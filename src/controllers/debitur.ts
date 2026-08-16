import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const debiturRouter = new Hono();

// All debitur routes require authentication
debiturRouter.use('*', authMiddleware);

// GET / - List debiturs with search, filters, pagination, dynamic counts, and AO list
debiturRouter.get('/', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const kolFilter = c.req.query('kol') || '';
    const aoFilter = c.req.query('ao') || '';
    const statusFilter = c.req.query('status') || 'Aktif'; // Aktif, Lunas, TidakDitemukan
    const jtHariIni = c.req.query('jtHariIni') || c.req.query('jt');

    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const limit = Math.max(1, Math.min(2000, parseInt(c.req.query('limit') || '50', 10)));

    // Base filter: allow searching across all debitur statuses (Aktif, Lunas, etc.) if statusFilter is 'all'/'Semua'
    const whereClause: any = {};
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'Semua') {
      whereClause.statusDebitur = statusFilter;
    }

    // Filter by search query (nama, no_rekening (id), kota, ao)
    if (q) {
      whereClause.OR = [
        { nama: { contains: q } },
        { id: { contains: q } },
        { kota: { contains: q } },
        { ao: { contains: q } }
      ];
    }

    // Filter by AO
    if (aoFilter && aoFilter !== 'Semua') {
      whereClause.ao = aoFilter;
    }

    // Filter by KOL / Lunas
    if (kolFilter === 'Lunas') {
      whereClause.statusDebitur = 'Lunas';
      delete whereClause.kol;
    } else if (kolFilter && kolFilter !== 'Semua' && kolFilter !== 'all') {
      whereClause.kol = kolFilter;
      if (!statusFilter || statusFilter === 'Aktif') {
        whereClause.statusDebitur = 'Aktif';
      }
    }

    // Filter by Jatuh Tempo (hari_ini, minggu_ini, 2_minggu)
    const jtVal = c.req.query('jt') || (jtHariIni === '1' || jtHariIni === 'true' ? 'hari_ini' : '');
    if (jtVal && jtVal !== 'all' && jtVal !== 'Semua') {
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
      const todayDay = today.getDate();
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

      let maxDays = 0;
      if (jtVal === 'hari_ini' || jtVal === '1') maxDays = 0;
      else if (jtVal === 'minggu_ini' || jtVal === '7') maxDays = 7;
      else if (jtVal === '2_minggu' || jtVal === '14') maxDays = 14;

      const candidates = await prisma.debitur.findMany({
        where: whereClause,
        select: { id: true, tglJt: true }
      });

      const matchedIds = candidates.filter(d => {
        if (!d.tglJt) return false;
        const dt = new Date(d.tglJt);
        if (maxDays === 0) {
          return dt.getDate() === todayDay || (dt >= startOfToday && dt <= new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999));
        } else {
          const endRange = new Date(today.getFullYear(), today.getMonth(), today.getDate() + maxDays, 23, 59, 59, 999);
          return (dt >= startOfToday && dt <= endRange) || (dt.getDate() >= todayDay && dt.getDate() <= todayDay + maxDays);
        }
      }).map(d => d.id);

      whereClause.id = { in: matchedIds };
    }

    // Total count for current filter
    const total = await prisma.debitur.count({ where: whereClause });

    // Fetch paginated data
    const debiturs = await prisma.debitur.findMany({
      where: whereClause,
      orderBy: { nama: 'asc' },
      skip: (page - 1) * limit,
      take: limit
    });

    // 1. Overall Portfolio Summary Stats (Independent of Jatuh Tempo / KOL dropdown filters)
    const basePortfolioWhere: any = {};
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'Semua') {
      basePortfolioWhere.statusDebitur = statusFilter;
    }

    const portfolioDebiturList = await prisma.debitur.findMany({
      where: basePortfolioWhere,
      select: { kol: true, bakiDebet: true, totalTunggakan: true, tPokok: true, tMargin: true }
    });

    let totalBakiDebet = 0;
    let totalTunggakan = 0;
    let macetCount = 0;
    let macetBakiDebet = 0;

    portfolioDebiturList.forEach((d) => {
      totalBakiDebet += d.bakiDebet || 0;
      totalTunggakan += d.totalTunggakan || ((d.tPokok || 0) + (d.tMargin || 0));
      if (d.kol === 'Macet') {
        macetCount++;
        macetBakiDebet += d.bakiDebet || 0;
      }
    });

    const summaryStats = {
      totalDebitur: portfolioDebiturList.length,
      totalBakiDebet,
      totalTunggakan,
      macetCount,
      macetBakiDebet
    };

    // 2. Dynamic KOL Counts for Pills (reflects Jatuh Tempo / AO / Search filters, excluding KOL filter itself)
    const countWhereClause = { ...whereClause };
    delete countWhereClause.kol;
    delete countWhereClause.statusDebitur;

    const matchedDebiturForPills = await prisma.debitur.findMany({
      where: countWhereClause,
      select: { kol: true, statusDebitur: true }
    });

    const counts = {
      Semua: 0,
      Lancar: 0,
      DPK: 0,
      'Kurang Lancar': 0,
      Diragukan: 0,
      Macet: 0,
      Lunas: 0
    };

    matchedDebiturForPills.forEach((d) => {
      if (d.statusDebitur === 'Lunas') {
        counts.Lunas++;
      } else {
        counts.Semua++;
        const k = d.kol as keyof typeof counts;
        if (k in counts && k !== 'Lunas' && k !== 'Semua') {
          counts[k]++;
        }
      }
    });

    // Fetch distinct AO list for dropdown filter
    const aoWhereClause: any = { ao: { not: '' } };
    if (statusFilter && statusFilter !== 'all' && statusFilter !== 'Semua') {
      aoWhereClause.statusDebitur = statusFilter;
    }

    const distinctAos = await prisma.debitur.findMany({
      select: { ao: true },
      distinct: ['ao'],
      where: aoWhereClause,
      orderBy: { ao: 'asc' }
    });
    const aos = distinctAos.map((a) => a.ao).filter(Boolean);

    // Fetch latest applied CBS import batch or sync date
    const lastCbsBatch = await prisma.importBatch.findFirst({
      where: { status: 'applied' },
      orderBy: { appliedAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        tanggalSnapshot: true,
        uploadedAt: true,
        appliedAt: true,
        totalUpdated: true
      }
    });

    let lastCbsUpdate: any = null;
    if (lastCbsBatch) {
      lastCbsUpdate = {
        fileName: lastCbsBatch.fileName,
        tanggalSnapshot: lastCbsBatch.tanggalSnapshot,
        uploadedAt: lastCbsBatch.uploadedAt,
        appliedAt: lastCbsBatch.appliedAt,
        displayDate: lastCbsBatch.appliedAt || lastCbsBatch.uploadedAt || lastCbsBatch.tanggalSnapshot
      };
    } else {
      const fallbackDebitur = await prisma.debitur.findFirst({
        where: { lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: 'desc' },
        select: { lastSyncedAt: true }
      });
      if (fallbackDebitur?.lastSyncedAt) {
        lastCbsUpdate = {
          fileName: 'CBS Data Sync',
          displayDate: fallbackDebitur.lastSyncedAt
        };
      }
    }

    return c.json({
      debiturs,
      counts,
      summaryStats,
      lastCbsUpdate,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      aos
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /summary/ao - Full summary of portfolio & NPF for ALL Account Officers (AO)
debiturRouter.get('/summary/ao', async (c) => {
  try {
    const statusFilter = c.req.query('status') || 'Aktif';
    
    const debiturs = await prisma.debitur.findMany({
      where: { statusDebitur: statusFilter },
      select: {
        ao: true,
        bakiDebet: true,
        kol: true
      }
    });

    const aoMap: { [aoName: string]: { ao: string; noa: number; totalBaki: number; npfBaki: number } } = {};

    debiturs.forEach(d => {
      const aoName = d.ao && d.ao.trim() ? d.ao.trim() : 'Tanpa AO';
      if (!aoMap[aoName]) {
        aoMap[aoName] = { ao: aoName, noa: 0, totalBaki: 0, npfBaki: 0 };
      }
      aoMap[aoName].noa += 1;
      aoMap[aoName].totalBaki += (d.bakiDebet || 0);
      if (['Kurang Lancar', 'Diragukan', 'Macet'].includes(d.kol)) {
        aoMap[aoName].npfBaki += (d.bakiDebet || 0);
      }
    });

    const aoList = Object.values(aoMap).sort((a, b) => b.totalBaki - a.totalBaki);
    return c.json(aoList);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /:id - Detail of a single debitur
debiturRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id'); // no_rekening

    const debitur = await prisma.debitur.findUnique({
      where: { id },
      include: {
        kolHistory: {
          orderBy: { tanggalSnapshot: 'desc' }
        },
        deskCalls: {
          orderBy: { tanggal: 'desc' },
          take: 5
        },
        pembayaran: {
          orderBy: { tanggal: 'desc' }
        }
      }
    });

    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentYear = jakartaTime.getFullYear();
    const currentMonth = jakartaTime.getMonth();

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    const monthlyPayments = await prisma.pembayaran.findMany({
      where: {
        debiturId: id,
        tanggal: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });

    const totalBayarBulanIni = monthlyPayments.reduce((sum, p) => sum + p.nominal, 0);

    let statusBayar = 'Belum Bayar';
    const totalAngsuran = debitur.angsPrincipal + debitur.angsMargin;

    if (totalBayarBulanIni >= totalAngsuran && totalAngsuran > 0) {
      statusBayar = 'Sudah Bayar';
    } else if (totalBayarBulanIni > 0) {
      statusBayar = 'Bayar Sebagian';
    }

    // Deduplicate kolHistory by month & year first
    const uniqueHistoryMap = new Map<string, typeof debitur.kolHistory[0]>();
    for (const h of debitur.kolHistory) {
      const key = `${h.bulanLabel}_${new Date(h.tanggalSnapshot).getFullYear()}`;
      if (!uniqueHistoryMap.has(key)) {
        uniqueHistoryMap.set(key, h);
      }
    }
    const sortedHistories = Array.from(uniqueHistoryMap.values()).sort(
      (a, b) => new Date(a.tanggalSnapshot).getTime() - new Date(b.tanggalSnapshot).getTime()
    );

    // Filter to ONLY include rows where KOL status or Baki Debet actually changed (plus baseline & current state)
    const filteredHistory: typeof sortedHistories = [];
    if (sortedHistories.length > 0) {
      filteredHistory.push(sortedHistories[0]); // Always include initial baseline

      let lastRecorded = sortedHistories[0];
      for (let i = 1; i < sortedHistories.length; i++) {
        const current = sortedHistories[i];
        const isLatest = i === sortedHistories.length - 1;
        const isKolChanged = current.kol !== lastRecorded.kol;
        const isBakiDebetChanged = Math.abs(current.bakiDebet - lastRecorded.bakiDebet) >= 1;

        if (isKolChanged || isBakiDebetChanged || isLatest) {
          // Avoid duplicate push if current is identical to last recorded
          if (current.id !== lastRecorded.id) {
            filteredHistory.push(current);
            lastRecorded = current;
          }
        }
      }
    }

    // Sort descending for UI display (newest snapshot first)
    const kolHistory = filteredHistory.sort(
      (a, b) => new Date(b.tanggalSnapshot).getTime() - new Date(a.tanggalSnapshot).getTime()
    );

    return c.json({
      ...debitur,
      kolHistory,
      totalBayarBulanIni,
      totalAngsuran,
      statusBayar
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
