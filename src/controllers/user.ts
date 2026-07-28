import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

export const userRouter = new Hono();

// Enforce admin-only access for all user management routes
userRouter.use('*', authMiddleware, roleMiddleware(['admin']));

// GET /pending - List all pending users
userRouter.get('/pending', async (c) => {
  try {
    const users = await prisma.user.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' }
    });
    return c.json(users);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /active - List all active, inactive, and rejected users (excluding pending)
userRouter.get('/active', async (c) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: { in: ['active', 'inactive', 'rejected'] }
      },
      orderBy: { nama: 'asc' }
    });
    return c.json(users);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /create - Directly create a new user (including admins)
userRouter.post('/create', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password, nama, email, tgl_lahir, posisi } = body;

    if (!username || !password || !nama || !email || !tgl_lahir || !posisi) {
      return c.json({ error: 'Semua field wajib diisi' }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: 'Password minimal 8 karakter' }, 400);
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return c.json({ error: 'Username sudah digunakan' }, 400);
    }

    const tglLahirDate = new Date(tgl_lahir);
    if (isNaN(tglLahirDate.getTime())) {
      return c.json({ error: 'Format tanggal lahir tidak valid' }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        nama,
        email,
        tglLahir: tglLahirDate,
        posisi,
        status: 'active', // Directly active since created by admin
        registerAttemptCount: 0
      }
    });

    await logAudit(c, 'create_user', 'users', newUser.id, null, { username, posisi });

    return c.json(newUser, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /:id/approve - Approve user
userRouter.post('/:id/approve', async (c) => {
  try {
    const id = c.req.param('id');
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    if (user.status !== 'pending') {
      return c.json({ error: 'User tidak dalam status pending' }, 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: 'active',
        registerAttemptCount: 0,
        lastRegisterAttemptAt: null
      }
    });

    await logAudit(c, 'approve_user', 'users', id, { status: user.status }, { status: 'active' });

    return c.json({ message: 'User berhasil disetujui', user: updated });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /:id/reject - Reject user
userRouter.post('/:id/reject', async (c) => {
  try {
    const id = c.req.param('id');
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    if (user.status !== 'pending') {
      return c.json({ error: 'User tidak dalam status pending' }, 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: 'rejected'
      }
    });

    await logAudit(c, 'reject_user', 'users', id, { status: user.status }, { status: 'rejected' });

    return c.json({ message: 'Pendaftaran user ditolak', user: updated });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /:id/edit - Update active user (posisi, status, password, dll)
userRouter.put('/:id/edit', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { nama, email, posisi, status, password } = body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    const dataToUpdate: any = {
      nama: nama || user.nama,
      email: email || user.email,
      posisi: posisi || user.posisi,
      status: status || user.status
    };

    if (password && password.trim().length >= 6) {
      dataToUpdate.passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: dataToUpdate
    });

    await logAudit(c, 'edit_user', 'users', id, user, updated);

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /:id - Permanently delete user
userRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const currentUser = (c as any).get('user');

    if (currentUser?.id === id) {
      return c.json({ error: 'Anda tidak dapat menghapus akun milik Anda sendiri' }, 400);
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    // Revoke refresh tokens first
    await prisma.refreshToken.deleteMany({ where: { userId: id } });

    await prisma.user.delete({ where: { id } });

    await logAudit(c, 'delete_user', 'users', id, user, null);

    return c.json({ message: 'User berhasil dihapus', id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
