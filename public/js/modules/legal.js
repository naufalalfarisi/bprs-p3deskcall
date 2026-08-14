/* BPRS Mitra Harmoni Yogyakarta — Legal & AYDA Module */
import { apiCall } from './api.js';

export async function fetchLegalBerkas(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await apiCall(`/legal/berkas${qs ? '?' + qs : ''}`);
}

export async function toggleLegalChecklist(checklistId, checked) {
  return await apiCall(`/legal/checklist/${encodeURIComponent(checklistId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ checked })
  });
}

export async function fetchSuratLegalList() {
  return await apiCall('/legal/surat');
}

export async function createSuratLegal(payload) {
  return await apiCall('/legal/surat', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
