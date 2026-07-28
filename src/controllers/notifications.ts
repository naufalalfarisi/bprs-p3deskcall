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

    // 3. Janji bayar jatuh tempo (desk_call, admin)
    if (role === 'desk_call' || role === 'admin') {
      // Find range: H+0 to H+3 (today and last 3 days)
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 3); // 3 days ago
      
      const endDate = new Date(today); // today

      const callsWithJanji = await prisma.deskCall.findMany({
        where: {
          tindakLanjut: 'Janji Bayar',
          tanggalJanjiBayar: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { tanggalJanjiBayar: 'desc' }
      });

      // Filter: only show if no newer desk call exists for this debitur after the call date
      for (const call of callsWithJanji) {
        if (!call.tanggalJanjiBayar) continue;

        const newerCallCount = await prisma.deskCall.count({
          where: {
            debiturId: call.debiturId,
            tanggal: { gt: call.tanggal }
          }
        });

        // If no newer call exists, it means the promise is unresolved and needs follow up!
        if (newerCallCount === 0) {
          const promiseDateStr = call.tanggalJanjiBayar.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
          notifications.push({
            id: `promise_${call.id}`,
            type: 'danger',
            title: 'Janji Bayar Jatuh Tempo',
            message: `Nasabah ${call.namaDebitur} menjanjikan bayar pada ${promiseDateStr}`,
            link: `#/debitur?q=${call.debiturId}`
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

    return c.json(notifications);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
