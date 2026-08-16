import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import {
  computeEwsStatus,
  getEwsSummary,
  getEwsWatchlist,
  createAoCollectionLog,
  getAoCollectionLogs,
  getEwsLeaderboard
} from '../services/ewsService.js';

export { computeEwsStatus };

export const ewsRouter = new Hono();

// Enforce authentication & role restrictions
ewsRouter.use('*', authMiddleware, roleMiddleware(['admin', 'ao', 'kabid_ao', 'staff_p3', 'kabid_p3', 'desk_call']));

// GET /summary - Portfolio EWS Stats Header
ewsRouter.get('/summary', async (c) => {
  try {
    const user = (c as any).get('user');
    const reqAo = c.req.query('ao');
    const summary = await getEwsSummary(user, reqAo);
    return c.json(summary);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /watchlist - List Debitur for EWS Watchlist Table
ewsRouter.get('/watchlist', async (c) => {
  try {
    const user = (c as any).get('user');
    const reqAo = c.req.query('ao');
    const q = c.req.query('q') || '';
    const kolParam = c.req.query('kol') || '';
    const ewsStatusParam = c.req.query('ewsStatus') || '';

    const list = await getEwsWatchlist(user, reqAo, q, kolParam, ewsStatusParam);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

import { createAoLogSchema } from '../schemas/ews.schema.js';

// POST /collection-log - Add AO Collection Log Entry
ewsRouter.post('/collection-log', async (c) => {
  try {
    const user = (c as any).get('user');
    const body = await c.req.json();
    const parsed = createAoLogSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message, details: parsed.error.issues }, 400);
    }

    const { log, debitur } = await createAoCollectionLog(user, parsed.data as any);

    await logAudit(
      c,
      'CREATE_AO_COLLECTION_LOG',
      'AoCollectionLog',
      log.id,
      null,
      { debiturId: body.debiturId, statusTindakLanjut: body.statusTindakLanjut, jenisAktivitas: body.jenisAktivitas }
    );

    return c.json({ message: 'Tindak lanjut AO berhasil dicatat', log }, 201);
  } catch (err: any) {
    const statusCode = err.message.includes('wajib diisi') ? 400 : (err.message.includes('tidak ditemukan') ? 404 : (err.message.includes('hanya diperbolehkan') ? 403 : 500));
    return c.json({ error: err.message }, statusCode as any);
  }
});

// GET /collection-log/:debiturId - Get AO Collection Logs for a Debitur
ewsRouter.get('/collection-log/:debiturId', async (c) => {
  try {
    const debiturId = c.req.param('debiturId');
    const logs = await getAoCollectionLogs(debiturId);
    return c.json(logs);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /leaderboard - Performance Leaderboard per AO (for kabid_ao and admin)
ewsRouter.get('/leaderboard', async (c) => {
  try {
    const user = (c as any).get('user');
    const leaderboard = await getEwsLeaderboard(user);
    return c.json(leaderboard);
  } catch (err: any) {
    const statusCode = err.message.includes('hanya dapat diakses') ? 403 : 500;
    return c.json({ error: err.message }, statusCode as any);
  }
});
