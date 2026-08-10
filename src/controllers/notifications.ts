import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

export const notificationsRouter = new Hono();

// Enforce auth
notificationsRouter.use('*', authMiddleware);

// GET / - Get dynamic, on-demand notifications based on role
notificationsRouter.get('/', async (c) => {
  try {
    const user = (c as any).get('user');
    const role = user.posisi;
    const userId = user.id;

    const notifications: any[] = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
    const today = new Date(todayStr);

    // 1. Permintaan akun baru (admin only)
    if (role === 'admin') {
      const pendingUsersCount = await prisma.user.count({ where: { status: 'pending' } });
      if (pendingUsersCount > 0) {
        notifications.push({
          id: 'pending_users',
          type: 'info',
          title: 'Registrasi Baru',
          message: `${pendingUsersCount} pengguna baru menunggu persetujuan akun`,
          link: '#/user-management'
        });
      }
    }

    // 2. Pengingat upload CSV harian (admin only)
    if (role === 'admin') {
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      
      const todayImportCount = await prisma.importBatch.count({
        where: {
          status: 'applied',
          appliedAt: { gte: startOfToday, lte: endOfToday }
        }
      });

      if (todayImportCount === 0) {
        notifications.push({
          id: 'import_reminder',
          type: 'warning',
          title: 'Import CBS Harian',
          message: 'Data CBS hari ini belum diimpor. Silakan upload file kolektibilitas.',
          link: '#/import-cbs'
        });
      }
    }

    // 3. Janji bayar jatuh tempo (H-1 Pengingat Otomatis PTP & H+0 / Overdue)
    // 3. Janji bayar jatuh tempo (H-1 Pengingat Otomatis PTP & H+0 / Overdue)
    if (role === 'desk_call' || role === 'admin' || role === 'staff_p3' || role === 'kabid_p3') {
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 5); // 5 days ago
      
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 1); // Tomorrow (H-1)

      const callsWithJanji = await prisma.deskCall.findMany({
        where: {
          tindakLanjut: 'Janji Bayar',
          tanggalJanjiBayar: {
            gte: startDate,
            lte: endDate
          }
        },
        include: { debitur: true },
        orderBy: { tanggalJanjiBayar: 'asc' }
      });

      for (const call of callsWithJanji) {
        if (!call.tanggalJanjiBayar) continue;

        // Check if debitur has paid or has any DeskCall marked as 'Sudah Bayar' / 'Lunas'
        const callDateStart = new Date(call.tanggal);
        callDateStart.setHours(0, 0, 0, 0);
        callDateStart.setDate(callDateStart.getDate() - 1); // 1 day buffer for date/timezone differences

        const paidAfterCount = await prisma.pembayaran.count({
          where: {
            debiturId: call.debiturId,
            tanggal: { gte: callDateStart }
          }
        });

        const sudahBayarDeskCallCount = await prisma.deskCall.count({
          where: {
            debiturId: call.debiturId,
            OR: [
              { tindakLanjut: 'Sudah Bayar' },
              { tindakLanjut: { contains: 'Sudah Bayar' } },
              { tindakLanjut: { contains: 'Lunas' } }
            ]
          }
        });

        // Skip if debitur has already paid or any desk call is marked as 'Sudah Bayar'
        if (paidAfterCount > 0 || sudahBayarDeskCallCount > 0) continue;

        // Count follow-up Desk Calls recorded after this promise call date
        const followUpCount = await prisma.deskCall.count({
          where: {
            debiturId: call.debiturId,
            id: { not: call.id },
            tanggal: { gte: call.tanggal }
          }
        });

        const promiseDateStr = call.tanggalJanjiBayar.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const isTomorrow = call.tanggalJanjiBayar.toISOString().substring(0, 10) === new Date(today.getTime() + 86400000).toISOString().substring(0, 10);
        
        const nominalText = call.nominalJanji ? `Rp ${new Intl.NumberFormat('id-ID').format(call.nominalJanji)}` : 'sesuai kesepakatan';
        const maxFollowUp = 3;
        const cappedFollowUp = Math.min(followUpCount, maxFollowUp);

        if (isTomorrow) {
          notifications.push({
            id: `promise_h1_${call.id}`,
            deskCallId: call.id,
            type: 'warning',
            title: 'Pengingat H-1 Janji Bayar',
            message: `Nasabah ${call.namaDebitur} dijadwalkan bayar BESOK (${promiseDateStr}) sebesar ${nominalText}`,
            link: `#/debitur?q=${call.debiturId}`,
            debiturId: call.debiturId,
            debiturNama: call.namaDebitur,
            followUpCount: cappedFollowUp,
            maxFollowUp,
            canFollowUp: followUpCount < maxFollowUp
          });
        } else {
          notifications.push({
            id: `promise_${call.id}`,
            deskCallId: call.id,
            type: 'danger',
            title: 'Janji Bayar Jatuh Tempo',
            message: `Nasabah ${call.namaDebitur} menjanjikan bayar (${promiseDateStr}) sebesar ${nominalText}`,
            link: `#/debitur?q=${call.debiturId}`,
            debiturId: call.debiturId,
            debiturNama: call.namaDebitur,
            followUpCount: cappedFollowUp,
            maxFollowUp,
            canFollowUp: followUpCount < maxFollowUp
          });
        }
      }
    }

    // 4. P3 lewat jatuh tempo (staff_p3, kabid_p3, admin)
    if (role === 'staff_p3' || role === 'kabid_p3' || role === 'admin') {
      const p3Filter: any = { status: 'Lewat Jatuh Tempo' };
      if (role === 'staff_p3') {
        p3Filter.petugasId = userId;
      }

      const overdueP3 = await prisma.jadwalPenagihan.findMany({
        where: p3Filter,
        orderBy: { tanggal: 'asc' }
      });

      overdueP3.forEach((s) => {
        const dateStr = s.tanggal.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        notifications.push({
          id: `p3_overdue_${s.id}`,
          type: 'danger',
          title: 'Kunjungan Lewat Jatuh Tempo',
          message: `Jadwal P3 ${s.nomorJadwal} (${s.namaDebitur}) tertunda sejak ${dateStr}`,
          link: `#/p3`
        });
      });
    }

    // 5. Target RBB mendekati akhir bulan (admin, kabid_p3)
    if (role === 'admin' || role === 'kabid_p3') {
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const remainingDays = lastDay - today.getDate();

      if (remainingDays <= 7) {
        notifications.push({
          id: 'rbb_deadline',
          type: 'info',
          title: 'Target RBB Akhir Bulan',
          message: `Sisa ${remainingDays} hari untuk mencapai target RBB bulan ini. Tinjau pencapaian KPI Anda.`,
          link: '#/kpi'
        });
      }
    }

    // 6. Early Warning Red-Alert System: Pergeseran Kolektibilitas (Disatukan dalam 1 notifikasi)
    if (role === 'desk_call' || role === 'admin' || role === 'staff_p3' || role === 'kabid_p3' || role === 'kabid_ao') {
      const activeDebiturs = await prisma.debitur.findMany({
        where: {
          statusDebitur: 'Aktif'
        },
        select: {
          id: true,
          nama: true,
          kol: true,
          bakiDebet: true,
          kolHistory: {
            orderBy: { tanggalSnapshot: 'desc' },
            take: 2
          }
        }
      });

      let redAlertCount = 0;
      let totalBakiDebet = 0;

      for (const deb of activeDebiturs) {
        if (deb.kolHistory && deb.kolHistory.length >= 2) {
          const latestSnap = deb.kolHistory[0];
          const prevSnap = deb.kolHistory[1];

          // Deteksi pergeseran KOL memburuk (Lancar -> DPK/NPF, DPK -> NPF)
          const isShift = (
            (prevSnap.kol === 'Lancar' && latestSnap.kol !== 'Lancar') ||
            (prevSnap.kol === 'DPK' && (latestSnap.kol === 'Kurang Lancar' || latestSnap.kol === 'Diragukan' || latestSnap.kol === 'Macet')) ||
            ((prevSnap.kol === '1' || prevSnap.kol === 'KOL 1') && (latestSnap.kol !== '1' && latestSnap.kol !== 'KOL 1'))
          );

          if (isShift) {
            redAlertCount++;
            totalBakiDebet += (deb.bakiDebet || 0);
          }
        }
      }

      if (redAlertCount > 0) {
        const bakiText = `Rp ${new Intl.NumberFormat('id-ID').format(totalBakiDebet)}`;
        notifications.push({
          id: `red_alert_summary_${todayStr}`,
          type: 'danger',
          title: `RED-ALERT: Pergeseran Kolektibilitas (${redAlertCount} Debitur)`,
          message: `Terdapat ${redAlertCount} debitur yang mengalami pergeseran kolektibilitas hari ini (Total Baki Debet: ${bakiText}). Segera lakukan penanganan.`,
          link: '#/desk-call',
          isRedAlert: true,
          isRedAlertSummary: true,
          count: redAlertCount,
          totalBaki: totalBakiDebet
        });
      }
    }

    return c.json(notifications);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
