import { describe, it, expect } from 'vitest';
import { computeAuditDiff, FIELD_LABELS } from '../controllers/audit.js';

describe('Visual Audit Trail & Diff Engine Tests', () => {
  describe('computeAuditDiff', () => {
    it('should detect modified fields with before and after values', () => {
      const oldVal = {
        bakiDebet: 50_000_000,
        kol: 'DPK',
        tPokok: 2_500_000,
        statusDebitur: 'Aktif'
      };

      const newVal = {
        bakiDebet: 45_000_000,
        kol: 'Lancar',
        tPokok: 0,
        statusDebitur: 'Aktif'
      };

      const diffs = computeAuditDiff(oldVal, newVal);

      expect(diffs).toHaveLength(3);

      const bakiDiff = diffs.find((d) => d.field === 'bakiDebet');
      expect(bakiDiff).toBeDefined();
      expect(bakiDiff?.oldValue).toBe(50_000_000);
      expect(bakiDiff?.newValue).toBe(45_000_000);
      expect(bakiDiff?.type).toBe('modified');
      expect(bakiDiff?.label).toBe('Baki Debet');

      const kolDiff = diffs.find((d) => d.field === 'kol');
      expect(kolDiff).toBeDefined();
      expect(kolDiff?.oldValue).toBe('DPK');
      expect(kolDiff?.newValue).toBe('Lancar');
      expect(kolDiff?.type).toBe('modified');

      const pokokDiff = diffs.find((d) => d.field === 'tPokok');
      expect(pokokDiff).toBeDefined();
      expect(pokokDiff?.oldValue).toBe(2_500_000);
      expect(pokokDiff?.newValue).toBe(0);
    });

    it('should detect added fields when old object is null or field is newly set', () => {
      const oldVal = null;
      const newVal = {
        nama: 'Debitur Baru',
        plafon: 100_000_000,
        kol: 'Lancar'
      };

      const diffs = computeAuditDiff(oldVal, newVal);

      expect(diffs.length).toBeGreaterThanOrEqual(3);
      diffs.forEach((d) => {
        expect(d.type).toBe('added');
        expect(d.oldValue).toBeNull();
      });
    });

    it('should detect removed fields when new object is null', () => {
      const oldVal = {
        nama: 'Debitur Dihapus',
        nominal: 1_000_000
      };
      const newVal = null;

      const diffs = computeAuditDiff(oldVal, newVal);

      expect(diffs).toHaveLength(2);
      diffs.forEach((d) => {
        expect(d.type).toBe('removed');
        expect(d.newValue).toBeNull();
      });
    });

    it('should ignore sensitive or internal metadata fields (passwordHash, updatedAt, id)', () => {
      const oldVal = {
        id: 'rec-123',
        passwordHash: '$2a$10$oldhash...',
        updatedAt: '2026-08-16T10:00:00Z',
        nama: 'Ahmad'
      };

      const newVal = {
        id: 'rec-123',
        passwordHash: '$2a$10$newhash...',
        updatedAt: '2026-08-16T11:00:00Z',
        nama: 'Ahmad Fauzi'
      };

      const diffs = computeAuditDiff(oldVal, newVal);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].field).toBe('nama');
      expect(diffs[0].oldValue).toBe('Ahmad');
      expect(diffs[0].newValue).toBe('Ahmad Fauzi');
    });

    it('should parse stringified JSON objects automatically', () => {
      const oldJson = JSON.stringify({ kol: 'Macet', bakiDebet: 10_000_000 });
      const newJson = JSON.stringify({ kol: 'Kurang Lancar', bakiDebet: 8_000_000 });

      const diffs = computeAuditDiff(oldJson, newJson);

      expect(diffs).toHaveLength(2);
      expect(diffs.find((d) => d.field === 'kol')?.oldValue).toBe('Macet');
      expect(diffs.find((d) => d.field === 'bakiDebet')?.newValue).toBe(8_000_000);
    });
  });

  describe('FIELD_LABELS mapping', () => {
    it('should contain Indonesian banking and NPF business translations', () => {
      expect(FIELD_LABELS.bakiDebet).toBe('Baki Debet');
      expect(FIELD_LABELS.kol).toBe('Kolektibilitas (KOL)');
      expect(FIELD_LABELS.tPokok).toBe('Tunggakan Pokok');
      expect(FIELD_LABELS.tMargin).toBe('Tunggakan Margin');
      expect(FIELD_LABELS.statusDebitur).toBe('Status Debitur');
      expect(FIELD_LABELS.nominal).toBe('Nominal Pembayaran');
      expect(FIELD_LABELS.nominalJanji).toBe('Nominal Janji Bayar');
    });
  });
});
