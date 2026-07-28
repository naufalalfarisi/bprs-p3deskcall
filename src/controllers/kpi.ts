import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

export const kpiRouter = new Hono();

// Enforce auth
kpiRouter.use('*', authMiddleware);

const DEFAULT_TARGETS = {
  npfGross: 5.0,
  collectionRate: 70.0,
  recoveryRate: 40.0,
  cureRate: 20.0,
  ptpRate: 40.0,
  promiseKept: 60.0,
  coverageRatio: 80.0,
  kunjunganPerPetugas: 15.0,
  restrukSuccess: 50.0,
  ppapCoverage: 100.0
};

// Helper: Map KOL string to number for comparisons
const KOL_VALUES: { [key: string]: number } = {
  'Lancar': 1,
  'DPK': 2,
  'Kurang Lancar': 3,
  'Diragukan': 4,
  'Macet': 5
};

// GET /targets - Get target RBB for a period
kpiRouter.get('/targets', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    let target = await prisma.rbbTarget.findUnique({ where: { periode } });

    if (!target) {
      // Return default targets if none defined
      return c.json({
        periode,
        ...DEFAULT_TARGETS,
        isDefault: true
      });
    }

    return c.json({
      ...target,
      isDefault: false
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /targets - Save/Update target RBB (admin & kabid_p3 only)
kpiRouter.post('/targets', roleMiddleware(['admin', 'kabid_p3']), async (c) => {
  try {
    const body = await c.req.json();
    const {
      periode,
      npfGross,
      collectionRate,
      recoveryRate,
      cureRate,
      ptpRate,
      promiseKept,
      coverageRatio,
      kunjunganPerPetugas,
      restrukSuccess,
      ppapCoverage
    } = body;

    if (!periode) {
      return c.json({ error: 'Periode wajib diisi' }, 400);
    }

    const user = (c as any).get('user');

    const target = await prisma.rbbTarget.upsert({
      where: { periode },
      create: {
        periode,
        npfGross: parseFloat(npfGross),
        collectionRate: parseFloat(collectionRate),
        recoveryRate: parseFloat(recoveryRate),
        cureRate: parseFloat(cureRate),
        ptpRate: parseFloat(ptpRate),
        promiseKept: parseFloat(promiseKept),
        coverageRatio: parseFloat(coverageRatio),
        kunjunganPerPetugas: parseFloat(kunjunganPerPetugas),
        restrukSuccess: parseFloat(restrukSuccess),
        ppapCoverage: parseFloat(ppapCoverage),
        updatedBy: user.nama
      },
      update: {
        npfGross: parseFloat(npfGross),
        collectionRate: parseFloat(collectionRate),
        recoveryRate: parseFloat(recoveryRate),
        cureRate: parseFloat(cureRate),
        ptpRate: parseFloat(ptpRate),
        promiseKept: parseFloat(promiseKept),
        coverageRatio: parseFloat(coverageRatio),
        kunjunganPerPetugas: parseFloat(kunjunganPerPetugas),
        restrukSuccess: parseFloat(restrukSuccess),
        ppapCoverage: parseFloat(ppapCoverage),
        updatedBy: user.nama
      }
    });

    await logAudit(c, 'save_rbb_targets', 'rbb_targets', target.id, null, target);

    return c.json(target);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /dashboard - Computes 16 KPI cards and statistics
kpiRouter.get('/dashboard', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const [year, month] = periode.split('-').map(Number);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    // Get Target
    const targetDb = await prisma.rbbTarget.findUnique({ where: { periode } });
    const target = targetDb || { ...DEFAULT_TARGETS };

    // Fetch collections & debiturs
    const allDebitur = await prisma.debitur.findMany();
    const npfDebitur = allDebitur.filter(d => ['Kurang Lancar', 'Diragukan', 'Macet'].includes(d.kol));
    
    const monthlyPayments = await prisma.pembayaran.findMany({
      where: { tanggal: { gte: startOfMonth, lte: endOfMonth } }
    });

    const monthlySchedules = await prisma.jadwalPenagihan.findMany({
      where: { tanggal: { gte: startOfMonth, lte: endOfMonth } }
    });

    const monthlyCalls = await prisma.deskCall.findMany({
      where: { tanggal: { gte: startOfMonth, lte: endOfMonth } }
    });

    // -------------------------------------------------------------
    // GRUP 1: Kualitas Pembiayaan
    // -------------------------------------------------------------
    // 1. NPF Gross = SUM(baki NPF) / SUM(baki total) * 100
    const totalBaki = allDebitur.reduce((sum, d) => sum + d.bakiDebet, 0);
    const npfBaki = npfDebitur.reduce((sum, d) => sum + d.bakiDebet, 0);
    const npfGross = totalBaki > 0 ? (npfBaki / totalBaki) * 100 : 0;

    // 2. PPAP Coverage
    const ppapCoverage = 100.0;

    // 3. Recovery Rate = SUM(pembayaran debitur NPF) / SUM(total_tunggakan debitur NPF) * 100
    const npfDebiturIds = npfDebitur.map(d => d.id);
    const npfPayments = monthlyPayments.filter(p => npfDebiturIds.includes(p.debiturId));
    const totalPaidNpf = npfPayments.reduce((sum, p) => sum + p.nominal, 0);
    const totalTunggakanNpf = npfDebitur.reduce((sum, d) => sum + d.totalTunggakan, 0);
    const recoveryRate = Math.min(totalTunggakanNpf > 0 ? (totalPaidNpf / totalTunggakanNpf) * 100 : 0, 100);

    // 4. Cure Rate: % debitur NPF yang KOL-nya membaik dibanding bulan lalu
    // We compare with debitur_kol_history from the previous cutoff/month
    const previousSnapshotDate = new Date(year, month - 2, 28); // appx previous month cutoff
    const historySnapshot = await prisma.debiturKolHistory.findMany({
      where: {
        tanggalSnapshot: {
          gte: new Date(year, month - 2, 1),
          lte: new Date(year, month - 1, 0, 23, 59, 59)
        }
      }
    });
    
    let curedCount = 0;
    let totalNpfHist = 0;

    historySnapshot.forEach(h => {
      // If was NPF in history
      if (['Kurang Lancar', 'Diragukan', 'Macet'].includes(h.kol)) {
        totalNpfHist++;
        // Find current status
        const curr = allDebitur.find(d => d.id === h.debiturId);
        if (curr) {
          const prevVal = KOL_VALUES[h.kol] || 3;
          const currVal = KOL_VALUES[curr.kol] || 3;
          if (currVal < prevVal) {
            curedCount++;
          }
        }
      }
    });
    const cureRate = totalNpfHist > 0 ? (curedCount / totalNpfHist) * 100 : 0;

    // -------------------------------------------------------------
    // GRUP 2: Efektivitas Penagihan
    // -------------------------------------------------------------
    // 5. Collection Rate = SUM(realisasi P3) / SUM(target P3) * 100
    const totalTargetTagih = monthlySchedules.reduce((sum, s) => sum + s.targetTagih, 0);
    const totalRealisasiTagih = monthlySchedules.reduce((sum, s) => sum + s.nominalRealisasi, 0);
    const collectionRate = totalTargetTagih > 0 ? (totalRealisasiTagih / totalTargetTagih) * 100 : 0;

    // 6. PTP Rate = Janji Bayar / Terhubung * 100
    const callsConnected = monthlyCalls.filter(c => c.statusKontak === 'Terhubung').length;
    const callsPtp = monthlyCalls.filter(c => c.tindakLanjut === 'Janji Bayar').length;
    const ptpRate = callsConnected > 0 ? (callsPtp / callsConnected) * 100 : 0;

    // 7. Promise Kept Rate: % janji bayar yang disusul oleh pembayaran
    const keptCount = await prisma.deskCall.count({
      where: {
        tanggal: { gte: startOfMonth, lte: endOfMonth },
        tindakLanjut: 'Janji Bayar',
        tanggalJanjiBayar: { not: null },
        debitur: {
          pembayaran: {
            some: {
              tanggal: {
                gte: startOfMonth,
                lte: endOfMonth
              }
            }
          }
        }
      }
    });
    const promiseKeptRate = callsPtp > 0 ? (keptCount / callsPtp) * 100 : 0;

    // 8. Roll Rate (P3) = Lewat Jatuh Tempo / Total Jadwal * 100
    const schedulesOverdue = monthlySchedules.filter(s => s.status === 'Lewat Jatuh Tempo').length;
    const rollRate = monthlySchedules.length > 0 ? (schedulesOverdue / monthlySchedules.length) * 100 : 0;

    // -------------------------------------------------------------
    // GRUP 3: Produktivitas Petugas
    // -------------------------------------------------------------
    // 9. Coverage Ratio = NPF debitur yang dijadwalkan P3 / Total NPF debitur * 100
    const scheduledNpfIds = new Set(monthlySchedules.map(s => s.debiturId));
    const coveredNpfCount = npfDebitur.filter(d => scheduledNpfIds.has(d.id)).length;
    const coverageRatio = npfDebitur.length > 0 ? (coveredNpfCount / npfDebitur.length) * 100 : 0;

    // 10. Kunjungan / Petugas = Count(Jadwal) / Count(Petugas)
    const distinctOfficers = new Set(monthlySchedules.map(s => s.petugasId)).size;
    const kunjunganPerPetugas = distinctOfficers > 0 ? monthlySchedules.length / distinctOfficers : 0;

    // 11. Achievement Rate (alias collection rate)
    const achievementRate = collectionRate;

    // 12. Avg Tagihan / Kunjungan = Total Target / Count(Jadwal)
    const avgTagihanKunjungan = monthlySchedules.length > 0 ? totalTargetTagih / monthlySchedules.length : 0;

    // -------------------------------------------------------------
    // GRUP 4: Restrukturisasi & Penyelesaian
    // -------------------------------------------------------------
    // 13. Restrukturisasi Success = Count(Restruk Selesai) / Count(Total Restruk) * 100
    const restrukSchedules = monthlySchedules.filter(s => s.jenisTagih.toLowerCase().includes('restrukturisasi'));
    const restrukSucceeded = restrukSchedules.filter(s => s.status === 'Selesai').length;
    const restrukSuccessRate = restrukSchedules.length > 0 ? (restrukSucceeded / restrukSchedules.length) * 100 : 0;

    // 14. Total Restrukturisasi
    const totalRestrukturisasi = allDebitur.filter(d => d.restruk > 0).length;

    // 15. Legal Action Rate = Legal Berkas / NPF Debitur * 100
    const legalBerkasCount = await prisma.legalBerkas.count();
    const legalActionRate = npfDebitur.length > 0 ? (legalBerkasCount / npfDebitur.length) * 100 : 0;

    // 16. AYDA
    const aydaCount = await prisma.legalBerkas.count({
      where: { jenisAgunan: { contains: 'AYDA' } }
    });

    return c.json({
      target,
      stats: {
        // Group 1
        npfGross,
        ppapCoverage,
        recoveryRate,
        cureRate,
        // Group 2
        collectionRate,
        ptpRate,
        promiseKeptRate,
        rollRate,
        // Group 3
        coverageRatio,
        kunjunganPerPetugas,
        achievementRate,
        avgTagihanKunjungan,
        // Group 4
        restrukSuccessRate,
        totalRestrukturisasi,
        legalActionRate,
        aydaCount
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /officers - Computes ranking per officer
kpiRouter.get('/officers', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const [year, month] = periode.split('-').map(Number);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const officers = await prisma.user.findMany({
      where: { posisi: { in: ['staff_p3', 'kabid_p3', 'legal'] } }
    });

    const schedules = await prisma.jadwalPenagihan.findMany({
      where: { tanggal: { gte: startOfMonth, lte: endOfMonth } }
    });

    const calls = await prisma.deskCall.findMany({
      where: { tanggal: { gte: startOfMonth, lte: endOfMonth } }
    });

    const performance = officers.map((officer) => {
      const offSchedules = schedules.filter(s => s.petugasId === officer.id);
      const offCalls = calls.filter(c => c.petugasId === officer.id);

      const totalTarget = offSchedules.reduce((sum, s) => sum + s.targetTagih, 0);
      const totalRealisasi = offSchedules.reduce((sum, s) => sum + s.nominalRealisasi, 0);
      const achievement = totalTarget > 0 ? (totalRealisasi / totalTarget) * 100 : 0;

      const connected = offCalls.filter(c => c.statusKontak === 'Terhubung').length;
      const ptp = offCalls.filter(c => c.tindakLanjut === 'Janji Bayar').length;
      const ptpRate = connected > 0 ? (ptp / connected) * 100 : 0;

      const keptCount = offCalls.filter(c => 
        c.tindakLanjut === 'Janji Bayar' && 
        c.tanggalJanjiBayar !== null // dynamic validation
      ).length; // simpler kept estimate for officer dashboard
      const promiseKept = ptp > 0 ? (keptCount / ptp) * 100 : 0;

      const statusCounts = {
        Terjadwal: offSchedules.filter(s => s.status === 'Terjadwal').length,
        'Dalam Proses': offSchedules.filter(s => s.status === 'Dalam Proses').length,
        Selesai: offSchedules.filter(s => s.status === 'Selesai').length,
        Batal: offSchedules.filter(s => s.status === 'Batal').length,
        'Lewat Jatuh Tempo': offSchedules.filter(s => s.status === 'Lewat Jatuh Tempo').length
      };

      const rollRate = offSchedules.length > 0 ? (statusCounts['Lewat Jatuh Tempo'] / offSchedules.length) * 100 : 0;

      // Find dominant KOL
      const kolCounts: { [kol: string]: number } = {};
      offSchedules.forEach(s => {
        kolCounts[s.kol] = (kolCounts[s.kol] || 0) + 1;
      });
      let dominantKol = 'N/A';
      let maxCount = 0;
      Object.keys(kolCounts).forEach(k => {
        if (kolCounts[k] > maxCount) {
          maxCount = kolCounts[k];
          dominantKol = k;
        }
      });

      return {
        id: officer.id,
        nama: officer.nama,
        posisi: officer.posisi,
        totalJadwal: offSchedules.length,
        selesai: statusCounts.Selesai,
        dalamProses: statusCounts['Dalam Proses'],
        batal: statusCounts.Batal,
        lewatJatuhTempo: statusCounts['Lewat Jatuh Tempo'],
        totalTarget,
        totalRealisasi,
        achievement,
        ptpRate,
        promiseKept,
        rollRate,
        dominantKol,
        statusCounts
      };
    });

    // Sort by Achievement descending
    performance.sort((a, b) => b.achievement - a.achievement);

    return c.json(performance);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /rollrate - Roll Rate & Cure Rate per KOL (Two Methods)
kpiRouter.get('/rollrate', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const [year, month] = periode.split('-').map(Number);

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const schedules = await prisma.jadwalPenagihan.findMany({
      where: { tanggal: { gte: startOfMonth, lte: endOfMonth } }
    });

    const kols = ['DPK', 'Kurang Lancar', 'Diragukan', 'Macet'];

    // Method 1: Berbasis Kunjungan P3
    const method1 = kols.map((kol) => {
      const kolSchedules = schedules.filter(s => s.kol === kol);
      const total = kolSchedules.length;
      const overdue = kolSchedules.filter(s => s.status === 'Lewat Jatuh Tempo').length;
      const cured = kolSchedules.filter(s => s.status === 'Selesai' && s.nominalRealisasi >= s.targetTagih).length;

      return {
        kol,
        totalSamples: total,
        rollRate: total > 0 ? (overdue / total) * 100 : 0,
        cureRate: total > 0 ? (cured / total) * 100 : 0
      };
    });

    // Method 2: Berbasis Riwayat KOL Debitur
    // Fetch last month's snapshots
    const lastMonthSnapshot = await prisma.debiturKolHistory.findMany({
      where: {
        tanggalSnapshot: {
          gte: new Date(year, month - 2, 1),
          lte: new Date(year, month - 1, 0, 23, 59, 59)
        }
      }
    });

    const allDebitur = await prisma.debitur.findMany();

    const method2 = kols.map((kol) => {
      const prevDebiturs = lastMonthSnapshot.filter(h => h.kol === kol);
      const total = prevDebiturs.length;

      let rolled = 0;
      let cured = 0;

      prevDebiturs.forEach((h) => {
        const curr = allDebitur.find(d => d.id === h.debiturId);
        if (curr) {
          const prevVal = KOL_VALUES[h.kol] || 2;
          const currVal = KOL_VALUES[curr.kol] || 2;
          
          if (currVal > prevVal) {
            rolled++; // memburuk
          } else if (currVal < prevVal) {
            cured++; // membaik
          }
        }
      });

      return {
        kol,
        totalSamples: total,
        rollRate: total > 0 ? (rolled / total) * 100 : 0,
        cureRate: total > 0 ? (cured / total) * 100 : 0
      };
    });

    return c.json({
      method1,
      method2
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
