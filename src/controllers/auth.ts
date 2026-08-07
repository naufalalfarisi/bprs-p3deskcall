import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { createAccessToken, authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

import { promises as fs } from 'fs';
import path from 'path';

export const authRouter = new Hono();

// Utility: Check if date is today (Asia/Jakarta)
function isToday(date: Date): boolean {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  return todayStr === dateStr;
}

// GET /ao-list - Get unique list of AO names from CBS debitur data
authRouter.get('/ao-list', async (c) => {
  try {
    const rawAos = await prisma.debitur.findMany({
      select: { ao: true },
      where: { ao: { not: '' } },
      distinct: ['ao'],
      orderBy: { ao: 'asc' }
    });
    const list = rawAos.map((r) => r.ao).filter(Boolean);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /register
authRouter.post('/register', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password, nama, email, tgl_lahir, posisi, ao_name_ref } = body;

    if (!username || !password || !nama || !email || !tgl_lahir || !posisi) {
      return c.json({ error: 'Semua field wajib diisi' }, 400);
    }

    if (posisi === 'ao' && !ao_name_ref) {
      return c.json({ error: 'Pilihan nama AO wajib diisi untuk posisi Account Officer' }, 400);
    }

    if (password.length < 8) {
      return c.json({ error: 'Password minimal 8 karakter' }, 400);
    }

    // Role admin cannot be registered
    if (posisi === 'admin') {
      return c.json({ error: 'Role admin tidak dapat didaftarkan secara publik' }, 403);
    }

    const tglLahirDate = new Date(tgl_lahir);
    if (isNaN(tglLahirDate.getTime())) {
      return c.json({ error: 'Format tanggal lahir tidak valid' }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const existingUser = await prisma.user.findUnique({ where: { username } });

    if (existingUser) {
      // If user is rejected, check daily attempts (max 3/day)
      if (existingUser.status === 'rejected') {
        const attemptDate = existingUser.lastRegisterAttemptAt;
        let attemptCount = existingUser.registerAttemptCount;

        if (attemptDate && isToday(attemptDate)) {
          if (attemptCount >= 3) {
            return c.json({ error: 'Batas pendaftaran ulang hari ini tercapai (maksimal 3 kali)' }, 429);
          }
          attemptCount += 1;
        } else {
          attemptCount = 1;
        }

        // Allow retry with same username
        const updated = await prisma.user.update({
          where: { username },
          data: {
            nama,
            email,
            tglLahir: tglLahirDate,
            passwordHash,
            posisi,
            aoNameRef: posisi === 'ao' ? (ao_name_ref || null) : null,
            status: 'pending',
            registerAttemptCount: attemptCount,
            lastRegisterAttemptAt: new Date()
          }
        });

        // Trigger manual audit log for register attempt (no auth context)
        await prisma.auditLog.create({
          data: {
            userId: updated.id,
            action: 'register_retry',
            tableName: 'users',
            recordId: updated.id,
            newValue: JSON.stringify({ username, posisi, aoNameRef: updated.aoNameRef }),
            ipAddress: c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
          }
        });

        return c.json({ message: 'Pendaftaran ulang berhasil dikirim, menunggu persetujuan admin', status: 'pending' });
      }

      return c.json({ error: 'Username sudah digunakan' }, 400);
    }

    // Register new user
    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        nama,
        email,
        tglLahir: tglLahirDate,
        posisi,
        aoNameRef: posisi === 'ao' ? (ao_name_ref || null) : null,
        status: 'pending',
        registerAttemptCount: 1,
        lastRegisterAttemptAt: new Date()
      }
    });

    // Write audit log without user context (it's register)
    await prisma.auditLog.create({
      data: {
        userId: newUser.id,
        action: 'register',
        tableName: 'users',
        recordId: newUser.id,
        newValue: JSON.stringify({ username, posisi, aoNameRef: newUser.aoNameRef }),
        ipAddress: c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
      }
    });

    return c.json({ message: 'Pendaftaran berhasil dikirim, menunggu persetujuan admin', status: 'pending' }, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /login
authRouter.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password, force } = body;
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    if (!username || !password) {
      return c.json({ error: 'Username dan password wajib diisi' }, 400);
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return c.json({ error: 'Kredensial login salah' }, 401);
    }

    // Check Lockout (5 failed attempts within 15 minutes)
    // We reuse registerAttemptCount and lastRegisterAttemptAt for login lockout
    // if status is active/inactive (to not mix with pending/rejected register states)
    const now = new Date();
    if (
      user.status !== 'pending' &&
      user.status !== 'rejected' &&
      user.registerAttemptCount >= 5 &&
      user.lastRegisterAttemptAt &&
      now.getTime() - user.lastRegisterAttemptAt.getTime() < 15 * 60 * 1000
    ) {
      const remainingTime = Math.ceil(
        (15 * 60 * 1000 - (now.getTime() - user.lastRegisterAttemptAt.getTime())) / 60000
      );
      return c.json({ error: `Akun terkunci karena 5x salah password. Coba lagi dalam ${remainingTime} menit.` }, 429);
    }

    // Check if account status is active
    if (user.status !== 'active') {
      if (user.status === 'pending') {
        return c.json({ error: 'Akun Anda belum disetujui oleh admin' }, 403);
      }
      return c.json({ error: 'Akun Anda dinonaktifkan atau ditolak' }, 403);
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      // Increment failed attempts
      let attemptCount = user.registerAttemptCount;
      if (user.lastRegisterAttemptAt && now.getTime() - user.lastRegisterAttemptAt.getTime() > 15 * 60 * 1000) {
        // Reset count if last attempt was > 15 mins ago
        attemptCount = 1;
      } else {
        attemptCount += 1;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          registerAttemptCount: attemptCount,
          lastRegisterAttemptAt: now
        }
      });

      return c.json({ error: 'Kredensial login salah' }, 401);
    }

    // Single-device login detection
    const activeTokens = await prisma.refreshToken.findMany({
      where: { userId: user.id, revoked: false, expiresAt: { gt: now } }
    });

    if (activeTokens.length > 0 && force !== true) {
      return c.json({
        status: 'session_active',
        message: 'Akun ini sedang aktif di perangkat lain, lanjutkan?'
      }, 409); // Conflict
    }

    // Revoke old tokens if forced
    if (activeTokens.length > 0 && force === true) {
      await prisma.refreshToken.updateMany({
        where: { userId: user.id, revoked: false },
        data: { revoked: true }
      });
    }

    // Reset attempts on successful login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        registerAttemptCount: 0,
        lastRegisterAttemptAt: null
      }
    });

    // Generate tokens
    const accessToken = await createAccessToken({
      userId: user.id,
      username: user.username,
      posisi: user.posisi
    });

    const userAgent = c.req.header('user-agent') || 'unknown';
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours

    const refreshToken = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(accessToken.substring(10, 30), 10), // generate hash from part of access token
        deviceInfo: userAgent,
        expiresAt
      }
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'login',
        tableName: 'users',
        recordId: user.id,
        ipAddress: ip
      }
    });

    return c.json({
      accessToken,
      refreshToken: refreshToken.id,
      user: {
        id: user.id,
        username: user.username,
        nama: user.nama,
        posisi: user.posisi,
        email: user.email,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /forgot-password
authRouter.post('/forgot-password', async (c) => {
  try {
    const body = await c.req.json();
    const { username, tgl_lahir, newPassword } = body;

    if (!username || !tgl_lahir || !newPassword) {
      return c.json({ error: 'Username, tanggal lahir, dan password baru wajib diisi' }, 400);
    }

    if (newPassword.length < 8) {
      return c.json({ error: 'Password baru minimal 8 karakter' }, 400);
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return c.json({ error: 'Data verifikasi tidak cocok' }, 404);
    }

    // Compare date of birth (ignoring time)
    const inputDateStr = new Date(tgl_lahir).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const userDateStr = user.tglLahir.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

    if (inputDateStr !== userDateStr) {
      return c.json({ error: 'Data verifikasi tidak cocok' }, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        registerAttemptCount: 0,
        lastRegisterAttemptAt: null
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'forgot_password_reset',
        tableName: 'users',
        recordId: user.id,
        ipAddress: c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
      }
    });

    return c.json({ message: 'Password berhasil diset ulang, silakan login' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /logout
authRouter.post('/logout', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { refreshToken } = body;

    if (refreshToken) {
      await prisma.refreshToken.update({
        where: { id: refreshToken },
        data: { revoked: true }
      });
    }

    const user = (c as any).get('user');
    await logAudit(c, 'logout', 'users', user.id);

    return c.json({ message: 'Logout berhasil' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /me - Get current logged in user profile
authRouter.get('/me', authMiddleware, async (c) => {
  try {
    const userSession = (c as any).get('user');
    const user = await prisma.user.findUnique({
      where: { id: userSession.id },
      select: {
        id: true,
        username: true,
        nama: true,
        email: true,
        tglLahir: true,
        posisi: true,
        status: true,
        avatarUrl: true,
        createdAt: true
      }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    return c.json(user);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /profile - Update current user profile info (nama, email, tglLahir)
authRouter.put('/profile', authMiddleware, async (c) => {
  try {
    const userSession = (c as any).get('user');
    const body = await c.req.json();
    const { nama, email, tgl_lahir } = body;

    if (!nama || !email || !tgl_lahir) {
      return c.json({ error: 'Nama, email, dan tanggal lahir wajib diisi' }, 400);
    }

    const tglLahirDate = new Date(tgl_lahir);
    if (isNaN(tglLahirDate.getTime())) {
      return c.json({ error: 'Format tanggal lahir tidak valid' }, 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userSession.id },
      data: {
        nama,
        email,
        tglLahir: tglLahirDate
      },
      select: {
        id: true,
        username: true,
        nama: true,
        email: true,
        tglLahir: true,
        posisi: true,
        avatarUrl: true
      }
    });

    await logAudit(c, 'update_profile', 'users', userSession.id, null, { nama, email });

    return c.json(updatedUser);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /profile/avatar - Upload profile picture
authRouter.post('/profile/avatar', authMiddleware, async (c) => {
  try {
    const userSession = (c as any).get('user');
    const body = await c.req.parseBody({ all: true });
    const file: any = body.file;

    if (!file || typeof file === 'string') {
      return c.json({ error: 'File foto profil wajib diunggah' }, 400);
    }

    const fileSize = file.size || 0;
    if (fileSize > 2 * 1024 * 1024) {
      return c.json({ error: 'Ukuran foto profil melebihi 2MB' }, 400);
    }

    const originalName = file.name || 'avatar.png';
    const ext = path.extname(originalName).toLowerCase() || '.png';
    if (!['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
      return c.json({ error: 'Format foto harus PNG, JPG, atau SVG' }, 400);
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    await fs.mkdir(uploadDir, { recursive: true });

    // Clean old avatars for this user
    try {
      const files = await fs.readdir(uploadDir);
      for (const f of files) {
        if (f.startsWith(`avatar_${userSession.id}_`)) {
          await fs.unlink(path.join(uploadDir, f));
        }
      }
    } catch (e) {}

    const fileName = `avatar_${userSession.id}_${Date.now()}${ext}`;
    const destPath = path.join(uploadDir, fileName);
    const avatarUrl = `/public/uploads/avatars/${fileName}`;

    let buffer: Buffer;
    if (typeof file.arrayBuffer === 'function') {
      const fileBytes = await file.arrayBuffer();
      buffer = Buffer.from(fileBytes);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else {
      return c.json({ error: 'Format data file tidak valid' }, 400);
    }

    await fs.writeFile(destPath, buffer);

    await prisma.user.update({
      where: { id: userSession.id },
      data: { avatarUrl }
    });

    await logAudit(c, 'upload_avatar', 'users', userSession.id, null, { avatarUrl });

    return c.json({ avatarUrl });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /change-password - Change current user password
authRouter.put('/change-password', authMiddleware, async (c) => {
  try {
    const userSession = (c as any).get('user');
    const body = await c.req.json();
    const { oldPassword, newPassword } = body;

    if (!oldPassword || !newPassword) {
      return c.json({ error: 'Password lama dan password baru wajib diisi' }, 400);
    }

    if (newPassword.length < 8) {
      return c.json({ error: 'Password baru minimal 8 karakter' }, 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userSession.id } });
    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match) {
      return c.json({ error: 'Password lama salah' }, 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    await logAudit(c, 'change_password', 'users', user.id);

    return c.json({ message: 'Password berhasil diperbarui' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
