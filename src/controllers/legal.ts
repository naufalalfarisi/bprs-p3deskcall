import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { promises as fs } from 'fs';
import path from 'path';
import {
  getLegalBerkas,
  createLegalBerkas,
  getLegalBerkasById,
  toggleChecklistItem,
  getSuratLegalList,
  createSuratLegal,
  getSpRecommendations,
  autoGenerateSp
} from '../services/legalService.js';

export const legalRouter = new Hono();

// Enforce auth & role restrictions
legalRouter.use('*', authMiddleware, roleMiddleware(['admin', 'kabid_p3', 'legal', 'staff_p3', 'desk_call', 'skai']));

// GET /berkas - List legal berkas
legalRouter.get('/berkas', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const status = c.req.query('status') || '';
    const formatted = await getLegalBerkas(q, status);
    return c.json(formatted);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /berkas - Create legal berkas
legalRouter.post('/berkas', async (c) => {
  try {
    const body = await c.req.json();
    const newBerkas = await createLegalBerkas(body);
    await logAudit(c, 'create_legal_berkas', 'legal_berkas', newBerkas.id, null, newBerkas);
    return c.json(newBerkas, 201);
  } catch (err: any) {
    const statusCode = err.message.includes('wajib diisi') || err.message.includes('sudah ada') ? 400 : (err.message.includes('tidak ditemukan') ? 404 : 500);
    return c.json({ error: err.message }, statusCode as any);
  }
});

// GET /berkas/:id - Detail legal berkas
legalRouter.get('/berkas/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const berkas = await getLegalBerkasById(id);
    return c.json(berkas);
  } catch (err: any) {
    const statusCode = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, statusCode as any);
  }
});

// PUT /berkas/:id/checklist - Toggle checklist item
legalRouter.put('/berkas/:id/checklist', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { checklistId, checked } = body;
    const user = (c as any).get('user');

    if (!checklistId || checked === undefined) {
      return c.json({ error: 'checklistId dan checked wajib diisi' }, 400);
    }

    const updatedChecklist = await toggleChecklistItem(id, checklistId, Boolean(checked), user.id);
    await logAudit(c, 'toggle_legal_checklist', 'legal_berkas_checklists', checklistId, null, { checked });
    return c.json(updatedChecklist);
  } catch (err: any) {
    const statusCode = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, statusCode as any);
  }
});

// POST /berkas/:id/files - Upload file to legal berkas
legalRouter.post('/berkas/:id/files', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.parseBody({ all: true });
    const file: any = body.file;

    if (!file || typeof file === 'string') {
      return c.json({ error: 'File dokumen wajib diunggah' }, 400);
    }

    const berkas = await prisma.legalBerkas.findUnique({ where: { id } });
    if (!berkas) {
      return c.json({ error: 'Berkas legal tidak ditemukan' }, 404);
    }

    const user = (c as any).get('user');
    const ext = path.extname(file.name) || '.pdf';
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'legal');
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `legal_${id}_${Date.now()}${ext}`;
    const targetPath = path.join(uploadDir, filename);

    if (typeof file.arrayBuffer === 'function') {
      const buf = await file.arrayBuffer();
      await fs.writeFile(targetPath, Buffer.from(buf));
    } else if (Buffer.isBuffer(file)) {
      await fs.writeFile(targetPath, file);
    } else {
      return c.json({ error: 'Format file tidak valid' }, 400);
    }

    const relPath = `/uploads/legal/${filename}`;
    const newFile = await prisma.legalFile.create({
      data: {
        legalBerkasId: id,
        fileName: file.name,
        filePath: relPath,
        uploadedBy: user.id
      }
    });

    await logAudit(c, 'upload_legal_file', 'legal_files', newFile.id, null, newFile);
    return c.json(newFile, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /berkas/:id/files/:fileId - Delete file
legalRouter.delete('/berkas/:id/files/:fileId', roleMiddleware(['admin', 'legal', 'kabid_p3', 'staff_p3', 'desk_call']), async (c) => {
  try {
    const id = c.req.param('id');
    const fileId = c.req.param('fileId');

    const file = await prisma.legalFile.findUnique({ where: { id: fileId } });
    if (!file || file.legalBerkasId !== id) {
      return c.json({ error: 'File tidak ditemukan' }, 404);
    }

    let relPath = file.filePath;
    if (relPath.startsWith('/') || relPath.startsWith('\\')) {
      relPath = relPath.substring(1);
    }
    const diskPath = path.join(process.cwd(), relPath);
    try {
      await fs.unlink(diskPath);
    } catch (e) {}

    await prisma.legalFile.delete({ where: { id: fileId } });
    await logAudit(c, 'delete_legal_file', 'legal_files', fileId || '', file);

    return c.json({ message: 'File dokumen berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /berkas/:id - Delete whole Legal Berkas
legalRouter.delete('/berkas/:id', roleMiddleware(['admin', 'legal', 'kabid_p3', 'staff_p3', 'desk_call']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const berkas = await prisma.legalBerkas.findUnique({
      where: { id },
      include: { files: true }
    });

    if (!berkas) {
      return c.json({ error: 'Berkas legal tidak ditemukan' }, 404);
    }

    for (const f of berkas.files || []) {
      if (f && f.filePath) {
        let relPath = f.filePath;
        if (relPath.startsWith('/') || relPath.startsWith('\\')) relPath = relPath.substring(1);
        const diskPath = path.join(process.cwd(), relPath);
        try {
          await fs.unlink(diskPath);
        } catch (e) {}
      }
    }

    await prisma.legalBerkasChecklist.deleteMany({ where: { legalBerkasId: id } });
    await prisma.legalFile.deleteMany({ where: { legalBerkasId: id } });
    await prisma.legalBerkas.delete({ where: { id } });

    await logAudit(c, 'delete_legal_berkas', 'legal_berkas', id, berkas);
    return c.json({ message: 'Berkas legal berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// SP1, SP2, & SOMASI ENDPOINTS
// ==========================================

// GET /surat - List Surat Peringatan & Somasi
legalRouter.get('/surat', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const jenis = c.req.query('jenis') || '';
    const status = c.req.query('status') || '';
    const list = await getSuratLegalList(q, jenis, status);
    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /surat/eligible - SP Auto-Trigger Recommendations
legalRouter.get('/surat/eligible', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const recommendations = await getSpRecommendations(q);
    return c.json(recommendations);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

import { createSuratLegalSchema, autoGenerateSpSchema } from '../schemas/legal.schema.js';

// POST /surat/auto-generate - 1-Click Auto Generate SP for Debitur
legalRouter.post('/surat/auto-generate', async (c) => {
  try {
    const user = (c as any).get('user');
    const body = await c.req.json();
    const parsed = autoGenerateSpSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message, details: parsed.error.issues }, 400);
    }

    const { debiturId, jenisSurat } = parsed.data;

    const newSurat = await autoGenerateSp(user, debiturId, jenisSurat);
    await logAudit(c, 'auto_generate_sp', 'surat_legal', newSurat.id, null, newSurat);
    return c.json(newSurat, 201);
  } catch (err: any) {
    const statusCode = err.message.includes('tidak ditemukan') ? 404 : 500;
    return c.json({ error: err.message }, statusCode as any);
  }
});

// POST /surat - Buat SP1, SP2, atau Somasi Baru (Manual)
legalRouter.post('/surat', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createSuratLegalSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message, details: parsed.error.issues }, 400);
    }

    const user = (c as any).get('user');

    const newSurat = await createSuratLegal(user, parsed.data as any);
    await logAudit(c, 'create_surat_legal', 'surat_legal', newSurat.id, null, newSurat);

    return c.json(newSurat, 201);
  } catch (err: any) {
    const statusCode = err.message.includes('wajib diisi') ? 400 : (err.message.includes('tidak ditemukan') ? 404 : 500);
    return c.json({ error: err.message }, statusCode as any);
  }
});

// GET /surat/:id - Detail Surat Legal
legalRouter.get('/surat/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const surat = await prisma.suratLegal.findUnique({
      where: { id },
      include: { debitur: true }
    });

    if (!surat) {
      return c.json({ error: 'Surat tidak ditemukan' }, 404);
    }

    return c.json(surat);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /surat/:id - Update Status / Catatan Surat Legal
legalRouter.put('/surat/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await prisma.suratLegal.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: 'Surat tidak ditemukan' }, 404);
    }

    const body = await c.req.json();
    const { status, penerima, tglDiterima, catatan, hal, tglJatuhTempo } = body;

    const updated = await prisma.suratLegal.update({
      where: { id },
      data: {
        status: status || existing.status,
        penerima: penerima !== undefined ? penerima : existing.penerima,
        tglDiterima: tglDiterima !== undefined ? (tglDiterima ? new Date(tglDiterima) : null) : existing.tglDiterima,
        catatan: catatan !== undefined ? catatan : existing.catatan,
        hal: hal || existing.hal,
        tglJatuhTempo: tglJatuhTempo !== undefined ? (tglJatuhTempo ? new Date(tglJatuhTempo) : null) : existing.tglJatuhTempo
      }
    });

    await logAudit(c, 'update_surat_legal', 'surat_legal', id, existing, updated);

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /surat/:id - Hapus Surat Legal
legalRouter.delete('/surat/:id', roleMiddleware(['admin', 'legal', 'kabid_p3', 'staff_p3', 'desk_call']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const surat = await prisma.suratLegal.findUnique({ where: { id } });
    if (!surat) {
      return c.json({ error: 'Surat tidak ditemukan' }, 404);
    }

    await prisma.suratLegal.delete({ where: { id } });
    await logAudit(c, 'delete_surat_legal', 'surat_legal', id, surat);

    return c.json({ message: 'Surat berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
