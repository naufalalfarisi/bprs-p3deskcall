import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import ExcelJS from 'exceljs';

export const deskcallRouter = new Hono();

// Enforce auth on all routes
deskcallRouter.use('*', authMiddleware);

// POST / - Catat Call Baru
deskcallRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      debiturId,
      tanggal,
      waktu,
      jenisKontak,
      statusKontak,
      hasilKomunikasi,
      tindakLanjut,
      prioritas,
      nominalJanji,
      tanggalJanjiBayar,
      durasiPanggilan
    } = body;

    if (!debiturId || !tanggal || !waktu || !jenisKontak || !statusKontak || !prioritas) {
      return c.json({ error: 'Field wajib tidak boleh kosong' }, 400);
    }

    const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    const user = (c as any).get('user');

    // Create the call entry with snapshot of KOL and bakiDebet (Opsi B)
    const newCall = await prisma.deskCall.create({
      data: {
        debiturId,
        namaDebitur: debitur.nama,
        tanggal: new Date(tanggal),
        waktu,
        petugasId: user.id,
        kol: debitur.kol,
        jenisKontak,
        statusKontak,
        hasilKomunikasi,
        tindakLanjut: tindakLanjut || 'Tidak Ada',
        prioritas,
        nominalJanji: nominalJanji ? parseFloat(nominalJanji) : null,
        tanggalJanjiBayar: tanggalJanjiBayar ? new Date(tanggalJanjiBayar) : null,
        bakiDebet: debitur.bakiDebet,
        durasiPanggilan: durasiPanggilan || null
      }
    });

    if (tindakLanjut && (tindakLanjut === 'Sudah Bayar' || tindakLanjut.includes('Sudah Bayar') || tindakLanjut.includes('Lunas'))) {
      const paymentNominal = nominalJanji ? parseFloat(nominalJanji) : (debitur.totalTunggakan || 0);
      await prisma.pembayaran.create({
        data: {
          debiturId,
          nama: debitur.nama,
          tanggal: new Date(tanggal),
          nominal: paymentNominal,
          kol: debitur.kol,
          metode: jenisKontak === 'WhatsApp' ? 'Transfer' : 'Tunai',
          petugas: user.nama || user.username || 'Desk Call',
          keterangan: hasilKomunikasi || 'Pembayaran dicatat via Desk Call (Sudah Bayar)'
        }
      });

      // Clear pending promise dates on previous DeskCalls for this debitur
      await prisma.deskCall.updateMany({
        where: {
          debiturId,
          tindakLanjut: 'Janji Bayar',
          id: { not: newCall.id }
        },
        data: {
          tanggalJanjiBayar: null
        }
      });
    }

    await logAudit(c, 'create_desk_call', 'desk_call', newCall.id, null, newCall);

    return c.json(newCall, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});



// GET /harian - Laporan Harian
deskcallRouter.get('/harian', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal']), async (c) => {
  try {
    const tanggalStr = c.req.query('tanggal') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const q = c.req.query('q') || '';
    const statusKontak = c.req.query('status') || '';
    const tindakLanjut = c.req.query('tindakLanjut') || '';
    const janjiDue = c.req.query('janjiDue') || '';

    const filterDate = new Date(tanggalStr);
    const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);

    const whereClause: any = {};

    if (janjiDue === 'true' || janjiDue === 'today') {
      whereClause.tindakLanjut = 'Janji Bayar';
      whereClause.tanggalJanjiBayar = {
        gte: startOfDay,
        lte: endOfDay
      };
    } else {
      whereClause.tanggal = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    if (q) {
      whereClause.OR = [
        { namaDebitur: { contains: q } },
        { debiturId: { contains: q } }
      ];
    }

    if (statusKontak) {
      whereClause.statusKontak = statusKontak;
    }

    if (tindakLanjut && !whereClause.tindakLanjut) {
      whereClause.tindakLanjut = tindakLanjut;
    }

    const calls = await prisma.deskCall.findMany({
      where: whereClause,
      include: {
        debitur: {
          select: {
            telepon: true,
            tglJt: true,
            totalTunggakan: true,
            ao: true
          }
        },
        petugas: {
          select: {
            nama: true,
            username: true
          }
        }
      },
      orderBy: { waktu: 'desc' }
    });

    // Stat cards for Harian
    const totalCalls = calls.length;
    const terhubung = calls.filter((c) => c.statusKontak === 'Terhubung').length;
    const janjiBayar = calls.filter((c) => c.tindakLanjut === 'Janji Bayar').length;
    const nominalJanji = calls.reduce((sum, c) => sum + (c.nominalJanji || 0), 0);

    return c.json({
      calls,
      stats: {
        totalCalls,
        terhubung,
        janjiBayar,
        nominalJanji,
        targetCalls: 30
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /bulanan - Laporan Bulanan (Grouped per Minggu dalam Sebulan)
deskcallRouter.get('/bulanan', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal']), async (c) => {
  try {
    const yearMonth = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const [year, month] = yearMonth.split('-').map(Number);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
    const maxDays = endOfMonth.getDate();

    const calls = await prisma.deskCall.findMany({
      where: {
        tanggal: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      include: {
        petugas: { select: { nama: true } }
      },
      orderBy: { tanggal: 'asc' }
    });

    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const monthLabel = monthNames[month - 1] || '';

    // Group into 5 Weeks of the month
    const weeklyMap: { [weekNum: number]: any } = {
      1: { weekNum: 1, label: `Minggu 1 (Tgl 01 - 07 ${monthLabel} ${year})`, startDay: 1, endDay: 7, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
      2: { weekNum: 2, label: `Minggu 2 (Tgl 08 - 14 ${monthLabel} ${year})`, startDay: 8, endDay: 14, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
      3: { weekNum: 3, label: `Minggu 3 (Tgl 15 - 21 ${monthLabel} ${year})`, startDay: 15, endDay: 21, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
      4: { weekNum: 4, label: `Minggu 4 (Tgl 22 - 28 ${monthLabel} ${year})`, startDay: 22, endDay: 28, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
      5: { weekNum: 5, label: `Minggu 5 (Tgl 29 - ${maxDays} ${monthLabel} ${year})`, startDay: 29, endDay: maxDays, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} }
    };

    calls.forEach((call) => {
      const callDate = new Date(call.tanggal);
      const day = callDate.getDate();
      let weekNum = 1;
      if (day >= 29) weekNum = 5;
      else if (day >= 22) weekNum = 4;
      else if (day >= 15) weekNum = 3;
      else if (day >= 8) weekNum = 2;

      const targetWeek = weeklyMap[weekNum];
      targetWeek.totalCall++;
      if (call.statusKontak === 'Terhubung') targetWeek.terhubung++;
      if (call.tindakLanjut === 'Janji Bayar') targetWeek.ptp++;
      targetWeek.nominalJanji += call.nominalJanji || 0;
      targetWeek.calls.push(call);

      const dateStr = callDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      if (!targetWeek.daysMap[dateStr]) {
        targetWeek.daysMap[dateStr] = { tanggal: dateStr, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [] };
      }
      targetWeek.daysMap[dateStr].totalCall++;
      if (call.statusKontak === 'Terhubung') targetWeek.daysMap[dateStr].terhubung++;
      if (call.tindakLanjut === 'Janji Bayar') targetWeek.daysMap[dateStr].ptp++;
      targetWeek.daysMap[dateStr].nominalJanji += call.nominalJanji || 0;
      targetWeek.daysMap[dateStr].calls.push(call);
    });

    const weeklyRekap = Object.values(weeklyMap).map((w: any) => {
      const connectionRate = w.totalCall > 0 ? (w.terhubung / w.totalCall) * 100 : 0;
      const ptpRate = w.terhubung > 0 ? (w.ptp / w.terhubung) * 100 : 0;
      const dailyBreakdown = Object.values(w.daysMap).sort((a: any, b: any) => a.tanggal.localeCompare(b.tanggal));
      return {
        ...w,
        connectionRate: parseFloat(connectionRate.toFixed(1)),
        ptpRate: parseFloat(ptpRate.toFixed(1)),
        dailyBreakdown
      };
    });

    // Aggregate values
    const totalCalls = calls.length;
    const terhubung = calls.filter((c) => c.statusKontak === 'Terhubung').length;
    const ptp = calls.filter((c) => c.tindakLanjut === 'Janji Bayar').length;
    const totalNominalJanji = calls.reduce((sum, c) => sum + (c.nominalJanji || 0), 0);

    const connectionRate = totalCalls > 0 ? (terhubung / totalCalls) * 100 : 0;
    const ptpRate = terhubung > 0 ? (ptp / terhubung) * 100 : 0;

    return c.json({
      weeklyRekap,
      periode: yearMonth,
      stats: {
        totalCalls,
        terhubung,
        connectionRate: parseFloat(connectionRate.toFixed(1)),
        ptp,
        ptpRate: parseFloat(ptpRate.toFixed(1)),
        totalNominalJanji
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /insight - Customer Insight tab
deskcallRouter.get('/insight', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal']), async (c) => {
  try {
    const yearMonth = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const [year, month] = yearMonth.split('-').map(Number);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const calls = await prisma.deskCall.findMany({
      where: {
        tanggal: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      },
      include: {
        petugas: {
          select: {
            nama: true
          }
        }
      }
    });

    // 1. Core Metriks
    const totalCall = calls.length;
    const terhubung = calls.filter((c) => c.statusKontak === 'Terhubung').length;
    const ptp = calls.filter((c) => c.tindakLanjut === 'Janji Bayar').length;
    const totalNominalJanji = calls.reduce((sum, c) => sum + (c.nominalJanji || 0), 0);

    const connectionRate = totalCall > 0 ? (terhubung / totalCall) * 100 : 0;
    const ptpRate = terhubung > 0 ? (ptp / terhubung) * 100 : 0;

    // 2. Status Kontak Breakdown (Donut)
    const statusBreakdown = {
      Terhubung: 0,
      'Tersambung Tidak Diangkat': 0,
      'Tidak Diangkat': 0,
      'Nomor Ditolak': 0,
      Sibuk: 0,
      'Tidak Aktif': 0,
      'Salah Nomor': 0
    };
    calls.forEach((c) => {
      const s = c.statusKontak as keyof typeof statusBreakdown;
      if (s in statusBreakdown) {
        statusBreakdown[s]++;
      }
    });

    // 3. Jenis Kontak Breakdown (Donut)
    const jenisBreakdown = {
      Telepon: calls.filter((c) => c.jenisKontak === 'Telepon').length,
      WhatsApp: calls.filter((c) => c.jenisKontak === 'WhatsApp').length
    };

    // 4. KOL Distribution (Bar)
    const kolDistribution: { [kol: string]: number } = {};
    calls.forEach((c) => {
      kolDistribution[c.kol] = (kolDistribution[c.kol] || 0) + 1;
    });

    // 5. Jam Paling Produktif (Bar)
    const hourlyDistribution: { [hour: string]: number } = {};
    // Init hours 08 to 17
    for (let i = 8; i <= 17; i++) {
      const hStr = i.toString().padStart(2, '0') + ':00';
      hourlyDistribution[hStr] = 0;
    }

    calls.forEach((c) => {
      if (c.statusKontak === 'Terhubung') {
        const hour = c.waktu.split(':')[0]; // get HH
        const hourKey = hour + ':00';
        if (hourKey in hourlyDistribution) {
          hourlyDistribution[hourKey]++;
        } else {
          hourlyDistribution[hourKey] = 1;
        }
      }
    });

    // 6. Tren Call per Hari
    const trenMap: { [dateStr: string]: { date: string; total: number; connected: number } } = {};
    calls.forEach((c) => {
      const dateStr = c.tanggal.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      if (!trenMap[dateStr]) {
        trenMap[dateStr] = { date: dateStr, total: 0, connected: 0 };
      }
      trenMap[dateStr].total++;
      if (c.statusKontak === 'Terhubung') {
        trenMap[dateStr].connected++;
      }
    });
    const trenCall = Object.values(trenMap).sort((a, b) => a.date.localeCompare(b.date));

    // 7. Perbandingan Kinerja per Petugas (tabel) - admin / kabid_p3 only
    const user = (c as any).get('user');
    let officerPerformance: any[] = [];

    if (user && (user.posisi === 'admin' || user.posisi === 'kabid_p3')) {
      const officerMap: { [userId: string]: any } = {};

      calls.forEach((c) => {
        const oId = c.petugasId;
        if (!officerMap[oId]) {
          officerMap[oId] = {
            nama: c.petugas?.nama || 'Petugas Lain',
            totalCall: 0,
            terhubung: 0,
            ptp: 0,
            nominalJanji: 0
          };
        }
        officerMap[oId].totalCall++;
        if (c.statusKontak === 'Terhubung') {
          officerMap[oId].terhubung++;
        }
        if (c.tindakLanjut === 'Janji Bayar') {
          officerMap[oId].ptp++;
        }
        officerMap[oId].nominalJanji += c.nominalJanji || 0;
      });

      officerPerformance = Object.values(officerMap).map((o: any) => ({
        ...o,
        connectionRate: o.totalCall > 0 ? (o.terhubung / o.totalCall) * 100 : 0,
        ptpRate: o.terhubung > 0 ? (o.ptp / o.terhubung) * 100 : 0
      }));
    }

    // 8. Success Rate & Klasifikasi Penyelesaian Nasabah Janji Bayar
    const promiseCalls = await prisma.deskCall.findMany({
      where: {
        tanggal: { gte: startOfMonth, lte: endOfMonth },
        OR: [
          { tindakLanjut: 'Janji Bayar' },
          { tindakLanjut: 'Sudah Bayar' },
          { tindakLanjut: { contains: 'Sudah Bayar' } },
          { tanggalJanjiBayar: { not: null } }
        ]
      },
      include: { debitur: true },
      orderBy: { tanggalJanjiBayar: 'asc' }
    });

    const promiseDebtorMap: { [debiturId: string]: any } = {};

    for (const pCall of promiseCalls) {
      if (!promiseDebtorMap[pCall.debiturId]) {
        const hasPayment = await prisma.pembayaran.count({
          where: { debiturId: pCall.debiturId }
        }) > 0;

        const hasSudahBayarCall = await prisma.deskCall.count({
          where: {
            debiturId: pCall.debiturId,
            OR: [
              { tindakLanjut: 'Sudah Bayar' },
              { tindakLanjut: { contains: 'Sudah Bayar' } },
              { tindakLanjut: { contains: 'Lunas' } }
            ]
          }
        }) > 0;

        const isResolved = hasPayment || hasSudahBayarCall || (pCall.tindakLanjut && (pCall.tindakLanjut.includes('Sudah Bayar') || pCall.tindakLanjut.includes('Lunas')));

        let statusCategory = 'Dalam Follow-Up';
        if (isResolved) {
          statusCategory = 'Selesai (Sudah Bayar)';
        } else if (pCall.tanggalJanjiBayar && new Date(pCall.tanggalJanjiBayar) < new Date()) {
          statusCategory = 'Ingkar Janji (Overdue)';
        }

        promiseDebtorMap[pCall.debiturId] = {
          debiturId: pCall.debiturId,
          namaDebitur: pCall.namaDebitur,
          tanggalJanjiBayar: pCall.tanggalJanjiBayar,
          nominalJanji: pCall.nominalJanji || 0,
          isResolved,
          statusCategory
        };
      }
    }

    const debtorList = Object.values(promiseDebtorMap);
    const totalPromiseDebtors = debtorList.length;
    const resolvedCount = debtorList.filter(d => d.isResolved).length;
    const pendingCount = debtorList.filter(d => d.statusCategory === 'Dalam Follow-Up').length;
    const brokenCount = debtorList.filter(d => d.statusCategory === 'Ingkar Janji (Overdue)').length;

    const promiseSuccessRate = totalPromiseDebtors > 0 ? parseFloat(((resolvedCount / totalPromiseDebtors) * 100).toFixed(1)) : 0;
    
    let promisePerformanceCategory = 'Perlu Perhatian';
    if (promiseSuccessRate >= 70) promisePerformanceCategory = 'Sangat Baik';
    else if (promiseSuccessRate >= 40) promisePerformanceCategory = 'Sedang';

    const ptpSuccessMetrics = {
      totalPromiseDebtors,
      resolvedCount,
      pendingCount,
      brokenCount,
      promiseSuccessRate,
      promisePerformanceCategory,
      debtorList
    };

    return c.json({
      stats: {
        totalCall,
        terhubung,
        connectionRate,
        ptp,
        ptpRate,
        totalNominalJanji
      },
      statusBreakdown,
      jenisBreakdown,
      kolDistribution,
      hourlyDistribution,
      trenCall,
      officerPerformance,
      ptpSuccessMetrics
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /export/excel - Export Excel Deskcall (Harian atau Bulanan)
deskcallRouter.get('/export/excel', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal']), async (c) => {
  try {
    const type = c.req.query('type') || 'harian';
    const tanggalStr = c.req.query('tanggal') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const periodeStr = c.req.query('periode') || new Date().toISOString().substring(0, 7);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BPRS NPF System';
    workbook.created = new Date();

    if (type === 'bulanan') {
      const [year, month] = periodeStr.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      const maxDays = endOfMonth.getDate();

      const calls = await prisma.deskCall.findMany({
        where: { tanggal: { gte: startOfMonth, lte: endOfMonth } },
        include: { debitur: true, petugas: { select: { nama: true } } },
        orderBy: { tanggal: 'asc' }
      });

      const monthNames = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      const monthLabel = monthNames[month - 1] || '';

      // Sheet 1: Rekap Minggu
      const wsSummary = workbook.addWorksheet('Rekapitulasi Mingguan');
      wsSummary.columns = [
        { header: 'Periode Minggu', key: 'label', width: 35 },
        { header: 'Total Call', key: 'totalCall', width: 15 },
        { header: 'Terhubung', key: 'terhubung', width: 15 },
        { header: 'Contact Rate (%)', key: 'connectionRate', width: 18 },
        { header: 'Janji Bayar (PTP)', key: 'ptp', width: 18 },
        { header: 'PTP Rate (%)', key: 'ptpRate', width: 15 },
        { header: 'Nominal Janji (IDR)', key: 'nominalJanji', width: 22 }
      ];

      wsSummary.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      wsSummary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };

      const weeklyMap: { [w: number]: any } = {
        1: { label: `Minggu 1 (Tgl 01 - 07 ${monthLabel} ${year})`, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0 },
        2: { label: `Minggu 2 (Tgl 08 - 14 ${monthLabel} ${year})`, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0 },
        3: { label: `Minggu 3 (Tgl 15 - 21 ${monthLabel} ${year})`, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0 },
        4: { label: `Minggu 4 (Tgl 22 - 28 ${monthLabel} ${year})`, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0 },
        5: { label: `Minggu 5 (Tgl 29 - ${maxDays} ${monthLabel} ${year})`, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0 }
      };

      calls.forEach(call => {
        const day = new Date(call.tanggal).getDate();
        let weekNum = 1;
        if (day >= 29) weekNum = 5;
        else if (day >= 22) weekNum = 4;
        else if (day >= 15) weekNum = 3;
        else if (day >= 8) weekNum = 2;

        const w = weeklyMap[weekNum];
        w.totalCall++;
        if (call.statusKontak === 'Terhubung') w.terhubung++;
        if (call.tindakLanjut === 'Janji Bayar') w.ptp++;
        w.nominalJanji += call.nominalJanji || 0;
      });

      Object.values(weeklyMap).forEach(w => {
        const connectionRate = w.totalCall > 0 ? (w.terhubung / w.totalCall) * 100 : 0;
        const ptpRate = w.terhubung > 0 ? (w.ptp / w.terhubung) * 100 : 0;
        wsSummary.addRow({
          label: w.label,
          totalCall: w.totalCall,
          terhubung: w.terhubung,
          connectionRate: `${connectionRate.toFixed(1)}%`,
          ptp: w.ptp,
          ptpRate: `${ptpRate.toFixed(1)}%`,
          nominalJanji: w.nominalJanji
        });
      });

      // Sheet 2: Detail Panggilan
      const wsDetail = workbook.addWorksheet('Detail Panggilan');
      wsDetail.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'Tanggal', key: 'tanggal', width: 14 },
        { header: 'Waktu', key: 'waktu', width: 10 },
        { header: 'No. Rekening', key: 'debiturId', width: 18 },
        { header: 'Nama Debitur', key: 'namaDebitur', width: 25 },
        { header: 'No. Telefon', key: 'telepon', width: 16 },
        { header: 'Jenis Kontak', key: 'jenisKontak', width: 14 },
        { header: 'Status Panggilan', key: 'statusKontak', width: 22 },
        { header: 'Tindak Lanjut', key: 'tindakLanjut', width: 18 },
        { header: 'Nominal Janji (IDR)', key: 'nominalJanji', width: 20 },
        { header: 'Tgl Janji Bayar', key: 'tanggalJanjiBayar', width: 16 },
        { header: 'Catatan Hasil Call', key: 'hasilKomunikasi', width: 35 },
        { header: 'Petugas', key: 'petugas', width: 20 }
      ];
      wsDetail.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      wsDetail.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };

      calls.forEach((c, idx) => {
        wsDetail.addRow({
          no: idx + 1,
          tanggal: new Date(c.tanggal).toLocaleDateString('id-ID'),
          waktu: c.waktu,
          debiturId: c.debiturId,
          namaDebitur: c.namaDebitur,
          telepon: c.debitur?.telepon || '',
          jenisKontak: c.jenisKontak,
          statusKontak: c.statusKontak,
          tindakLanjut: c.tindakLanjut || '-',
          nominalJanji: c.nominalJanji || 0,
          tanggalJanjiBayar: c.tanggalJanjiBayar ? new Date(c.tanggalJanjiBayar).toLocaleDateString('id-ID') : '-',
          hasilKomunikasi: c.hasilKomunikasi || '-',
          petugas: c.petugas?.nama || ''
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `Laporan_DeskCall_Bulanan_${periodeStr}.xlsx`;
      return c.body(buffer as any, 200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      });

    } else {
      // Harian
      const filterDate = new Date(tanggalStr);
      const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);

      const calls = await prisma.deskCall.findMany({
        where: { tanggal: { gte: startOfDay, lte: endOfDay } },
        include: { debitur: true, petugas: { select: { nama: true } } },
        orderBy: { waktu: 'desc' }
      });

      const ws = workbook.addWorksheet(`Harian ${tanggalStr}`);
      ws.columns = [
        { header: 'No', key: 'no', width: 6 },
        { header: 'No. Rekening', key: 'debiturId', width: 18 },
        { header: 'Nama Debitur', key: 'namaDebitur', width: 25 },
        { header: 'No. Telefon', key: 'telepon', width: 16 },
        { header: 'Waktu', key: 'waktu', width: 10 },
        { header: 'Jenis Kontak', key: 'jenisKontak', width: 14 },
        { header: 'Status Panggilan', key: 'statusKontak', width: 22 },
        { header: 'Tindak Lanjut', key: 'tindakLanjut', width: 18 },
        { header: 'Nominal Janji (IDR)', key: 'nominalJanji', width: 20 },
        { header: 'Tgl Janji Bayar', key: 'tanggalJanjiBayar', width: 16 },
        { header: 'Catatan Hasil Call', key: 'hasilKomunikasi', width: 35 },
        { header: 'KOL', key: 'kol', width: 8 },
        { header: 'Baki Debet (IDR)', key: 'bakiDebet', width: 18 },
        { header: 'Total Tunggakan (IDR)', key: 'totalTunggakan', width: 20 },
        { header: 'AO Penanggungjawab', key: 'ao', width: 20 },
        { header: 'Petugas Desk Call', key: 'petugas', width: 20 }
      ];

      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F766E' } };

      calls.forEach((c, idx) => {
        ws.addRow({
          no: idx + 1,
          debiturId: c.debiturId,
          namaDebitur: c.namaDebitur,
          telepon: c.debitur?.telepon || '',
          waktu: c.waktu,
          jenisKontak: c.jenisKontak,
          statusKontak: c.statusKontak,
          tindakLanjut: c.tindakLanjut || '-',
          nominalJanji: c.nominalJanji || 0,
          tanggalJanjiBayar: c.tanggalJanjiBayar ? new Date(c.tanggalJanjiBayar).toLocaleDateString('id-ID') : '-',
          hasilKomunikasi: c.hasilKomunikasi || '-',
          kol: c.kol || c.debitur?.kol || '-',
          bakiDebet: c.bakiDebet || c.debitur?.bakiDebet || 0,
          totalTunggakan: c.debitur?.totalTunggakan || 0,
          ao: c.debitur?.ao || '-',
          petugas: c.petugas?.nama || ''
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `Laporan_DeskCall_Harian_${tanggalStr}.xlsx`;
      return c.body(buffer as any, 200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /export/csv - Export CSV Deskcall (Harian atau Bulanan)
deskcallRouter.get('/export/csv', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal']), async (c) => {
  try {
    const type = c.req.query('type') || 'harian';
    const tanggalStr = c.req.query('tanggal') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const periodeStr = c.req.query('periode') || new Date().toISOString().substring(0, 7);

    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      const val = String(str).replace(/"/g, '""');
      return `"${val}"`;
    };

    let csvContent = '\uFEFF';

    if (type === 'bulanan') {
      const [year, month] = periodeStr.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      const calls = await prisma.deskCall.findMany({
        where: { tanggal: { gte: startOfMonth, lte: endOfMonth } },
        include: { debitur: true, petugas: { select: { nama: true } } },
        orderBy: { tanggal: 'asc' }
      });

      const headers = ['No', 'Tanggal', 'Waktu', 'No. Rekening', 'Nama Debitur', 'No. Telefon', 'Jenis Kontak', 'Status Panggilan', 'Tindak Lanjut', 'Nominal Janji', 'Tgl Janji Bayar', 'Catatan Hasil Call', 'Petugas'];
      csvContent += headers.map(escapeCsv).join(',') + '\n';

      calls.forEach((call, idx) => {
        const row = [
          idx + 1,
          new Date(call.tanggal).toLocaleDateString('id-ID'),
          call.waktu,
          call.debiturId,
          call.namaDebitur,
          call.debitur?.telepon || '',
          call.jenisKontak,
          call.statusKontak,
          call.tindakLanjut || '-',
          call.nominalJanji || 0,
          call.tanggalJanjiBayar ? new Date(call.tanggalJanjiBayar).toLocaleDateString('id-ID') : '-',
          call.hasilKomunikasi || '-',
          call.petugas?.nama || ''
        ];
        csvContent += row.map(escapeCsv).join(',') + '\n';
      });

      const filename = `Laporan_DeskCall_Bulanan_${periodeStr}.csv`;
      return c.text(csvContent, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
    } else {
      // Harian
      const filterDate = new Date(tanggalStr);
      const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);

      const calls = await prisma.deskCall.findMany({
        where: { tanggal: { gte: startOfDay, lte: endOfDay } },
        include: { debitur: true, petugas: { select: { nama: true } } },
        orderBy: { waktu: 'desc' }
      });

      const headers = ['No', 'No. Rekening', 'Nama Debitur', 'No. Telefon', 'Waktu', 'Jenis Kontak', 'Status Panggilan', 'Tindak Lanjut', 'Nominal Janji', 'Tgl Janji Bayar', 'Catatan Hasil Call', 'KOL', 'Baki Debet', 'Total Tunggakan', 'AO Penanggungjawab', 'Petugas Desk Call'];
      csvContent += headers.map(escapeCsv).join(',') + '\n';

      calls.forEach((call, idx) => {
        const row = [
          idx + 1,
          call.debiturId,
          call.namaDebitur,
          call.debitur?.telepon || '',
          call.waktu,
          call.jenisKontak,
          call.statusKontak,
          call.tindakLanjut || '-',
          call.nominalJanji || 0,
          call.tanggalJanjiBayar ? new Date(call.tanggalJanjiBayar).toLocaleDateString('id-ID') : '-',
          call.hasilKomunikasi || '-',
          call.kol || call.debitur?.kol || '-',
          call.bakiDebet || call.debitur?.bakiDebet || 0,
          call.debitur?.totalTunggakan || 0,
          call.debitur?.ao || '-',
          call.petugas?.nama || ''
        ];
        csvContent += row.map(escapeCsv).join(',') + '\n';
      });

      const filename = `Laporan_DeskCall_Harian_${tanggalStr}.csv`;
      return c.text(csvContent, 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /:id - Detail of a single desk call
deskcallRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const call = await prisma.deskCall.findUnique({
      where: { id },
      include: {
        debitur: true,
        petugas: { select: { nama: true, username: true } }
      }
    });

    if (!call) {
      return c.json({ error: 'Data Desk Call tidak ditemukan' }, 404);
    }

    return c.json(call);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /:id - Edit Call (admin, desk_call, kabid_p3)
deskcallRouter.put('/:id', roleMiddleware(['admin', 'desk_call', 'kabid_p3']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const existing = await (prisma as any).deskCall.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: 'Entri call tidak ditemukan' }, 404);
    }

    const body = await c.req.json();
    const {
      tanggal,
      waktu,
      jenisKontak,
      statusKontak,
      hasilKomunikasi,
      tindakLanjut,
      prioritas,
      nominalJanji,
      tanggalJanjiBayar
    } = body;

    const updated = await (prisma as any).deskCall.update({
      where: { id },
      data: {
        tanggal: tanggal ? new Date(tanggal) : existing.tanggal,
        waktu: waktu || existing.waktu,
        jenisKontak: jenisKontak || existing.jenisKontak,
        statusKontak: statusKontak || existing.statusKontak,
        hasilKomunikasi: hasilKomunikasi !== undefined ? hasilKomunikasi : existing.hasilKomunikasi,
        tindakLanjut: tindakLanjut !== undefined ? tindakLanjut : existing.tindakLanjut,
        prioritas: prioritas || existing.prioritas,
        nominalJanji: nominalJanji !== undefined ? (nominalJanji !== null && nominalJanji !== '' ? parseFloat(nominalJanji) : null) : existing.nominalJanji,
        tanggalJanjiBayar: tanggalJanjiBayar !== undefined ? (tanggalJanjiBayar ? new Date(tanggalJanjiBayar) : null) : existing.tanggalJanjiBayar
      }
    });

    if (tindakLanjut && (tindakLanjut === 'Sudah Bayar' || tindakLanjut.includes('Sudah Bayar') || tindakLanjut.includes('Lunas'))) {
      const paymentNominal = nominalJanji !== undefined && nominalJanji !== null && nominalJanji !== '' 
        ? parseFloat(nominalJanji) 
        : (existing.nominalJanji || 0);
      const debitur = await prisma.debitur.findUnique({ where: { id: existing.debiturId } });
      if (debitur) {
        await prisma.pembayaran.create({
          data: {
            debiturId: existing.debiturId,
            nama: debitur.nama,
            tanggal: tanggal ? new Date(tanggal) : new Date(),
            nominal: paymentNominal > 0 ? paymentNominal : (debitur.totalTunggakan || 0),
            kol: debitur.kol,
            metode: 'Transfer',
            petugas: (c as any).get('user')?.nama || 'Desk Call',
            keterangan: hasilKomunikasi || 'Pembayaran dicatat via Desk Call (Sudah Bayar)'
          }
        });
      }

      await prisma.deskCall.updateMany({
        where: {
          debiturId: existing.debiturId,
          tindakLanjut: 'Janji Bayar',
          id: { not: id }
        },
        data: {
          tanggalJanjiBayar: null
        }
      });
    }

    await logAudit(c, 'update_desk_call', 'desk_call', id, existing, updated);

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /:id - Hapus Call (admin, desk_call, kabid_p3)
deskcallRouter.delete('/:id', roleMiddleware(['admin', 'desk_call', 'kabid_p3']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const call = await (prisma as any).deskCall.findUnique({ where: { id } });

    if (!call) {
      return c.json({ error: 'Entri call tidak ditemukan' }, 404);
    }

    await (prisma as any).deskCall.delete({ where: { id } });
    await logAudit(c, 'delete_desk_call', 'desk_call', id, call);

    return c.json({ message: 'Entri call berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
