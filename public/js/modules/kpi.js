/* BPRS Mitra Harmoni Yogyakarta — KPI & Scorecard Module */
import { apiCall } from './api.js';

export async function fetchKpiDashboard(periode) {
  return await apiCall(`/kpi/dashboard?periode=${encodeURIComponent(periode)}`);
}

export async function fetchKpiTargets(periode) {
  return await apiCall(`/kpi/targets?periode=${encodeURIComponent(periode)}`);
}

export async function saveKpiTargets(payload) {
  return await apiCall('/kpi/targets', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function fetchRollRateMatrix(periode, method = 'p3') {
  return await apiCall(`/kpi/rollcure?periode=${encodeURIComponent(periode)}&method=${encodeURIComponent(method)}`);
}

export async function fetchAoPerformance() {
  return await apiCall('/kpi/ao-performance');
}

export async function fetchAoDebiturDrilldown(aoName) {
  return await apiCall(`/kpi/ao-debiturs?ao=${encodeURIComponent(aoName)}`);
}
