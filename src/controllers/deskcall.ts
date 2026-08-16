import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import ExcelJS from 'exceljs';
import { prisma } from '../db.js';
import { createDeskCallSchema, updateDeskCallSchema } from '../schemas/deskcall.schema.js';
import {
  createDeskCall,
  getDeskCallHarian,
  getDeskCallBulanan,
  getDeskCallRedAlert,
  getDeskCallInsight,
  getDeskCallById,
  updateDeskCall,
  deleteDeskCall
} from '../services/deskcallService.js';

export const deskcallRouter = new Hono();

// Enforce auth on all routes
deskcallRouter.use('*', authMiddleware);

// POST / - Catat Call Baru
deskcallRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createDeskCallSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message, details: parsed.error.issues }, 400);
    }

    const user = (c as any).get('user');
    const newCall = await createDeskCall(user, parsed.data as any);
    await logAudit(c, 'create_desk_call', 'desk_call', newCall.id, null, newCall);

    return c.json(newCall, 201);
  } catch (err: any) {
    const status = err.message.includes('kosong') ? 400 : (err.message.includes('tidak ditemukan') ? 404 : 500);
    return c.json({ error: err.message }, status as any);
  }
});

// GET /harian - Laporan Harian
deskcallRouter.get('/harian', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal', 'kabid_ao', 'ao']), async (c) => {
  try {
    const tanggalStr = c.req.query('tanggal') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const q = c.req.query('q') || '';
    const statusKontak = c.req.query('status') || '';
    const tindakLanjut = c.req.query('tindakLanjut') || '';
    const janjiDue = c.req.query('janjiDue') || '';

    const result = await getDeskCallHarian({ tanggalStr, q, statusKontak, tindakLanjut, janjiDue });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /bulanan - Laporan Bulanan (Grouped per Minggu dalam Sebulan)
deskcallRouter.get('/bulanan', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal', 'kabid_ao', 'ao']), async (c) => {
  try {
    const yearMonth = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const result = await getDeskCallBulanan(yearMonth);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /redalert - Red Alert: Nasabah bergeser dari KOL 1 (Lancar) ke KOL 2 (DPK)
deskcallRouter.get('/redalert', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal', 'kabid_ao', 'ao']), async (c) => {
  try {
    const q = c.req.query('q') || '';
    const ao = c.req.query('ao') || '';
    const hariIni = c.req.query('hariIni') || '';
    const filterStatus = c.req.query('status') || 'all';

    const result = await getDeskCallRedAlert({ q, ao, hariIni, filterStatus });
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /insight - Customer Insight tab
deskcallRouter.get('/insight', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal', 'kabid_ao', 'ao']), async (c) => {
  try {
    const yearMonth = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const user = (c as any).get('user');
    const result = await getDeskCallInsight(user, yearMonth);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /export/excel - Export Excel Deskcall (Harian atau Bulanan)
deskcallRouter.get('/export/excel', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal', 'kabid_ao', 'ao']), async (c) => {
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
        { header: 'Nominal Janji (IDR)', key: 'nominalJanji', width: 22 },
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
deskcallRouter.get('/export/csv', roleMiddleware(['admin', 'desk_call', 'kabid_p3', 'staff_p3', 'legal', 'kabid_ao', 'ao']), async (c) => {
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
    const call = await getDeskCallById(id);
    return c.json(call);
  } catch (err: any) {
    const status = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, status as any);
  }
});

// PUT /:id - Edit Call (admin, desk_call, kabid_p3)
deskcallRouter.put('/:id', roleMiddleware(['admin', 'desk_call', 'kabid_p3']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const body = await c.req.json();
    const parsed = updateDeskCallSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message, details: parsed.error.issues }, 400);
    }

    const user = (c as any).get('user');
    const { existing, updated } = await updateDeskCall(id, user, parsed.data as any);
    await logAudit(c, 'update_desk_call', 'desk_call', id, existing, updated);

    return c.json(updated);
  } catch (err: any) {
    const status = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, status as any);
  }
});

// DELETE /:id - Hapus Call (admin, desk_call, kabid_p3)
deskcallRouter.delete('/:id', roleMiddleware(['admin', 'desk_call', 'kabid_p3']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const call = await deleteDeskCall(id);
    await logAudit(c, 'delete_desk_call', 'desk_call', id, call);

    return c.json({ message: 'Entri call berhasil dihapus' });
  } catch (err: any) {
    const status = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, status as any);
  }
});
