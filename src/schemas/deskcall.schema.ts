import { z } from 'zod';

export const createDeskCallSchema = z.object({
  debiturId: z.string().min(1, 'Nomor rekening/ID debitur wajib diisi'),
  tanggal: z.string().min(1, 'Tanggal kontak wajib diisi'),
  waktu: z.string().min(1, 'Waktu kontak wajib diisi'),
  jenisKontak: z.string().min(1, 'Jenis kontak wajib diisi'),
  statusKontak: z.string().min(1, 'Status kontak wajib diisi'),
  hasilKomunikasi: z.string().optional(),
  tindakLanjut: z.string().optional().default('Tidak Ada'),
  prioritas: z.string().min(1, 'Prioritas wajib diisi'),
  nominalJanji: z.union([z.number(), z.string()]).nullable().optional(),
  tanggalJanjiBayar: z.string().nullable().optional(),
  durasiPanggilan: z.string().nullable().optional()
});

export const updateDeskCallSchema = z.object({
  jenisKontak: z.string().optional(),
  statusKontak: z.string().optional(),
  hasilKomunikasi: z.string().optional(),
  tindakLanjut: z.string().optional(),
  prioritas: z.string().optional(),
  nominalJanji: z.union([z.number(), z.string()]).nullable().optional(),
  tanggalJanjiBayar: z.string().nullable().optional(),
  durasiPanggilan: z.string().nullable().optional()
});
