import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { normalizePhoneTo08 } from '../utils/phone.js';

export const importRouter = new Hono();

// Enforce admin-only
importRouter.use('*', authMiddleware, roleMiddleware(['admin']));

// Indonesian month parsing
function parseIndonesianDate(str: string): Date | null {
  if (!str) return null;
  // Format target: "Sampai Tanggal DD Bulan YYYY" (handles quotes and brackets)
  let cleanStr = str.replace(/["']/g, '').replace(/Sampai Tanggal/gi, '').trim();
  const parts = cleanStr.split(/\s+/);
  if (parts.length < 3) return null;

  const day = parseInt(parts[0], 10);
  const monthName = parts[1].toLowerCase();
  const year = parseInt(parts[2], 10);

  const months: { [key: string]: number } = {
    januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11
  };

  const month = months[monthName];
  if (month === undefined || isNaN(day) || isNaN(year)) return null;

  const d = new Date(year, month, day);
  if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return null;

  return d;
}

// Robust numeric formatting handler for Indonesian & standard CSV values
function parseIndonesianFloat(val: any): number {
  if (val === undefined || val === null) return 0;
  let str = String(val).trim().replace(/["']/g, '');
  if (!str) return 0;

  if (str.includes('.') && str.includes(',')) {
    // Indonesian format: 10.500.000,00 -> remove dots, replace comma with dot
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    // Check if comma is decimal (ends with ,XX) or thousand separator (1,747,174)
    if (/,\d{1,2}$/.test(str)) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.')) {
    // Multiple dots (10.500.000) vs decimal dot (400000000.00)
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Parse date string like DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
function parseDateCell(val: any): Date | null {
  if (!val) return null;
  let str = String(val).trim().replace(/["']/g, '');
  if (!str || str === '00/00/0000' || str === '00-00-0000' || str === '31-12-9999' || str === '31/12/9999' || str === '00-00-0000') return null;

  // YYYY-MM-DD ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1900 && year < 2100) {
      const date = new Date(year, month, day);
      return isNaN(date.getTime()) ? null : date;
    }
  }

  return null;
}

// Convert KOL 1-5 or text to standard KOL string
function normalizeKol(val: any): string {
  if (!val) return 'Lancar';
  const str = String(val).trim().replace(/["']/g, '');
  if (str === '1') return 'Lancar';
  if (str === '2') return 'DPK';
  if (str === '3') return 'Kurang Lancar';
  if (str === '4') return 'Diragukan';
  if (str === '5') return 'Macet';

  const lower = str.toLowerCase();
  if (lower.includes('lancar') && !lower.includes('kurang')) return 'Lancar';
  if (lower.includes('dpk')) return 'DPK';
  if (lower.includes('kurang')) return 'Kurang Lancar';
  if (lower.includes('ragu') || lower.includes('diragukan')) return 'Diragukan';
  if (lower.includes('macet')) return 'Macet';

  return str || 'Lancar';
}

// CSV Parser supporting quotes
function parseCSV(content: string, delimiter: string): string[][] {
  const lines = content.split(/\r?\n/);
  return lines
    .map(line => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    })
    .filter(row => row.length > 1 || (row.length === 1 && row[0] !== ''));
}

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

    const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');

    if (lines.length < 2) {
      return c.json({ error: 'File CSV kosong atau tidak lengkap' }, 400);
    }

    // 1. Cutoff Date detection from Row 1
    const row1 = lines[0];
    const cutoffDate = parseIndonesianDate(row1);
    if (!cutoffDate) {
      return c.json({ error: 'Baris pertama file tidak memuat tanggal cutoff "Sampai Tanggal..." yang valid' }, 400);
    }

    // 2. Delimiter detection from Row 2 (Headers)
    const row2 = lines[1];
    const commaCount = (row2.match(/,/g) || []).length;
    const semicolonCount = (row2.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';

    // 3. Parse CSV rows
    const parsedRows = parseCSV(content, delimiter);
    const headers = parsedRows[1];

    if (!headers || headers.length < 10) {
      return c.json({ error: 'Header CSV tidak valid atau kolom terlalu sedikit' }, 400);
    }

    // Create column map
    const colMap: { [key: string]: number } = {};
    headers.forEach((h, idx) => {
      colMap[h.trim()] = idx;
    });

    const requiredColumns = ['RekeningBaru', 'Nama', 'Kol', 'Bakidebet'];
    const missing = requiredColumns.filter(col => colMap[col] === undefined);
    if (missing.length > 0) {
      return c.json({ error: `File CSV kekurangan kolom wajib: ${missing.join(', ')}` }, 400);
    }

    const user = (c as any).get('user');

    // Create Staging Batch
    const batch = await prisma.importBatch.create({
      data: {
        uploadedBy: user.nama,
        fileName: file.name,
        tanggalSnapshot: cutoffDate,
        totalRowsParsed: 0,
        totalUpdated: 0,
        totalNewDetected: 0,
        totalMissingDetected: 0,
        status: 'pending_review'
      }
    });

    let totalRowsParsed = 0;
    let totalUpdated = 0;
    let totalNewDetected = 0;

    const dataRows = parsedRows.slice(2); // Rows after header
    const stagingRowsToCreate: any[] = [];
    const validRekBarus = new Set<string>();

    for (const row of dataRows) {
      if (row.length < headers.length) continue;

      const getValue = (colName: string) => {
        const idx = colMap[colName];
        return idx !== undefined ? row[idx] : '';
      };

      const noRek = getValue('RekeningBaru');
      if (!noRek) continue;
      validRekBarus.add(noRek);

      // Validate NIK Scientific notation
      let nik = getValue('NoIdentitas');
      if (nik && (nik.toUpperCase().includes('E+') || nik.toUpperCase().includes('E-'))) {
        nik = ''; // scientific notation corrupt data is set to empty
      }

      // Telephone single quote strip & 08 normalization
      let telepon = getValue('Telepon');
      if (telepon && telepon.startsWith("'")) {
        telepon = telepon.substring(1);
      }
      telepon = normalizePhoneTo08(telepon);

      // Populate parsed raw row data
      const parsedData = {
        id: noRek,
        cif: getValue('CIFBaru'),
        nama: getValue('Nama'),
        nik,
        tglLahir: parseDateCell(getValue('TglLahir')),
        alamat: getValue('Alamat'),
        kota: getValue('Kota'),
        telepon,
        pekerjaan: getValue('Pekerjaan'),
        agama: getValue('Agama'),
        resiko: getValue('Resiko') || 'Sedang',
        jenisMargin: getValue('JenisMargin'),
        rateMargin: parseIndonesianFloat(getValue('Rate Margin') || getValue('RateMargin')),
        jw: parseInt(getValue('JW'), 10) || 0,
        tglAwal: parseDateCell(getValue('TglAwal')),
        tglJt: parseDateCell(getValue('JTHTMP')),
        tglAngsuranTerakhir: parseDateCell(getValue('TglAngsuranTerakhir')),
        ao: getValue('AO'),
        plafon: parseIndonesianFloat(getValue('Plafond/Modal Bank') || getValue('Plafond/ModalBank')),
        bakiDebet: parseIndonesianFloat(getValue('Bakidebet')),
        angsPrincipal: parseIndonesianFloat(getValue('AngsPokok')),
        angsMargin: parseIndonesianFloat(getValue('AngsMargin')),
        tPokok: parseIndonesianFloat(getValue('T.Pokok')),
        frhPokok: parseInt(getValue('FRHPokok'), 10) || 0,
        frPokok: parseInt(getValue('FRPokok'), 10) || 0,
        tMargin: parseIndonesianFloat(getValue('T.Margin')),
        frhMargin: parseInt(getValue('FRHMargin'), 10) || 0,
        frMargin: parseInt(getValue('FRMargin'), 10) || 0,
        totalTunggakan: parseIndonesianFloat(getValue('TotalTunggakan')),
        fr: parseInt(getValue('FR'), 10) || 0,
        frHari: parseInt(getValue('FRHari'), 10) || 0,
        kol: normalizeKol(getValue('Kol')),
        kolMurni: normalizeKol(getValue('KolMurni') || getValue('Kol Murni')),
        restruk: parseInt(getValue('Restrukturisasi'), 10) || 0,
        rekTabungan: getValue('RekTabungan'),
        saldoTabungan: parseIndonesianFloat(getValue('Saldo')),
        jenisAgunan: getValue('JenisAgunan'),
        nilaiJaminan: parseIndonesianFloat(getValue('NilaiJaminan')),
        spkNumber: getValue('NoSPk')
      };

      stagingRowsToCreate.push({
        batchId: batch.id,
        rawData: JSON.stringify(parsedData),
        rowStatus: 'valid'
      });

      totalRowsParsed++;

      // Check delta if it's update or new
      const exists = await prisma.debitur.findUnique({ where: { id: noRek } });
      if (exists) {
        totalUpdated++;
      } else {
        totalNewDetected++;
      }
    }

    // Write all staging rows to DB in chunks to avoid sqlite query limit
    const CHUNK_SIZE = 50;
    for (let i = 0; i < stagingRowsToCreate.length; i += CHUNK_SIZE) {
      const chunk = stagingRowsToCreate.slice(i, i + CHUNK_SIZE);
      await prisma.$transaction(
        async (tx) => {
          for (const sr of chunk) {
            await tx.importStagingRow.create({ data: sr });
          }
        },
        { timeout: 120000, maxWait: 20000 }
      );
    }

    // Missing debiturs: Currently active in DB but missing from upload CSV
    const activeDebiturs = await prisma.debitur.findMany({
      where: { statusDebitur: 'Aktif' },
      select: { id: true }
    });

    const totalMissingDetected = activeDebiturs.filter(ad => !validRekBarus.has(ad.id)).length;

    // Update batch stats
    const updatedBatch = await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        totalRowsParsed,
        totalUpdated,
        totalNewDetected,
        totalMissingDetected
      }
    });

    return c.json({
      batchId: updatedBatch.id,
      fileName: file.name,
      tanggalSnapshot: cutoffDate,
      totalRowsParsed,
      totalUpdated,
      totalNewDetected,
      totalMissingDetected
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /cbs/:batchId/commit - Apply staging rows (atomic updates)
importRouter.post('/cbs/:batchId/commit', async (c) => {
  const batchId = c.req.param('batchId') || '';
  try {
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });

    if (!batch) {
      return c.json({ error: 'Batch import tidak ditemukan' }, 404);
    }

    if (batch.status !== 'pending_review') {
      return c.json({ error: 'Batch ini sudah diproses atau gagal' }, 400);
    }

    // Load all staging rows
    const stagingRows = await prisma.importStagingRow.findMany({
      where: { batchId }
    });

    const now = new Date();
    const appliedRekeningBarus = new Set<string>();

    // Process staging rows in smaller chunks (20 rows) with extended timeout to prevent SQLite lock timeouts
    const COMMIT_CHUNK_SIZE = 20;
    for (let i = 0; i < stagingRows.length; i += COMMIT_CHUNK_SIZE) {
      const chunk = stagingRows.slice(i, i + COMMIT_CHUNK_SIZE);
      await prisma.$transaction(
        async (tx) => {
          for (const row of chunk) {
            const parsed = JSON.parse(row.rawData);
            appliedRekeningBarus.add(parsed.id);

            const existing = await tx.debitur.findUnique({ where: { id: parsed.id } });

            // Write Rules (Bab 16.6): NIK is write-once
            let nikValue = parsed.nik;
            if (existing && existing.nik) {
              nikValue = existing.nik; // keep old valid NIK
            }

          // Lunas Status Check: if baki_debet = 0 -> status Lunas
          const statusDebitur = parsed.bakiDebet === 0 ? 'Lunas' : 'Aktif';

          // Upsert Debitur
          await tx.debitur.upsert({
            where: { id: parsed.id },
            create: {
              ...parsed,
              nik: nikValue,
              statusDebitur,
              lastSyncedAt: now,
              lastSeenInImportAt: now
            },
            update: {
              ...parsed,
              nik: nikValue,
              statusDebitur,
              lastSyncedAt: now,
              lastSeenInImportAt: now
            }
          });

          // Early Warning Red-Alert Audit Logging if KOL degraded to NPF
          if (existing && existing.kol !== parsed.kol) {
            if (
              (existing.kol === 'DPK' || existing.kol === 'Lancar') &&
              (parsed.kol === 'Kurang Lancar' || parsed.kol === 'Diragukan' || parsed.kol === 'Macet')
            ) {
              await logAudit(
                c,
                'RED_ALERT_KOL_DEGRADATION',
                'Debitur',
                parsed.id,
                { kol: existing.kol, bakiDebet: existing.bakiDebet },
                { kol: parsed.kol, bakiDebet: parsed.bakiDebet }
              );
            }
          }

          // Insert or Update KOL History Snapshot (Prevents duplicates when importing multiple times in the same snapshot period)
          const existingHistory = await tx.debiturKolHistory.findFirst({
            where: {
              debiturId: parsed.id,
              tanggalSnapshot: batch.tanggalSnapshot
            }
          });

          if (existingHistory) {
            await tx.debiturKolHistory.update({
              where: { id: existingHistory.id },
              data: {
                kol: parsed.kol,
                bakiDebet: parsed.bakiDebet
              }
            });
          } else {
            await tx.debiturKolHistory.create({
              data: {
                debiturId: parsed.id,
                tanggalSnapshot: batch.tanggalSnapshot,
                bulanLabel: batch.tanggalSnapshot.toLocaleDateString('id-ID', { month: 'long' }),
                kol: parsed.kol,
                bakiDebet: parsed.bakiDebet
              }
            });
          }
        }
      },
      { timeout: 120000, maxWait: 20000 }
    );
  }

    // Auto-update missing active debiturs: CBS omits lunas/closed accounts from CSV
    const missingIds = Array.from(appliedRekeningBarus);
    if (missingIds.length > 0) {
      await prisma.debitur.updateMany({
        where: {
          statusDebitur: 'Aktif',
          id: { notIn: missingIds }
        },
        data: {
          statusDebitur: 'Lunas',
          bakiDebet: 0,
          totalTunggakan: 0,
          tPokok: 0,
          tMargin: 0
        }
      });
    }

    // Update import_batches status
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'applied',
        appliedAt: now
      }
    });

    // Write audit log
    await logAudit(c, 'commit_cbs_import', 'import_batches', batchId, null, {
      totalRows: stagingRows.length,
      snapshotDate: batch.tanggalSnapshot
    });

    // Clean staging rows after applied (PRD Chapter 6.16)
    await prisma.importStagingRow.deleteMany({ where: { batchId } });

    return c.json({ message: 'Import CBS berhasil diterapkan ke database' });
  } catch (err: any) {
    // Set status as failed
    await prisma.importBatch.update({
      where: { id: batchId },
      data: { status: 'failed' }
    });
    return c.json({ error: err.message }, 500);
  }
});

// GET /cbs/missing - Active debiturs missing in the last sync
importRouter.get('/cbs/missing', async (c) => {
  try {
    const lastApplied = await prisma.importBatch.findFirst({
      where: { status: 'applied' },
      orderBy: { appliedAt: 'desc' }
    });

    if (!lastApplied || !lastApplied.appliedAt) {
      return c.json([]);
    }

    // Active debiturs that were not updated in the last batch
    const missingDebiturs = await prisma.debitur.findMany({
      where: {
        statusDebitur: 'Aktif',
        lastSeenInImportAt: {
          lt: lastApplied.appliedAt
        }
      }
    });

    return c.json(missingDebiturs);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /cbs/missing/:id/resolve - Resolve missing debitur status
importRouter.post('/cbs/missing/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id'); // no_rekening
    const body = await c.req.json();
    const { status } = body; // Lunas or TidakDitemukan or Aktif

    if (!status || !['Lunas', 'TidakDitemukan', 'Aktif'].includes(status)) {
      return c.json({ error: 'Status tidak valid' }, 400);
    }

    const debitur = await prisma.debitur.findUnique({ where: { id } });
    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    const updated = await prisma.debitur.update({
      where: { id },
      data: { statusDebitur: status }
    });

    await logAudit(c, 'resolve_missing_debitur', 'debitur', id, { statusDebitur: debitur.statusDebitur }, { statusDebitur: status });

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /cbs/history - List history of all CBS import batches
importRouter.get('/cbs/history', async (c) => {
  try {
    const batches = await prisma.importBatch.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 100
    });
    return c.json(batches);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
