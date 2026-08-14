/* BPRS Mitra Harmoni Yogyakarta — EWS (Early Warning System) Module */
import { apiCall } from './api.js';
import { formatRupiah, formatDate } from './utils.js';

export async function fetchEwsSummary(aoId = '') {
  const url = aoId ? `/ews/summary?ao=${encodeURIComponent(aoId)}` : '/ews/summary';
  return await apiCall(url);
}

export async function fetchEwsDebitur(aoId = '', status = '', kol = '') {
  let query = [];
  if (aoId) query.push(`ao=${encodeURIComponent(aoId)}`);
  if (status) query.push(`status=${encodeURIComponent(status)}`);
  if (kol) query.push(`kol=${encodeURIComponent(kol)}`);
  const qs = query.length ? `?${query.join('&')}` : '';
  return await apiCall(`/ews/debitur${qs}`);
}

export async function createAoCollectionLog(data) {
  return await apiCall('/ews/collection-log', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export async function fetchAoCollectionLogs(debiturId) {
  return await apiCall(`/ews/collection-logs/${encodeURIComponent(debiturId)}`);
}

export function formatEwsBadge(ewsStatus) {
  if (!ewsStatus) return '<span class="badge badge-gray">-</span>';
  const badgeClass = ewsStatus.badgeClass || 'badge-gray';
  const label = ewsStatus.label || ewsStatus.status || '-';
  return `<span class="badge ${badgeClass}">${label}</span>`;
}
