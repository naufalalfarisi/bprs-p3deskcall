import { z } from 'zod';

export const createAoLogSchema = z.object({
  debiturId: z.string().min(1, 'ID debitur wajib diisi'),
  tanggal: z.string().min(1, 'Tanggal log wajib diisi'),
  aktivitas: z.enum(['Kunjungan', 'Telepon', 'Pesan WA', 'Surat', 'Lainnya'], {
    message: 'Aktivitas tidak valid'
  }),
  hasil: z.string().min(1, 'Hasil aktivitas wajib diisi'),
  tindakLanjut: z.string().optional(),
  tglJanjiBayar: z.string().nullable().optional(),
  nominalJanji: z.union([z.number(), z.string()]).nullable().optional()
});
