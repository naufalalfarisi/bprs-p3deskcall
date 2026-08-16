import { z } from 'zod';

export const createPembayaranSchema = z.object({
  debiturId: z.string().min(1, 'ID Debitur wajib diisi'),
  tanggal: z.string().min(1, 'Tanggal pembayaran wajib diisi'),
  nominal: z.union([z.number(), z.string().min(1)]),
  jenisPembayaran: z.enum(['Angsuran', 'Pelunasan', 'Sebagian', 'Biaya Lainnya'], {
    message: 'Jenis pembayaran tidak valid'
  }).optional().default('Angsuran'),
  metode: z.enum(['Tunai', 'Transfer', 'Autodebet', 'Lainnya'], {
    message: 'Metode pembayaran tidak valid'
  }),
  noKuitansi: z.string().optional(),
  petugasId: z.string().optional(),
  catatan: z.string().optional()
});
