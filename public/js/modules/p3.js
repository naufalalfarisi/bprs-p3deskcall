/* BPRS Mitra Harmoni Yogyakarta — P3 Field Collection Module */
import { apiCall } from './api.js';

export async function fetchP3Schedules(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return await apiCall(`/p3/jadwal${qs ? '?' + qs : ''}`);
}

export async function createP3Schedule(payload) {
  return await apiCall('/p3/jadwal', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function uploadP3Photo(jadwalId, formData) {
  return await apiCall(`/p3/jadwal/${encodeURIComponent(jadwalId)}/foto`, {
    method: 'POST',
    body: formData
  });
}

export async function submitP3CheckIn(jadwalId, checkInData) {
  return await apiCall(`/p3/jadwal/${encodeURIComponent(jadwalId)}/checkin`, {
    method: 'POST',
    body: JSON.stringify(checkInData)
  });
}
