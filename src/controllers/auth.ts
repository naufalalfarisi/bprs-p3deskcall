import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { createAccessToken, authMiddleware } from '../middleware/auth.js';
import { authLoginRateLimiter, authRegisterRateLimiter } from '../middleware/rateLimiter.js';
import { logAudit } from '../utils/audit.js';

import {
  LoginSchema,
  RegisterSchema,
  VerifyOtpSchema,
  ResendOtpSchema,
  ForgotPasswordSchema,
  ChangePasswordSchema
} from '../schemas/index.js';
import { sendOtpEmail } from '../services/emailService.js';

// Helper: build Set-Cookie header value
function buildTokenCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `bprs_token=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Max-Age=${maxAgeSeconds}`
  ];
  if (config.cookieSecure) parts.push('Secure');
  return parts.join('; ');
}

function buildClearCookie(): string {
  return 'bprs_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}

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

// Handler for registration and sending OTP email
async function handleRegisterRequest(c: any) {
  try {
    const body = await c.req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Data tidak valid';
      return c.json({ error: firstError }, 400);
    }
    const { username, password, nama, email, tgl_lahir, posisi, ao_name_ref } = parsed.data;

    if (posisi === 'ao' && !ao_name_ref) {
      return c.json({ error: 'Pilihan nama AO wajib diisi untuk posisi Account Officer' }, 400);
    }

    const tglLahirDate = new Date(tgl_lahir);
    if (isNaN(tglLahirDate.getTime())) {
      return c.json({ error: 'Format tanggal lahir tidak valid' }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Check existing user
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }]
      }
    });

    if (existingUser) {
      if (!existingUser.emailVerified) {
        // User registered but hasn't verified email yet -> update and resend fresh OTP
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            username,
            passwordHash,
            nama,
            tglLahir: tglLahirDate,
            posisi,
            aoNameRef: posisi === 'ao' ? (ao_name_ref || null) : null,
            status: 'active'
          }
        });

        await prisma.emailOtp.updateMany({
          where: { email, consumed: false },
          data: { consumed: true }
        });

        await prisma.emailOtp.create({
          data: { email, otpCode, purpose: 'register', expiresAt: otpExpiry }
        });
        await sendOtpEmail(email, otpCode, nama);

        return c.json({
          success: true,
          message: 'Pendaftaran diperbarui. Kode OTP verifikasi telah dikirim ke email Anda.',
          email,
          username,
          requiresOtp: true
        });
      }

      if (existingUser.username === username) {
        return c.json({ error: 'Username sudah digunakan oleh akun lain' }, 400);
      }
      return c.json({ error: 'Email sudah terdaftar pada sistem' }, 400);
    }

    const newUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        nama,
        email,
        tglLahir: tglLahirDate,
        posisi,
        aoNameRef: posisi === 'ao' ? (ao_name_ref || null) : null,
        status: 'active',
        emailVerified: false,
        roleConfirmed: false,
        registerAttemptCount: 1,
        lastRegisterAttemptAt: new Date()
      }
    });

    await prisma.emailOtp.updateMany({
      where: { email, consumed: false },
      data: { consumed: true }
    });

    await prisma.emailOtp.create({
      data: { email, otpCode, purpose: 'register', expiresAt: otpExpiry }
    });

    await sendOtpEmail(email, otpCode, nama);

    await prisma.auditLog.create({
      data: {
        userId: newUser.id,
        action: 'register_request',
        tableName: 'users',
        recordId: newUser.id,
        newValue: JSON.stringify({ username, email, posisi, aoNameRef: newUser.aoNameRef }),
        ipAddress: c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1'
      }
    });

    return c.json(
      {
        success: true,
        message: 'Pendaftaran akun berhasil. Silakan masukkan 6 digit kode OTP yang dikirim ke email Anda.',
        email,
        username,
        requiresOtp: true
      },
      201
    );
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
}

// POST /register and POST /register-request (alias)
authRouter.post('/register', authRegisterRateLimiter, handleRegisterRequest);
authRouter.post('/register-request', authRegisterRateLimiter, handleRegisterRequest);

// POST /verify-otp - Verify 6-digit OTP, activate email, and auto-login
authRouter.post('/verify-otp', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = VerifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Data OTP tidak valid';
      return c.json({ error: firstError }, 400);
    }
    const { email, otpCode } = parsed.data;
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

    const otpRecord = await prisma.emailOtp.findFirst({
      where: {
        email,
        consumed: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord || otpRecord.otpCode !== otpCode) {
      if (otpRecord) {
        await prisma.emailOtp.update({
          where: { id: otpRecord.id },
          data: { attempts: otpRecord.attempts + 1 }
        });
      }
      return c.json({ error: 'Kode OTP salah atau sudah kedaluwarsa' }, 400);
    }

    // Mark OTP as consumed
    await prisma.emailOtp.update({
      where: { id: otpRecord.id },
      data: { consumed: true }
    });

    // Find and update user
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        status: 'active',
        registerAttemptCount: 0,
        lastRegisterAttemptAt: null
      }
    });

    // Auto-login: generate access token & refresh token
    const accessToken = await createAccessToken({
      userId: updatedUser.id,
      username: updatedUser.username,
      posisi: updatedUser.posisi
    });

    const userAgent = c.req.header('user-agent') || 'unknown';
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

    const refreshToken = await prisma.refreshToken.create({
      data: {
        userId: updatedUser.id,
        tokenHash: await bcrypt.hash(accessToken.substring(10, 30), 10),
        deviceInfo: userAgent,
        expiresAt
      }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: updatedUser.id,
        action: 'verify_otp_login',
        tableName: 'users',
        recordId: updatedUser.id,
        ipAddress: ip
      }
    });

    // Set auth cookie
    c.header('Set-Cookie', buildTokenCookie(accessToken, 8 * 60 * 60));

    return c.json({
      success: true,
      message: 'Email berhasil diverifikasi! Selamat datang di BPRS Mitra Harmoni.',
      accessToken,
      refreshToken: refreshToken.id,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        nama: updatedUser.nama,
        posisi: updatedUser.posisi,
        aoNameRef: updatedUser.aoNameRef,
        email: updatedUser.email,
        avatarUrl: updatedUser.avatarUrl,
        emailVerified: true,
        roleConfirmed: updatedUser.roleConfirmed
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /resend-otp - Resend new OTP with 60-second cooldown
authRouter.post('/resend-otp', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ResendOtpSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Email tidak valid';
      return c.json({ error: firstError }, 400);
    }
    const { email } = parsed.data;

    const user = await prisma.user.findFirst({ where: { email } });
    if (!user) {
      return c.json({ error: 'Email tidak terdaftar' }, 404);
    }

    // Cooldown check: 60 seconds
    const lastOtp = await prisma.emailOtp.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' }
    });

    if (lastOtp && Date.now() - lastOtp.createdAt.getTime() < 60 * 1000) {
      const remainingSec = Math.ceil((60 * 1000 - (Date.now() - lastOtp.createdAt.getTime())) / 1000);
      return c.json({ error: `Harap tunggu ${remainingSec} detik sebelum meminta kode OTP baru` }, 429);
    }

    // Invalidate previous OTPs
    await prisma.emailOtp.updateMany({
      where: { email, consumed: false },
      data: { consumed: true }
    });

    // Create fresh OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await prisma.emailOtp.create({
      data: {
        email,
        otpCode,
        purpose: 'register',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    // Send email
    await sendOtpEmail(email, otpCode, user.nama);

    return c.json({
      success: true,
      message: 'Kode OTP baru berhasil dikirim ke email Anda'
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /login
authRouter.post('/login', authLoginRateLimiter, async (c) => {
  try {
    const body = await c.req.json();
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Data tidak valid';
      return c.json({ error: firstError }, 400);
    }
    const { username, password, force } = parsed.data;
    const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';

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

    // Check if email has been verified via OTP
    if (!user.emailVerified) {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      await prisma.emailOtp.updateMany({
        where: { email: user.email, consumed: false },
        data: { consumed: true }
      });
      await prisma.emailOtp.create({
        data: {
          email: user.email,
          otpCode,
          purpose: 'register',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });
      await sendOtpEmail(user.email, otpCode, user.nama);

      return c.json(
        {
          error: 'Email Anda belum diverifikasi. Kode OTP baru telah dikirimkan ke email Anda.',
          requiresOtp: true,
          email: user.email,
          username: user.username
        },
        403
      );
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

    // Set HttpOnly cookie for enhanced security (dual-mode: cookie + JSON)
    c.header('Set-Cookie', buildTokenCookie(accessToken, 8 * 60 * 60));

    return c.json({
      accessToken,
      refreshToken: refreshToken.id,
      user: {
        id: user.id,
        username: user.username,
        nama: user.nama,
        posisi: user.posisi,
        aoNameRef: user.aoNameRef,
        email: user.email,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        roleConfirmed: user.roleConfirmed
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /me - Get current logged-in user profile with role status
authRouter.get('/me', authMiddleware, async (c) => {
  try {
    const userSession = (c as any).get('user');
    const user = await prisma.user.findUnique({
      where: { id: userSession.id }
    });

    if (!user) {
      return c.json({ error: 'User tidak ditemukan' }, 404);
    }

    return c.json({
      id: user.id,
      username: user.username,
      nama: user.nama,
      posisi: user.posisi,
      aoNameRef: user.aoNameRef,
      email: user.email,
      avatarUrl: user.avatarUrl,
      emailVerified: user.emailVerified,
      roleConfirmed: user.roleConfirmed,
      confirmedBy: user.confirmedBy,
      confirmedAt: user.confirmedAt
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /forgot-password
authRouter.post('/forgot-password', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = ForgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Data tidak valid';
      return c.json({ error: firstError }, 400);
    }
    const { username, tgl_lahir, newPassword } = parsed.data;

    // Password length already validated by Zod schema

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

    // Clear HttpOnly cookie
    c.header('Set-Cookie', buildClearCookie());

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
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'Data tidak valid';
      return c.json({ error: firstError }, 400);
    }
    const { oldPassword, newPassword } = parsed.data;

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
