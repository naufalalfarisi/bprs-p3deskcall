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

const ROW_KOLS = ['Lancar', 'DPK', 'Kurang Lancar', 'Diragukan', 'Macet'];
const COL_KOLS = ['Lancar', 'DPK', 'Kurang Lancar', 'Diragukan', 'Macet', 'Lunas'];

export interface MigrationCell {
  noa: number;
  bakiDebet: number;
  percent: number;
  movement: 'cure' | 'steady' | 'roll' | 'lunas';
}

/**
 * Compute 5x6 NPF Migration / Transition Matrix between two snapshots or previous snapshot vs live data.
 */
export async function getKpiMigrationMatrix(fromPeriode?: string, toPeriode?: string) {
  // Fetch available snapshots list
  const distinctSnapshots = await prisma.debiturKolHistory.findMany({
    select: {
      bulanLabel: true,
      tanggalSnapshot: true
    },
    distinct: ['tanggalSnapshot'],
    orderBy: { tanggalSnapshot: 'desc' }
  });

  const availableSnapshots = distinctSnapshots.map(s => ({
    tanggalSnapshot: s.tanggalSnapshot,
    bulanLabel: s.bulanLabel,
    periodeStr: s.tanggalSnapshot.toISOString().substring(0, 7)
  }));

  // Determine 'From' snapshot
  let fromHistories: any[] = [];
  let fromLabel = 'Bulan Sebelumnya';

  if (fromPeriode) {
    const [y, m] = fromPeriode.split('-').map(Number);
    fromHistories = await prisma.debiturKolHistory.findMany({
      where: {
        tanggalSnapshot: {
          gte: new Date(y, m - 1, 1),
          lte: new Date(y, m, 0, 23, 59, 59, 999)
        }
      }
    });
    fromLabel = fromPeriode;
  } else if (availableSnapshots.length > 0) {
    const latestSnapshotDate = availableSnapshots[0].tanggalSnapshot;
    fromHistories = await prisma.debiturKolHistory.findMany({
      where: { tanggalSnapshot: latestSnapshotDate }
    });
    fromLabel = availableSnapshots[0].bulanLabel || availableSnapshots[0].periodeStr;
  }

  // Determine 'To' data: either specific snapshot or live Debitur portfolio
  let toMap = new Map<string, { kol: string; bakiDebet: number; statusDebitur: string }>();
  let toLabel = 'Posisi Live';

  if (toPeriode) {
    const [y, m] = toPeriode.split('-').map(Number);
    const toHistories = await prisma.debiturKolHistory.findMany({
      where: {
        tanggalSnapshot: {
          gte: new Date(y, m - 1, 1),
          lte: new Date(y, m, 0, 23, 59, 59, 999)
        }
      }
    });
    toHistories.forEach(h => {
      toMap.set(h.debiturId, { kol: h.kol, bakiDebet: h.bakiDebet, statusDebitur: 'Aktif' });
    });
    toLabel = toPeriode;
  } else {
    const activeDebs = await prisma.debitur.findMany({
      select: { id: true, kol: true, bakiDebet: true, statusDebitur: true }
    });
    activeDebs.forEach(d => {
      toMap.set(d.id, {
        kol: d.statusDebitur === 'Lunas' ? 'Lunas' : d.kol,
        bakiDebet: d.bakiDebet,
        statusDebitur: d.statusDebitur
      });
    });
  }

  // Build matrix grid
  const matrix: Record<string, Record<string, MigrationCell>> = {};
  const rowTotals: Record<string, { noa: number; bakiDebet: number }> = {};
  const colTotals: Record<string, { noa: number; bakiDebet: number }> = {};

  ROW_KOLS.forEach(r => {
    matrix[r] = {};
    rowTotals[r] = { noa: 0, bakiDebet: 0 };
    COL_KOLS.forEach(c => {
      let movement: 'cure' | 'steady' | 'roll' | 'lunas' = 'steady';
      if (c === 'Lunas') {
        movement = 'lunas';
      } else {
        const rVal = KOL_VALUES[r] || 2;
        const cVal = KOL_VALUES[c] || 2;
        if (cVal < rVal) movement = 'cure';
        else if (cVal > rVal) movement = 'roll';
        else movement = 'steady';
      }

      matrix[r][c] = {
        noa: 0,
        bakiDebet: 0,
        percent: 0,
        movement
      };
    });
  });

  COL_KOLS.forEach(c => {
    colTotals[c] = { noa: 0, bakiDebet: 0 };
  });

  let totalEvaluatedNoa = 0;
  let totalEvaluatedBaki = 0;
  let totalCuredNoa = 0;
  let totalCuredBaki = 0;
  let totalRolledNoa = 0;
  let totalRolledBaki = 0;
  let totalSteadyNoa = 0;
  let totalSteadyBaki = 0;
  let npfInflowBaki = 0; // Migrating from KOL 1/2 to KOL 3/4/5
  let npfOutflowBaki = 0; // Migrating from KOL 3/4/5 to KOL 1/2 or Lunas

  fromHistories.forEach(fromRecord => {
    const fromKol = fromRecord.kol;
    if (!ROW_KOLS.includes(fromKol)) return;

    const toData = toMap.get(fromRecord.debiturId);
    let toKol = toData ? toData.kol : 'Lunas';
    if (!COL_KOLS.includes(toKol)) {
      toKol = toData?.statusDebitur === 'Lunas' ? 'Lunas' : 'Macet';
    }

    const baki = fromRecord.bakiDebet || 0;

    matrix[fromKol][toKol].noa += 1;
    matrix[fromKol][toKol].bakiDebet += baki;
    rowTotals[fromKol].noa += 1;
    rowTotals[fromKol].bakiDebet += baki;
    colTotals[toKol].noa += 1;
    colTotals[toKol].bakiDebet += baki;

    totalEvaluatedNoa++;
    totalEvaluatedBaki += baki;

    const fromVal = KOL_VALUES[fromKol] || 2;
    const toVal = toKol === 'Lunas' ? 0 : (KOL_VALUES[toKol] || 2);

    if (toKol === 'Lunas' || toVal < fromVal) {
      totalCuredNoa++;
      totalCuredBaki += baki;
    } else if (toVal > fromVal) {
      totalRolledNoa++;
      totalRolledBaki += baki;
    } else {
      totalSteadyNoa++;
      totalSteadyBaki += baki;
    }

    // NPF Inflow & Outflow
    const fromIsNpf = ['Kurang Lancar', 'Diragukan', 'Macet'].includes(fromKol);
    const toIsNpf = ['Kurang Lancar', 'Diragukan', 'Macet'].includes(toKol);

    if (!fromIsNpf && toIsNpf) {
      npfInflowBaki += baki;
    } else if (fromIsNpf && !toIsNpf) {
      npfOutflowBaki += baki;
    }
  });

  // Calculate percentages per row
  ROW_KOLS.forEach(r => {
    const rTotalNoa = rowTotals[r].noa;
    COL_KOLS.forEach(c => {
      if (rTotalNoa > 0) {
        matrix[r][c].percent = parseFloat(((matrix[r][c].noa / rTotalNoa) * 100).toFixed(1));
      }
    });
  });

  const overallCureRatePct = totalEvaluatedNoa > 0
    ? parseFloat(((totalCuredNoa / totalEvaluatedNoa) * 100).toFixed(2))
    : 0;
  const overallRollRatePct = totalEvaluatedNoa > 0
    ? parseFloat(((totalRolledNoa / totalEvaluatedNoa) * 100).toFixed(2))
    : 0;
  const netNpfMigrationNominal = npfInflowBaki - npfOutflowBaki;

  return {
    fromLabel,
    toLabel,
    availableSnapshots,
    rowKols: ROW_KOLS,
    colKols: COL_KOLS,
    matrix,
    rowTotals,
    colTotals,
    summary: {
      totalEvaluatedNoa,
      totalEvaluatedBaki,
      totalCuredNoa,
      totalCuredBaki,
      totalRolledNoa,
      totalRolledBaki,
      totalSteadyNoa,
      totalSteadyBaki,
      overallCureRatePct,
      overallRollRatePct,
      npfInflowBaki,
      npfOutflowBaki,
      netNpfMigrationNominal
    }
  };
}

/**
 * Execute interactive What-If Stress Testing & Target Simulation on active loan portfolio.
 */
export async function runNpfStressTest(params: {
  targetRecoveryNominal?: number;
  restrukturisasiKol3Nominal?: number;
  dpkRollOverPercent?: number;
}) {
  const targetRecovery = Math.max(0, Number(params.targetRecoveryNominal) || 0);
  const restrukKol3 = Math.max(0, Number(params.restrukturisasiKol3Nominal) || 0);
  const dpkRollPct = Math.min(100, Math.max(0, Number(params.dpkRollOverPercent) || 0));

  // Fetch current active debiturs
  const activeDebs = await prisma.debitur.findMany({
    where: { statusDebitur: 'Aktif' },
    select: { kol: true, bakiDebet: true }
  });

  let totalBaki = 0;
  let lancarBaki = 0;
  let dpkBaki = 0;
  let klBaki = 0;
  let diragukanBaki = 0;
  let macetBaki = 0;

  activeDebs.forEach(d => {
    const b = d.bakiDebet || 0;
    totalBaki += b;
    if (d.kol === 'Lancar') lancarBaki += b;
    else if (d.kol === 'DPK') dpkBaki += b;
    else if (d.kol === 'Kurang Lancar') klBaki += b;
    else if (d.kol === 'Diragukan') diragukanBaki += b;
    else if (d.kol === 'Macet') macetBaki += b;
  });

  const currentNpfBaki = klBaki + diragukanBaki + macetBaki;
  const currentNpfGross = totalBaki > 0 ? (currentNpfBaki / totalBaki) * 100 : 0;
  const currentLar = totalBaki > 0 ? ((dpkBaki + currentNpfBaki) / totalBaki) * 100 : 0;

  // Baseline minimum PPAP requirement (OJK standard)
  // Lancar: 1%, DPK: 5%, KL: 15%, Diragukan: 50%, Macet: 100%
  const currentPpap = (lancarBaki * 0.01) + (dpkBaki * 0.05) + (klBaki * 0.15) + (diragukanBaki * 0.50) + (macetBaki * 1.00);

  // Apply Simulation Slices:
  // 1. Recovery on NPF: Reduces NPF baki and total portfolio baki (cash in)
  const actualRecovery = Math.min(targetRecovery, currentNpfBaki);

  // 2. Restrukturisasi on KL: Moves KL balance to performing DPK/Lancar (does not reduce total baki)
  const actualRestruk = Math.min(restrukKol3, Math.max(0, klBaki));

  // 3. Shock / Roll over on DPK: % of DPK degrades to KL (increases NPF)
  const dpkDegradedToKl = dpkBaki * (dpkRollPct / 100);

  // Compute Simulated Balances
  const simTotalBaki = Math.max(1, totalBaki - actualRecovery);
  const simLancarBaki = lancarBaki;
  const simDpkBaki = Math.max(0, dpkBaki - dpkDegradedToKl + actualRestruk);
  const simKlBaki = Math.max(0, klBaki - actualRestruk + dpkDegradedToKl - (actualRecovery * (klBaki / (currentNpfBaki || 1))));
  const simDiragukanBaki = Math.max(0, diragukanBaki - (actualRecovery * (diragukanBaki / (currentNpfBaki || 1))));
  const simMacetBaki = Math.max(0, macetBaki - (actualRecovery * (macetBaki / (currentNpfBaki || 1))));

  const simNpfBaki = simKlBaki + simDiragukanBaki + simMacetBaki;
  const simNpfGross = (simNpfBaki / simTotalBaki) * 100;
  const simLar = ((simDpkBaki + simNpfBaki) / simTotalBaki) * 100;
  const simPpap = (simLancarBaki * 0.01) + (simDpkBaki * 0.05) + (simKlBaki * 0.15) + (simDiragukanBaki * 0.50) + (simMacetBaki * 1.00);

  const npfDelta = simNpfGross - currentNpfGross;
  const ppapDelta = simPpap - currentPpap;

  let conclusion = '';
  if (simNpfGross <= 5.0) {
    conclusion = `Target NPF Gross Sehat Tercapai (${simNpfGross.toFixed(2)}% ≤ 5.00%). Portofolio berada di zona aman regulasi OJK.`;
  } else if (simNpfGross < currentNpfGross) {
    conclusion = `NPF Gross membaik sebesar ${Math.abs(npfDelta).toFixed(2)}% (dari ${currentNpfGross.toFixed(2)}% menjadi ${simNpfGross.toFixed(2)}%), namun masih memerlukan tambahan recovery Rp ${((simNpfBaki - (simTotalBaki * 0.05))).toLocaleString('id-ID')} untuk mencapai ambang batas 5.00%.`;
  } else {
    conclusion = `Peringatan Risiko: Skenario pemburukan menyebabkan NPF Gross naik sebesar +${npfDelta.toFixed(2)}% menjadi ${simNpfGross.toFixed(2)}%, memicu kebutuhan tambahan cadangan PPAP sebesar Rp ${Math.max(0, ppapDelta).toLocaleString('id-ID')}.`;
  }

  return {
    baseline: {
      totalNOA: activeDebs.length,
      totalBaki,
      lancarBaki,
      dpkBaki,
      klBaki,
      diragukanBaki,
      macetBaki,
      npfBaki: currentNpfBaki,
      npfGross: parseFloat(currentNpfGross.toFixed(2)),
      lar: parseFloat(currentLar.toFixed(2)),
      ppapRequirement: Math.round(currentPpap)
    },
    simulation: {
      targetRecoveryApplied: actualRecovery,
      restrukturisasiApplied: actualRestruk,
      dpkDegradedAmount: Math.round(dpkDegradedToKl),
      simTotalBaki: Math.round(simTotalBaki),
      simDpkBaki: Math.round(simDpkBaki),
      simNpfBaki: Math.round(simNpfBaki),
      simNpfGross: parseFloat(simNpfGross.toFixed(2)),
      simLar: parseFloat(simLar.toFixed(2)),
      simPpapRequirement: Math.round(simPpap),
      npfDeltaPercent: parseFloat(npfDelta.toFixed(2)),
      ppapDeltaNominal: Math.round(ppapDelta),
      conclusion
    }
  };
}

/**
 * Fetch comprehensive executive reporting dataset for PDF generation & board meetings.
 */
export async function getExecutiveReportData(periode?: string) {
  const activePeriode = periode || new Date().toISOString().substring(0, 7);
  const [dashboardData, migrationData, appSettings] = await Promise.all([
    getKpiDashboard(activePeriode),
    getKpiMigrationMatrix(),
    prisma.appSetting.findMany()
  ]);

  const settingsMap: Record<string, string> = {};
  appSettings.forEach(s => { settingsMap[s.key] = s.value; });

  // Top 10 largest NPF accounts
  const topNpfDebitur = await prisma.debitur.findMany({
    where: {
      statusDebitur: 'Aktif',
      kol: { in: ['Kurang Lancar', 'Diragukan', 'Macet'] }
    },
    select: {
      id: true,
      nama: true,
      ao: true,
      kol: true,
      bakiDebet: true,
      totalTunggakan: true,
      telepon: true
    },
    orderBy: { bakiDebet: 'desc' },
    take: 10
  });

  // AO summary
  const allDebs = await prisma.debitur.findMany({
    where: { statusDebitur: 'Aktif' },
    select: { ao: true, kol: true, bakiDebet: true }
  });

  const aoMap: Record<string, { ao: string; noa: number; totalBaki: number; npfBaki: number }> = {};
  allDebs.forEach(d => {
    const aoName = d.ao || 'Tanpa AO';
    if (!aoMap[aoName]) {
      aoMap[aoName] = { ao: aoName, noa: 0, totalBaki: 0, npfBaki: 0 };
    }
    aoMap[aoName].noa++;
    aoMap[aoName].totalBaki += (d.bakiDebet || 0);
    if (['Kurang Lancar', 'Diragukan', 'Macet'].includes(d.kol)) {
      aoMap[aoName].npfBaki += (d.bakiDebet || 0);
    }
  });

  const aoPerformance = Object.values(aoMap)
    .map(a => ({
      ...a,
      npfRatio: a.totalBaki > 0 ? parseFloat(((a.npfBaki / a.totalBaki) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.totalBaki - a.totalBaki);

  return {
    periode: activePeriode,
    generatedAt: new Date().toISOString(),
    institution: {
      name: settingsMap['pt_name'] || 'PT BPRS Mitra Harmoni Yogyakarta',
      address: settingsMap['pt_address'] || 'Yogyakarta, Indonesia',
      phone: settingsMap['pt_phone'] || '(0274) 123456',
      logoUrl: settingsMap['logo_url'] || ''
    },
    kpi: dashboardData,
    migrationSummary: migrationData.summary,
    topNpfDebitur,
    aoPerformance
  };
}

