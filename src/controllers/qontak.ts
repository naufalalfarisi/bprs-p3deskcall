import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { sendQontakWaMessage, testQontakConnection } from '../services/qontak.js';
import crypto from 'crypto';

export const qontakRouter = new Hono();

// All Qontak endpoints restricted exclusively to Admin and Desk Call roles
qontakRouter.use('*', authMiddleware, roleMiddleware(['admin', 'desk_call']));

// Helper to generate a random 12-char token for Debtor Portal
function generatePortalToken(): string {
  return crypto.randomBytes(6).toString('hex');
}

// POST /send-wa - Send single WA via Mekari Qontak with Debtor Portal Link
qontakRouter.post('/send-wa', async (c) => {
  try {
    const user = (c as any).get('user');
    const { debiturId, customMessage } = await c.req.json();

    if (!debiturId) {
      return c.json({ error: 'Field debiturId wajib diisi' }, 400);
    }

    const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
    if (!debitur) {
      return c.json({ error: 'Debitur tidak ditemukan' }, 404);
    }

    // Generate or reuse valid Debtor Portal Token
    let tokenRecord = await (prisma as any).debtorPortalToken.findFirst({
      where: {
        debiturId: debitur.id,
        isUsed: false,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!tokenRecord) {
      const expiresAt = new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)); // 14 days valid
      tokenRecord = await (prisma as any).debtorPortalToken.create({
        data: {
          token: generatePortalToken(),
          debiturId: debitur.id,
          expiresAt,
          createdVia: 'QontakWA'
        }
      });
    }

    const origin = c.req.header('origin') || c.req.header('host') || 'http://localhost:3000';
    const protocol = origin.startsWith('http') ? '' : 'http://';
    const portalUrl = `${protocol}${origin}/#/portal/pay/${tokenRecord.token}`;

    const result = await sendQontakWaMessage({
      phone: debitur.telepon,
      debiturId: debitur.id,
      debiturNama: debitur.nama,
      nominalTunggakan: debitur.totalTunggakan || debitur.bakiDebet || 0,
      tglJt: debitur.tglJt,
      portalUrl,
      sentByUserId: user.id,
      customMessage
    });

    // Create DeskCall entry for audit log
    await prisma.deskCall.create({
      data: {
        debiturId: debitur.id,
        namaDebitur: debitur.nama,
        tanggal: new Date(),
        waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        petugasId: user.id,
        kol: debitur.kol,
        jenisKontak: 'Mekari Qontak',
        statusKontak: 'Pesan Terkirim',
        hasilKomunikasi: `Pesan pengingat WA dikirim via Mekari Qontak API. Link Portal: ${portalUrl}`,
        tindakLanjut: 'Menunggu Konfirmasi',
        prioritas: 'Sedang',
        bakiDebet: debitur.bakiDebet
      }
    });

    return c.json({
      success: true,
      message: `Pesan WA via Mekari Qontak berhasil dikirim ke ${debitur.nama}`,
      portalUrl,
      result
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /broadcast - Batch WA Blast via Mekari Qontak
qontakRouter.post('/broadcast', async (c) => {
  try {
    const user = (c as any).get('user');
    const { debiturIds, category } = await c.req.json();

    if (!Array.isArray(debiturIds) || debiturIds.length === 0) {
      return c.json({ error: 'Daftar debiturIds tidak boleh kosong' }, 400);
    }

    const debiturs = await prisma.debitur.findMany({
      where: { id: { in: debiturIds } }
    });

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    const origin = c.req.header('origin') || c.req.header('host') || 'http://localhost:3000';
    const protocol = origin.startsWith('http') ? '' : 'http://';

    for (const d of debiturs) {
      try {
        let tokenRecord = await (prisma as any).debtorPortalToken.findFirst({
          where: { debiturId: d.id, isUsed: false, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' }
        });

        if (!tokenRecord) {
          tokenRecord = await (prisma as any).debtorPortalToken.create({
            data: {
              token: generatePortalToken(),
              debiturId: d.id,
              expiresAt: new Date(Date.now() + (14 * 24 * 60 * 60 * 1000)),
              createdVia: 'QontakBlast'
            }
          });
        }

        const portalUrl = `${protocol}${origin}/#/portal/pay/${tokenRecord.token}`;

        await sendQontakWaMessage({
          phone: d.telepon,
          debiturId: d.id,
          debiturNama: d.nama,
          nominalTunggakan: d.totalTunggakan || d.bakiDebet || 0,
          tglJt: d.tglJt,
          portalUrl,
          sentByUserId: user.id
        });

        await prisma.deskCall.create({
          data: {
            debiturId: d.id,
            namaDebitur: d.nama,
            tanggal: new Date(),
            waktu: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            petugasId: user.id,
            kol: d.kol,
            jenisKontak: 'Mekari Qontak',
            statusKontak: 'Broadcast Terkirim',
            hasilKomunikasi: `Pesan WA Broadcast Blast dikirim via Mekari Qontak. Portal: ${portalUrl}`,
            tindakLanjut: 'Menunggu Konfirmasi',
            prioritas: 'Tinggi',
            bakiDebet: d.bakiDebet
          }
        });

        successCount++;
      } catch (err: any) {
        failCount++;
        errors.push(`${d.nama} (${d.id}): ${err.message}`);
      }
    }

    return c.json({
      success: true,
      message: `Broadcast Blast Mekari Qontak selesai. Berhasil: ${successCount}, Gagal: ${failCount}`,
      successCount,
      failCount,
      errors
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /logs - Fetch Mekari Qontak broadcast logs & statistics
qontakRouter.get('/logs', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const logs = await (prisma as any).qontakLog?.findMany?.({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        debitur: {
          select: {
            nama: true,
            id: true,
            bakiDebet: true,
            totalTunggakan: true,
            portalTokens: {
              take: 1,
              orderBy: { createdAt: 'desc' }
            }
          }
        },
        sentByUser: { select: { nama: true, id: true } }
      }
    }) || [];

    const totalSent = await (prisma as any).qontakLog?.count?.({ where: { status: 'SENT' } }) || 0;
    const portalResponses = await (prisma as any).debtorPortalToken?.count?.({ where: { isUsed: true } }) || 0;

    // Aggregate total baki debet from unique debiturs who received Qontak WA
    const uniqueDebiturIds = await (prisma as any).qontakLog?.findMany?.({
      where: { status: 'SENT', debiturId: { not: null } },
      distinct: ['debiturId'],
      select: { debiturId: true }
    }) || [];

    const debiturList = await prisma.debitur.findMany({
      where: { id: { in: uniqueDebiturIds.map((d: any) => d.debiturId).filter(Boolean) } },
      select: { bakiDebet: true, totalTunggakan: true }
    });


    const totalBakiDebet = debiturList.reduce((acc, d) => acc + (d.bakiDebet || 0), 0);

    return c.json({
      stats: {
        totalSent,
        portalResponses,
        totalBakiDebet,
        uniqueDebiturCount: debiturList.length
      },
      logs
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /test-connection - Test Mekari Qontak API Credentials
qontakRouter.post('/test-connection', async (c) => {
  try {
    const body = await c.req.json();
    const isConnected = await testQontakConnection(body);
    return c.json({
      success: true,
      message: 'Koneksi ke API Mekari Qontak Berhasil!',
      connected: isConnected
    });
  } catch (err: any) {
    return c.json({ error: err.message, connected: false }, 400);
  }
});
