import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import {
  SaveRbbTargetSchema,
  StressTestSchema,
  MigrationMatrixQuerySchema
} from '../schemas/kpi.schema.js';
import {
  getKpiTargets,
  saveKpiTargets,
  getKpiDashboard,
  getKpiOfficers,
  getKpiRollrate,
  getKpiMigrationMatrix,
  runNpfStressTest,
  getExecutiveReportData,
  getAoPerformanceReport,
  getAoDebiturDrilldown
} from '../services/kpiService.js';

export const kpiRouter = new Hono();

// Enforce auth
kpiRouter.use('*', authMiddleware);

// GET /targets - Get target RBB for a period
kpiRouter.get('/targets', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const result = await getKpiTargets(periode);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /targets - Save/Update target RBB (admin & kabid_p3 only)
kpiRouter.post('/targets', roleMiddleware(['admin', 'kabid_p3']), async (c) => {
  try {
    const rawBody = await c.req.json();
    const parsed = SaveRbbTargetSchema.safeParse(rawBody);

    if (!parsed.success) {
      return c.json({ error: 'Validasi gagal', details: parsed.error.issues }, 400);
    }

    const user = (c as any).get('user');

    const target = await saveKpiTargets({
      ...parsed.data,
      updatedBy: user.nama
    });

    await logAudit(c, 'save_rbb_targets', 'rbb_targets', target.id, null, target);

    return c.json(target);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /dashboard - Computes 16 KPI cards and statistics
kpiRouter.get('/dashboard', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const data = await getKpiDashboard(periode);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /officers - Computes ranking per officer
kpiRouter.get('/officers', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const data = await getKpiOfficers(periode);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /rollrate - Roll Rate & Cure Rate per KOL (Two Methods)
kpiRouter.get('/rollrate', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7); // YYYY-MM
    const data = await getKpiRollrate(periode);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /migration-matrix - 5x6 NPF Migration / Transition Matrix
kpiRouter.get('/migration-matrix', async (c) => {
  try {
    const query = {
      fromPeriode: c.req.query('fromPeriode') || undefined,
      toPeriode: c.req.query('toPeriode') || undefined
    };
    const parsed = MigrationMatrixQuerySchema.safeParse(query);
    if (!parsed.success) {
      return c.json({ error: 'Format periode tidak valid (gunakan YYYY-MM)', details: parsed.error.issues }, 400);
    }
    const data = await getKpiMigrationMatrix(parsed.data.fromPeriode, parsed.data.toPeriode);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /stress-test - Interactive What-If Stress Testing & Simulation
kpiRouter.post('/stress-test', async (c) => {
  try {
    const rawBody = await c.req.json();
    const parsed = StressTestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: 'Parameter simulasi tidak valid', details: parsed.error.issues }, 400);
    }
    const result = await runNpfStressTest(parsed.data);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /executive-report - Comprehensive executive reporting dataset
kpiRouter.get('/executive-report', async (c) => {
  try {
    const periode = c.req.query('periode') || new Date().toISOString().substring(0, 7);
    const data = await getExecutiveReportData(periode);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /ao-performance - Comprehensive AO Financing Performance & KOL Breakdown
kpiRouter.get('/ao-performance', async (c) => {
  try {
    const data = await getAoPerformanceReport();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /ao-debiturs - Detailed Debtor Drilldown for a specific AO
kpiRouter.get('/ao-debiturs', async (c) => {
  try {
    const ao = c.req.query('ao') || '';
    if (!ao) {
      return c.json({ error: 'Parameter nama AO wajib diisi' }, 400);
    }
    const data = await getAoDebiturDrilldown(ao);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

