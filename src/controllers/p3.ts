import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { promises as fs } from 'fs';
import path from 'path';

// Sharp import with a fallback in case sharp is not compiled or fails on Node 17
let sharpInstance: any = null;
let sharpLoaded = false;

async function getSharp() {
  if (sharpLoaded) return sharpInstance;
  try {
    const sharpModule = await import('sharp');
    sharpInstance = sharpModule.default || sharpModule;
  } catch (e) {
    console.warn('Sharp module not loaded, falling back to direct write:', e);
  }
  sharpLoaded = true;
  return sharpInstance;
}

export const p3Router = new Hono();

// Enforce auth
p3Router.use('*', authMiddleware);

// GET /petugas - List P3-eligible staff for petugas dropdown
p3Router.get('/petugas', async (c) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: 'active',
        posisi: { in: ['staff_p3', 'kabid_p3', 'admin'] }
      },
      select: { id: true, nama: true, posisi: true },
      orderBy: { nama: 'asc' }
    });
    return c.json(users);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /jadwal - List schedules with filters and stats
p3Router.get('/jadwal', async (c) => {
  try {
    const tanggalStr = c.req.query('tanggal'); // YYYY-MM-DD
    const prioritas = c.req.query('prioritas') || '';
    const status = c.req.query('status') || '';
    const petugasId = c.req.query('petugasId') || '';
    const q = c.req.query('q') || '';

    const whereClause: any = {};

    if (q) {
      whereClause.OR = [
        { namaDebitur: { contains: q } },
        { debiturId: { contains: q } },
        { nomorJadwal: { contains: q } }
      ];
    }

    if (tanggalStr) {
      const filterDate = new Date(tanggalStr);
      const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);
      whereClause.tanggal = {
        gte: startOfDay,
        lte: endOfDay
      };
    }

    if (prioritas && prioritas !== 'Semua') {
      whereClause.prioritas = prioritas;
    }

    if (status) {
      whereClause.status = status;
    }

    if (petugasId) {
      whereClause.petugasId = petugasId;
    }

    const jadwals = await prisma.jadwalPenagihan.findMany({
      where: whereClause,
      include: {
        petugas: { select: { nama: true } },
        debitur: { select: { alamat: true, kota: true, totalTunggakan: true } },
        fotos: true
      },
      orderBy: { tanggal: 'desc' }
    });

    // Calculate overall stats for the current filter's date (or all time if no date filter)
    const statsWhereClause = tanggalStr ? { tanggal: whereClause.tanggal } : {};
    const allJadwalsForStats = await prisma.jadwalPenagihan.findMany({
      where: statsWhereClause,
      select: { status: true }
    });

    const stats = {
      totalJadwal: allJadwalsForStats.length,
      selesai: allJadwalsForStats.filter((j) => j.status === 'Selesai').length,
      dalamProses: allJadwalsForStats.filter((j) => j.status === 'Dalam Proses').length,
      lewatJatuhTempo: allJadwalsForStats.filter((j) => j.status === 'Lewat Jatuh Tempo').length
    };

    return c.json({
      jadwals,
      stats
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /calendar - Calendar strip count generator for 14 days
p3Router.get('/calendar', async (c) => {
  try {
    const today = new Date();
    // Start from 7 days ago, end in 7 days
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 7);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 7);
    endDate.setHours(23, 59, 59, 999);

    const schedules = await prisma.jadwalPenagihan.findMany({
      where: {
        tanggal: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        tanggal: true
      }
    });

    // Count by date
    const dateCounts: { [dateStr: string]: number } = {};
    
    // Init all 15 days in range with 0 count
    for (let i = -7; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      dateCounts[dStr] = 0;
    }

    schedules.forEach((s) => {
      const dStr = s.tanggal.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      if (dStr in dateCounts) {
        dateCounts[dStr]++;
      }
    });

    const result = Object.keys(dateCounts).map((date) => ({
      date,
      count: dateCounts[date]
    })).sort((a, b) => a.date.localeCompare(b.date));

    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

import { createJadwalP3Schema } from '../schemas/p3.schema.js';

// POST /jadwal - Create Schedule
p3Router.post('/jadwal', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createJadwalP3Schema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0].message, details: parsed.error.issues }, 400);
    }

    const {
      debiturId,
      tanggal,
      waktuMulai,
      petugasId,
      area,
      prioritas,
      targetTagih,
      jenisTagih,
      metode,
      catatan
    } = parsed.data;

    const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    const petugas = await prisma.user.findUnique({ where: { id: petugasId } });
    if (!petugas) {
      return c.json({ error: 'Petugas tidak ditemukan' }, 404);
    }

    // Generate nomor_jadwal: P3/YYYY/MM/XXX
    const scheduleDate = new Date(tanggal);
    const yearStr = scheduleDate.getFullYear().toString();
    const monthStr = (scheduleDate.getMonth() + 1).toString().padStart(2, '0');

    const startOfMonth = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth(), 1);
    const endOfMonth = new Date(scheduleDate.getFullYear(), scheduleDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthlyCount = await prisma.jadwalPenagihan.count({
      where: {
        tanggal: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });

    const sequenceNum = (monthlyCount + 1).toString().padStart(3, '0');
    const nomorJadwal = `P3/${yearStr}/${monthStr}/${sequenceNum}`;

    // Create the schedule with debitur status snapshots
    const newSchedule = await prisma.jadwalPenagihan.create({
      data: {
        nomorJadwal,
        tanggal: scheduleDate,
        waktuMulai,
        petugasId,
        area: area || debitur.kota,
        prioritas,
        debiturId,
        namaDebitur: debitur.nama,
        kol: debitur.kol,
        bakiDebet: debitur.bakiDebet,
        targetTagih: parseFloat(String(targetTagih)),
        alamat: debitur.alamat,
        jenisTagih,
        metode,
        status: 'Terjadwal',
        catatan
      }
    });

    await logAudit(c, 'create_p3_schedule', 'jadwal_penagihan', newSchedule.id, null, newSchedule);

    return c.json(newSchedule, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /jadwal/:id - Schedule Detail
p3Router.get('/jadwal/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const schedule = await prisma.jadwalPenagihan.findUnique({
      where: { id },
      include: {
        petugas: { select: { id: true, nama: true, posisi: true } },
        debitur: true,
        fotos: true
      }
    });

    if (!schedule) {
      return c.json({ error: 'Jadwal tidak ditemukan' }, 404);
    }

    return c.json(schedule);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /jadwal/:id - Update Schedule (Optimistic Locking & Visit Result)
p3Router.put('/jadwal/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { status, nominalRealisasi, hasil, catatan, clientUpdatedAt, checkInLat, checkInLng, checkInAddress } = body;

    const existing = await prisma.jadwalPenagihan.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: 'Jadwal tidak ditemukan' }, 404);
    }

    // Optimistic locking check (compare ISO timestamp strings or raw values)
    if (clientUpdatedAt) {
      const dbTime = new Date(existing.updatedAt).getTime();
      const clientTime = new Date(clientUpdatedAt).getTime();
      if (Math.abs(dbTime - clientTime) > 1000) { // allow 1-second drift
        return c.json({
          error: 'Jadwal telah diubah oleh pengguna lain. Silakan muat ulang halaman.'
        }, 409); // Conflict
      }
    }

    const updated = await prisma.jadwalPenagihan.update({
      where: { id },
      data: {
        status: status || existing.status,
        nominalRealisasi: nominalRealisasi !== undefined ? parseFloat(nominalRealisasi) : existing.nominalRealisasi,
        hasil: hasil !== undefined ? hasil : existing.hasil,
        catatan: catatan !== undefined ? catatan : existing.catatan,
        checkInLat: checkInLat ? parseFloat(checkInLat) : existing.checkInLat,
        checkInLng: checkInLng ? parseFloat(checkInLng) : existing.checkInLng,
        checkInAddress: checkInAddress || existing.checkInAddress,
        checkInTime: checkInLat ? new Date() : existing.checkInTime
      }
    });

    await logAudit(c, 'update_p3_schedule', 'jadwal_penagihan', id, existing, updated);

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /jadwal/:id/foto - Photo Upload with Sharp Resize/Compression (Partial Success)
p3Router.post('/jadwal/:id/foto', async (c) => {
  try {
    const id = c.req.param('id');
    const schedule = await prisma.jadwalPenagihan.findUnique({
      where: { id },
      include: { fotos: true }
    });

    if (!schedule) {
      return c.json({ error: 'Jadwal tidak ditemukan' }, 404);
    }

    const currentPhotoCount = schedule.fotos.length;
    if (currentPhotoCount >= 5) {
      return c.json({ error: 'Jumlah foto sudah maksimal (5 foto)' }, 400);
    }

    // Parse multipart body
    const body = await c.req.parseBody({ all: true });
    
    // Support either single file or array of files under "files" or "foto"
    const filesInput = body.files || body.foto;
    if (!filesInput) {
      return c.json({ error: 'Tidak ada file foto yang diunggah' }, 400);
    }

    const filesArray = Array.isArray(filesInput) ? filesInput : [filesInput];
    
    // Limit to make sure total does not exceed 5
    const remainingSlots = 5 - currentPhotoCount;
    const filesToUpload = filesArray.slice(0, remainingSlots);

    // Setup upload directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'p3');
    await fs.mkdir(uploadDir, { recursive: true });

    const user = (c as any).get('user');
    const successes: any[] = [];
    const failures: any[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      // Type safety check
      if (!(file instanceof File)) {
        failures.push({ name: `file_${i}`, error: 'Invalid file upload type' });
        continue;
      }

      try {
        const fileBytes = await file.arrayBuffer();
        const buffer = Buffer.from(fileBytes);

        // Max file size 8MB
        if (file.size > 8 * 1024 * 1024) {
          failures.push({ name: file.name, error: 'Ukuran file melebihi 8MB' });
          continue;
        }

        const fileName = `${id}_${Date.now()}_${i}.webp`;
        const destPath = path.join(uploadDir, fileName);
        const webpRelativePath = `/public/uploads/p3/${fileName}`;

        // Attempt compress & resize with Sharp, fallback to raw write if sharp is unavailable
        const sharp = await getSharp();
        if (sharp) {
          await sharp(buffer)
            .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(destPath);
        } else {
          // Write original file (as is) but with the same extension/naming for simplicity
          await fs.writeFile(destPath, buffer);
        }

        // Save DB record
        const photoRecord = await prisma.penagihanFoto.create({
          data: {
            jadwalId: id,
            filePath: webpRelativePath,
            uploadedBy: user.id,
            latitude: body.latitude ? parseFloat(String(body.latitude)) : null,
            longitude: body.longitude ? parseFloat(String(body.longitude)) : null,
            gpsAddress: body.gpsAddress ? String(body.gpsAddress) : null
          }
        });

        successes.push({
          id: photoRecord.id,
          name: file.name,
          filePath: webpRelativePath
        });
      } catch (err: any) {
        console.error(`Failed to process photo ${file.name}:`, err);
        failures.push({ name: file.name, error: err.message || 'Image processing error' });
      }
    }

    // Write audit log if any photo succeeded
    if (successes.length > 0) {
      await logAudit(c, 'upload_p3_photos', 'penagihan_foto', id, null, {
        successCount: successes.length,
        photos: successes
      });
    }

    return c.json({
      message: `${successes.length} foto berhasil diunggah. ${failures.length} gagal.`,
      successes,
      failures
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /jadwal/:id/foto/:fotoId - Delete photo
p3Router.delete('/jadwal/:id/foto/:fotoId', async (c) => {
  try {
    const id = c.req.param('id');
    const fotoId = c.req.param('fotoId');

    const foto = await prisma.penagihanFoto.findUnique({
      where: { id: fotoId }
    });

    if (!foto || foto.jadwalId !== id) {
      return c.json({ error: 'Foto tidak ditemukan' }, 404);
    }

    // Delete file from disk
    const diskPath = path.join(process.cwd(), foto.filePath);
    try {
      await fs.unlink(diskPath);
    } catch (e) {
      console.warn('Could not delete file from disk:', diskPath, e);
    }

    // Delete record
    await prisma.penagihanFoto.delete({ where: { id: fotoId } });
    await logAudit(c, 'delete_p3_photo', 'penagihan_foto', fotoId, foto);

    return c.json({ message: 'Foto berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

import {
  SyncBatchP3Schema,
  RouteClusterQuerySchema,
  SaveSignatureP3Schema
} from '../schemas/p3.schema.js';

// Helper: Haversine distance in KM
export function getHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

// POST /sync-batch - Batch sync offline drafts with photos and signatures
p3Router.post('/sync-batch', async (c) => {
  try {
    const rawBody = await c.req.json();
    const parsed = SyncBatchP3Schema.safeParse(rawBody);

    if (!parsed.success) {
      return c.json({ error: 'Validasi draft offline gagal', details: parsed.error.issues }, 400);
    }

    const { drafts } = parsed.data;
    const user = (c as any).get('user');

    const uploadSigDir = path.join(process.cwd(), 'public', 'uploads', 'signatures');
    const uploadPhotoDir = path.join(process.cwd(), 'public', 'uploads', 'p3');
    await fs.mkdir(uploadSigDir, { recursive: true });
    await fs.mkdir(uploadPhotoDir, { recursive: true });

    const results: any[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const draft of drafts) {
      try {
        const existing = await prisma.jadwalPenagihan.findUnique({
          where: { id: draft.jadwalId }
        });

        if (!existing) {
          results.push({ jadwalId: draft.jadwalId, status: 'error', message: 'Jadwal tidak ditemukan' });
          failCount++;
          continue;
        }

        let sigFilePath: string | null = existing.tandaTanganDebitur;

        // Process Base64 Signature if provided
        if (draft.tandaTanganDebitur && draft.tandaTanganDebitur.startsWith('data:image/')) {
          try {
            const matches = draft.tandaTanganDebitur.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              const buffer = Buffer.from(matches[2], 'base64');
              const fileName = `sig_${draft.jadwalId}_${Date.now()}.png`;
              const fullPath = path.join(uploadSigDir, fileName);
              await fs.writeFile(fullPath, buffer);
              sigFilePath = `/uploads/signatures/${fileName}`;
            }
          } catch (sigErr) {
            console.warn('Could not save signature image:', sigErr);
          }
        }

        // Update Jadwal record
        const updated = await prisma.jadwalPenagihan.update({
          where: { id: draft.jadwalId },
          data: {
            status: draft.status || existing.status,
            nominalRealisasi: draft.nominalRealisasi !== undefined ? draft.nominalRealisasi : existing.nominalRealisasi,
            hasil: draft.hasil !== undefined ? draft.hasil : existing.hasil,
            catatan: draft.catatan !== undefined ? draft.catatan : existing.catatan,
            checkInLat: draft.checkInLat ?? existing.checkInLat,
            checkInLng: draft.checkInLng ?? existing.checkInLng,
            checkInAddress: draft.checkInAddress || existing.checkInAddress,
            checkInTime: draft.checkInTime ? new Date(draft.checkInTime) : (draft.checkInLat ? new Date() : existing.checkInTime),
            tandaTanganDebitur: sigFilePath,
            tandaTanganNama: draft.tandaTanganNama || existing.tandaTanganNama,
            localRecordedAt: draft.localRecordedAt ? new Date(draft.localRecordedAt) : new Date(),
            isOfflineSync: true
          }
        });

        // Process Photos if attached
        if (draft.fotos && Array.isArray(draft.fotos)) {
          for (const fotoItem of draft.fotos) {
            if (fotoItem.base64 && fotoItem.base64.startsWith('data:image/')) {
              try {
                const matches = fotoItem.base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                  const buffer = Buffer.from(matches[2], 'base64');
                  const fileName = `p3_${draft.jadwalId}_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                  const fullPath = path.join(uploadPhotoDir, fileName);
                  await fs.writeFile(fullPath, buffer);

                  await prisma.penagihanFoto.create({
                    data: {
                      jadwalId: draft.jadwalId,
                      filePath: `public/uploads/p3/${fileName}`,
                      latitude: fotoItem.latitude || null,
                      longitude: fotoItem.longitude || null,
                      gpsAddress: fotoItem.gpsAddress || null,
                      uploadedBy: user.id
                    }
                  });
                }
              } catch (fotoErr) {
                console.warn('Could not save photo item:', fotoErr);
              }
            }
          }
        }

        await logAudit(c, 'sync_offline_p3', 'jadwal_penagihan', draft.jadwalId, existing, updated);
        results.push({ jadwalId: draft.jadwalId, status: 'success', nomorJadwal: updated.nomorJadwal });
        successCount++;
      } catch (err: any) {
        results.push({ jadwalId: draft.jadwalId, status: 'error', message: err.message });
        failCount++;
      }
    }

    return c.json({
      success: true,
      message: `Sinkronisasi selesai: ${successCount} berhasil, ${failCount} gagal.`,
      processedCount: drafts.length,
      successCount,
      failCount,
      results
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /signature/:jadwalId - Direct standalone digital signature save
p3Router.post('/signature/:jadwalId', async (c) => {
  try {
    const jadwalId = c.req.param('jadwalId');
    const rawBody = await c.req.json();
    const parsed = SaveSignatureP3Schema.safeParse(rawBody);

    if (!parsed.success) {
      return c.json({ error: 'Data tanda tangan tidak valid', details: parsed.error.issues }, 400);
    }

    const schedule = await prisma.jadwalPenagihan.findUnique({ where: { id: jadwalId } });
    if (!schedule) {
      return c.json({ error: 'Jadwal tidak ditemukan' }, 404);
    }

    const uploadSigDir = path.join(process.cwd(), 'public', 'uploads', 'signatures');
    await fs.mkdir(uploadSigDir, { recursive: true });

    let sigFilePath = '';
    const { signatureBase64, signerName } = parsed.data;

    if (signatureBase64.startsWith('data:image/')) {
      const matches = signatureBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], 'base64');
        const fileName = `sig_${jadwalId}_${Date.now()}.png`;
        const fullPath = path.join(uploadSigDir, fileName);
        await fs.writeFile(fullPath, buffer);
        sigFilePath = `/uploads/signatures/${fileName}`;
      }
    }

    const updated = await prisma.jadwalPenagihan.update({
      where: { id: jadwalId },
      data: {
        tandaTanganDebitur: sigFilePath || signatureBase64,
        tandaTanganNama: signerName || schedule.namaDebitur
      }
    });

    await logAudit(c, 'save_p3_signature', 'jadwal_penagihan', jadwalId, schedule, updated);

    return c.json({
      success: true,
      message: 'Tanda tangan digital berhasil disimpan',
      signatureUrl: updated.tandaTanganDebitur
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /route-cluster - Smart Map Clustering & Nearest-Neighbor Route Optimization
p3Router.get('/route-cluster', async (c) => {
  try {
    const tanggalStr = c.req.query('tanggal') || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const petugasId = c.req.query('petugasId') || '';
    const area = c.req.query('area') || '';

    const filterDate = new Date(tanggalStr);
    const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);

    const whereClause: any = {
      tanggal: { gte: startOfDay, lte: endOfDay }
    };
    if (petugasId) whereClause.petugasId = petugasId;
    if (area && area !== 'Semua') whereClause.area = area;

    const schedules = await prisma.jadwalPenagihan.findMany({
      where: whereClause,
      include: {
        debitur: {
          select: {
            id: true,
            nama: true,
            alamat: true,
            kota: true,
            latitude: true,
            longitude: true,
            kol: true,
            bakiDebet: true,
            totalTunggakan: true,
            telepon: true
          }
        },
        petugas: { select: { id: true, nama: true } }
      },
      orderBy: { waktuMulai: 'asc' }
    });

    // Default BPRS HQ Coordinates (Yogyakarta City Center)
    const bprsHq = {
      lat: -7.797068,
      lng: 110.370529,
      name: 'Kantor BPRS Mitra Harmoni (Pusat Keberangkatan)'
    };

    // Area coordinate anchors around DIY (Yogyakarta, Sleman, Bantul, Kulon Progo, Gunungkidul)
    const AREA_ANCHORS: Record<string, { lat: number; lng: number }> = {
      'YOGYAKARTA': { lat: -7.7956, lng: 110.3695 },
      'KOTA YOGYAKARTA': { lat: -7.7956, lng: 110.3695 },
      'SLEMAN': { lat: -7.7167, lng: 110.3556 },
      'BANTUL': { lat: -7.8894, lng: 110.3292 },
      'KULON PROGO': { lat: -7.8389, lng: 110.1583 },
      'GUNUNGKIDUL': { lat: -7.9625, lng: 110.6036 }
    };

    // Prepare point list with valid coordinates
    const waypoints: any[] = [];
    schedules.forEach((s, idx) => {
      let lat = s.checkInLat || s.debitur?.latitude;
      let lng = s.checkInLng || s.debitur?.longitude;

      // Deterministic fallback coordinates if none exists in DB based on area or address hash
      if (!lat || !lng) {
        const areaUpper = (s.area || s.debitur?.kota || 'YOGYAKARTA').toUpperCase();
        let anchor = AREA_ANCHORS['YOGYAKARTA'];
        for (const k of Object.keys(AREA_ANCHORS)) {
          if (areaUpper.includes(k)) { anchor = AREA_ANCHORS[k]; break; }
        }
        // Consistent slight offset by index/debiturId so markers don't overlap
        const hash = (s.debiturId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + idx) % 100;
        const offsetLat = ((hash % 10) - 5) * 0.008;
        const offsetLng = ((Math.floor(hash / 10)) - 5) * 0.008;
        lat = parseFloat((anchor.lat + offsetLat).toFixed(6));
        lng = parseFloat((anchor.lng + offsetLng).toFixed(6));
      }

      waypoints.push({
        jadwalId: s.id,
        nomorJadwal: s.nomorJadwal,
        debiturId: s.debiturId,
        namaDebitur: s.namaDebitur,
        kol: s.kol,
        bakiDebet: s.bakiDebet,
        targetTagih: s.targetTagih,
        alamat: s.alamat,
        prioritas: s.prioritas,
        status: s.status,
        waktuMulai: s.waktuMulai,
        petugasNama: s.petugas?.nama || 'Petugas',
        telepon: s.debitur?.telepon || '',
        lat,
        lng,
        hasSignature: !!s.tandaTanganDebitur,
        isOfflineSync: s.isOfflineSync
      });
    });

    // Nearest Neighbor TSP Route Heuristic starting from HQ
    const unvisited = [...waypoints];
    const optimizedRoute: any[] = [];
    let currentLat = bprsHq.lat;
    let currentLng = bprsHq.lng;
    let totalDistanceKm = 0;
    let orderSeq = 1;

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Number.MAX_VALUE;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = getHaversineDistanceKm(currentLat, currentLng, unvisited[i].lat, unvisited[i].lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const nextStop = unvisited.splice(nearestIdx, 1)[0];
      totalDistanceKm += minDistance;
      optimizedRoute.push({
        ...nextStop,
        urutanKunjungan: orderSeq++,
        jarakDariSebelumnyaKm: minDistance,
        jarakKumulatifKm: parseFloat(totalDistanceKm.toFixed(2))
      });

      currentLat = nextStop.lat;
      currentLng = nextStop.lng;
    }

    // Add return distance to HQ
    if (optimizedRoute.length > 0) {
      const returnDist = getHaversineDistanceKm(currentLat, currentLng, bprsHq.lat, bprsHq.lng);
      totalDistanceKm += returnDist;
    }

    return c.json({
      tanggal: tanggalStr,
      totalJadwal: schedules.length,
      totalDistanceKm: parseFloat(totalDistanceKm.toFixed(2)),
      bprsHq,
      waypoints,
      optimizedRoute
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

