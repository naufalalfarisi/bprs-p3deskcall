import { z } from 'zod';

export const createSuratLegalSchema = z.object({
  debiturId: z.string().min(1, 'ID debitur wajib diisi'),
  jenisSurat: z.string().min(1, 'Jenis surat wajib diisi'),
  nomorSurat: z.string().optional(),
  tanggalTerbit: z.string().min(1, 'Tanggal terbit wajib diisi'),
  tenggatWaktu: z.string().optional(),
  perihal: z.string().min(1, 'Perihal surat wajib diisi'),
  keterangan: z.string().optional(),
  statusPengiriman: z.string().optional().default('Draf')
});

export const autoGenerateSpSchema = z.object({
  debiturId: z.string().min(1, 'ID debitur wajib diisi'),
  jenisSurat: z.string().optional()
});
