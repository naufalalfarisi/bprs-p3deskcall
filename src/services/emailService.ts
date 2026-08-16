import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export interface SendOtpResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

// Cache logo base64 in memory
let _cachedLogoBase64: string | null = null;

function getCompanyLogoBase64(): string | null {
  if (_cachedLogoBase64 !== null) return _cachedLogoBase64;

  const candidatePaths = [
    path.resolve(process.cwd(), 'public/icons/pwa-192x192.png'),
    path.resolve(process.cwd(), 'public/uploads/favicon/favicon_1784881114917.png'),
    path.resolve(process.cwd(), 'public/icons/apple-touch-icon.png')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        _cachedLogoBase64 = fs.readFileSync(p).toString('base64');
        return _cachedLogoBase64;
      } catch (err) {
        logger.warn({ err, path: p }, 'Failed reading company logo for email');
      }
    }
  }
  return null;
}

/**
 * Service to send OTP and transactional emails with embedded company logo using Resend REST API
 */
export async function sendOtpEmail(
  toEmail: string,
  otpCode: string,
  recipientName?: string
): Promise<SendOtpResult> {
  const name = recipientName || 'Petugas';
  const apiKey = config.resendApiKey;
  const fromEmail = config.emailFrom;
  const logoBase64 = getCompanyLogoBase64();

  const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kode OTP Verifikasi BPRS Mitra Harmoni</title>
  <style>
    body { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 0; color: #1e293b; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06); }
    .header { background: linear-gradient(135deg, #0F766E 0%, #042F2E 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .logo-box { width: 56px; height: 56px; margin: 0 auto 12px auto; background: #ffffff; border-radius: 14px; padding: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.18); display: inline-block; }
    .logo-img { width: 100%; height: 100%; object-fit: contain; border-radius: 10px; display: block; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; text-transform: uppercase; color: #ffffff; }
    .header p { margin: 6px 0 0; font-size: 11.5px; color: #99f6e4; opacity: 0.95; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
    .content { padding: 32px 28px; }
    .greeting { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
    .message { font-size: 13.5px; line-height: 1.65; color: #475569; margin-bottom: 24px; }
    .otp-box { background: #f0fdf4; border: 2px dashed #0f766e; border-radius: 14px; padding: 22px; text-align: center; margin: 24px 0; }
    .otp-label { font-size: 11px; text-transform: uppercase; color: #047857; font-weight: 800; letter-spacing: 0.08em; margin-bottom: 8px; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #065f46; margin: 0; }
    .otp-expiry { font-size: 12px; color: #64748b; margin-top: 10px; }
    .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #92400e; line-height: 1.5; margin-top: 24px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 11.5px; color: #94a3b8; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${logoBase64 ? `
      <div class="logo-box">
        <img src="cid:bprs_logo" alt="Logo BPRS Mitra Harmoni" class="logo-img" />
      </div>
      ` : ''}
      <h1>BPRS MITRA HARMONI</h1>
      <p>Sistem Informasi Penagihan Terpadu &amp; EWS</p>
    </div>
    <div class="content">
      <div class="greeting">Assalamu'alaikum Wr. Wb., ${escapeHtml(name)}</div>
      <div class="message">
        Terima kasih telah mendaftar pada Sistem Informasi Penagihan Terpadu PT BPRS Mitra Harmoni Yogyakarta. Gunakan kode verifikasi OTP berikut untuk mengonfirmasi email dan mengaktifkan akses akun operasional Anda:
      </div>

      <div class="otp-box">
        <div class="otp-label">Kode Verifikasi Email (OTP)</div>
        <div class="otp-code">${otpCode}</div>
        <div class="otp-expiry">Masa berlaku kode: <strong>10 Menit</strong></div>
      </div>

      <div class="warning">
        <strong>PENTING:</strong> Demi keamanan perbankan, jangan pernah membagikan kode OTP ini kepada siapa pun. Petugas IT &amp; Administrator tidak akan pernah meminta kode verifikasi Anda.
      </div>
    </div>
    <div class="footer">
      &copy; 2026 PT BPRS Mitra Harmoni Yogyakarta. Hak Cipta Dilindungi.<br>
      Email otomatis dikirim oleh Sistem P3DeskCall BPRS Mitra Harmoni.
    </div>
  </div>
</body>
</html>
`;

  try {
    if (!apiKey) {
      logger.warn({ toEmail, otpCode }, '[EMAIL DEV SIMULATOR] Resend API Key is missing. Simulating OTP delivery.');
      return { success: true, simulated: true };
    }

    const payload: Record<string, any> = {
      from: fromEmail,
      to: [toEmail],
      subject: `[BPRS MITRA HARMONI] Kode OTP Verifikasi Akun: ${otpCode}`,
      html: htmlContent
    };

    if (logoBase64) {
      payload.attachments = [
        {
          filename: 'bprs-logo.png',
          content: logoBase64,
          content_id: 'bprs_logo'
        }
      ];
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = (await response.json()) as any;

    if (!response.ok) {
      logger.warn({ toEmail, otpCode, error: data }, '[EMAIL RESEND WARNING] Failed to deliver via Resend API (Sandbox restrictions or unverified domain). OTP logged for fallback.');
      return {
        success: true,
        simulated: true,
        error: data?.message || 'Resend delivery fallback'
      };
    }

    logger.info({ toEmail, messageId: data.id }, 'OTP email with embedded company logo successfully delivered via Resend');
    return {
      success: true,
      messageId: data.id
    };
  } catch (err: any) {
    logger.error({ toEmail, otpCode, error: err.message }, 'Error sending OTP email, logging OTP for fallback');
    return {
      success: true,
      simulated: true,
      error: err.message
    };
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
