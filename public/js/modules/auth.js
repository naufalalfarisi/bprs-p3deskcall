/* BPRS Mitra Harmoni Yogyakarta — Auth & Session Module */
import { state } from './state.js';
import { apiCall } from './api.js';
import { showToast } from './utils.js';

export async function loginUser(username, password) {
  try {
    const res = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (res && res.token) {
      state.accessToken = res.token;
      state.user = res.user;
      localStorage.setItem('bprs_token', res.token);
      localStorage.setItem('bprs_user', JSON.stringify(res.user));
      return res;
    }
    return null;
  } catch (err) {
    showToast(err.message || 'Login gagal', 'danger');
    throw err;
  }
}

export function logoutUser() {
  state.accessToken = null;
  state.user = null;
  localStorage.removeItem('bprs_token');
  localStorage.removeItem('bprs_user');
  sessionStorage.clear();
}

export function getCurrentUser() {
  if (state.user) return state.user;
  const stored = localStorage.getItem('bprs_user');
  if (stored) {
    try {
      state.user = JSON.parse(stored);
      return state.user;
    } catch (e) {
      return null;
    }
  }
  return null;
}

export function hasRole(allowedRoles) {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.posisi === 'admin') return true;
  return allowedRoles.includes(user.posisi);
}
