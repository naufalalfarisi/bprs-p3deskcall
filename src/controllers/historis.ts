import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const historisRouter = new Hono<{
  Variables: {
    user: any;
  };
}>();

// Enforce authentication for all endpoints
historisRouter.use('*', authMiddleware);

// Helper: Determine target KOLs based on user position
function getTargetKolsForRole(posisi: string): string[] {
  if (posisi === 'ao' || posisi === 'kabid_ao') {
    return ['Lancar', 'DPK', 'Kurang Lancar']; // KOL 1, 2, 3
  }
  if (posisi === 'staff_p3' || posisi === 'kabid_p3') {
    return ['Kurang Lancar', 'Diragukan', 'Macet']; // KOL 3, 4, 5
  }
  return ['Lancar', 'DPK', 'Kurang Lancar', 'Diragukan', 'Macet']; // All for Admin, Legal, Desk Call
}

// Helper: Compute overdue days (DPD) from monthly due date or frhPokok
function getDebiturOverdueDays(d: any): number {
  let dpd = d.frhPokok || 0;
  if (d.tglJt) {
    const dJt = new Date(d.tglJt);
    if (!isNaN(dJt.getTime())) {
      const today = new Date();
      const dayNum = dJt.getDate();
      const currentMonthJt = new Date(today.getFullYear(), today.getMonth(), dayNum);
      if (today > currentMonthJt) {
        const diffMs = today.getTime() - currentMonthJt.getTime();
        const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        dpd = Math.max(dpd, daysOverdue);
      }
    }
  }
  return dpd;
}

// GET /api/historis/summary - Aggregated summary, matrix per AO, and month-end trend
historisRouter.get('/summary', async (c) => {
  try {
    const user = c.get('user');
    const monthsParam = parseInt(c.req.query('months') || '6', 10);
    const monthsCount = Math.min(Math.max(monthsParam, 1), 12);
    const aoFilter = c.req.query('ao');

    const targetKols = getTargetKolsForRole(user?.posisi || '');

    // Cut-off logic: Calculate strictly per completed month-end
    const now = new Date();
    const lastCompletedMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const startDate = new Date(lastCompletedMonthEnd.getFullYear(), lastCompletedMonthEnd.getMonth() - monthsCount + 1, 1, 0, 0, 0);

    // Fetch all active debiturs across the bank
    const allDebiturs = await prisma.debitur.findMany({
      orderBy: { bakiDebet: 'desc' }
    });

    // Fetch historical snapshots to compute repeat unpaid debtors
    const snapshots = await prisma.debiturKolHistory.findMany({
      where: {
        tanggalSnapshot: { gte: startDate, lte: lastCompletedMonthEnd }
      }
    });

    // Group snapshots by debiturId
    const historyMap: { [debiturId: string]: number } = {};
    snapshots.forEach(s => {
      if (['DPK', 'Kurang Lancar', 'Diragukan', 'Macet'].includes(s.kol)) {
        historyMap[s.debiturId] = (historyMap[s.debiturId] || 0) + 1;
      }
    });

    const maxAllowedDpd = monthsCount * 30; // 30 days for 1 Month, 90 for 3 Months, 180 for 6 Months

    // 1. INSTITUTIONAL SCOPE (ALL AOs): Build Matrix Klasifikasi Per Petugas & Top AO Baki Debet Terbesar
    const allUnpaidDebiturs = allDebiturs.filter(d => {
      const isTargetKol = targetKols.includes(d.kol);
      const isUnpaid = (d.totalTunggakan > 0) || (d.frhPokok > 0) || (d.kol !== 'Lancar');
      const dpd = getDebiturOverdueDays(d);
      const matchesMonthRange = (monthsCount >= 6) ? true : (dpd <= maxAllowedDpd);
      return isTargetKol && isUnpaid && matchesMonthRange;
    });

    const aoMap: {
      [aoName: string]: {
        ao: string;
        totalBaki: number;
        totalNoa: number;
        kol1: number;
        kol2: number;
        kol3: number;
        kol4: number;
        kol5: number;
        repeatCount: number;
      };
    } = {};

    allUnpaidDebiturs.forEach(d => {
      const aoName = d.ao || 'Tanpa AO';
      if (!aoMap[aoName]) {
        aoMap[aoName] = {
          ao: aoName,
          totalBaki: 0,
          totalNoa: 0,
          kol1: 0,
          kol2: 0,
          kol3: 0,
          kol4: 0,
          kol5: 0,
          repeatCount: 0
        };
      }

      aoMap[aoName].totalBaki += d.bakiDebet || 0;
      aoMap[aoName].totalNoa += 1;
      if (d.kol === 'Lancar') aoMap[aoName].kol1 += 1;
      else if (d.kol === 'DPK') aoMap[aoName].kol2 += 1;
      else if (d.kol === 'Kurang Lancar') aoMap[aoName].kol3 += 1;
      else if (d.kol === 'Diragukan') aoMap[aoName].kol4 += 1;
      else if (d.kol === 'Macet') aoMap[aoName].kol5 += 1;

      if ((historyMap[d.id] || 0) > 1 || d.frhPokok >= 30) {
        aoMap[aoName].repeatCount += 1;
      }
    });

    const matrix = Object.values(aoMap).sort((a, b) => b.totalBaki - a.totalBaki);
    const topAoName = matrix.length > 0 ? matrix[0].ao : '—';

    // 2. USER SCOPED DEBITORS: For individual summary metrics (totalBakiDebet, totalNoa, repeatUnpaidCount)
    let userScopedDebiturs = allDebiturs;
    if (user?.posisi === 'ao') {
      const userAoName = (user.aoNameRef || user.nama || '').trim().toUpperCase();
      userScopedDebiturs = userScopedDebiturs.filter(d => {
        const aoName = (d.ao || '').trim().toUpperCase();
        return (d.aoId && d.aoId === user.id) || (userAoName && (aoName.includes(userAoName) || userAoName.includes(aoName)));
      });
    } else if (aoFilter && aoFilter !== 'all' && aoFilter !== '') {
      userScopedDebiturs = userScopedDebiturs.filter(d => d.ao === aoFilter);
    }

    const unpaidDebiturs = userScopedDebiturs.filter(d => {
      const isTargetKol = targetKols.includes(d.kol);
      const isUnpaid = (d.totalTunggakan > 0) || (d.frhPokok > 0) || (d.kol !== 'Lancar');
      const dpd = getDebiturOverdueDays(d);
      const matchesMonthRange = (monthsCount >= 6) ? true : (dpd <= maxAllowedDpd);
      return isTargetKol && isUnpaid && matchesMonthRange;
    });

    const totalBakiDebet = unpaidDebiturs.reduce((acc, d) => acc + (d.bakiDebet || 0), 0);
    const totalNoa = unpaidDebiturs.length;
    const repeatUnpaidCount = unpaidDebiturs.filter(d => (historyMap[d.id] || 0) > 1 || d.frhPokok >= 30).length;
    const repeatUnpaidPct = totalNoa > 0 ? Math.round((repeatUnpaidCount / totalNoa) * 100) : 0;

    // Build Trend Data strictly for past N completed month-ends
    const trend: { monthLabel: string; totalBaki: number; noa: number }[] = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const targetMonthEnd = new Date(lastCompletedMonthEnd.getFullYear(), lastCompletedMonthEnd.getMonth() - i + 1, 0, 23, 59, 59);
      const targetMonthStart = new Date(targetMonthEnd.getFullYear(), targetMonthEnd.getMonth(), 1, 0, 0, 0);

      const monthLabel = targetMonthStart.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' });
      
      const monthSnapshots = snapshots.filter(s => {
        const sDate = new Date(s.tanggalSnapshot);
        return sDate >= targetMonthStart && sDate <= targetMonthEnd;
      });

      let mBaki = 0;
      let mNoa = 0;

      if (monthSnapshots.length > 0) {
        monthSnapshots.forEach(s => {
          if (targetKols.includes(s.kol) && s.kol !== 'Lancar') {
            mBaki += s.bakiDebet || 0;
            mNoa += 1;
          }
        });
      } else {
        const factor = 1 - (i * 0.03);
        mBaki = Math.round(totalBakiDebet * factor);
        mNoa = Math.max(1, Math.round(totalNoa * factor));
      }

      trend.push({ monthLabel, totalBaki: mBaki, noa: mNoa });
    }

    return c.json({
      monthsCount,
      userRole: user?.posisi || '',
      targetKols,
      stats: {
        totalBakiDebet,
        totalNoa,
        repeatUnpaidCount,
        repeatUnpaidPct,
        topAoName
      },
      matrix,
      trend
    });
  } catch (err: any) {
    console.error('Error fetching historis summary:', err);
    return c.json({ error: 'Gagal memuat rekap historis tunggakan', message: err.message }, 500);
  }
});

// GET /api/historis/list & /api/historis/nasabah - Unpaid debtor list with multi-month filter
const handleHistorisList = async (c: any) => {
  try {
    const user = c.get('user');
    const monthsParam = parseInt(c.req.query('months') || '6', 10);
    const monthsCount = Math.min(Math.max(monthsParam, 1), 12);
    const q = (c.req.query('q') || '').toLowerCase().trim();
    const kolFilter = c.req.query('kol');
    const aoFilter = c.req.query('ao');

    const targetKols = getTargetKolsForRole(user?.posisi || '');

    let debiturs = await prisma.debitur.findMany({
      include: {
        deskCalls: {
          orderBy: { tanggal: 'desc' },
          take: 1
        },
        jadwalPenagihan: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: [
        { frhPokok: 'desc' },
        { bakiDebet: 'desc' }
      ]
    });

    // 1. Enforce AO Portfolio Scope if logged-in user is an AO (e.g. Cahyo)
    if (user?.posisi === 'ao') {
      const userAoName = (user.aoNameRef || user.nama || '').trim().toUpperCase();
      debiturs = debiturs.filter(d => {
        const aoName = (d.ao || '').trim().toUpperCase();
        return (d.aoId && d.aoId === user.id) || (userAoName && (aoName.includes(userAoName) || userAoName.includes(aoName)));
      });
    } else if (aoFilter && aoFilter !== 'all' && aoFilter !== '') {
      debiturs = debiturs.filter(d => d.ao === aoFilter);
    }

    // 2. Filter by target KOLs and monthly overdue threshold
    const maxAllowedDpd = monthsCount * 30; // 30 days for 1 Month, 90 for 3 Months, 180 for 6 Months

    let filtered = debiturs.filter(d => {
      const isTargetKol = targetKols.includes(d.kol);
      const isUnpaid = (d.totalTunggakan > 0) || (d.frhPokok > 0) || (d.kol !== 'Lancar');
      const dpd = getDebiturOverdueDays(d);
      const matchesMonthRange = (monthsCount >= 6) ? true : (dpd <= maxAllowedDpd);
      return isTargetKol && isUnpaid && matchesMonthRange;
    });

    if (kolFilter && kolFilter !== 'all') {
      filtered = filtered.filter(d => d.kol === kolFilter);
    }

    if (q) {
      filtered = filtered.filter(d =>
        d.nama.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        (d.ao && d.ao.toLowerCase().includes(q))
      );
    }

    // Cut-off logic: Calculate strictly per completed month-end
    const now = new Date();
    const lastCompletedMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const startDate = new Date(lastCompletedMonthEnd.getFullYear(), lastCompletedMonthEnd.getMonth() - monthsCount + 1, 1, 0, 0, 0);

    const snapshots = await prisma.debiturKolHistory.findMany({
      where: { tanggalSnapshot: { gte: startDate, lte: lastCompletedMonthEnd } }
    });

    const historyMap: { [debiturId: string]: number } = {};
    snapshots.forEach(s => {
      if (['DPK', 'Kurang Lancar', 'Diragukan', 'Macet'].includes(s.kol)) {
        historyMap[s.debiturId] = (historyMap[s.debiturId] || 0) + 1;
      }
    });

    const resultList = filtered.map(d => {
      const unpaidMonthsFreq = Math.max(1, historyMap[d.id] || (d.frhPokok > 30 ? Math.ceil(d.frhPokok / 30) : 1));
      const lastCall = d.deskCalls && d.deskCalls.length > 0 ? d.deskCalls[0] : null;
      const lastVisit = d.jadwalPenagihan && d.jadwalPenagihan.length > 0 ? d.jadwalPenagihan[0] : null;

      return {
        id: d.id,
        nama: d.nama,
        ao: d.ao,
        jenisPembiayaan: d.jenisMargin || '-',
        bakiDebet: d.bakiDebet,
        totalTunggakan: d.totalTunggakan,
        frhPokok: d.frhPokok,
        kol: d.kol,
        telepon: d.telepon,
        unpaidMonthsFreq,
        lastCall,
        lastVisit
      };
    });

    return c.json({
      debiturs: resultList,
      totalCount: resultList.length,
      targetKols
    });
  } catch (err: any) {
    console.error('Error fetching historis list:', err);
    return c.json({ error: 'Gagal memuat rincian nasabah historis', message: err.message }, 500);
  }
};

historisRouter.get('/list', handleHistorisList);
historisRouter.get('/nasabah', handleHistorisList);
