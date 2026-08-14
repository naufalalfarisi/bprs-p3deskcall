import { prisma } from '../db.js';
import { logAudit } from '../utils/audit.js';
import { normalizePhoneTo08 } from '../utils/phone.js';
import { Context } from 'hono';

// Indonesian month parsing
export function parseIndonesianDate(str: string): Date | null {
  if (!str) return null;
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

// Robust numeric formatting handler
export function parseIndonesianFloat(val: any): number {
  if (val === undefined || val === null) return 0;
  let str = String(val).trim().replace(/["']/g, '');
  if (!str) return 0;

  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    if (/,\d{1,2}$/.test(str)) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.')) {
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// Parse date string like DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
export function parseDateCell(val: any): Date | null {
  if (!val) return null;
  let str = String(val).trim().replace(/["']/g, '');
  if (!str || str === '00/00/0000' || str === '00-00-0000' || str === '31-12-9999' || str === '31/12/9999') return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  }

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
export function normalizeKol(val: any): string {
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
export function parseCSV(content: string, delimiter: string): string[][] {
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

/**
 * Upload and stage CSV file into ImportBatch and ImportStagingRow.
 */
export async function processCbsUpload(user: any, fileName: string, content: string) {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');

  if (lines.length < 2) {
    throw new Error('File CSV kosong atau tidak lengkap');
  }

  const row1 = lines[0];
  const cutoffDate = parseIndonesianDate(row1);
  if (!cutoffDate) {
    throw new Error('Baris pertama file tidak memuat tanggal cutoff "Sampai Tanggal..." yang valid');
  }

  const row2 = lines[1];
  const commaCount = (row2.match(/,/g) || []).length;
  const semicolonCount = (row2.match(/;/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const parsedRows = parseCSV(content, delimiter);
  const headers = parsedRows[1];

  if (!headers || headers.length < 10) {
    throw new Error('Header CSV tidak valid atau kolom terlalu sedikit');
  }

  const colMap: { [key: string]: number } = {};
  headers.forEach((h, idx) => {
    colMap[h.trim()] = idx;
  });

  const requiredColumns = ['RekeningBaru', 'Nama', 'Kol', 'Bakidebet'];
  const missing = requiredColumns.filter(col => colMap[col] === undefined);
  if (missing.length > 0) {
    throw new Error(`File CSV kekurangan kolom wajib: ${missing.join(', ')}`);
  }

  const batch = await prisma.importBatch.create({
    data: {
      uploadedBy: user.nama,
      fileName,
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

  const dataRows = parsedRows.slice(2);
  const stagingRowsToCreate: any[] = [];
  const validRekBarus = new Set<string>();

  const existingDebiturList = await prisma.debitur.findMany({ select: { id: true } });
  const existingDebiturSet = new Set(existingDebiturList.map(d => d.id));

  for (const row of dataRows) {
    if (row.length < headers.length) continue;

    const getValue = (colName: string) => {
      const idx = colMap[colName];
      return idx !== undefined ? row[idx] : '';
    };

    const noRek = getValue('RekeningBaru');
    if (!noRek) continue;
    validRekBarus.add(noRek);

    let nik = getValue('NoIdentitas');
    if (nik && (nik.toUpperCase().includes('E+') || nik.toUpperCase().includes('E-'))) {
      nik = '';
    }

    let telepon = getValue('Telepon');
    if (telepon && telepon.startsWith("'")) {
      telepon = telepon.substring(1);
    }
    telepon = normalizePhoneTo08(telepon);

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

    if (existingDebiturSet.has(noRek)) {
      totalUpdated++;
    } else {
      totalNewDetected++;
    }
  }

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

  const activeDebiturs = await prisma.debitur.findMany({
    where: { statusDebitur: 'Aktif' },
    select: { id: true }
  });

  const totalMissingDetected = activeDebiturs.filter(ad => !validRekBarus.has(ad.id)).length;

  const updatedBatch = await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      totalRowsParsed,
      totalUpdated,
      totalNewDetected,
      totalMissingDetected
    }
  });

  return {
    batchId: updatedBatch.id,
    fileName,
    tanggalSnapshot: cutoffDate,
    totalRowsParsed,
    totalUpdated,
    totalNewDetected,
    totalMissingDetected
  };
}

/**
 * Commit staging rows into active database.
 */
export async function commitCbsBatch(c: Context | null, batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });

  if (!batch) {
    throw new Error('Batch import tidak ditemukan');
  }

  if (batch.status !== 'pending_review') {
    throw new Error('Batch ini sudah diproses atau gagal');
  }

  const stagingRows = await prisma.importStagingRow.findMany({
    where: { batchId }
  });

  const now = new Date();
  const appliedRekeningBarus = new Set<string>();

  const activeAoUsers = await prisma.user.findMany({
    where: { posisi: 'ao', status: 'active', aoNameRef: { not: null } },
    select: { id: true, aoNameRef: true }
  });
  const aoMap = new Map<string, string>();
  activeAoUsers.forEach(u => {
    if (u.aoNameRef) aoMap.set(u.aoNameRef, u.id);
  });

  const bulanLabel = batch.tanggalSnapshot.toLocaleDateString('id-ID', { month: 'long' });

  const existingHistories = await prisma.debiturKolHistory.findMany({
    where: { bulanLabel },
    select: { id: true, debiturId: true }
  });
  const historyMap = new Map<string, string>();
  existingHistories.forEach(h => historyMap.set(h.debiturId, h.id));

  try {
    const COMMIT_CHUNK_SIZE = 20;
    for (let i = 0; i < stagingRows.length; i += COMMIT_CHUNK_SIZE) {
      const chunk = stagingRows.slice(i, i + COMMIT_CHUNK_SIZE);
      await prisma.$transaction(
        async (tx) => {
          for (const row of chunk) {
            const parsed = JSON.parse(row.rawData);
            appliedRekeningBarus.add(parsed.id);

            const existing = await tx.debitur.findUnique({ where: { id: parsed.id } });

            let nikValue = parsed.nik;
            if (existing && existing.nik) {
              nikValue = existing.nik;
            }

            const statusDebitur = parsed.bakiDebet === 0 ? 'Lunas' : 'Aktif';
            const aoId = parsed.ao ? (aoMap.get(parsed.ao) || null) : null;

            await tx.debitur.upsert({
              where: { id: parsed.id },
              create: {
                ...parsed,
                nik: nikValue,
                statusDebitur,
                aoId,
                lastSyncedAt: now,
                lastSeenInImportAt: now
              },
              update: {
                ...parsed,
                nik: nikValue,
                statusDebitur,
                ...(aoId ? { aoId } : {}),
                lastSyncedAt: now,
                lastSeenInImportAt: now
              }
            });

            const isPrevKol1 = !existing || existing.kol === 'Lancar' || existing.kol === '1' || existing.kolMurni === '1';
            const isNextKol2 = parsed.kol === 'DPK' || parsed.kol === '2' || parsed.kolMurni === '2' || (parsed.frhPokok >= 1 && parsed.frhPokok <= 30);

            if (isPrevKol1 && isNextKol2) {
              await logAudit(
                c,
                'RED_ALERT_KOL1_TO_KOL2_SHIFT',
                'Debitur',
                parsed.id,
                { kol: existing?.kol || 'Lancar', bakiDebet: existing?.bakiDebet || 0 },
                { kol: parsed.kol, bakiDebet: parsed.bakiDebet },
                tx
              );
            } else if (existing && existing.kol !== parsed.kol) {
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
                  { kol: parsed.kol, bakiDebet: parsed.bakiDebet },
                  tx
                );
              }
            }

            const historyId = historyMap.get(parsed.id);
            if (historyId) {
              await tx.debiturKolHistory.update({
                where: { id: historyId },
                data: {
                  kol: parsed.kol,
                  bakiDebet: parsed.bakiDebet,
                  tanggalSnapshot: batch.tanggalSnapshot
                }
              });
            } else {
              const newHist = await tx.debiturKolHistory.create({
                data: {
                  debiturId: parsed.id,
                  tanggalSnapshot: batch.tanggalSnapshot,
                  bulanLabel,
                  kol: parsed.kol,
                  bakiDebet: parsed.bakiDebet
                }
              });
              historyMap.set(parsed.id, newHist.id);
            }
          }
        },
        { timeout: 120000, maxWait: 20000 }
      );
    }

    if (appliedRekeningBarus.size > 0) {
      await prisma.debitur.updateMany({
        where: {
          statusDebitur: 'Aktif',
          OR: [
            { lastSeenInImportAt: { lt: batch.uploadedAt } },
            { lastSeenInImportAt: null }
          ]
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

    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'applied',
        appliedAt: now
      }
    });

    await logAudit(c, 'commit_cbs_import', 'import_batches', batchId, null, {
      totalRows: stagingRows.length,
      snapshotDate: batch.tanggalSnapshot
    });

    await prisma.importStagingRow.deleteMany({ where: { batchId } });

    return { message: 'Import CBS berhasil diterapkan ke database' };
  } catch (err: any) {
    await prisma.importBatch.update({
      where: { id: batchId },
      data: { status: 'failed' }
    });
    throw err;
  }
}

/**
 * Get commit info (total staging rows & metadata) for chunked progress commit.
 */
export async function prepareCbsCommitInfo(batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error('Batch import tidak ditemukan');
  if (batch.status !== 'pending_review') throw new Error('Batch ini sudah diproses atau gagal');

  const totalStagingRows = await prisma.importStagingRow.count({ where: { batchId } });
  return {
    batchId: batch.id,
    fileName: batch.fileName,
    tanggalSnapshot: batch.tanggalSnapshot,
    totalStagingRows
  };
}

/**
 * Process a single chunk of staging rows for real-time progress bar.
 */
export async function commitCbsChunkStep(c: Context | null, batchId: string, offset: number, limit: number) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error('Batch import tidak ditemukan');
  if (batch.status !== 'pending_review') throw new Error('Batch ini sudah diproses atau gagal');

  const stagingRows = await prisma.importStagingRow.findMany({
    where: { batchId },
    skip: offset,
    take: limit
  });

  const totalStagingRows = await prisma.importStagingRow.count({ where: { batchId } });
  if (stagingRows.length === 0) {
    return { offset, limit, processedCount: 0, totalStagingRows };
  }

  const now = new Date();
  const activeAoUsers = await prisma.user.findMany({
    where: { posisi: 'ao', status: 'active', aoNameRef: { not: null } },
    select: { id: true, aoNameRef: true }
  });
  const aoMap = new Map<string, string>();
  activeAoUsers.forEach(u => {
    if (u.aoNameRef) aoMap.set(u.aoNameRef, u.id);
  });

  const bulanLabel = batch.tanggalSnapshot.toLocaleDateString('id-ID', { month: 'long' });
  const existingHistories = await prisma.debiturKolHistory.findMany({
    where: { bulanLabel },
    select: { id: true, debiturId: true }
  });
  const historyMap = new Map<string, string>();
  existingHistories.forEach(h => historyMap.set(h.debiturId, h.id));

  await prisma.$transaction(
    async (tx) => {
      for (const row of stagingRows) {
        const parsed = JSON.parse(row.rawData);
        const existing = await tx.debitur.findUnique({ where: { id: parsed.id } });

        let nikValue = parsed.nik;
        if (existing && existing.nik) {
          nikValue = existing.nik;
        }

        const statusDebitur = parsed.bakiDebet === 0 ? 'Lunas' : 'Aktif';
        const aoId = parsed.ao ? (aoMap.get(parsed.ao) || null) : null;

        await tx.debitur.upsert({
          where: { id: parsed.id },
          create: {
            ...parsed,
            nik: nikValue,
            statusDebitur,
            aoId,
            lastSyncedAt: now,
            lastSeenInImportAt: now
          },
          update: {
            ...parsed,
            nik: nikValue,
            statusDebitur,
            ...(aoId ? { aoId } : {}),
            lastSyncedAt: now,
            lastSeenInImportAt: now
          }
        });

        const isPrevKol1 = !existing || existing.kol === 'Lancar' || existing.kol === '1' || existing.kolMurni === '1';
        const isNextKol2 = parsed.kol === 'DPK' || parsed.kol === '2' || parsed.kolMurni === '2' || (parsed.frhPokok >= 1 && parsed.frhPokok <= 30);

        if (isPrevKol1 && isNextKol2) {
          await logAudit(
            c,
            'RED_ALERT_KOL1_TO_KOL2_SHIFT',
            'Debitur',
            parsed.id,
            { kol: existing?.kol || 'Lancar', bakiDebet: existing?.bakiDebet || 0 },
            { kol: parsed.kol, bakiDebet: parsed.bakiDebet },
            tx
          );
        } else if (existing && existing.kol !== parsed.kol) {
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
              { kol: parsed.kol, bakiDebet: parsed.bakiDebet },
              tx
            );
          }
        }

        const historyId = historyMap.get(parsed.id);
        if (historyId) {
          await tx.debiturKolHistory.update({
            where: { id: historyId },
            data: {
              kol: parsed.kol,
              bakiDebet: parsed.bakiDebet,
              tanggalSnapshot: batch.tanggalSnapshot
            }
          });
        } else {
          const newHist = await tx.debiturKolHistory.create({
            data: {
              debiturId: parsed.id,
              tanggalSnapshot: batch.tanggalSnapshot,
              bulanLabel,
              kol: parsed.kol,
              bakiDebet: parsed.bakiDebet
            }
          });
          historyMap.set(parsed.id, newHist.id);
        }
      }
    },
    { timeout: 120000, maxWait: 20000 }
  );

  return {
    offset,
    limit,
    processedChunk: stagingRows.length,
    totalStagingRows
  };
}

/**
 * Finalize CBS Commit Batch after all chunks are completed.
 */
export async function finishCbsCommitBatch(c: Context | null, batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error('Batch import tidak ditemukan');

  const now = new Date();

  // Update status for debiturs not seen in this batch to Lunas
  await prisma.debitur.updateMany({
    where: {
      statusDebitur: 'Aktif',
      OR: [
        { lastSeenInImportAt: { lt: batch.uploadedAt } },
        { lastSeenInImportAt: null }
      ]
    },
    data: {
      statusDebitur: 'Lunas',
      bakiDebet: 0,
      totalTunggakan: 0,
      tPokok: 0,
      tMargin: 0
    }
  });

  await prisma.importBatch.update({
    where: { id: batchId },
    data: {
      status: 'applied',
      appliedAt: now
    }
  });

  await logAudit(c, 'commit_cbs_import', 'import_batches', batchId, null, {
    snapshotDate: batch.tanggalSnapshot
  });

  await prisma.importStagingRow.deleteMany({ where: { batchId } });

  return { message: 'Import CBS berhasil diterapkan ke database (100% Selesai)' };
}

/**
 * Get active debiturs missing in the last sync.
 */
export async function getMissingDebiturs() {
  const lastApplied = await prisma.importBatch.findFirst({
    where: { status: 'applied' },
    orderBy: { appliedAt: 'desc' }
  });

  if (!lastApplied || !lastApplied.appliedAt) {
    return [];
  }

  return prisma.debitur.findMany({
    where: {
      statusDebitur: 'Aktif',
      lastSeenInImportAt: {
        lt: lastApplied.appliedAt
      }
    }
  });
}

/**
 * Resolve missing debitur status manually.
 */
export async function resolveMissingDebitur(id: string, status: string, c?: Context | null) {
  if (!status || !['Lunas', 'TidakDitemukan', 'Aktif'].includes(status)) {
    throw new Error('Status tidak valid');
  }

  const debitur = await prisma.debitur.findUnique({ where: { id } });
  if (!debitur) {
    throw new Error('Debitur tidak ditemukan');
  }

  const updated = await prisma.debitur.update({
    where: { id },
    data: { statusDebitur: status }
  });

  await logAudit(c || null, 'resolve_missing_debitur', 'debitur', id, { statusDebitur: debitur.statusDebitur }, { statusDebitur: status });

  return updated;
}

/**
 * Get CBS import batch history.
 */
export async function getCbsBatchHistory(limit: number = 100) {
  return prisma.importBatch.findMany({
    orderBy: { uploadedAt: 'desc' },
    take: limit
  });
}

/**
 * Get detailed breakdown of debitur status changes for a specific CBS Import Batch.
 */
export async function getCbsBatchChanges(batchId: string) {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    throw new Error('Batch import tidak ditemukan');
  }

  const windowStart = new Date(batch.uploadedAt.getTime() - 5 * 60 * 1000);
  const windowEnd = batch.appliedAt
    ? new Date(batch.appliedAt.getTime() + 5 * 60 * 1000)
    : new Date(batch.uploadedAt.getTime() + 60 * 60 * 1000);

  // 1. Newly created debiturs in this batch window
  const newDebitursRaw = await prisma.debitur.findMany({
    where: {
      createdAt: {
        gte: windowStart,
        lte: windowEnd
      }
    },
    select: {
      id: true,
      nama: true,
      ao: true,
      plafon: true,
      bakiDebet: true,
      kol: true,
      jenisMargin: true
    }
  });
  const newDebiturs = newDebitursRaw.map(d => ({
    debiturId: d.id,
    nama: d.nama,
    ao: d.ao || '-',
    plafon: d.plafon || 0,
    bakiDebet: d.bakiDebet || 0,
    kol: d.kol || 'Lancar',
    jenisMargin: d.jenisMargin || '-'
  }));

  // 2. Missing / Lunas debiturs updated during this batch window
  let missingDebiturs: any[] = [];
  if (batch.appliedAt) {
    missingDebiturs = await prisma.debitur.findMany({
      where: {
        statusDebitur: 'Lunas',
        updatedAt: {
          gte: windowStart,
          lte: windowEnd
        }
      },
      select: {
        id: true,
        nama: true,
        ao: true,
        bakiDebet: true,
        kol: true,
        statusDebitur: true
      }
    });
  }

  // 3. KOL Changes (Comparing current snapshot with previous snapshot)
  const currentHistories = await prisma.debiturKolHistory.findMany({
    where: { tanggalSnapshot: batch.tanggalSnapshot },
    include: { debitur: { select: { nama: true, ao: true, plafon: true, jenisMargin: true, statusDebitur: true } } }
  });

  const prevHistoryEntry = await prisma.debiturKolHistory.findFirst({
    where: { tanggalSnapshot: { lt: batch.tanggalSnapshot } },
    orderBy: { tanggalSnapshot: 'desc' }
  });

  const prevHistoryMap = new Map<string, string>();
  if (prevHistoryEntry) {
    const prevHistories = await prisma.debiturKolHistory.findMany({
      where: { tanggalSnapshot: prevHistoryEntry.tanggalSnapshot }
    });
    prevHistories.forEach(h => prevHistoryMap.set(h.debiturId, h.kol));
  }

  const kolChanges: any[] = [];
  for (const h of currentHistories) {
    const prevKol = prevHistoryMap.get(h.debiturId);
    if (prevKol && prevKol !== h.kol) {
      kolChanges.push({
        debiturId: h.debiturId,
        nama: h.debitur?.nama || '-',
        ao: h.debitur?.ao || '-',
        prevKol,
        currentKol: h.kol,
        bakiDebet: h.bakiDebet,
        jenisMargin: h.debitur?.jenisMargin || '-'
      });
    }
  }

  return {
    batch,
    kolChanges,
    newDebiturs,
    missingDebiturs,
    summary: {
      totalUpdated: batch.totalUpdated,
      totalNew: batch.totalNewDetected,
      totalMissing: batch.totalMissingDetected
    }
  };
}
