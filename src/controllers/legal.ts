import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { promises as fs } from 'fs';
import path from 'path';

export const legalRouter = new Hono();

// Enforce auth & role restrictions (admin, kabid_p3, legal, staff_p3, desk_call)
legalRouter.use('*', authMiddleware, roleMiddleware(['admin', 'kabid_p3', 'legal', 'staff_p3', 'desk_call']));

// Default checklist items from PRD Chapter 6.9
const DEFAULT_CHECKLISTS = [
  { kategori: 'Identitas', name: 'KTP Debitur' },
  { kategori: 'Identitas', name: 'KTP Pasangan' },
  { kategori: 'Identitas', name: 'Kartu Keluarga' },
  { kategori: 'Identitas', name: 'NPWP' },
  
  { kategori: 'Usaha', name: 'Surat Keterangan Usaha' },
  { kategori: 'Usaha', name: 'Foto Usaha' },
  { kategori: 'Usaha', name: 'Laporan Keuangan' },
  
  { kategori: 'Agunan', name: 'Sertifikat/BPKB Asli' },
  { kategori: 'Agunan', name: 'SPPT PBB' },
  { kategori: 'Agunan', name: 'Bukti Kepemilikan' },
  { kategori: 'Agunan', name: 'Foto Agunan' },
  
  { kategori: 'Akad & Notarial', name: 'Akad Pembiayaan' },
  { kategori: 'Akad & Notarial', name: 'Surat Kuasa' },
  { kategori: 'Akad & Notarial', name: 'APHT/Fidusia' }
];

// Helper: Calculate Status based on Checked percentage
function calculateStatus(checkedCount: number, totalCount: number): string {
  if (totalCount === 0) return 'Kurang';
  const percentage = (checkedCount / totalCount) * 100;
  if (percentage === 100) return 'Lengkap';
  if (percentage >= 50) return 'Proses';
  return 'Kurang';
}

// GET /berkas - List legal berkas
legalRouter.get('/berkas', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const status = c.req.query('status') || '';

    const whereClause: any = {};

    if (q) {
      whereClause.OR = [
        { id: { contains: q } },
        { debitur: { nama: { contains: q } } },
        { debiturId: { contains: q } }
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    const berkas = await prisma.legalBerkas.findMany({
      where: whereClause,
      include: {
        debitur: {
          select: {
            nama: true,
            bakiDebet: true,
            jenisMargin: true,
            ao: true
          }
        },
        checklists: true,
        files: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Format output with count of checked/total checklists
    const formatted = berkas.map((b) => {
      const total = b.checklists.length;
      const checked = b.checklists.filter((c) => c.checked).length;
      return {
        ...b,
        totalChecklists: total,
        checkedChecklists: checked,
        percentage: total > 0 ? Math.round((checked / total) * 100) : 0
      };
    });

    return c.json(formatted);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /berkas - Create legal berkas
legalRouter.post('/berkas', async (c) => {
  try {
    const body = await c.req.json();
    const { debiturId, jenisAgunan, notaris, noAkad, lokasiArsip } = body;

    if (!debiturId || !jenisAgunan || !notaris || !noAkad || !lokasiArsip) {
      return c.json({ error: 'Semua field wajib diisi' }, 400);
    }

    // Check if debitur exists
    const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    // Check if legal berkas already exists
    const existing = await prisma.legalBerkas.findFirst({ where: { debiturId } });
    if (existing) {
      return c.json({ error: 'Berkas legal untuk debitur ini sudah ada' }, 400);
    }

    // Generate ID: LF-XXX
    const count = await prisma.legalBerkas.count();
    const id = `LF-${(count + 1).toString().padStart(3, '0')}`;

    // Create legal berkas and checklists in a transaction
    const newBerkas = await prisma.$transaction(async (tx) => {
      const bk = await tx.legalBerkas.create({
        data: {
          id,
          debiturId,
          plafon: debitur.plafon,
          jenisAgunan,
          notaris,
          noAkad,
          lokasiArsip,
          status: 'Kurang'
        }
      });

      // Create all default checklist items
      await Promise.all(
        DEFAULT_CHECKLISTS.map((item) =>
          tx.legalBerkasChecklist.create({
            data: {
              legalBerkasId: bk.id,
              kategori: item.kategori,
              itemName: item.name,
              checked: false
            }
          })
        )
      );

      return bk;
    });

    await logAudit(c, 'create_legal_berkas', 'legal_berkas', id, null, newBerkas);

    return c.json(newBerkas, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /berkas/:id - Detail legal berkas
legalRouter.get('/berkas/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const berkas = await prisma.legalBerkas.findUnique({
      where: { id },
      include: {
        debitur: true,
        checklists: true,
        files: true
      }
    });

    if (!berkas) {
      return c.json({ error: 'Berkas legal tidak ditemukan' }, 404);
    }

    const total = berkas.checklists.length;
    const checked = berkas.checklists.filter((c) => c.checked).length;
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

    return c.json({
      ...berkas,
      totalChecklists: total,
      checkedChecklists: checked,
      percentage
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /berkas/:id/checklist - Toggle checklist item
legalRouter.put('/berkas/:id/checklist', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { checklistId, checked } = body;

    if (!checklistId || checked === undefined) {
      return c.json({ error: 'checklistId dan checked wajib diisi' }, 400);
    }

    const item = await prisma.legalBerkasChecklist.findUnique({ where: { id: checklistId } });
    if (!item || item.legalBerkasId !== id) {
      return c.json({ error: 'Item checklist tidak ditemukan' }, 404);
    }

    const user = (c as any).get('user');

    // Update checklist item
    const updatedItem = await prisma.legalBerkasChecklist.update({
      where: { id: checklistId },
      data: {
        checked,
        checkedAt: checked ? new Date() : null,
        checkedBy: checked ? user.id : null
      }
    });

    // Fetch all checklists for this berkas to recalculate status
    const allChecklists = await prisma.legalBerkasChecklist.findMany({
      where: { legalBerkasId: id }
    });

    const total = allChecklists.length;
    const checkedCount = allChecklists.filter((cl) => cl.checked).length;
    const newStatus = calculateStatus(checkedCount, total);

    const oldBerkas = await prisma.legalBerkas.findUnique({ where: { id } });
    const updatedBerkas = await prisma.legalBerkas.update({
      where: { id },
      data: { status: newStatus }
    });

    await logAudit(c, 'toggle_legal_checklist', 'legal_berkas_checklist', checklistId, item, updatedItem);
    if (oldBerkas?.status !== newStatus) {
      await logAudit(c, 'update_legal_status', 'legal_berkas', id, oldBerkas, updatedBerkas);
    }

    return c.json({
      message: 'Checklist berhasil di-update',
      item: updatedItem,
      berkasStatus: newStatus,
      percentage: total > 0 ? Math.round((checkedCount / total) * 100) : 0
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /berkas/:id/files - Upload Document File
legalRouter.post('/berkas/:id/files', async (c) => {
  try {
    const id = c.req.param('id');
    const berkas = await prisma.legalBerkas.findUnique({ where: { id } });
    if (!berkas) {
      return c.json({ error: 'Berkas legal tidak ditemukan' }, 404);
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'File dokumen wajib diunggah' }, 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return c.json({ error: 'Ukuran file melebihi 10MB' }, 400);
    }

    // Save folder
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'legal');
    await fs.mkdir(uploadDir, { recursive: true });

    const fileName = `${id}_${Date.now()}_${file.name}`;
    const destPath = path.join(uploadDir, fileName);
    const fileRelativePath = `/public/uploads/legal/${fileName}`;

    const fileBytes = await file.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(fileBytes));

    const user = (c as any).get('user');
    const legalFile = await prisma.legalFile.create({
      data: {
        legalBerkasId: id,
        fileName: file.name,
        filePath: fileRelativePath,
        uploadedBy: user.id
      }
    });

    await logAudit(c, 'upload_legal_file', 'legal_files', legalFile.id, null, legalFile);

    return c.json(legalFile, 201);
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

    // Unlink disk file cleanly
    let relPath = file.filePath;
    if (relPath.startsWith('/') || relPath.startsWith('\\')) {
      relPath = relPath.substring(1);
    }
    const diskPath = path.join(process.cwd(), relPath);
    try {
      await fs.unlink(diskPath);
    } catch (e) {
      console.warn('Could not delete legal file from disk:', diskPath, e);
    }

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
    const berkas = await (prisma as any).legalBerkas.findUnique({
      where: { id },
      include: { files: true }
    });

    if (!berkas) {
      return c.json({ error: 'Berkas legal tidak ditemukan' }, 404);
    }

    // Unlink physical files if any
    for (const f of berkas.files || []) {
      if (f && f.filePath) {
        let relPath = f.filePath;
        if (relPath.startsWith('/') || relPath.startsWith('\\')) relPath = relPath.substring(1);
        const diskPath = path.join(process.cwd(), relPath);
        try {
          await fs.unlink(diskPath);
        } catch (e) {
          // ignore disk delete error
        }
      }
    }

    // Delete relation records explicitly to satisfy foreign key constraints
    await (prisma as any).legalBerkasChecklist.deleteMany({ where: { legalBerkasId: id } });
    await (prisma as any).legalFile.deleteMany({ where: { legalBerkasId: id } });
    await (prisma as any).legalBerkas.delete({ where: { id } });

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

    const whereClause: any = {};
    if (jenis) whereClause.jenisSurat = jenis;
    if (status) whereClause.status = status;
    if (q) {
      whereClause.OR = [
        { nomorSurat: { contains: q } },
        { namaDebitur: { contains: q } },
        { debiturId: { contains: q } }
      ];
    }

    const list = await (prisma as any).suratLegal.findMany({
      where: whereClause,
      include: {
        debitur: {
          select: {
            nama: true,
            alamat: true,
            telepon: true,
            tglJt: true,
            jenisMargin: true,
            ao: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return c.json(list);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /surat - Buat SP1, SP2, atau Somasi Baru
legalRouter.post('/surat', async (c) => {
  try {
    const body = await c.req.json();
    const {
      debiturId,
      jenisSurat, // SP1, SP2, Somasi 1, Somasi 2, Eksekusi Jaminan
      tanggalSurat,
      tglJatuhTempo,
      hal,
      catatan
    } = body;

    if (!debiturId || !jenisSurat || !tanggalSurat) {
      return c.json({ error: 'Debitur, Jenis Surat, dan Tanggal wajib diisi' }, 400);
    }

    const debitur = await (prisma as any).debitur.findUnique({ where: { id: debiturId } });
    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    const user = (c as any).get('user');

    // Generate auto reference number: e.g. SP1/2026/08/001
    const prefixMap: any = {
      'SP1': 'SP1',
      'SP2': 'SP2',
      'Somasi 1': 'SOM1',
      'Somasi 2': 'SOM2',
      'Eksekusi Jaminan': 'EKS'
    };
    const prefix = prefixMap[jenisSurat] || 'SUR';
    const now = new Date(tanggalSurat);
    const yearStr = now.getFullYear();
    const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');

    const count = await (prisma as any).suratLegal.count({
      where: {
        jenisSurat
      }
    });

    const seq = (count + 1).toString().padStart(3, '0');
    const nomorSurat = `${prefix}/${yearStr}/${monthStr}/${seq}`;

    const newSurat = await (prisma as any).suratLegal.create({
      data: {
        nomorSurat,
        jenisSurat,
        debiturId: debitur.id,
        namaDebitur: debitur.nama,
        tanggalSurat: new Date(tanggalSurat),
        tglJatuhTempo: tglJatuhTempo ? new Date(tglJatuhTempo) : null,
        hal: hal || `Surat Peringatan / Somasi atas Tunggakan Pembiayaan ${debitur.jenisMargin}`,
        totalTunggakan: debitur.totalTunggakan,
        tPokok: debitur.tPokok,
        tMargin: debitur.tMargin,
        bakiDebet: debitur.bakiDebet,
        status: 'Diterbitkan',
        petugas: user.nama,
        catatan
      }
    });

    await logAudit(c, 'create_surat_legal', 'surat_legal', newSurat.id, null, newSurat);

    return c.json(newSurat, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /surat/:id - Detail Surat Legal
legalRouter.get('/surat/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const surat = await (prisma as any).suratLegal.findUnique({
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
    const existing = await (prisma as any).suratLegal.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: 'Surat tidak ditemukan' }, 404);
    }

    const body = await c.req.json();
    const { status, penerima, tglDiterima, catatan, hal, tglJatuhTempo } = body;

    const updated = await (prisma as any).suratLegal.update({
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
    const surat = await (prisma as any).suratLegal.findUnique({ where: { id } });
    if (!surat) {
      return c.json({ error: 'Surat tidak ditemukan' }, 404);
    }

    await (prisma as any).suratLegal.delete({ where: { id } });
    await logAudit(c, 'delete_surat_legal', 'surat_legal', id, surat);

    return c.json({ message: 'Surat berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
