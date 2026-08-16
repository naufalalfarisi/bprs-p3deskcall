import { describe, it, expect } from 'vitest';
import {
  createDeskCallSchema,
  updateDeskCallSchema,
  createJadwalP3Schema,
  createPembayaranSchema,
  createAoLogSchema,
  createSuratLegalSchema
} from '../schemas/index.js';

describe('Zod Validation Schemas Tests', () => {

  describe('Desk Call Schemas', () => {
    it('should validate valid desk call payload', () => {
      const result = createDeskCallSchema.safeParse({
        debiturId: '01.001.0001',
        tanggal: '2026-08-14',
        waktu: '10:00',
        jenisKontak: 'Telepon',
        statusKontak: 'Terhubung',
        prioritas: 'Tinggi',
        nominalJanji: 5000000,
        tanggalJanjiBayar: '2026-08-20'
      });
      expect(result.success).toBe(true);
    });

    it('should reject desk call payload missing required fields', () => {
      const result = createDeskCallSchema.safeParse({
        debiturId: '01.001.0001'
      });
      expect(result.success).toBe(false);
    });
  });

  describe('P3 Schemas', () => {
    it('should validate valid P3 jadwal payload', () => {
      const result = createJadwalP3Schema.safeParse({
        debiturId: '01.001.0001',
        tanggal: '2026-08-15',
        waktuMulai: '09:00',
        petugasId: 'user-p3-1',
        prioritas: 'Tinggi',
        targetTagih: 10000000,
        jenisTagih: 'Kunjungan Fisik',
        metode: 'Penagihan Lapangan'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Pembayaran Schemas', () => {
    it('should validate valid Pembayaran payload', () => {
      const result = createPembayaranSchema.safeParse({
        debiturId: '01.001.0001',
        tanggal: '2026-08-14',
        nominal: 1500000,
        jenisPembayaran: 'Angsuran',
        metode: 'Transfer'
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid payment method', () => {
      const result = createPembayaranSchema.safeParse({
        debiturId: '01.001.0001',
        tanggal: '2026-08-14',
        nominal: 1500000,
        jenisPembayaran: 'Angsuran',
        metode: 'Kripto' // Invalid
      });
      expect(result.success).toBe(false);
    });
  });

  describe('EWS & Legal Schemas', () => {
    it('should validate AO collection log', () => {
      const result = createAoLogSchema.safeParse({
        debiturId: '01.001.0001',
        tanggal: '2026-08-14',
        aktivitas: 'Kunjungan',
        hasil: 'Debitur bersedia membayar minggu depan'
      });
      expect(result.success).toBe(true);
    });

    it('should validate Surat Legal creation', () => {
      const result = createSuratLegalSchema.safeParse({
        debiturId: '01.001.0001',
        jenisSurat: 'SP1',
        tanggalTerbit: '2026-08-14',
        perihal: 'Surat Peringatan Pertama'
      });
      expect(result.success).toBe(true);
    });
  });
});
