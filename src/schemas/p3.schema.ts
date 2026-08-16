import { z } from 'zod';

export const createJadwalP3Schema = z.object({
  debiturId: z.string().min(1, 'ID debitur wajib diisi'),
  tanggal: z.string().min(1, 'Tanggal kunjungan wajib diisi'),
  waktuMulai: z.string().min(1, 'Waktu mulai wajib diisi'),
  petugasId: z.string().min(1, 'Petugas wajib dipilih'),
  area: z.string().optional(),
  prioritas: z.string().min(1, 'Prioritas wajib diisi'),
  targetTagih: z.union([z.number(), z.string()]),
  jenisTagih: z.string().min(1, 'Jenis tagih wajib diisi'),
  metode: z.string().min(1, 'Metode penagihan wajib diisi'),
  catatan: z.string().optional()
});

export const checkInP3Schema = z.object({
  latitude: z.number({ message: 'Latitude wajib ada' }),
  longitude: z.number({ message: 'Longitude wajib ada' }),
  catatan: z.string().optional()
});

export const updateStatusP3Schema = z.object({
  status: z.enum(['terjadwal', 'selesai', 'batal', 'reschedule'], {
    message: 'Status kunjungan tidak valid'
  }),
  hasilKunjungan: z.string().optional(),
  nominalDidapat: z.union([z.number(), z.string()]).nullable().optional(),
  janjiBayarTanggal: z.string().nullable().optional(),
  janjiBayarNominal: z.union([z.number(), z.string()]).nullable().optional(),
  kendala: z.string().optional()
});

export const SyncBatchItemSchema = z.object({
  jadwalId: z.string().min(1, 'ID Jadwal wajib ada'),
  status: z.string().min(1, 'Status wajib ada'),
  hasil: z.string().nullable().optional(),
  catatan: z.string().nullable().optional(),
  nominalRealisasi: z.union([z.number(), z.string()]).transform(v => Number(v) || 0).optional(),
  checkInLat: z.number().nullable().optional(),
  checkInLng: z.number().nullable().optional(),
  checkInTime: z.string().nullable().optional(),
  checkInAddress: z.string().nullable().optional(),
  localRecordedAt: z.string().nullable().optional(),
  tandaTanganDebitur: z.string().nullable().optional(),
  tandaTanganNama: z.string().nullable().optional(),
  fotos: z.array(z.object({
    base64: z.string().min(1),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    gpsAddress: z.string().nullable().optional()
  })).optional()
});

export const SyncBatchP3Schema = z.object({
  drafts: z.array(SyncBatchItemSchema).min(1, 'Minimal 1 draft offline untuk disinkronisasi')
});

export const RouteClusterQuerySchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional(),
  petugasId: z.string().optional(),
  area: z.string().optional()
});

export const SaveSignatureP3Schema = z.object({
  signatureBase64: z.string().min(1, 'Data tanda tangan wajib ada'),
  signerName: z.string().optional()
});

