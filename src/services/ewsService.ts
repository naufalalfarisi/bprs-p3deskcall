import { prisma } from '../db.js';

/**
 * Calculate EWS status on-demand per debitur based on due date & DPD.
 */
export function computeEwsStatus(tglJt: Date | null, frhPokok: number) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed
  const todayMidnight = new Date(currentYear, currentMonth, today.getDate()).getTime();

  if (frhPokok && frhPokok > 0) {
    const dpd = frhPokok;
    if (dpd > 14) {
      return { status: 'DPD 2+ / Kritis', label: `DPD ${dpd} Hari`, category: 'CRITICAL', code: 'RED', badgeClass: 'badge-red', diffDays: -dpd, dpd };
    } else if (dpd >= 8) {
      return { status: 'DPD 8-14 / Bermasalah', label: `DPD ${dpd} Hari`, category: 'VERY_HIGH', code: 'PURPLE', badgeClass: 'badge-purple', diffDays: -dpd, dpd };
    } else {
      return { status: 'DPD 1-7 / Perhatian', label: `DPD ${dpd} Hari`, category: 'HIGH', code: 'ORANGE', badgeClass: 'badge-orange', diffDays: -dpd, dpd };
    }
  }

  // If no frhPokok (not in arrears), check distance to due date:
  let targetDueDate: Date;
  if (tglJt) {
    const dt = new Date(tglJt);
    if (!isNaN(dt.getTime())) {
      const dtMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
      if (dtMidnight >= todayMidnight) {
        targetDueDate = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
      } else {
        // If dt date is in the past, evaluate recurring monthly due day
        const dueDay = dt.getDate();
        const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const actualDueDay = Math.min(dueDay, lastDayOfCurrentMonth);
        const thisMonthDue = new Date(currentYear, currentMonth, actualDueDay);
        if (thisMonthDue.getTime() >= todayMidnight) {
          targetDueDate = thisMonthDue;
        } else {
          const lastDayOfNextMonth = new Date(currentYear, currentMonth + 2, 0).getDate();
          const actualNextDueDay = Math.min(dueDay, lastDayOfNextMonth);
          targetDueDate = new Date(currentYear, currentMonth + 1, actualNextDueDay);
        }
      }
    } else {
      targetDueDate = new Date(currentYear, currentMonth, 25);
    }
  } else {
    targetDueDate = new Date(currentYear, currentMonth, 25);
  }

  const diffDays = Math.round((targetDueDate.getTime() - todayMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) {
    return { status: 'Lancar / Normal', label: `H-${diffDays} Jatuh Tempo`, category: 'LOW', code: 'GREEN', badgeClass: 'badge-green', diffDays };
  } else if (diffDays >= 0) {
    return { status: 'Reminder', label: diffDays === 0 ? 'Hari H Jatuh Tempo' : 'H-1 Jatuh Tempo', category: 'MEDIUM', code: 'YELLOW', badgeClass: 'badge-yellow', diffDays };
  } else {
    const dpd = Math.abs(diffDays);
    if (dpd > 14) {
      return { status: 'DPD 2+ / Kritis', label: `DPD ${dpd} Hari`, category: 'CRITICAL', code: 'RED', badgeClass: 'badge-red', diffDays, dpd };
    } else if (dpd >= 8) {
      return { status: 'DPD 8-14 / Bermasalah', label: `DPD ${dpd} Hari`, category: 'VERY_HIGH', code: 'PURPLE', badgeClass: 'badge-purple', diffDays, dpd };
    } else {
      return { status: 'DPD 1-7 / Perhatian', label: `DPD ${dpd} Hari`, category: 'HIGH', code: 'ORANGE', badgeClass: 'badge-orange', diffDays, dpd };
    }
  }
}

/**
 * Filter target KOL based on user role.
 */
export function getEwsKolsForRole(posisi: string): string[] | null {
  if (posisi === 'ao' || posisi === 'kabid_ao') {
    return ['Lancar', '1', 'KOL 1', 'DPK', '2', 'KOL 2', 'Kurang Lancar', '3', 'KOL 3'];
  }
  if (posisi === 'staff_p3' || posisi === 'kabid_p3') {
    return ['Kurang Lancar', '3', 'KOL 3', 'Diragukan', '4', 'KOL 4', 'Macet', '5', 'KOL 5'];
  }
  return null;
}

/**
 * Compute portfolio EWS summary stats header.
 */
export async function getEwsSummary(user: any, reqAo?: string) {
  let whereClause: any = { statusDebitur: 'Aktif' };
  const roleKols = getEwsKolsForRole(user.posisi);
  if (roleKols) {
    whereClause.kol = { in: roleKols };
  }

  if (user.posisi === 'ao') {
    if (user.aoNameRef) {
      whereClause.OR = [
        { aoId: user.id },
        { ao: user.aoNameRef }
      ];
    } else {
      whereClause.aoId = user.id;
    }
  } else if (reqAo) {
    whereClause.OR = [
      { aoId: reqAo },
      { ao: reqAo }
    ];
  }

  const debiturs = await prisma.debitur.findMany({ where: whereClause });

  let totalDebitur = debiturs.length;
  let lancarCount = 0;
  let dpkCount = 0;
  let npfWatchlistCount = 0;
  let totalBakiDebetBerisiko = 0;
  let totalTunggakan = 0;

  const kolDistribution: Record<string, number> = {
    Lancar: 0,
    DPK: 0,
    'Kurang Lancar': 0,
    Diragukan: 0,
    Macet: 0
  };

  const ewsStatusCounts: Record<string, number> = {
    Reminder: 0,
    'Jatuh Tempo Hari Ini': 0,
    'DPD 1 / Dalam Perhatian': 0,
    'DPD 2+ / Bermasalah': 0,
    'Lancar / Normal': 0
  };

  debiturs.forEach((d) => {
    totalTunggakan += d.totalTunggakan || 0;
    
    const k = d.kol || 'Lancar';
    kolDistribution[k] = (kolDistribution[k] || 0) + 1;

    if (k === 'Lancar') lancarCount++;
    else if (k === 'DPK') {
      dpkCount++;
      totalBakiDebetBerisiko += d.bakiDebet || 0;
    } else {
      npfWatchlistCount++;
      totalBakiDebetBerisiko += d.bakiDebet || 0;
    }

    const ews = computeEwsStatus(d.tglJt, d.frhPokok);
    ewsStatusCounts[ews.status] = (ewsStatusCounts[ews.status] || 0) + 1;
  });

  return {
    totalDebitur,
    lancarCount,
    dpkCount,
    npfWatchlistCount,
    totalBakiDebetBerisiko,
    totalTunggakan,
    kolDistribution,
    ewsStatusCounts
  };
}

/**
 * Fetch debitur list for EWS Watchlist table with computed EWS status.
 */
export async function getEwsWatchlist(
  user: any,
  reqAo?: string,
  q?: string,
  kolParam?: string,
  ewsStatusParam?: string
) {
  let whereClause: any = { statusDebitur: 'Aktif' };
  const roleKols = getEwsKolsForRole(user.posisi);

  if (user.posisi === 'ao') {
    if (user.aoNameRef) {
      whereClause.OR = [
        { aoId: user.id },
        { ao: user.aoNameRef }
      ];
    } else {
      whereClause.aoId = user.id;
    }
  } else if (reqAo) {
    whereClause.OR = [
      { aoId: reqAo },
      { ao: reqAo }
    ];
  }

  if (kolParam) {
    if (roleKols && !roleKols.includes(kolParam)) {
      whereClause.kol = { in: [] };
    } else {
      whereClause.kol = kolParam;
    }
  } else if (roleKols) {
    whereClause.kol = { in: roleKols };
  }

  if (q) {
    const searchTerms = {
      OR: [
        { nama: { contains: q } },
        { id: { contains: q } },
        { ao: { contains: q } }
      ]
    };
    if (whereClause.OR) {
      whereClause = { AND: [whereClause, searchTerms] };
    } else {
      whereClause.OR = searchTerms.OR;
    }
  }

  const debiturs = await prisma.debitur.findMany({
    where: whereClause,
    include: {
      aoCollectionLogs: {
        orderBy: { tanggal: 'desc' },
        take: 1
      }
    },
    orderBy: [
      { totalTunggakan: 'desc' },
      { frhPokok: 'desc' }
    ]
  });

  const result = debiturs.map((d) => {
    const ews = computeEwsStatus(d.tglJt, d.frhPokok);
    const isOwnedByMe = user.posisi === 'admin' || d.aoId === user.id || (user.aoNameRef && d.ao === user.aoNameRef);

    return {
      ...d,
      ewsStatusInfo: ews,
      isOwnedByMe: !!isOwnedByMe,
      lastAoLog: d.aoCollectionLogs[0] || null
    };
  });

  return ewsStatusParam
    ? result.filter((item) => item.ewsStatusInfo.status === ewsStatusParam)
    : result;
}

export interface CreateAoCollectionLogParams {
  debiturId: string;
  jenisAktivitas: string;
  statusTindakLanjut: string;
  tanggalJanji?: string | null;
  catatan?: string;
}

/**
 * Add AO collection log entry with authorization check.
 */
export async function createAoCollectionLog(user: any, params: CreateAoCollectionLogParams) {
  const { debiturId, jenisAktivitas, statusTindakLanjut, tanggalJanji, catatan } = params;

  if (!debiturId || !jenisAktivitas || !statusTindakLanjut) {
    throw new Error('Debitur, jenis aktivitas, dan status tindak lanjut wajib diisi');
  }

  const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
  if (!debitur) {
    throw new Error('Data debitur tidak ditemukan');
  }

  const isOwner = debitur.aoId === user.id || (user.aoNameRef && debitur.ao === user.aoNameRef);
  if (user.posisi !== 'admin' && !isOwner) {
    throw new Error('Anda hanya diperbolehkan mencatat tindak lanjut untuk nasabah binaan Anda sendiri');
  }

  const tglJanjiDate = tanggalJanji ? new Date(tanggalJanji) : null;

  const log = await prisma.aoCollectionLog.create({
    data: {
      debiturId,
      namaDebitur: debitur.nama,
      aoId: debitur.aoId || user.id,
      kol: debitur.kol,
      bakiDebet: debitur.bakiDebet,
      jenisAktivitas,
      statusTindakLanjut,
      tanggalJanji: tglJanjiDate,
      catatan: catatan || '',
      createdBy: user.id
    }
  });

  return { log, debitur };
}

/**
 * Get collection logs for a debitur.
 */
export async function getAoCollectionLogs(debiturId: string) {
  return prisma.aoCollectionLog.findMany({
    where: { debiturId },
    include: {
      aoUser: { select: { nama: true, email: true } },
      createdByUser: { select: { nama: true } }
    },
    orderBy: { tanggal: 'desc' }
  });
}

/**
 * Compute performance leaderboard per AO.
 */
export async function getEwsLeaderboard(user: any) {
  if (user.posisi === 'ao') {
    throw new Error('Leaderboard hanya dapat diakses oleh Kabid AO dan Administrator');
  }

  const aoUsers = await prisma.user.findMany({
    where: { posisi: 'ao', status: 'active' },
    select: { id: true, nama: true, aoNameRef: true }
  });

  const leaderboard = await Promise.all(
    aoUsers.map(async (ao) => {
      const debiturs = await prisma.debitur.findMany({
        where: {
          statusDebitur: 'Aktif',
          OR: [
            { aoId: ao.id },
            ...(ao.aoNameRef ? [{ ao: ao.aoNameRef }] : [])
          ]
        }
      });

      const totalDebitur = debiturs.length;
      const totalBakiDebet = debiturs.reduce((acc, d) => acc + (d.bakiDebet || 0), 0);
      const npfDebiturs = debiturs.filter((d) => ['Kurang Lancar', 'Diragukan', 'Macet'].includes(d.kol));
      const npfBakiDebet = npfDebiturs.reduce((acc, d) => acc + (d.bakiDebet || 0), 0);
      const npfRatio = totalBakiDebet > 0 ? (npfBakiDebet / totalBakiDebet) * 100 : 0;

      const logs = await prisma.aoCollectionLog.findMany({
        where: {
          OR: [
            { aoId: ao.id },
            { createdBy: ao.id }
          ]
        }
      });

      const completedLogs = logs.filter((l) => l.statusTindakLanjut === 'Selesai Ditindaklanjuti').length;
      const successRate = logs.length > 0 ? (completedLogs / logs.length) * 100 : 0;

      return {
        aoId: ao.id,
        nama: ao.nama,
        aoNameRef: ao.aoNameRef,
        totalDebitur,
        totalBakiDebet,
        npfBakiDebet,
        npfRatio: Math.round(npfRatio * 10) / 10,
        totalLogs: logs.length,
        successRate: Math.round(successRate * 10) / 10
      };
    })
  );

  leaderboard.sort((a, b) => a.npfRatio - b.npfRatio);
  return leaderboard;
}
