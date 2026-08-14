import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
  processCbsUpload,
  commitCbsBatch,
  getMissingDebiturs,
  resolveMissingDebitur,
  getCbsBatchHistory,
  getCbsBatchChanges
} from '../services/importService.js';

export const importRouter = new Hono();

// Enforce admin-only
importRouter.use('*', authMiddleware, roleMiddleware(['admin']));

// POST /cbs - Upload and process staging
importRouter.post('/cbs', async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    const file: any = body.file;

    if (!file || typeof file === 'string') {
      return c.json({ error: 'File CSV wajib diunggah' }, 400);
    }

    let content = '';
    if (typeof file.text === 'function') {
      content = await file.text();
    } else if (typeof file.arrayBuffer === 'function') {
      const buf = await file.arrayBuffer();
      content = Buffer.from(buf).toString('utf-8');
    } else if (Buffer.isBuffer(file)) {
      content = file.toString('utf-8');
    } else {
      return c.json({ error: 'Format file tidak dapat dibaca' }, 400);
    }

    const user = (c as any).get('user');
    const result = await processCbsUpload(user, file.name, content);
    return c.json(result);
  } catch (err: any) {
    const status = err.message.includes('wajib') || err.message.includes('kosong') || err.message.includes('Header CSV') ? 400 : 500;
    return c.json({ error: err.message }, status as any);
  }
});

// POST /cbs/:batchId/commit - Apply staging rows (atomic updates)
importRouter.post('/cbs/:batchId/commit', async (c) => {
  const batchId = c.req.param('batchId') || '';
  try {
    const result = await commitCbsBatch(c, batchId);
    return c.json(result);
  } catch (err: any) {
    const status = err.message.includes('tidak ditemukan') ? 404 : (err.message.includes('sudah diproses') ? 400 : 500);
    return c.json({ error: err.message }, status as any);
  }
});

// GET /cbs/:batchId/commit-info - Get info for progress bar
importRouter.get('/cbs/:batchId/commit-info', async (c) => {
  const batchId = c.req.param('batchId') || '';
  try {
    const { prepareCbsCommitInfo } = await import('../services/importService.js');
    const result = await prepareCbsCommitInfo(batchId);
    return c.json(result);
  } catch (err: any) {
    const status = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, status as any);
  }
});

// POST /cbs/:batchId/commit-chunk - Process a single chunk for progress bar
importRouter.post('/cbs/:batchId/commit-chunk', async (c) => {
  const batchId = c.req.param('batchId') || '';
  try {
    const body = await c.req.json().catch(() => ({}));
    const offset = parseInt(body.offset, 10) || 0;
    const limit = parseInt(body.limit, 10) || 100;
    const { commitCbsChunkStep } = await import('../services/importService.js');
    const result = await commitCbsChunkStep(c, batchId, offset, limit);
    return c.json(result);
  } catch (err: any) {
    const status = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, status as any);
  }
});

// POST /cbs/:batchId/commit-finish - Finalize commit batch
importRouter.post('/cbs/:batchId/commit-finish', async (c) => {
  const batchId = c.req.param('batchId') || '';
  try {
    const { finishCbsCommitBatch } = await import('../services/importService.js');
    const result = await finishCbsCommitBatch(c, batchId);
    return c.json(result);
  } catch (err: any) {
    const status = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, status as any);
  }
});

// GET /cbs/missing - Active debiturs missing in the last sync
importRouter.get('/cbs/missing', async (c) => {
  try {
    const missingDebiturs = await getMissingDebiturs();
    return c.json(missingDebiturs);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /cbs/missing/:id/resolve - Resolve missing debitur status
importRouter.post('/cbs/missing/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { status } = body;

    const updated = await resolveMissingDebitur(id, status, c);
    return c.json(updated);
  } catch (err: any) {
    const statusCode = err.message.includes('Status tidak valid') ? 400 : (err.message.includes('tidak ditemukan') ? 404 : 500);
    return c.json({ error: err.message }, statusCode as any);
  }
});

// GET /cbs/history - List history of all CBS import batches
importRouter.get('/cbs/history', async (c) => {
  try {
    const batches = await getCbsBatchHistory();
    return c.json(batches);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /cbs/batch/:batchId/changes - Detailed breakdown of status & KOL changes for a batch
importRouter.get('/cbs/batch/:batchId/changes', async (c) => {
  try {
    const batchId = c.req.param('batchId');
    const changes = await getCbsBatchChanges(batchId);
    return c.json(changes);
  } catch (err: any) {
    const statusCode = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, statusCode as any);
  }
});
