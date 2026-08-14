/* BPRS Mitra Harmoni Yogyakarta — Debitur Portfolio Module */
import { apiCall } from './api.js';

export async function fetchDebiturList(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await apiCall(`/debitur${qs ? '?' + qs : ''}`);
}

export async function fetchDebiturDetail(id) {
  return await apiCall(`/debitur/${encodeURIComponent(id)}`);
}

export async function updateDebitur(id, payload) {
  return await apiCall(`/debitur/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}
