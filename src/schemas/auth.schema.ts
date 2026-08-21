import { z } from 'zod';

export const LoginSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
  force: z.boolean().optional()
});

export const RegisterSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  nama: z.string().min(1, 'Nama lengkap wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  tgl_lahir: z.string().min(1, 'Tanggal lahir wajib diisi'),
  posisi: z.enum(['desk_call', 'ao', 'p3', 'legal', 'staff_ao', 'kabid_ao', 'staff_p3', 'kabid_p3', 'admin', 'skai'], {
    message: 'Posisi tidak valid'
  }),
  ao_name_ref: z.string().optional()
});

export const VerifyOtpSchema = z.object({
  email: z.string().min(1, 'Email atau username wajib diisi'),
  otpCode: z.string().length(6, 'Kode OTP harus 6 digit angka')
});

export const ResendOtpSchema = z.object({
  email: z.string().min(1, 'Email atau username wajib diisi')
});

export const ForgotPasswordSchema = z.object({
  username: z.string().min(1, 'Username wajib diisi'),
  tgl_lahir: z.string().min(1, 'Tanggal lahir wajib diisi'),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter')
});

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Password lama wajib diisi'),
  newPassword: z.string().min(8, 'Password baru minimal 8 karakter')
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof ResendOtpSchema>;
