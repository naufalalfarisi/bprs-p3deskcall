import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import {
  getKpiTargets,
  saveKpiTargets,
  getKpiDashboard,
  getKpiOfficers,
  getKpiRollrate
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
    const body = await c.req.json();
    const { periode } = body;

    if (!periode) {
      return c.json({ error: 'Periode wajib diisi' }, 400);
    }

    const user = (c as any).get('user');

    const target = await saveKpiTargets({
      ...body,
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
