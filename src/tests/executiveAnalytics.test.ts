import { describe, it, expect } from 'vitest';
import {
  SaveRbbTargetSchema,
  StressTestSchema,
  MigrationMatrixQuerySchema
} from '../schemas/kpi.schema.js';
import {
  getKpiMigrationMatrix,
  runNpfStressTest,
  getExecutiveReportData
} from '../services/kpiService.js';

describe('Feature 6: Executive Analytics & Stress Testing', () => {
  describe('Zod Schemas Validation', () => {
    it('should validate SaveRbbTargetSchema correctly', () => {
      const valid = SaveRbbTargetSchema.safeParse({
        periode: '2026-08',
        npfGross: 4.5,
        collectionRate: 75,
        recoveryRate: 45,
        cureRate: 25,
        ptpRate: 50,
        promiseKept: 65,
        coverageRatio: 90,
        kunjunganPerPetugas: 18,
        restrukSuccess: 55,
        ppapCoverage: 110
      });
      expect(valid.success).toBe(true);

      const invalid = SaveRbbTargetSchema.safeParse({
        periode: '2026/08', // Invalid format
        npfGross: 4.5
      });
      expect(invalid.success).toBe(false);
    });

    it('should validate StressTestSchema correctly with defaults', () => {
      const parsed = StressTestSchema.safeParse({
        targetRecoveryNominal: '500000000',
        restrukturisasiKol3Nominal: 200000000,
        dpkRollOverPercent: 15
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.targetRecoveryNominal).toBe(500000000);
        expect(parsed.data.dpkRollOverPercent).toBe(15);
      }

      const invalid = StressTestSchema.safeParse({
        dpkRollOverPercent: 150 // Out of range > 100
      });
      expect(invalid.success).toBe(false);
    });

    it('should validate MigrationMatrixQuerySchema', () => {
      const valid = MigrationMatrixQuerySchema.safeParse({
        fromPeriode: '2026-07',
        toPeriode: '2026-08'
      });
      expect(valid.success).toBe(true);
    });
  });

  describe('Migration Matrix Computation', () => {
    it('should generate a 5x6 matrix structure with correct categories', async () => {
      const result = await getKpiMigrationMatrix();
      expect(result).toBeDefined();
      expect(result.rowKols).toEqual(['Lancar', 'DPK', 'Kurang Lancar', 'Diragukan', 'Macet']);
      expect(result.colKols).toEqual(['Lancar', 'DPK', 'Kurang Lancar', 'Diragukan', 'Macet', 'Lunas']);
      expect(result.matrix).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(typeof result.summary.totalEvaluatedNoa).toBe('number');
      expect(typeof result.summary.overallCureRatePct).toBe('number');
      expect(typeof result.summary.overallRollRatePct).toBe('number');
    });
  });

  describe('Stress Testing & Scenario Simulator', () => {
    it('should calculate recovery simulation correctly reducing NPF Gross', async () => {
      const baselineRes = await runNpfStressTest({
        targetRecoveryNominal: 0,
        restrukturisasiKol3Nominal: 0,
        dpkRollOverPercent: 0
      });

      expect(baselineRes.baseline.totalBaki).toBeGreaterThan(0);
      expect(baselineRes.simulation.simNpfGross).toBe(baselineRes.baseline.npfGross);

      // Apply 100,000,000 recovery
      const simRes = await runNpfStressTest({
        targetRecoveryNominal: 100000000,
        restrukturisasiKol3Nominal: 0,
        dpkRollOverPercent: 0
      });

      expect(simRes.simulation.targetRecoveryApplied).toBeGreaterThanOrEqual(0);
      if (baselineRes.baseline.npfBaki > 0) {
        expect(simRes.simulation.simNpfGross).toBeLessThanOrEqual(baselineRes.baseline.npfGross);
      }
    });

    it('should calculate DPK roll-over shock increasing NPF Gross and PPAP requirement', async () => {
      const shockRes = await runNpfStressTest({
        targetRecoveryNominal: 0,
        restrukturisasiKol3Nominal: 0,
        dpkRollOverPercent: 20
      });

      if (shockRes.baseline.dpkBaki > 0) {
        expect(shockRes.simulation.simNpfGross).toBeGreaterThanOrEqual(shockRes.baseline.npfGross);
        expect(shockRes.simulation.simPpapRequirement).toBeGreaterThanOrEqual(shockRes.baseline.ppapRequirement);
      }
    });
  });

  describe('Executive Report Dataset', () => {
    it('should aggregate comprehensive report data including institution, KPI, top NPF, and AO performance', async () => {
      const report = await getExecutiveReportData('2026-08');
      expect(report).toBeDefined();
      expect(report.institution.name).toBeDefined();
      expect(report.kpi).toBeDefined();
      expect(Array.isArray(report.topNpfDebitur)).toBe(true);
      expect(Array.isArray(report.aoPerformance)).toBe(true);
    });
  });
});
