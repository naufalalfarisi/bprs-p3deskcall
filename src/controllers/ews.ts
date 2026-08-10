import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

export const ewsRouter = new Hono();

// Enforce authentication & role restrictions (admin, ao, kabid_ao, staff_p3, kabid_p3)
ewsRouter.use('*', authMiddleware, roleMiddleware(['admin', 'ao', 'kabid_ao', 'staff_p3', 'kabid_p3']));

// Helper function to calculate EWS status on-demand per debitur
export function computeEwsStatus(tglJt: Date, frhPokok: number) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed
  
  let dueDay = 25;
  if (tglJt) {
    const dt = new Date(tglJt);
    if (!isNaN(dt.getTime())) {
      dueDay = dt.getDate();
    }
  }
  
  const lastDayOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const actualDueDay = Math.min(dueDay, lastDayOfCurrentMonth);
  
  const dueDateThisMonth = new Date(currentYear, currentMonth, actualDueDay);
  const todayMidnight = new Date(currentYear, currentMonth, today.getDate()).getTime();
  const dueMidnight = dueDateThisMonth.getTime();
  
  // diffDays > 0 means days remaining UNTIL due date this month
  // diffDays < 0 means days past due date this month
  const diffDays = Math.round((dueMidnight - todayMidnight) / (1000 * 60 * 60 * 24));
  
  if (diffDays > 0) {
    // Due date in current month has NOT arrived yet
    if (diffDays === 1 || diffDays === 0) {
      return { status: 'Reminder', label: 'H-1 s/d Hari H', category: 'MEDIUM', code: 'YELLOW', badgeClass: 'badge-yellow', diffDays };
    } else {
      return { status: 'Lancar / Normal', label: `H-${diffDays} Jatuh Tempo`, category: 'LOW', code: 'GREEN', badgeClass: 'badge-green', diffDays };
    }
  } else {
    // Due date has passed in current month
    const dpd = Math.max(frhPokok || 0, Math.abs(diffDays));
    if (dpd > 14) {
      return { status: 'DPD 2+ / Kritis', label: `DPD ${dpd} Hari`, category: 'CRITICAL', code: 'RED', badgeClass: 'badge-red', diffDays, dpd };
    } else if (dpd >= 8) {
      return { status: 'DPD 8-14 / Bermasalah', label: `DPD ${dpd} Hari`, category: 'VERY_HIGH', code: 'PURPLE', badgeClass: 'badge-purple', diffDays, dpd };
    } else if (dpd >= 1) {
      return { status: 'DPD 1-7 / Perhatian', label: `DPD ${dpd} Hari`, category: 'HIGH', code: 'ORANGE', badgeClass: 'badge-orange', diffDays, dpd };
    } else {
      return { status: 'Jatuh Tempo Hari Ini', label: 'Hari H Jatuh Tempo', category: 'MEDIUM', code: 'YELLOW', badgeClass: 'badge-yellow', diffDays: 0, dpd: 0 };
    }
  }
}


// Helper: Filter target KOL based on role (AO -> KOL 1,2,3 | P3 -> KOL 3,4,5)
function getEwsKolsForRole(posisi: string): string[] | null {
  if (posisi === 'ao' || posisi === 'kabid_ao') {
    return ['Lancar', '1', 'KOL 1', 'DPK', '2', 'KOL 2', 'Kurang Lancar', '3', 'KOL 3'];
  }
  if (posisi === 'staff_p3' || posisi === 'kabid_p3') {
    return ['Kurang Lancar', '3', 'KOL 3', 'Diragukan', '4', 'KOL 4', 'Macet', '5', 'KOL 5'];
  }
  return null;
}

// GET /summary - Portfolio EWS Stats Header
ewsRouter.get('/summary', async (c) => {
  try {
    const user = (c as any).get('user');
    const reqAo = c.req.query('ao');

    let whereClause: any = { statusDebitur: 'Aktif' };
    const roleKols = getEwsKolsForRole(user.posisi);
    if (roleKols) {
      whereClause.kol = { in: roleKols };
    }

    if (user.posisi === 'ao') {
      // Filter for specific AO
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

    return c.json({
      totalDebitur,
      lancarCount,
      dpkCount,
      npfWatchlistCount,
      totalBakiDebetBerisiko,
      totalTunggakan,
      kolDistribution,
      ewsStatusCounts
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /watchlist - List Debitur for EWS Watchlist Table
ewsRouter.get('/watchlist', async (c) => {
  try {
    const user = (c as any).get('user');
    const reqAo = c.req.query('ao');
    const q = c.req.query('q') || '';
    const kolParam = c.req.query('kol') || '';
    const ewsStatusParam = c.req.query('ewsStatus') || '';

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

    // Attach computed EWS status
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

    // Filter by EWS status if specified
    const filteredResult = ewsStatusParam
      ? result.filter((item) => item.ewsStatusInfo.status === ewsStatusParam)
      : result;

    return c.json(filteredResult);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /collection-log - Add AO Collection Log Entry
ewsRouter.post('/collection-log', async (c) => {
  try {
    const user = (c as any).get('user');
    const body = await c.req.json();
    const { debiturId, jenisAktivitas, statusTindakLanjut, tanggalJanji, catatan } = body;

    if (!debiturId || !jenisAktivitas || !statusTindakLanjut) {
      return c.json({ error: 'Debitur, jenis aktivitas, dan status tindak lanjut wajib diisi' }, 400);
    }

    // Check Debitur Existence
    const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
    if (!debitur) {
      return c.json({ error: 'Data debitur tidak ditemukan' }, 404);
    }

    // Strict Authorization Check: Only Admin or AO owner can create collection log
    const isOwner = debitur.aoId === user.id || (user.aoNameRef && debitur.ao === user.aoNameRef);
    if (user.posisi !== 'admin' && !isOwner) {
      return c.json({ error: 'Anda hanya diperbolehkan mencatat tindak lanjut untuk nasabah binaan Anda sendiri' }, 403);
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

    await logAudit(
      c,
      'CREATE_AO_COLLECTION_LOG',
      'AoCollectionLog',
      log.id,
      null,
      { debiturId, statusTindakLanjut, jenisAktivitas }
    );

    return c.json({ message: 'Tindak lanjut AO berhasil dicatat', log }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /collection-log/:debiturId - Get AO Collection Logs for a Debitur
ewsRouter.get('/collection-log/:debiturId', async (c) => {
  try {
    const debiturId = c.req.param('debiturId');
    const logs = await prisma.aoCollectionLog.findMany({
      where: { debiturId },
      include: {
        aoUser: { select: { nama: true, email: true } },
        createdByUser: { select: { nama: true } }
      },
      orderBy: { tanggal: 'desc' }
    });
    return c.json(logs);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /leaderboard - Performance Leaderboard per AO (for kabid_ao and admin)
ewsRouter.get('/leaderboard', async (c) => {
  try {
    const user = (c as any).get('user');
    if (user.posisi === 'ao') {
      return c.json({ error: 'Leaderboard hanya dapat diakses oleh Kabid AO dan Administrator' }, 403);
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

    leaderboard.sort((a, b) => a.npfRatio - b.npfRatio); // lower NPF ratio ranked higher

    return c.json(leaderboard);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
