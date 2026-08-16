import { z } from 'zod';

export const CreateUserSchema = z.object({
  username: z.string().min(3, 'Username minimal 3 karakter'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  nama: z.string().min(1, 'Nama wajib diisi'),
  email: z.string().email('Format email tidak valid'),
  tgl_lahir: z.string().min(1, 'Tanggal lahir wajib diisi'),
  posisi: z.string().min(1, 'Posisi wajib diisi'),
  ao_name_ref: z.string().optional()
});

export const ConfirmRoleSchema = z.object({
  posisi: z.enum(['admin', 'kabid_p3', 'staff_p3', 'desk_call', 'legal', 'ao', 'kabid_ao'], {
    message: 'Posisi / Role tidak valid'
  }),
  aoNameRef: z.string().optional().nullable()
});

export const EditUserSchema = z.object({
  nama: z.string().min(1, 'Nama wajib diisi').optional(),
  email: z.string().email('Format email tidak valid').optional(),
  posisi: z.string().min(1, 'Posisi wajib diisi').optional(),
  aoNameRef: z.string().optional().nullable(),
  status: z.enum(['pending', 'active', 'inactive', 'rejected']).optional(),
  password: z.string().min(6, 'Password minimal 6 karakter').optional()
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type ConfirmRoleInput = z.infer<typeof ConfirmRoleSchema>;
export type EditUserInput = z.infer<typeof EditUserSchema>;
