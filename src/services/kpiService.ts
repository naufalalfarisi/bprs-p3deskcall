import { prisma } from '../db.js';

export const DEFAULT_TARGETS = {
  npfGross: 7.0,
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

export const KOL_VALUES: { [key: string]: number } = {
  'Lancar': 1,
  'DPK': 2,
  'Kurang Lancar': 3,
  'Diragukan': 4,
  'Macet': 5
};

export interface SaveKpiTargetsParams {
  periode: string;
  npfGross: number | string;
  collectionRate: number | string;
  recoveryRate: number | string;
  cureRate: number | string;
  ptpRate: number | string;
  promiseKept: number | string;
  coverageRatio: number | string;
  kunjunganPerPetugas: number | string;
  restrukSuccess: number | string;
  ppapCoverage: number | string;
  updatedBy: string;
}

/**
 * Fetch RBB target for a given period (YYYY-MM).
 */
export async function getKpiTargets(periode: string) {
  const target = await prisma.rbbTarget.findUnique({ where: { periode } });
  if (!target) {
    return {
      periode,
      ...DEFAULT_TARGETS,
      isDefault: true
    };
  }
  return {
    ...target,
    isDefault: false
  };
}

/**
 * Create or update RBB target for a given period.
 */
export async function saveKpiTargets(params: SaveKpiTargetsParams) {
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
    ppapCoverage,
    updatedBy
  } = params;

  return prisma.rbbTarget.upsert({
    where: { periode },
    create: {
      periode,
      npfGross: parseFloat(String(npfGross)),
      collectionRate: parseFloat(String(collectionRate)),
      recoveryRate: parseFloat(String(recoveryRate)),
      cureRate: parseFloat(String(cureRate)),
      ptpRate: parseFloat(String(ptpRate)),
      promiseKept: parseFloat(String(promiseKept)),
      coverageRatio: parseFloat(String(coverageRatio)),
      kunjunganPerPetugas: parseFloat(String(kunjunganPerPetugas)),
      restrukSuccess: parseFloat(String(restrukSuccess)),
      ppapCoverage: parseFloat(String(ppapCoverage)),
      updatedBy
    },
    update: {
      npfGross: parseFloat(String(npfGross)),
      collectionRate: parseFloat(String(collectionRate)),
      recoveryRate: parseFloat(String(recoveryRate)),
      cureRate: parseFloat(String(cureRate)),
      ptpRate: parseFloat(String(ptpRate)),
      promiseKept: parseFloat(String(promiseKept)),
      coverageRatio: parseFloat(String(coverageRatio)),
      kunjunganPerPetugas: parseFloat(String(kunjunganPerPetugas)),
      restrukSuccess: parseFloat(String(restrukSuccess)),
      ppapCoverage: parseFloat(String(ppapCoverage)),
      updatedBy
    }
  });
}

/**
 * Compute 16 KPI cards and statistics for dashboard view.
 */
export async function getKpiDashboard(periode: string) {
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
  const totalBaki = allDebitur.reduce((sum, d) => sum + d.bakiDebet, 0);
  const npfBaki = npfDebitur.reduce((sum, d) => sum + d.bakiDebet, 0);
  const npfGross = totalBaki > 0 ? (npfBaki / totalBaki) * 100 : 0;

  // 1b. Last Month NPF Gross
  const prevMonthDate = new Date(year, month - 2, 1);
  const lastMonthName = prevMonthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  const targetLabel = prevMonthDate.toLocaleDateString('id-ID', { month: 'long' });

  const lmSnapshotRaw = await prisma.debiturKolHistory.findMany({
    where: {
      bulanLabel: { contains: targetLabel }
    },
    orderBy: { tanggalSnapshot: 'desc' }
  });

  // Deduplicate by debiturId to ensure 1 snapshot per debitur for last month
  const lmSnapshotMap = new Map<string, typeof lmSnapshotRaw[0]>();
  lmSnapshotRaw.forEach(h => {
    if (!lmSnapshotMap.has(h.debiturId)) {
      lmSnapshotMap.set(h.debiturId, h);
    }
  });
  const lmSnapshot = Array.from(lmSnapshotMap.values());

  let lastMonthNpfGross = 0;
  let lastMonthTotalBaki = 0;
  let lastMonthNpfBaki = 0;

  if (lmSnapshot.length > 0) {
    lastMonthTotalBaki = lmSnapshot.reduce((s, h) => s + (h.bakiDebet || 0), 0);
    lastMonthNpfBaki = lmSnapshot.filter(h => ['Kurang Lancar', 'Diragukan', 'Macet'].includes(h.kol)).reduce((s, h) => s + (h.bakiDebet || 0), 0);
    lastMonthNpfGross = lastMonthTotalBaki > 0 ? (lastMonthNpfBaki / lastMonthTotalBaki) * 100 : npfGross;
  } else {
    lastMonthNpfGross = npfGross;
  }

  // 2. PPAP Coverage
  const ppapCoverage = 100.0;

  // 3. Recovery Rate
  const npfDebiturIds = npfDebitur.map(d => d.id);
  const npfPayments = monthlyPayments.filter(p => npfDebiturIds.includes(p.debiturId));
  const totalPaidNpf = npfPayments.reduce((sum, p) => sum + p.nominal, 0);
  const totalTunggakanNpf = npfDebitur.reduce((sum, d) => sum + d.totalTunggakan, 0);
  const recoveryRate = Math.min(totalTunggakanNpf > 0 ? (totalPaidNpf / totalTunggakanNpf) * 100 : 0, 100);

  // 4. Cure Rate
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
    if (['Kurang Lancar', 'Diragukan', 'Macet'].includes(h.kol)) {
      totalNpfHist++;
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
  const totalTargetTagih = monthlySchedules.reduce((sum, s) => sum + s.targetTagih, 0);
  const totalRealisasiTagih = monthlySchedules.reduce((sum, s) => sum + s.nominalRealisasi, 0);
  const collectionRate = totalTargetTagih > 0 ? (totalRealisasiTagih / totalTargetTagih) * 100 : 0;

  const callsConnected = monthlyCalls.filter(c => c.statusKontak === 'Terhubung').length;
  const callsPtp = monthlyCalls.filter(c => c.tindakLanjut === 'Janji Bayar').length;
  const ptpRate = callsConnected > 0 ? (callsPtp / callsConnected) * 100 : 0;

  const keptCount = await prisma.deskCall.count({
    where: {
      tanggal: { gte: startOfMonth, lte: endOfMonth },
      tindakLanjut: 'Janji Bayar',
      tanggalJanjiBayar: { not: null },
      debitur: {
        OR: [
          { pembayaran: { some: {} } },
          { deskCalls: { some: { OR: [{ tindakLanjut: 'Sudah Bayar' }, { tindakLanjut: { contains: 'Sudah Bayar' } }] } } }
        ]
      }
    }
  });
  const promiseKeptRate = callsPtp > 0 ? parseFloat(((keptCount / callsPtp) * 100).toFixed(1)) : 0;
  let promiseKeptCategory = 'Perlu Perhatian';
  if (promiseKeptRate >= 70) promiseKeptCategory = 'Sangat Baik';
  else if (promiseKeptRate >= 40) promiseKeptCategory = 'Sedang';

  const schedulesOverdue = monthlySchedules.filter(s => s.status === 'Lewat Jatuh Tempo').length;
  const rollRate = monthlySchedules.length > 0 ? (schedulesOverdue / monthlySchedules.length) * 100 : 0;

  // -------------------------------------------------------------
  // GRUP 3: Produktivitas Petugas
  // -------------------------------------------------------------
  const scheduledNpfIds = new Set(monthlySchedules.map(s => s.debiturId));
  const coveredNpfCount = npfDebitur.filter(d => scheduledNpfIds.has(d.id)).length;
  const coverageRatio = npfDebitur.length > 0 ? (coveredNpfCount / npfDebitur.length) * 100 : 0;

  const distinctOfficers = new Set(monthlySchedules.map(s => s.petugasId)).size;
  const kunjunganPerPetugas = distinctOfficers > 0 ? monthlySchedules.length / distinctOfficers : 0;

  const achievementRate = collectionRate;
  const avgTagihanKunjungan = monthlySchedules.length > 0 ? totalTargetTagih / monthlySchedules.length : 0;

  // -------------------------------------------------------------
  // GRUP 4: Restrukturisasi & Penyelesaian
  // -------------------------------------------------------------
  const restrukSchedules = monthlySchedules.filter(s => s.jenisTagih.toLowerCase().includes('restrukturisasi'));
  const restrukSucceeded = restrukSchedules.filter(s => s.status === 'Selesai').length;
  const restrukSuccessRate = restrukSchedules.length > 0 ? (restrukSucceeded / restrukSchedules.length) * 100 : 0;

  const totalRestrukturisasi = allDebitur.filter(d => d.restruk > 0).length;

  const legalBerkasCount = await prisma.legalBerkas.count();
  const legalActionRate = npfDebitur.length > 0 ? (legalBerkasCount / npfDebitur.length) * 100 : 0;

  const aydaCount = await prisma.legalBerkas.count({
    where: { jenisAgunan: { contains: 'AYDA' } }
  });

  return {
    target,
    stats: {
      npfGross,
      lastMonthNpfGross,
      lastMonthName,
      ppapCoverage,
      recoveryRate,
      cureRate,
      collectionRate,
      ptpRate,
      promiseKeptRate,
      promiseKeptCategory,
      rollRate,
      coverageRatio,
      kunjunganPerPetugas,
      achievementRate,
      avgTagihanKunjungan,
      restrukSuccessRate,
      totalRestrukturisasi,
      legalActionRate,
      aydaCount
    }
  };
}

/**
 * Compute ranking and performance per officer.
 */
export async function getKpiOfficers(periode: string) {
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
      c.tanggalJanjiBayar !== null
    ).length;
    const promiseKept = ptp > 0 ? (keptCount / ptp) * 100 : 0;

    const statusCounts = {
      Terjadwal: offSchedules.filter(s => s.status === 'Terjadwal').length,
      'Dalam Proses': offSchedules.filter(s => s.status === 'Dalam Proses').length,
      Selesai: offSchedules.filter(s => s.status === 'Selesai').length,
      Batal: offSchedules.filter(s => s.status === 'Batal').length,
      'Lewat Jatuh Tempo': offSchedules.filter(s => s.status === 'Lewat Jatuh Tempo').length
    };

    const rollRate = offSchedules.length > 0 ? (statusCounts['Lewat Jatuh Tempo'] / offSchedules.length) * 100 : 0;

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

  performance.sort((a, b) => b.achievement - a.achievement);
  return performance;
}

/**
 * Compute Roll Rate & Cure Rate per KOL using 2 methods.
 */
export async function getKpiRollrate(periode: string) {
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
          rolled++;
        } else if (currVal < prevVal) {
          cured++;
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

  return {
    method1,
    method2
  };
}
