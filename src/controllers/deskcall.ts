import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

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
      tanggalJanjiBayar
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
        bakiDebet: debitur.bakiDebet
      }
    });

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
        nominalJanji
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
      officerPerformance
    });
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

// DELETE /:id - Hapus Call (admin & desk_call)
deskcallRouter.delete('/:id', roleMiddleware(['admin', 'desk_call']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const call = await prisma.deskCall.findUnique({ where: { id } });

    if (!call) {
      return c.json({ error: 'Entri call tidak ditemukan' }, 404);
    }

    await prisma.deskCall.delete({ where: { id } });
    await logAudit(c, 'delete_desk_call', 'desk_call', id, call);

    return c.json({ message: 'Entri call berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
