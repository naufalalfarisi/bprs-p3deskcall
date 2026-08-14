import { Hono } from 'hono';
import { prisma } from '../db.js';

export const portalRouter = new Hono();

// Public endpoints — NO authMiddleware required for public debtor portal link access

// GET /pay/:token - Resolve portal token and return debtor payment details
portalRouter.get('/pay/:token', async (c) => {
  try {
    const token = c.req.param('token');
    if (!token) {
      return c.json({ error: 'Token portal tidak valid' }, 400);
    }

    const portalToken = await (prisma as any).debtorPortalToken.findUnique({
      where: { token },
      include: {
        debitur: {
          select: {
            id: true,
            nama: true,
            tglJt: true,
            bakiDebet: true,
            totalTunggakan: true,
            angsPrincipal: true,
            angsMargin: true,
            kol: true,
            ao: true
          }
        }
      }
    });

    if (!portalToken) {
      return c.json({ error: 'Token portal tidak ditemukan atau sudah kadaluarsa' }, 404);
    }

    if (portalToken.expiresAt < new Date()) {
      return c.json({ error: 'Tautan portal ini telah kadaluarsa' }, 410);
    }

    const debitur = portalToken.debitur;
    const ptName = process.env.PT_NAME || 'PT BPRS Mitra Harmoni Yogyakarta';

    return c.json({
      valid: true,
      token: portalToken.token,
      isUsed: portalToken.isUsed,
      submittedAt: portalToken.submittedAt,
      ptName,
      debitur: {
        id: debitur.id,
        nama: debitur.nama,
        kol: debitur.kol,
        ao: debitur.ao,
        tglJt: debitur.tglJt,
        bakiDebet: debitur.bakiDebet,
        totalTunggakan: debitur.totalTunggakan || (debitur.angsPrincipal + debitur.angsMargin),
        angsPrincipal: debitur.angsPrincipal,
        angsMargin: debitur.angsMargin
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /pay/:token/submit - Debtor submits payment promise date or transfer proof receipt
portalRouter.post('/pay/:token/submit', async (c) => {
  try {
    const token = c.req.param('token');
    const { promisedDate, promisedAmount, transferProofUrl, notes } = await c.req.json();

    const portalToken = await (prisma as any).debtorPortalToken.findUnique({
      where: { token },
      include: { debitur: true }
    });

    if (!portalToken) {
      return c.json({ error: 'Token portal tidak ditemukan' }, 404);
    }

    if (portalToken.expiresAt < new Date()) {
      return c.json({ error: 'Tautan portal ini telah kadaluarsa' }, 410);
    }

    const debitur = portalToken.debitur;
    const now = new Date();
    const pAmount = promisedAmount ? parseFloat(promisedAmount) : (debitur.totalTunggakan || 0);

    // Update portal token status
    const updatedToken = await (prisma as any).debtorPortalToken.update({
      where: { id: portalToken.id },
      data: {
        isUsed: true,
        submittedAt: now,
        promisedDate: promisedDate ? new Date(promisedDate) : null,
        promisedAmount: pAmount,
        transferProofUrl: transferProofUrl || null,
        notes: notes || null
      }
    });

    const isProofUploaded = !!transferProofUrl;
    const statusKontak = isProofUploaded ? 'Bukti Bayar Diunggah Mandiri' : 'Janji Bayar Mandiri';
    const tindakLanjut = isProofUploaded ? 'Sudah Bayar' : 'Janji Bayar';

    // Find admin or AO user for valid petugasId reference
    let petugasUser = await prisma.user.findFirst({
      where: { OR: [{ username: 'admin' }, { posisi: 'admin' }] }
    });
    if (!petugasUser) {
      petugasUser = await prisma.user.findFirst();
    }
    const petugasId = petugasUser ? petugasUser.id : 'usr-admin';

    // Create DeskCall entry for audit tracking
    await prisma.deskCall.create({
      data: {
        debiturId: debitur.id,
        namaDebitur: debitur.nama,
        tanggal: now,
        waktu: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        petugasId,
        kol: debitur.kol,
        jenisKontak: 'Mekari Qontak',
        statusKontak,
        hasilKomunikasi: `Konfirmasi Mandiri Debitur via Web Portal. ${isProofUploaded ? 'Bukti Transfer Diunggah.' : ''} Catatan: ${notes || '-'}`,
        tindakLanjut,
        prioritas: 'Tinggi',
        nominalJanji: pAmount > 0 ? pAmount : null,
        tanggalJanjiBayar: promisedDate ? new Date(promisedDate) : null,
        bakiDebet: debitur.bakiDebet
      }
    });

    // If transfer proof uploaded, log payment entry for verification
    if (isProofUploaded) {
      await prisma.pembayaran.create({
        data: {
          debiturId: debitur.id,
          nama: debitur.nama,
          tanggal: now,
          nominal: pAmount > 0 ? pAmount : (debitur.totalTunggakan || 0),
          kol: debitur.kol,
          metode: 'Transfer',
          petugas: 'Web Portal Debitur',
          keterangan: `Konfirmasi Mandiri via Web Portal Nasabah. Bukti: ${transferProofUrl}`
        }
      });
    }

    return c.json({
      success: true,
      message: 'Terima kasih, konfirmasi pembayaran Anda telah kami terima dan tercatat di sistem perbankan kami.',
      data: updatedToken
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
