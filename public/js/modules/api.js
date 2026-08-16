/* BPRS Mitra Harmoni Yogyakarta — API Module */
import { state } from './state.js';
import { showToast } from './utils.js';

export async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.accessToken) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
  }

  let reqBody = options.body;
  // Remove Content-Type if uploading FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  } else if (reqBody && typeof reqBody === 'object' && !(reqBody instanceof Blob)) {
    reqBody = JSON.stringify(reqBody);
  }

  let url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
  if (!endpoint.startsWith('http')) {
    if (window.location.protocol === 'file:') {
      url = `http://localhost:3001/api${endpoint}`;
    } else if (window.location.port && window.location.port !== '3001') {
      const host = window.location.hostname || 'localhost';
      url = `http://${host}:3001/api${endpoint}`;
    }
  }

  try {
    const res = await fetch(url, { ...options, headers, body: reqBody });

    if (res.status === 401 && !endpoint.includes('/auth/login')) {
      if (typeof window.doLogout === 'function') {
        window.doLogout(false);
      }
      showToast('Sesi Anda berakhir, silakan login kembali', 'warning');
      return null;
    }

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { error: text || 'Respon server tidak valid' };
    }

    if (!res.ok && res.status !== 409) {
      throw new Error(data.error || data.message || 'Terjadi kesalahan pada server');
    }
    return data;
  } catch (err) {
    if (!endpoint.includes('/auth/login')) {
      showToast(err.message, 'danger');
    }
    console.error('API Error:', err);
    throw err;
  }
}
