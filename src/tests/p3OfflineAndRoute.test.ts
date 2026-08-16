import { describe, it, expect } from 'vitest';
import {
  SyncBatchP3Schema,
  RouteClusterQuerySchema,
  SaveSignatureP3Schema
} from '../schemas/p3.schema.js';
import { getHaversineDistanceKm } from '../controllers/p3.js';
import { prisma } from '../db.js';

describe('Feature 3: P3 Offline Sync & Smart Route Clustering', () => {
  describe('Zod Schemas Validation', () => {
    it('should validate SyncBatchP3Schema with full draft payload', () => {
      const validPayload = {
        drafts: [
          {
            jadwalId: 'test-jadwal-123',
            status: 'Selesai',
            hasil: 'Debitur berjanji membayar via transfer besok',
            nominalRealisasi: 500000,
            checkInLat: -7.7956,
            checkInLng: 110.3695,
            checkInAddress: 'Jl. Malioboro No. 10, Yogyakarta',
            tandaTanganDebitur: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            tandaTanganNama: 'Budi Santoso',
            localRecordedAt: '2026-08-16T10:30:00.000Z',
            fotos: [
              {
                base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
                latitude: -7.7956,
                longitude: 110.3695,
                gpsAddress: 'Lokasi Debitur'
              }
            ]
          }
        ]
      };

      const parsed = SyncBatchP3Schema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.drafts.length).toBe(1);
        expect(parsed.data.drafts[0].nominalRealisasi).toBe(500000);
      }
    });

    it('should reject SyncBatchP3Schema if drafts array is empty', () => {
      const invalid = SyncBatchP3Schema.safeParse({ drafts: [] });
      expect(invalid.success).toBe(false);
    });

    it('should validate RouteClusterQuerySchema date format', () => {
      const valid = RouteClusterQuerySchema.safeParse({ tanggal: '2026-08-16', area: 'SLEMAN' });
      expect(valid.success).toBe(true);

      const invalid = RouteClusterQuerySchema.safeParse({ tanggal: '16-08-2026' });
      expect(invalid.success).toBe(false);
    });

    it('should validate SaveSignatureP3Schema', () => {
      const valid = SaveSignatureP3Schema.safeParse({
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        signerName: 'Ahmad Fauzi'
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('Haversine Distance & Route Calculation', () => {
    it('should calculate distance correctly between Yogyakarta HQ and Sleman anchor (~8-12 km)', () => {
      const jogjaHq = { lat: -7.797068, lng: 110.370529 };
      const slemanPoint = { lat: -7.7167, lng: 110.3556 };

      const dist = getHaversineDistanceKm(jogjaHq.lat, jogjaHq.lng, slemanPoint.lat, slemanPoint.lng);
      expect(dist).toBeGreaterThan(7);
      expect(dist).toBeLessThan(15);
    });

    it('should return 0 distance for identical coordinates', () => {
      const dist = getHaversineDistanceKm(-7.797068, 110.370529, -7.797068, 110.370529);
      expect(dist).toBe(0);
    });
  });
});
