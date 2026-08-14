/* BPRS Mitra Harmoni Yogyakarta — Desk Call Module */
import { apiCall } from './api.js';
import { formatRupiah, formatDate } from './utils.js';

export async function fetchDeskCallHistory(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await apiCall(`/deskcall/logs${qs ? '?' + qs : ''}`);
}

export async function createDeskCallLog(payload) {
  return await apiCall('/deskcall/log', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchGoldenHourStats() {
  return await apiCall('/deskcall/golden-hour');
}

export async function fetchPtpResolutionSummary() {
  return await apiCall('/deskcall/ptp-summary');
}
