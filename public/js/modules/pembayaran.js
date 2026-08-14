/* BPRS Mitra Harmoni Yogyakarta — Pembayaran Module */
import { apiCall } from './api.js';

export async function fetchPembayaranHistory(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await apiCall(`/pembayaran${qs ? '?' + qs : ''}`);
}

export async function createPembayaran(payload) {
  return await apiCall('/pembayaran', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
