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

// POST /jadwal - Create Schedule
p3Router.post('/jadwal', async (c) => {
  try {
    const body = await c.req.json();
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
    } = body;

    if (!debiturId || !tanggal || !waktuMulai || !petugasId || !prioritas || !targetTagih || !jenisTagih || !metode) {
      return c.json({ error: 'Field wajib tidak boleh kosong' }, 400);
    }

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
        targetTagih: parseFloat(targetTagih),
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
