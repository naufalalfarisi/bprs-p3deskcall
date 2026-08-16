import { z } from 'zod';

export const SaveRbbTargetSchema = z.object({
  periode: z.string().regex(/^\d{4}-\d{2}$/, 'Format periode harus YYYY-MM'),
  npfGross: z.coerce.number().min(0).max(100).default(5.0),
  collectionRate: z.coerce.number().min(0).max(100).default(70.0),
  recoveryRate: z.coerce.number().min(0).max(100).default(40.0),
  cureRate: z.coerce.number().min(0).max(100).default(20.0),
  ptpRate: z.coerce.number().min(0).max(100).default(40.0),
  promiseKept: z.coerce.number().min(0).max(100).default(60.0),
  coverageRatio: z.coerce.number().min(0).max(500).default(80.0),
  kunjunganPerPetugas: z.coerce.number().min(0).default(15.0),
  restrukSuccess: z.coerce.number().min(0).max(100).default(50.0),
  ppapCoverage: z.coerce.number().min(0).max(500).default(100.0)
});

export const StressTestSchema = z.object({
  targetRecoveryNominal: z.coerce.number().min(0).default(0),
  restrukturisasiKol3Nominal: z.coerce.number().min(0).default(0),
  dpkRollOverPercent: z.coerce.number().min(0).max(100).default(0)
});

export const MigrationMatrixQuerySchema = z.object({
  fromPeriode: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  toPeriode: z.string().regex(/^\d{4}-\d{2}$/).optional()
});

export type SaveRbbTargetInput = z.infer<typeof SaveRbbTargetSchema>;
export type StressTestInput = z.infer<typeof StressTestSchema>;
export type MigrationMatrixQueryInput = z.infer<typeof MigrationMatrixQuerySchema>;
