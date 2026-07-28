import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

export const pembayaranRouter = new Hono();

// Enforce auth
pembayaranRouter.use('*', authMiddleware);

// GET / - List payments with search and stat cards
pembayaranRouter.get('/', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const whereClause: any = {};

    if (q) {
      whereClause.OR = [
        { nama: { contains: q } },
        { debiturId: { contains: q } },
        { debitur: { nama: { contains: q } } }
      ];
    }

    const pembayaran = await prisma.pembayaran.findMany({
      where: whereClause,
      include: {
        debitur: {
          select: {
            nama: true,
            ao: true
          }
        }
      },
      orderBy: { tanggal: 'desc' }
    });

    // Calculate stat cards for the current calendar month
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentYear = jakartaTime.getFullYear();
    const currentMonth = jakartaTime.getMonth();

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    const monthlyPayments = await prisma.pembayaran.findMany({
      where: {
        tanggal: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    });

    const totalMasuk = monthlyPayments.reduce((sum, p) => sum + p.nominal, 0);
    const totalTransfer = monthlyPayments.filter((p) => p.metode === 'Transfer').reduce((sum, p) => sum + p.nominal, 0);
    const totalTunai = monthlyPayments.filter((p) => p.metode === 'Tunai').reduce((sum, p) => sum + p.nominal, 0);

    return c.json({
      pembayaran,
      stats: {
        totalTransaksi: pembayaran.length,
        totalMasuk,
        totalTransfer,
        totalTunai
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST / - Catat Pembayaran Manual
pembayaranRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { debiturId, tanggal, nominal, kol, metode, keterangan } = body;

    if (!debiturId || !tanggal || !nominal || !metode) {
      return c.json({ error: 'Field wajib tidak boleh kosong' }, 400);
    }

    const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    const user = (c as any).get('user');

    const payment = await prisma.pembayaran.create({
      data: {
        debiturId,
        nama: debitur.nama,
        tanggal: new Date(tanggal),
        nominal: parseFloat(nominal),
        kol: kol || debitur.kol,
        metode,
        petugas: user.nama,
        keterangan
      }
    });

    await logAudit(c, 'create_payment', 'pembayaran', payment.id, null, payment);

    return c.json(payment, 201);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /:id - Detail of a single pembayaran
pembayaranRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const payment = await prisma.pembayaran.findUnique({
      where: { id },
      include: {
        debitur: true
      }
    });

    if (!payment) {
      return c.json({ error: 'Data pembayaran tidak ditemukan' }, 404);
    }

    return c.json(payment);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// PUT /:id - Edit Pembayaran (admin & kabid_p3 only)
pembayaranRouter.put('/:id', roleMiddleware(['admin', 'kabid_p3']), async (c) => {
  try {
    const id = c.req.param('id') || '';
    const body = await c.req.json();
    const { tanggal, nominal, kol, metode, keterangan } = body;

    const existing = await prisma.pembayaran.findUnique({ where: { id } });
    if (!existing) {
      return c.json({ error: 'Data pembayaran tidak ditemukan' }, 404);
    }

    const user = (c as any).get('user');

    const updated = await prisma.pembayaran.update({
      where: { id },
      data: {
        tanggal: tanggal ? new Date(tanggal) : existing.tanggal,
        nominal: nominal ? parseFloat(nominal) : existing.nominal,
        kol: kol || existing.kol,
        metode: metode || existing.metode,
        keterangan: keterangan !== undefined ? keterangan : existing.keterangan,
        updatedBy: user.nama
      }
    });

    await logAudit(c, 'update_payment', 'pembayaran', id, existing, updated);

    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE /:id - Hapus Pembayaran
pembayaranRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const payment = await prisma.pembayaran.findUnique({ where: { id } });

    if (!payment) {
      return c.json({ error: 'Data pembayaran tidak ditemukan' }, 404);
    }

    await prisma.pembayaran.delete({ where: { id } });
    await logAudit(c, 'delete_payment', 'pembayaran', id, payment);

    return c.json({ message: 'Data pembayaran berhasil dihapus' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /import - Import parsed Excel/CSV rows with match review logic
pembayaranRouter.post('/import', async (c) => {
  try {
    const body = await c.req.json();
    const { rows } = body; // Array of row items parsed on client

    if (!rows || !Array.isArray(rows)) {
      return c.json({ error: 'Input rows harus berupa array' }, 400);
    }

    const user = (c as any).get('user');
    const resultRows: any[] = [];
    const ambiguousRows: any[] = [];
    const errors: any[] = [];
    
    let totalValid = 0;
    let totalAmbiguous = 0;
    let totalFailed = 0;

    // Create a batch record
    const batch = await prisma.pembayaranImportBatch.create({
      data: {
        uploadedBy: user.nama,
        fileName: body.fileName || 'imported_file.csv',
        totalValid: 0,
        totalAmbiguous: 0,
        totalFailed: 0
      }
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 1;
      const { noRek, namaDebitur, tanggal, jumlah, kol, metode, petugas, keterangan } = row;

      if (!namaDebitur || !tanggal || !jumlah || parseFloat(jumlah) <= 0) {
        errors.push({ line: lineNum, error: 'Kolom namaDebitur, tanggal, atau jumlah tidak valid' });
        totalFailed++;
        continue;
      }

      const parsedAmount = parseFloat(jumlah);
      const parsedDate = new Date(tanggal);

      if (isNaN(parsedDate.getTime())) {
        errors.push({ line: lineNum, error: `Format tanggal '${tanggal}' tidak valid (gunakan YYYY-MM-DD)` });
        totalFailed++;
        continue;
      }

      // Case 1: noRek is specified
      if (noRek) {
        const debitur = await prisma.debitur.findUnique({ where: { id: noRek } });
        if (debitur) {
          resultRows.push({
            debiturId: debitur.id,
            nama: debitur.nama,
            tanggal: parsedDate,
            nominal: parsedAmount,
            kol: kol || debitur.kol,
            metode: metode || 'Transfer',
            petugas: petugas || user.nama,
            keterangan,
            importBatchId: batch.id
          });
          totalValid++;
        } else {
          errors.push({ line: lineNum, error: `No. Rekening '${noRek}' tidak terdaftar di database` });
          totalFailed++;
        }
      } 
      // Case 2 & 3: noRek is empty, match by name similarity
      else {
        // Find debiturs with matching name (case-insensitive contains or exact match)
        const matchingDebiturs = await prisma.debitur.findMany({
          where: {
            nama: { contains: namaDebitur }
          }
        });

        if (matchingDebiturs.length === 1) {
          const debitur = matchingDebiturs[0];
          resultRows.push({
            debiturId: debitur.id,
            nama: debitur.nama,
            tanggal: parsedDate,
            nominal: parsedAmount,
            kol: kol || debitur.kol,
            metode: metode || 'Transfer',
            petugas: petugas || user.nama,
            keterangan,
            importBatchId: batch.id
          });
          totalValid++;
        } else if (matchingDebiturs.length > 1) {
          // Ambiguous: multiple matching names
          ambiguousRows.push({
            line: lineNum,
            rawData: row,
            matches: matchingDebiturs.map(d => ({ id: d.id, nama: d.nama, ao: d.ao, kol: d.kol }))
          });
          totalAmbiguous++;
        } else {
          // No match found
          errors.push({ line: lineNum, error: `Nama debitur '${namaDebitur}' tidak terdaftar` });
          totalFailed++;
        }
      }
    }

    // Save valid records in transaction
    if (resultRows.length > 0) {
      await prisma.$transaction(
        resultRows.map((r) => prisma.pembayaran.create({ data: r }))
      );
    }

    // Update batch stats
    await prisma.pembayaranImportBatch.update({
      where: { id: batch.id },
      data: {
        totalValid,
        totalAmbiguous,
        totalFailed
      }
    });

    // Write audit log
    await logAudit(c, 'import_payments', 'pembayaran_import_batches', batch.id, null, {
      totalValid,
      totalAmbiguous,
      totalFailed
    });

    return c.json({
      batchId: batch.id,
      totalValid,
      totalAmbiguous,
      totalFailed,
      errors,
      ambiguousRows
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
