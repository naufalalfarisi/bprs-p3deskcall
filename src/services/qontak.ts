import { prisma } from '../db.js';

interface QontakAuthParams {
  apiToken?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
}

interface SendQontakWaParams {
  phone: string;
  debiturId?: string;
  debiturNama: string;
  nominalTunggakan: number;
  tglJt?: string | Date;
  portalUrl?: string;
  sentByUserId?: string;
  customMessage?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

export async function getQontakAccessToken(customParams?: QontakAuthParams): Promise<string> {
  // 1. Direct API Token Support (Omnichannel API Token from Qontak Settings)
  const apiToken = customParams?.apiToken || process.env.MEKARI_QONTAK_API_TOKEN || '';
  if (apiToken && apiToken.trim().length > 0) {
    return apiToken.trim();
  }

  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt - 60000 && !customParams) {
    return cachedAccessToken;
  }

  // Fetch credentials from AppSettings or env
  const clientId = customParams?.clientId || process.env.MEKARI_QONTAK_CLIENT_ID || '';
  const clientSecret = customParams?.clientSecret || process.env.MEKARI_QONTAK_CLIENT_SECRET || '';
  const username = customParams?.username || process.env.MEKARI_QONTAK_USERNAME || '';
  const password = customParams?.password || process.env.MEKARI_QONTAK_PASSWORD || '';

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Kredensial API Mekari Qontak (Omnichannel API Token atau Username & Password) belum dikonfigurasi.');
  }

  const authUrl = 'https://service-chat.qontak.com/oauth/token';

  const res = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      username,
      password,
      grant_type: 'password',
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const data: any = await res.json();
  if (!res.ok || !data?.access_token) {
    const msg = (Array.isArray(data?.error?.messages) && data.error.messages[0]) || data?.error_description || data?.message || 'Gagal otentikasi OAuth2 ke server Mekari Qontak';
    throw new Error(msg);
  }

  if (!customParams) {
    cachedAccessToken = data.access_token;
    tokenExpiresAt = Date.now() + ((data.expires_in || 7200) * 1000);
  }

  return data.access_token;
}

export async function testQontakConnection(params: QontakAuthParams): Promise<boolean> {
  const token = await getQontakAccessToken(params);

  // Verify token by calling Qontak Open API v1 templates endpoint
  const verifyUrl = 'https://service-chat.qontak.com/api/open/v1/templates/whatsapp';
  const res = await fetch(verifyUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    const msg = (Array.isArray(data?.error?.messages) && data.error.messages[0]) || data?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(`Token API Qontak tidak valid: ${msg}`);
  }

  return true;
}

export async function sendQontakWaMessage(params: SendQontakWaParams) {
  const { phone, debiturId, debiturNama, nominalTunggakan, tglJt, portalUrl, sentByUserId, customMessage } = params;

  let cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  if (cleanPhone.startsWith('0')) {
    cleanPhone = '62' + cleanPhone.substring(1);
  }

  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error(`Nomor telepon '${phone}' tidak valid untuk pengiriman WhatsApp`);
  }

  const channelId = process.env.MEKARI_QONTAK_CHANNEL_ID || '08937cee-fbff-405f-806c-6f5d79ca46a7';
  const templateId = process.env.MEKARI_QONTAK_TEMPLATE_ID || '1798b797-012d-443b-ab0d-95f9ae01d7a0';

  // Get Auth Token
  const token = await getQontakAccessToken();

  const sendUrl = 'https://service-chat.qontak.com/api/open/v1/broadcasts/whatsapp/direct';

  const formattedTunggakan = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(nominalTunggakan || 0);
  const formattedJt = tglJt ? new Date(tglJt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

  const bodyPayload: any = {
    to_number: cleanPhone,
    to_name: debiturNama,
    message_template_id: templateId,
    channel_integration_id: channelId,
    language: {
      code: 'id'
    },
    parameters: {
      body: []
    }
  };

  let qontakLog;
  try {
    const res = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    const resJson: any = await res.json();

    const isSuccess = res.ok && (resJson?.status === 'success' || resJson?.data?.id);

    qontakLog = await prisma.qontakLog.create({
      data: {
        debiturId: debiturId || null,
        phone: cleanPhone,
        channel: 'WhatsApp Mekari Qontak',
        templateId: templateId || 'Direct Message',
        status: isSuccess ? 'SENT' : 'FAILED',
        messageId: resJson?.data?.id || null,
        responseJson: JSON.stringify(resJson),
        sentByUserId: sentByUserId || null
      }
    });

    if (!isSuccess) {
      throw new Error(resJson?.message || resJson?.error?.message || 'Gagal mengirim pesan via API Mekari Qontak');
    }

    return {
      success: true,
      messageId: resJson?.data?.id,
      logId: qontakLog.id
    };
  } catch (err: any) {
    if (!qontakLog) {
      await prisma.qontakLog.create({
        data: {
          debiturId: debiturId || null,
          phone: cleanPhone,
          channel: 'WhatsApp Mekari Qontak',
          templateId: templateId || 'Direct Message',
          status: 'FAILED',
          responseJson: JSON.stringify({ error: err.message }),
          sentByUserId: sentByUserId || null
        }
      }).catch(() => {});
    }
    throw err;
  }
}
