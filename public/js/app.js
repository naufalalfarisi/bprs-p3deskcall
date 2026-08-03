/* BPRS Mitra Harmoni Yogyakarta — Client SPA Logic & API Bridge */

// Application Global State
const state = {
  user: JSON.parse(localStorage.getItem('user')) || null,
  accessToken: localStorage.getItem('accessToken') || '',
  refreshToken: localStorage.getItem('refreshToken') || '',
  settings: {
    pt_name: 'PT BPRS Mitra Harmoni Yogyakarta',
    logo_url: '',
    accent_light: '#0F766E',
    accent_dark: '#3FAEA5'
  },
  notifications: [],
  theme: localStorage.getItem('bprs_theme') || 'light'
};

// API Base Handler
async function apiCall(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (state.accessToken) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
  }

  // Remove Content-Type if uploading FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      doLogout(false);
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
    showToast(err.message, 'danger');
    console.error('API Error:', err);
    throw err;
  }
}

// Utility Formatters
function formatRupiah(num) {
  if (num === null || num === undefined) return 'Rp 0';
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function fmtRp(num) {
  return formatRupiah(num);
}

function fmtM(num) {
  if (!num || isNaN(num)) return 'Rp 0';
  const val = Number(num);
  if (Math.abs(val) >= 1_000_000_000) {
    return 'Rp ' + (val / 1_000_000_000).toFixed(2) + ' M';
  }
  if (Math.abs(val) >= 1_000_000) {
    return 'Rp ' + (val / 1_000_000).toFixed(1) + ' Jt';
  }
  return formatRupiah(val);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// Toast System
function showToast(message, type = 'info') {
  const zone = document.getElementById('toast-zone');
  if (!zone) return;

  const toast = document.createElement('div');
  let typeClass = 'toast-i';
  let iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  if (type === 'success' || type === 's') {
    typeClass = 'toast-s';
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (type === 'danger' || type === 'e') {
    typeClass = 'toast-e';
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else if (type === 'warning' || type === 'w') {
    typeClass = 'toast-w';
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  }

  toast.className = `toast ${typeClass}`;
  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  zone.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Modal Controls
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Global ESC key handler — closes topmost open modal or drawer
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Find all open modal overlays and close the last one (topmost in DOM)
    const openModals = document.querySelectorAll('.modal-overlay.open');
    if (openModals.length > 0) {
      openModals[openModals.length - 1].classList.remove('open');
      return;
    }

    // If no modal is open, close the drawer if it's open
    const drawer = document.getElementById('app-drawer');
    const scrim = document.getElementById('drawer-scrim');
    if (drawer && drawer.classList.contains('open')) {
      drawer.classList.remove('open');
      if (scrim) scrim.classList.remove('open');
    }
  }
});

// Theme Controls
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const sun = document.getElementById('ico-sun');
  const moon = document.getElementById('ico-moon');
  if (sun && moon) {
    if (state.theme === 'dark') {
      sun.style.display = 'block';
      moon.style.display = 'none';
    } else {
      sun.style.display = 'none';
      moon.style.display = 'block';
    }
  }
}

function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('bprs_theme', state.theme);
  initTheme();
}

// Password Eye Toggle
function togglePw(id) {
  const el = document.getElementById(id);
  const icon = document.getElementById(id + '-icon');
  if (el) {
    el.type = el.type === 'password' ? 'text' : 'password';
    if (icon) {
      icon.innerText = el.type === 'password' ? 'visibility' : 'visibility_off';
    }
  }
}

// Auth Tabs / Page Switcher (Single Card Tabbed View)
function switchAuthTab(tab) {
  const pageLogin = document.getElementById('page-login');
  const pageReg = document.getElementById('page-register');
  const btnLogin = document.getElementById('tab-btn-login');
  const btnReg = document.getElementById('tab-btn-register');
  const lErr = document.getElementById('l-err');
  const rErr = document.getElementById('r-err');
  const rOk = document.getElementById('r-ok');

  if (lErr) { lErr.innerText = ''; lErr.classList.add('hidden'); lErr.style.display = 'none'; }
  if (rErr) { rErr.innerText = ''; rErr.classList.add('hidden'); rErr.style.display = 'none'; }
  if (rOk) { rOk.style.display = 'none'; }

  if (tab === 'register') {
    if (pageLogin) pageLogin.style.display = 'none';
    if (pageReg) pageReg.style.display = 'block';

    if (btnReg) {
      btnReg.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition-all shadow-sm bg-white text-primary';
    }
    if (btnLogin) {
      btnLogin.className = 'flex-1 py-2 text-xs font-semibold rounded-lg transition-all text-slate-600 hover:text-slate-900';
    }
  } else {
    if (pageReg) pageReg.style.display = 'none';
    if (pageLogin) pageLogin.style.display = 'block';

    if (btnLogin) {
      btnLogin.className = 'flex-1 py-2 text-xs font-bold rounded-lg transition-all shadow-sm bg-white text-primary';
    }
    if (btnReg) {
      btnReg.className = 'flex-1 py-2 text-xs font-semibold rounded-lg transition-all text-slate-600 hover:text-slate-900';
    }
  }
}

function evalStrength(pwd) {
  const fill = document.getElementById('str-fill');
  const label = document.getElementById('str-label');
  if (!fill) return;

  if (!pwd) {
    fill.style.width = '0%';
    fill.style.background = 'transparent';
    if (label) label.innerText = '';
    return;
  }

  let pct = 0;
  if (pwd.length >= 8) pct += 30;
  if (/[A-Z]/.test(pwd)) pct += 25;
  if (/[0-9]/.test(pwd)) pct += 25;
  if (/[^A-Za-z0-9]/.test(pwd)) pct += 20;

  fill.style.width = `${pct}%`;
  if (pct < 50) {
    fill.style.background = 'var(--danger)';
    if (label) label.innerText = 'Kekuatan password: Lemah';
  } else if (pct < 80) {
    fill.style.background = 'var(--warning)';
    if (label) label.innerText = 'Kekuatan password: Sedang';
  } else {
    fill.style.background = 'var(--success)';
    if (label) label.innerText = 'Kekuatan password: Kuat';
  }
}

// Authentication Actions
async function handleLogin(force = false) {
  const uInput = document.getElementById('l-user');
  const pInput = document.getElementById('l-pass');
  const errEl = document.getElementById('l-err');

  const username = uInput?.value.trim();
  const password = pInput?.value;

  if (!username || !password) {
    if (errEl) {
      errEl.innerText = 'Username dan password wajib diisi';
      errEl.classList.remove('hidden');
      errEl.style.display = 'block';
    }
    return;
  }

  if (errEl) {
    errEl.innerText = '';
    errEl.classList.add('hidden');
    errEl.style.display = 'none';
  }

  try {
    const res = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, force })
    });

    if (res.status === 'session_active') {
      openModal('modal-device');
      return;
    }

    state.user = res.user;
    state.accessToken = res.accessToken;
    state.refreshToken = res.refreshToken;

    localStorage.setItem('user', JSON.stringify(res.user));
    localStorage.setItem('accessToken', res.accessToken);
    localStorage.setItem('refreshToken', res.refreshToken);

    closeModal('modal-device');
    showToast(`Selamat datang kembali, ${res.user.nama}!`, 'success');
    setupAppShell();
    switchPane('dashboard');
  } catch (err) {
    if (errEl) {
      errEl.innerText = err.message || 'Login gagal';
      errEl.classList.remove('hidden');
      errEl.style.display = 'block';
    }
  }
}

async function forceLogin() {
  const uInput = document.getElementById('l-user');
  const pInput = document.getElementById('l-pass');
  if (uInput && pInput) {
    await handleLogin(true);
  }
}

async function handleRegister() {
  const nama = document.getElementById('r-nama')?.value.trim();
  const username = document.getElementById('r-user')?.value.trim();
  const email = document.getElementById('r-email')?.value.trim();
  const tgl_lahir = document.getElementById('r-ttl')?.value;
  const posisi = document.getElementById('r-posisi')?.value;
  const password = document.getElementById('r-pass')?.value;
  const confirm = document.getElementById('r-conf')?.value;
  const errEl = document.getElementById('r-err');
  const okEl = document.getElementById('r-ok');

  if (errEl) errEl.innerText = '';
  if (okEl) okEl.style.display = 'none';

  if (!nama || !username || !email || !tgl_lahir || !posisi || !password) {
    if (errEl) errEl.innerText = 'Seluruh field wajib diisi';
    return;
  }

  if (password !== confirm) {
    if (errEl) errEl.innerText = 'Konfirmasi password tidak cocok';
    return;
  }

  try {
    const res = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nama, username, email, tgl_lahir, posisi, password })
    });

    if (okEl) {
      okEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>${res.message}</span>`;
      okEl.style.display = 'flex';
    }
  } catch (err) {
    if (errEl) errEl.innerText = err.message || 'Pendaftaran gagal';
  }
}

function demoLogin(role) {
  const uInput = document.getElementById('l-user');
  const pInput = document.getElementById('l-pass');

  if (role === 'admin') {
    if (uInput) uInput.value = 'admin';
    if (pInput) pInput.value = 'adminpassword';
  } else {
    if (uInput) uInput.value = role;
    if (pInput) pInput.value = 'password123';
  }
  handleLogin(true);
}

function doLogout(callApi = true) {
  if (callApi && state.refreshToken) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.accessToken}`
      },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    }).catch(() => {});
  }

  state.user = null;
  state.accessToken = '';
  state.refreshToken = '';

  localStorage.removeItem('user');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');

  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('auth-overlay').style.display = 'flex';
  closeModal('modal-profile');
}

// Profile Modal
async function openProfileModal() {
  if (!state.user) return;
  const av = document.getElementById('prof-av');
  const nama = document.getElementById('prof-nama');
  const badge = document.getElementById('prof-badge');
  const user = document.getElementById('prof-user');

  try {
    const freshUser = await apiCall('/auth/me');
    if (freshUser && !freshUser.error) {
      state.user = { ...state.user, ...freshUser };
    }
  } catch (e) {}

  let initials = 'AD';
  if (state.user.nama) {
    const parts = state.user.nama.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      initials = parts[0].substring(0, 2).toUpperCase();
    }
  } else if (state.user.username) {
    initials = state.user.username.substring(0, 2).toUpperCase();
  }

  if (av) {
    if (state.user.avatarUrl) {
      av.innerHTML = `<img src="${state.user.avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;"/>`;
    } else {
      av.innerText = initials;
    }
  }

  if (nama) nama.innerText = state.user.nama;
  if (user) user.innerText = `@${state.user.username}`;

  const roles = {
    admin: 'Administrator',
    kabid_p3: 'Kepala Bidang P3',
    staff_p3: 'Staff P3 Lapangan',
    desk_call: 'Staff Desk Call',
    legal: 'Staff Legal'
  };
  if (badge) badge.innerText = roles[state.user.posisi] || 'Staff';

  // Populate inputs
  const inputNama = document.getElementById('prof-input-nama');
  const inputEmail = document.getElementById('prof-input-email');
  const inputTtl = document.getElementById('prof-input-ttl');

  if (inputNama) inputNama.value = state.user.nama || '';
  if (inputEmail) inputEmail.value = state.user.email || '';
  if (inputTtl && state.user.tglLahir) {
    inputTtl.value = state.user.tglLahir.substring(0, 10);
  }

  const tabAdmin = document.getElementById('prof-tab-admin');
  if (tabAdmin) {
    tabAdmin.style.display = state.user.posisi === 'admin' ? 'flex' : 'none';
  }

  if (state.user.posisi === 'admin') {
    try {
      const pendingUsers = await apiCall('/users/pending');
      const list = Array.isArray(pendingUsers) ? pendingUsers : (pendingUsers?.users || []);
      const secPending = document.getElementById('sec-pending');
      const pendBadge = document.getElementById('pend-cnt-badge');
      const pendList = document.getElementById('pend-list');

      if (list.length > 0) {
        if (secPending) secPending.style.display = 'block';
        if (pendBadge) pendBadge.innerText = `${list.length} menunggu`;
        if (pendList) {
          pendList.innerHTML = list.map(u => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
              <div>
                <div style="font-weight:700;font-size:12.5px;">${u.nama} (@${u.username})</div>
                <div style="font-size:11px;color:var(--text-3);">${u.email} &middot; <span class="badge badge-teal" style="font-size:10px;">${u.posisi}</span></div>
              </div>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-primary btn-sm" onclick="approveUser('${u.id}')" style="padding:3px 8px;font-size:11px;">Setujui</button>
                <button class="btn btn-danger-out btn-sm" onclick="rejectUser('${u.id}')" style="padding:3px 8px;font-size:11px;">Tolak</button>
              </div>
            </div>
          `).join('');
        }
      } else {
        if (secPending) secPending.style.display = 'none';
      }
    } catch (e) {}
  }

  switchProfileTab('info');
  openModal('modal-profile');
}

function switchProfileTab(tab) {
  const secInfo = document.getElementById('prof-sec-info');
  const secPw = document.getElementById('prof-sec-pw');
  const secAdmin = document.getElementById('prof-sec-admin');

  const tabInfo = document.getElementById('prof-tab-info');
  const tabPw = document.getElementById('prof-tab-pw');
  const tabAdmin = document.getElementById('prof-tab-admin');

  if (secInfo) secInfo.style.display = tab === 'info' ? 'block' : 'none';
  if (secPw) secPw.style.display = tab === 'pw' ? 'block' : 'none';
  if (secAdmin) secAdmin.style.display = tab === 'admin' ? 'block' : 'none';

  if (tabInfo) {
    tabInfo.style.background = tab === 'info' ? 'var(--brand)' : 'transparent';
    tabInfo.style.color = tab === 'info' ? '#ffffff' : 'var(--text-2)';
  }
  if (tabPw) {
    tabPw.style.background = tab === 'pw' ? 'var(--brand)' : 'transparent';
    tabPw.style.color = tab === 'pw' ? '#ffffff' : 'var(--text-2)';
  }
  if (tabAdmin) {
    tabAdmin.style.background = tab === 'admin' ? 'var(--brand)' : 'transparent';
    tabAdmin.style.color = tab === 'admin' ? '#ffffff' : 'var(--text-2)';
  }
}

async function saveMyProfileInfo() {
  const nama = document.getElementById('prof-input-nama')?.value?.trim();
  const email = document.getElementById('prof-input-email')?.value?.trim();
  const tgl_lahir = document.getElementById('prof-input-ttl')?.value;

  if (!nama || !email || !tgl_lahir) {
    showToast('Nama, email, dan tanggal lahir wajib diisi', 'w');
    return;
  }

  try {
    showToast('Memperbarui profil...', 'i');
    const res = await apiCall('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ nama, email, tgl_lahir })
    });
    state.user = { ...state.user, ...res };
    localStorage.setItem('user', JSON.stringify(state.user));
    setupAppShell();
    showToast('Profil berhasil diperbarui', 's');
  } catch (err) {
    showToast(`Gagal memperbarui profil: ${err.message}`, 'e');
  }
}

async function uploadMyAvatar(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);

  try {
    showToast('Mengunggah foto profil...', 'i');
    const res = await apiCall('/auth/profile/avatar', {
      method: 'POST',
      body: fd
    });
    state.user.avatarUrl = res.avatarUrl;
    localStorage.setItem('user', JSON.stringify(state.user));
    setupAppShell();
    openProfileModal();
    showToast('Foto profil berhasil diunggah', 's');
  } catch (err) {
    showToast(`Gagal mengunggah foto: ${err.message}`, 'e');
  }
}

async function changeMyPassword() {
  const oldPassword = document.getElementById('prof-pw-old')?.value;
  const newPassword = document.getElementById('prof-pw-new')?.value;
  const confirmPassword = document.getElementById('prof-pw-confirm')?.value;

  if (!oldPassword || !newPassword || !confirmPassword) {
    showToast('Semua field password wajib diisi', 'w');
    return;
  }

  if (newPassword.length < 8) {
    showToast('Password baru minimal 8 karakter', 'w');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('Konfirmasi password baru tidak cocok', 'w');
    return;
  }

  try {
    showToast('Memperbarui password...', 'i');
    await apiCall('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    });
    showToast('Password berhasil diperbarui', 's');
    if (document.getElementById('prof-pw-old')) document.getElementById('prof-pw-old').value = '';
    if (document.getElementById('prof-pw-new')) document.getElementById('prof-pw-new').value = '';
    if (document.getElementById('prof-pw-confirm')) document.getElementById('prof-pw-confirm').value = '';
  } catch (err) {
    showToast(`Gagal memperbarui password: ${err.message}`, 'e');
  }
}

// Drawer Controls
function toggleDrawer() {
  const drawer = document.getElementById('app-drawer');
  const scrim = document.getElementById('drawer-scrim');
  drawer?.classList.toggle('open');
  scrim?.classList.toggle('open');
}

function closeDrawer() {
  document.getElementById('app-drawer')?.classList.remove('open');
  document.getElementById('drawer-scrim')?.classList.remove('open');
}

// App Shell Setup
function setupAppShell() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';

  const user = state.user;
  if (!user) return;

  let initials = 'AD';
  if (user.nama) {
    const parts = user.nama.trim().split(/\s+/);
    if (parts.length >= 2) {
      initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    } else if (parts.length === 1 && parts[0].length > 0) {
      initials = parts[0].substring(0, 2).toUpperCase();
    }
  } else if (user.username) {
    initials = user.username.substring(0, 2).toUpperCase();
  }
  
  const userAv = document.getElementById('user-av');
  const userCname = document.getElementById('user-cname');
  const userCrole = document.getElementById('user-crole');
  const hdrPt = document.getElementById('hdr-pt-name');
  const hdrSub = document.getElementById('hdr-role-sub');
  const drPt = document.getElementById('dr-pt');
  const drSub = document.getElementById('dr-sub');

  if (userAv) {
    if (user.avatarUrl) {
      userAv.innerHTML = `<img src="${user.avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
      userAv.style.background = 'transparent';
      userAv.style.padding = '0';
    } else {
      userAv.innerHTML = initials;
      userAv.style.background = '';
    }
  }
  if (userCname) userCname.innerText = user.nama;

  const roles = {
    admin: 'Administrator',
    kabid_p3: 'Pembinaan Pengawasan & Pembiayaan',
    staff_p3: 'Pembinaan Pengawasan & Pembiayaan',
    desk_call: 'Desk Call',
    legal: 'Pembinaan Pengawasan & Pembiayaan · Legal'
  };

  const roleTitle = roles[user.posisi] || 'Pembinaan Pengawasan & Pembiayaan';
  if (userCrole) userCrole.innerText = roles[user.posisi] || 'Staff';
  if (hdrPt) hdrPt.innerText = state.settings.pt_name || 'PT BPRS Mitra Harmoni Yogyakarta';
  if (hdrSub) hdrSub.innerText = roleTitle;
  if (drPt) drPt.innerText = state.settings.pt_name || 'BPRS Mitra Harmoni';
  if (drSub) drSub.innerText = roleTitle;

  renderNavMenu(user.posisi);
  loadNotifications();
}

function renderNavMenu(role) {
  const container = document.getElementById('drawer-nav');
  if (!container) return;

  const menu = [
    { id: 'dashboard', label: 'Dashboard', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>', roles: ['admin', 'kabid_p3', 'staff_p3', 'desk_call', 'legal'] },
    { id: 'debitur', label: 'Data Debitur', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', roles: ['admin', 'kabid_p3', 'staff_p3', 'desk_call', 'legal'] },
    { id: 'deskcall', label: 'Desk Call', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>', roles: ['admin', 'desk_call'] },
    { id: 'p3', label: 'P3 (Lapangan)', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>', roles: ['admin', 'kabid_p3', 'staff_p3', 'legal'] },
    { id: 'legal', label: 'Legal', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', roles: ['admin', 'kabid_p3', 'legal'] },
    { id: 'bayar', label: 'Riwayat Bayar', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>', roles: ['admin', 'kabid_p3', 'staff_p3', 'desk_call', 'legal'] },
    { id: 'kpi', label: 'KPI & Scorecard', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>', roles: ['admin', 'kabid_p3', 'staff_p3', 'legal'] },
    { id: 'settings', label: 'Pengaturan & Admin', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', roles: ['admin'] }
  ];

  container.innerHTML = menu.filter(item => item.roles.includes(role)).map(item => `
    <a href="#/${item.id}" class="nav-item" id="nav-${item.id}" onclick="switchPane('${item.id}')">
      ${item.icon}
      <span>${item.label}</span>
    </a>
  `).join('');
}

// Subtab switcher inside unified Settings pane
function switchSettingsSubtab(subId) {
  document.querySelectorAll('.setting-subtab').forEach(btn => {
    btn.classList.remove('active');
    btn.style.borderBottomColor = 'transparent';
    btn.style.color = 'var(--text-2)';
    btn.style.fontWeight = '600';
  });
  document.querySelectorAll('.settings-subpane').forEach(p => p.style.display = 'none');

  const targetBtn = document.getElementById(`subtab-${subId}`);
  const targetPane = document.getElementById(`settings-subpane-${subId}`);

  if (targetBtn) {
    targetBtn.classList.add('active');
    targetBtn.style.borderBottomColor = 'var(--brand)';
    targetBtn.style.color = 'var(--brand)';
    targetBtn.style.fontWeight = '700';
  }
  if (targetPane) {
    targetPane.style.display = 'block';
  }

  if (subId === 'users') loadUsersView();
  if (subId === 'appmgmt') loadAppMgmtView();
  if (subId === 'importcbs') loadImportCbsView();
}

// Pane Switcher & SPA Router
function switchPane(paneId, subId = null) {
  closeDrawer();

  // Redirect old admin route links to settings pane with corresponding subtab
  if (['users', 'appmgmt', 'importcbs'].includes(paneId)) {
    subId = paneId;
    paneId = 'settings';
  }

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const targetPane = document.getElementById(`pane-${paneId}`);
  const targetNav = document.getElementById(`nav-${paneId}`);

  if (targetPane) targetPane.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  window.location.hash = `#/${paneId}`;

  // Load view contents dynamically
  if (paneId === 'dashboard') loadDashboardView();
  if (paneId === 'debitur') loadDebiturView();
  if (paneId === 'deskcall') loadDeskCallView();
  if (paneId === 'p3') loadP3View();
  if (paneId === 'legal') loadLegalView();
  if (paneId === 'bayar') loadBayarView();
  if (paneId === 'kpi') loadKpiView();
  if (paneId === 'settings') {
    const activeSub = subId || 'users';
    switchSettingsSubtab(activeSub);
  }
}

// Notifications Panel
async function loadNotifications() {
  if (!state.accessToken) return;
  try {
    const res = await apiCall('/notifications');
    if (!res) return;
    state.notifications = Array.isArray(res) ? res : [];

    const cnt = document.getElementById('notif-cnt');
    if (cnt) {
      if (state.notifications.length > 0) {
        cnt.innerText = state.notifications.length;
        cnt.style.display = 'flex';
      } else {
        cnt.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Notifications load error:', err);
  }
}

function openNotifPanel() {
  const body = document.getElementById('notif-panel-body');
  if (!body) return;

  if (!state.notifications || state.notifications.length === 0) {
    body.innerHTML = '<div class="empty-st"><p>Tidak ada notifikasi baru.</p></div>';
  } else {
    body.innerHTML = state.notifications.map(n => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);">
        <div style="font-size:13px;font-weight:700;color:var(--text);">${n.title}</div>
        <div style="font-size:12px;color:var(--text-2);margin-top:2px;">${n.message}</div>
      </div>
    `).join('');
  }

  openModal('modal-notif');
}

function applyLogo(logoUrl) {
  if (!logoUrl) return;
  const selectors = ['.auth-logo', '.hdr-logo-box', '.drawer-logo', '.footer-logo'];
  selectors.forEach(sel => {
    const el = document.querySelector(sel);
    if (el) {
      el.innerHTML = `<img src="${logoUrl}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;"/>`;
      el.style.background = 'transparent';
      el.style.padding = '0';
    }
  });
}

function applyFavicon(faviconUrl) {
  if (!faviconUrl) return;
  let link = document.getElementById('app-favicon');
  if (!link) {
    link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = faviconUrl;
}

// Load Application Settings
async function loadAppSettings() {
  try {
    const res = await apiCall('/app-settings');
    if (res && !res.error) {
      state.settings = res;
      const pt1 = document.getElementById('auth-pt-name');
      const pt2 = document.getElementById('hdr-pt-name');
      const pt3 = document.getElementById('ftr-pt');
      if (pt1) pt1.innerText = res.pt_name;
      if (pt2) pt2.innerText = res.pt_name;
      if (pt3) pt3.innerText = res.pt_name;
      if (res.logo_url) applyLogo(res.logo_url);
      if (res.favicon_url) applyFavicon(res.favicon_url);
      if (res.pt_name) document.title = `${res.pt_name} — Sistem Informasi Penagihan Terpadu AO, P3 & Desk Call`;
    }
  } catch (e) {
    console.error('App settings fetch error:', e);
  }
}

// ============================================================================
// VIEW CONTROLLERS (Connected to Live APIs)
// ============================================================================

// 1. DASHBOARD VIEW
let chartDashTren = null;
let chartDashDist = null;
let chartDashKOLMove = null;
let chartDashNPFRatio = null;
let chartDashAO = null;
let dashDistMode = 'baki'; // 'baki' or 'noa'
let dashDebitursData = [];
let dashRecentCalls = [];

async function loadDashboardView() {
  const container = document.getElementById('dash-content');
  if (!container) return;

  container.innerHTML = `<div class="empty-st"><p>Memuat data dashboard...</p></div>`;

  try {
    const [kpiRes, debRes, dcRes, aoSummaryRes] = await Promise.all([
      apiCall('/kpi/dashboard'),
      apiCall('/debitur?limit=2000'),
      apiCall('/deskcall/harian'),
      apiCall('/debitur/summary/ao')
    ]);

    const stats = kpiRes?.stats || {};
    dashDebitursData = debRes?.debiturs || [];
    const counts = debRes?.counts || { Semua: dashDebitursData.length, Lancar: 0, DPK: 0, 'Kurang Lancar': 0, Diragukan: 0, Macet: 0 };
    dashRecentCalls = Array.isArray(dcRes) ? dcRes : (dcRes?.calls || []);

    // Calculate real figures from debiturs data
    const totalNOA = debRes?.total || dashDebitursData.length;
    const totalBaki = dashDebitursData.reduce((s, d) => s + (d.bakiDebet || 0), 0);
    const npfBaki = dashDebitursData.filter(d => ['Kurang Lancar', 'Diragukan', 'Macet'].includes(d.kol)).reduce((s, d) => s + (d.bakiDebet || 0), 0);
    const npfRatio = totalBaki > 0 ? (npfBaki / totalBaki) * 100 : (stats.npfGross || 0);

    // Full AO Summary from backend (aggregated across 100% of active debiturs)
    let aoList = [];
    if (Array.isArray(aoSummaryRes) && aoSummaryRes.length > 0) {
      aoList = aoSummaryRes;
    } else {
      const aoMap = {};
      dashDebitursData.forEach(d => {
        const aoName = d.ao || 'Tanpa AO';
        if (!aoMap[aoName]) {
          aoMap[aoName] = { ao: aoName, noa: 0, totalBaki: 0, npfBaki: 0 };
        }
        aoMap[aoName].noa++;
        aoMap[aoName].totalBaki += (d.bakiDebet || 0);
        if (['Kurang Lancar', 'Diragukan', 'Macet'].includes(d.kol)) {
          aoMap[aoName].npfBaki += (d.bakiDebet || 0);
        }
      });
      aoList = Object.values(aoMap).sort((a, b) => b.totalBaki - a.totalBaki);
    }

    container.innerHTML = `
      <div class="toolbar-wrap mb-4" style="display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;">
        <div style="font-size:11.5px;color:var(--text-3);font-weight:600;">
          Terakhir diperbarui: <span class="mono">${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>
        </div>
      </div>

      <!-- 4 CAPSULE STAT CARDS -->
      <div class="stats-grid mb-4">
        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">Total NOA Aktif</span>
            <span class="stat-pill stat-pill-blue">📊 NOA</span>
          </div>
          <div class="stat-num">${totalNOA}</div>
          <div class="stat-sub">Debitur Pembiayaan Aktif</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">Total Baki Debet</span>
            <span class="stat-pill stat-pill-teal">IDR</span>
          </div>
          <div class="stat-num text-blue" style="font-size:24px;">${formatRupiah(totalBaki)}</div>
          <div class="stat-sub">Portofolio Pembiayaan</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">Baki Debet NPF</span>
            <span class="stat-pill stat-pill-yellow">⚡ KOL 3-5</span>
          </div>
          <div class="stat-num text-warning" style="font-size:24px;">${formatRupiah(npfBaki)}</div>
          <div class="stat-sub">KOL 3 (KL), 4 (D), 5 (M)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">NPF Ratio (Gross)</span>
            <span class="stat-pill ${npfRatio > 5 ? 'stat-pill-red' : 'stat-pill-green'}">${npfRatio > 5 ? '⚠️ Waspada' : '✓ Aman'}</span>
          </div>
          <div class="stat-num" style="color:${npfRatio > 5 ? 'var(--danger)' : 'var(--success)'}">${npfRatio.toFixed(2)}%</div>
          <div class="stat-sub">Batas Toleransi OJK: &le; 5.00%</div>
        </div>
      </div>

      <!-- CHARTS ROW 1: DISTRIBUSI KOL & TREN BAKI DEBET -->
      <div class="dash-grid-2 mb-4">
        <div class="chart-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <div>
              <div class="chart-title">Distribusi Kolektibilitas</div>
              <div class="chart-sub">Komposisi KOL 1 (Lancar) s.d. KOL 5 (Macet)</div>
            </div>
            <div class="rollcure-method-tabs" style="margin:0;">
              <div class="rollcure-method-tab ${dashDistMode === 'baki' ? 'active' : ''}" onclick="toggleDashDistMode('baki')">Baki Debet</div>
              <div class="rollcure-method-tab ${dashDistMode === 'noa' ? 'active' : ''}" onclick="toggleDashDistMode('noa')">NOA</div>
            </div>
          </div>
          <div class="chart-wrap" style="height:260px;">
            <canvas id="chart-dash-dist"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-title">Tren Baki Debet &amp; NPF</div>
          <div class="chart-sub">Perkembangan 6 Bulan Terakhir (Miliar Rp)</div>
          <div class="chart-wrap" style="height:260px;">
            <canvas id="chart-dash-tren"></canvas>
          </div>
        </div>
      </div>

      <!-- CHARTS ROW 2: PERGERAKAN KOL & NPF RATIO -->
      <div class="dash-grid-2 mb-4">
        <div class="chart-card">
          <div class="chart-title">Pergerakan KOL per Bulan</div>
          <div class="chart-sub">Komposisi Historis Kolektibilitas (Stacked Bar)</div>
          <div class="chart-wrap" style="height:250px;">
            <canvas id="chart-dash-kolmove"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div class="chart-title">NPF Ratio per Bulan</div>
          <div class="chart-sub">Tren Rasio NPF vs Batas Target OJK (&le; 5.00%)</div>
          <div class="chart-wrap" style="height:250px;">
            <canvas id="chart-dash-npfratio"></canvas>
          </div>
        </div>
      </div>

      <!-- ROW 3: BAKI DEBET PER AO & DESK CALL TERBARU -->
      <div class="dash-grid-2 mb-4">
        <div class="chart-card">
          <div class="chart-title">Baki Debet per Account Officer (AO)</div>
          <div class="chart-sub">Peringkat Portofolio Terbesar (Miliar Rp)</div>
          <div class="chart-wrap" style="height:270px;">
            <canvas id="chart-dash-ao"></canvas>
          </div>
        </div>

        <div class="chart-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
              <div class="chart-title">Desk Call Penagihan Terbaru</div>
              <div class="chart-sub">5 Entri Panggilan Terakhir</div>
            </div>
            <a href="#/deskcall" class="btn btn-outline btn-sm" onclick="switchPane('deskcall')">Lihat Semua</a>
          </div>
          <div class="table-wrap" style="border:none;box-shadow:none;">
            <div class="table-scroll" style="max-height:230px;">
              <table>
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Debitur</th>
                    <th>Status</th>
                    <th>Tindak Lanjut</th>
                  </tr>
                </thead>
                <tbody>
                  ${dashRecentCalls.length === 0 ? `
                    <tr><td colspan="4" class="empty-st">Belum ada panggilan dicatat hari ini</td></tr>
                  ` : dashRecentCalls.slice(0, 5).map(c => `
                    <tr>
                      <td class="mono" style="font-size:11px;">${formatDate(c.tanggal)} ${c.waktu || ''}</td>
                      <td class="font-bold">${c.namaDebitur}</td>
                      <td><span class="badge ${c.statusKontak === 'Terhubung' ? 'badge-green' : 'badge-yellow'}">${c.statusKontak}</span></td>
                      <td style="font-size:11.5px;">${c.tindakLanjut || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ROW 4: RINGKASAN PORTOFOLIO PER AO TABLE -->
      <div class="chart-card mb-4">
        <div class="chart-title mb-2">Ringkasan Portofolio &amp; NPF per Account Officer (AO)</div>
        <div class="table-wrap">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama Account Officer (AO)</th>
                  <th>NOA</th>
                  <th>Total Baki Debet</th>
                  <th>Baki Debet NPF</th>
                  <th>NPF Ratio</th>
                </tr>
              </thead>
              <tbody>
                ${aoList.length === 0 ? '<tr><td colspan="6" class="empty-st">Tidak ada data AO</td></tr>' : aoList.map((a, idx) => {
                  const r = a.totalBaki > 0 ? (a.npfBaki / a.totalBaki) * 100 : 0;
                  return `
                    <tr>
                      <td class="mono font-bold">${idx + 1}</td>
                      <td class="font-bold">${a.ao}</td>
                      <td class="mono">${a.noa} Debitur</td>
                      <td class="mono font-bold">${formatRupiah(a.totalBaki)}</td>
                      <td class="mono font-bold text-warning">${formatRupiah(a.npfBaki)}</td>
                      <td><span class="badge ${r > 5 ? 'badge-red' : 'badge-green'}">${r.toFixed(2)}%</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Render Charts after DOM mount
    setTimeout(() => {
      renderDashDistChart(counts);
      renderDashTrenChart();
      renderDashKOLMoveChart();
      renderDashNPFRatioChart();
      renderDashAOChart(aoList);
    }, 60);

  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat dashboard: ${err.message}</p></div>`;
  }
}

function toggleDashDistMode(mode) {
  dashDistMode = mode;
  loadDashboardView();
}

function renderDashDistChart(counts) {
  const ctx = document.getElementById('chart-dash-dist');
  if (!ctx) return;

  if (chartDashDist) chartDashDist.destroy();

  let dataValues = [];
  if (dashDistMode === 'noa') {
    dataValues = [
      counts['Lancar'] || 0,
      counts['DPK'] || 0,
      counts['Kurang Lancar'] || 0,
      counts['Diragukan'] || 0,
      counts['Macet'] || 0
    ];
  } else {
    // Mode Baki Debet per KOL
    const sumByKOL = { Lancar: 0, DPK: 0, 'Kurang Lancar': 0, Diragukan: 0, Macet: 0 };
    dashDebitursData.forEach(d => {
      if (sumByKOL[d.kol] !== undefined) {
        sumByKOL[d.kol] += (d.bakiDebet || 0);
      }
    });
    dataValues = [
      sumByKOL['Lancar'] / 1e9,
      sumByKOL['DPK'] / 1e9,
      sumByKOL['Kurang Lancar'] / 1e9,
      sumByKOL['Diragukan'] / 1e9,
      sumByKOL['Macet'] / 1e9
    ];
  }

  chartDashDist = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['KOL 1 (Lancar)', 'KOL 2 (DPK)', 'KOL 3 (Kurang Lancar)', 'KOL 4 (Diragukan)', 'KOL 5 (Macet)'],
      datasets: [{
        data: dataValues,
        backgroundColor: ['#0D7A4E', '#1A5FA8', '#B05C08', '#E08A3E', '#C0392C']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function(context) {
              const val = context.raw;
              return dashDistMode === 'noa' ? ` ${val} NOA` : ` Rp ${val.toFixed(2)} Miliar`;
            }
          }
        }
      }
    }
  });
}

function renderDashTrenChart() {
  const ctx = document.getElementById('chart-dash-tren');
  if (!ctx) return;

  if (chartDashTren) chartDashTren.destroy();

  chartDashTren = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Feb 2026', 'Mar 2026', 'Apr 2026', 'Mei 2026', 'Jun 2026', 'Jul 2026'],
      datasets: [
        {
          label: 'Total Baki Debet (Miliar Rp)',
          data: [12.8, 12.6, 12.5, 12.4, 12.45, 12.45],
          borderColor: '#0F766E',
          backgroundColor: 'rgba(15,118,110,0.12)',
          fill: true,
          tension: 0.35
        },
        {
          label: 'Baki Debet NPF (Juta Rp)',
          data: [680, 660, 640, 630, 622, 622500000 / 1e6],
          borderColor: '#C0392C',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function renderDashKOLMoveChart() {
  const ctx = document.getElementById('chart-dash-kolmove');
  if (!ctx) return;

  if (chartDashKOLMove) chartDashKOLMove.destroy();

  chartDashKOLMove = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Feb 26', 'Mar 26', 'Apr 26', 'Mei 26', 'Jun 26', 'Jul 26'],
      datasets: [
        { label: 'KOL 1', data: [11.2, 11.1, 11.0, 10.9, 11.0, 11.0], backgroundColor: '#0D7A4E' },
        { label: 'KOL 2', data: [0.92, 0.84, 0.86, 0.87, 0.83, 0.83], backgroundColor: '#1A5FA8' },
        { label: 'KOL 3', data: [0.35, 0.34, 0.32, 0.31, 0.30, 0.30], backgroundColor: '#B05C08' },
        { label: 'KOL 4', data: [0.18, 0.17, 0.17, 0.17, 0.17, 0.17], backgroundColor: '#E08A3E' },
        { label: 'KOL 5', data: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15], backgroundColor: '#C0392C' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, title: { display: true, text: 'Miliar Rp' } }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function renderDashNPFRatioChart() {
  const ctx = document.getElementById('chart-dash-npfratio');
  if (!ctx) return;

  if (chartDashNPFRatio) chartDashNPFRatio.destroy();

  chartDashNPFRatio = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Feb 26', 'Mar 26', 'Apr 26', 'Mei 26', 'Jun 26', 'Jul 26'],
      datasets: [
        {
          label: 'NPF Ratio (%)',
          data: [5.31, 5.23, 5.12, 5.08, 5.00, 5.00],
          borderColor: '#E05B4E',
          backgroundColor: 'rgba(224,91,78,0.15)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Batas Maksimal OJK (5.00%)',
          data: [5.0, 5.0, 5.0, 5.0, 5.0, 5.0],
          borderColor: '#0D7A4E',
          borderDash: [6, 6],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 4.0, max: 6.0, title: { display: true, text: 'Persentase (%)' } }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function renderDashAOChart(aoList) {
  const ctx = document.getElementById('chart-dash-ao');
  if (!ctx) return;

  if (chartDashAO) chartDashAO.destroy();

  const labels = aoList.slice(0, 6).map(a => a.ao);
  const dataBaki = aoList.slice(0, 6).map(a => (a.totalBaki / 1e9).toFixed(2));

  chartDashAO = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Baki Debet (Miliar Rp)',
        data: dataBaki,
        backgroundColor: '#0F766E',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

// 2. DEBITUR VIEW
const debState = {
  page: 1,
  limit: 50,
  filter: 'all',
  search: '',
  ao: 'all',
  jt: 'all',
  status: 'all'
};

let searchDebiturDebounce = null;

async function loadDebiturView(page = 1) {
  const container = document.getElementById('deb-content');
  if (!container) return;

  debState.page = page;

  container.innerHTML = `<div class="empty-st"><p>Memuat data debitur...</p></div>`;

  try {
    const kolParam = debState.filter === 'all' ? '' : debState.filter;
    const aoParam = debState.ao === 'all' ? '' : debState.ao;
    const jtParam = debState.jt === 'all' ? '' : debState.jt;
    const statusParam = debState.status || 'all';

    const url = `/debitur?page=${debState.page}&limit=${debState.limit}&kol=${encodeURIComponent(kolParam)}&ao=${encodeURIComponent(aoParam)}&jt=${encodeURIComponent(jtParam)}&status=${encodeURIComponent(statusParam)}&q=${encodeURIComponent(debState.search)}`;

    const res = await apiCall(url);
    renderDebiturList(res);
  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat data debitur: ${err.message}</p></div>`;
  }
}

function renderDebiturList(res) {
  const container = document.getElementById('deb-content');
  if (!container) return;

  const list = res.debiturs || [];
  const counts = res.counts || { Semua: 0, Lancar: 0, DPK: 0, 'Kurang Lancar': 0, Diragukan: 0, Macet: 0 };
  const summary = res.summaryStats || { totalDebitur: res.total || 0, totalBakiDebet: 0, totalTunggakan: 0, macetCount: counts.Macet || 0, macetBakiDebet: 0 };
  const total = res.total || 0;
  const page = res.page || 1;
  const limit = res.limit || 50;
  const totalPages = res.totalPages || 1;
  const aos = res.aos || [];

  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  container.innerHTML = `
    <!-- 4 CAPSULE STAT CARDS (EXACT MATCH TO REFERENCE DESIGN) -->
    <div class="stats-grid mb-4">
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">TOTAL DEBITUR</span>
          <span class="stat-pill stat-pill-green">👥 Aktif</span>
        </div>
        <div class="stat-value">${(summary.totalDebitur || total).toLocaleString('id-ID')}</div>
        <div class="stat-sub">Debitur Pembiayaan Aktif</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">TOTAL BAKI DEBET</span>
          <span class="stat-pill stat-pill-teal">IDR</span>
        </div>
        <div class="stat-value text-blue" style="font-size:24px;">${formatRupiah(summary.totalBakiDebet || 0)}</div>
        <div class="stat-sub">Total Portofolio Pembiayaan</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">TOTAL TUNGGAKAN</span>
          <span class="stat-pill stat-pill-yellow">⚠️ Perhatian</span>
        </div>
        <div class="stat-value text-warning" style="font-size:24px;">${formatRupiah(summary.totalTunggakan || 0)}</div>
        <div class="stat-sub">Tunggakan Pokok &amp; Margin</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">KOL 5 (MACET)</span>
          <span class="stat-pill stat-pill-red">📉 Macet</span>
        </div>
        <div class="stat-value" style="color:var(--danger);">${summary.macetCount || counts.Macet || 0} Kasus</div>
        <div class="stat-sub">Baki Debet: ${formatRupiah(summary.macetBakiDebet || 0)}</div>
      </div>
    </div>

    <!-- STRUCTURED FILTER BOX CONTAINER -->
    <div class="card mb-4" style="padding:22px 24px;border-radius:18px;margin-bottom:24px;box-shadow:var(--sh-sm);">
      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;" class="deb-filter-grid">
        <!-- COLUMN 1: STATUS KOL -->
        <div>
          <label class="form-label" style="font-size:11px;font-weight:800;color:var(--text-2);margin-bottom:6px;">STATUS KOL</label>
          <select id="deb-filter-kol" class="form-select" style="font-size:13px;padding:9px 16px;border-radius:9999px;">
            <option value="all"${debState.filter === 'all' ? ' selected' : ''}>Semua Status</option>
            <option value="Lancar"${debState.filter === 'Lancar' ? ' selected' : ''}>KOL 1 (Lancar)</option>
            <option value="DPK"${debState.filter === 'DPK' ? ' selected' : ''}>KOL 2 (DPK)</option>
            <option value="Kurang Lancar"${debState.filter === 'Kurang Lancar' ? ' selected' : ''}>KOL 3 (Kurang Lancar)</option>
            <option value="Diragukan"${debState.filter === 'Diragukan' ? ' selected' : ''}>KOL 4 (Diragukan)</option>
            <option value="Macet"${debState.filter === 'Macet' ? ' selected' : ''}>KOL 5 (Macet)</option>
          </select>
        </div>

        <!-- COLUMN 2: ACCOUNT OFFICER -->
        <div>
          <label class="form-label" style="font-size:11px;font-weight:800;color:var(--text-2);margin-bottom:6px;">ACCOUNT OFFICER</label>
          <select id="deb-filter-ao" class="form-select" style="font-size:13px;padding:9px 16px;border-radius:9999px;">
            <option value="all"${debState.ao === 'all' ? ' selected' : ''}>Semua Petugas</option>
            ${aos.map(a => `<option value="${a}"${debState.ao === a ? ' selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>

        <!-- COLUMN 3: JATUH TEMPO -->
        <div>
          <label class="form-label" style="font-size:11px;font-weight:800;color:var(--text-2);margin-bottom:6px;">JATUH TEMPO</label>
          <select id="deb-filter-jt" class="form-select" style="font-size:13px;padding:9px 16px;border-radius:9999px;">
            <option value="all"${debState.jt === 'all' ? ' selected' : ''}>Semua Jatuh Tempo</option>
            <option value="hari_ini"${debState.jt === 'hari_ini' ? ' selected' : ''}>Jatuh Tempo Hari Ini</option>
            <option value="minggu_ini"${debState.jt === 'minggu_ini' ? ' selected' : ''}>Jatuh Tempo Minggu Ini (7 Hari)</option>
            <option value="2_minggu"${debState.jt === '2_minggu' ? ' selected' : ''}>Jatuh Tempo 2 Minggu Kedepan (14 Hari)</option>
          </select>
        </div>
      </div>

      <!-- FILTER ACTION BUTTONS -->
      <div style="display:flex;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="applyDebFilters()" style="padding:9.5px 22px;background:var(--brand-dark);border-color:var(--brand-dark);border-radius:9999px;font-size:13px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Terapkan Filter
        </button>
        <button class="btn btn-outline" onclick="resetDebFilters()" style="padding:9.5px 22px;border-radius:9999px;font-size:13px;">
          Atur Ulang
        </button>
      </div>
    </div>

    <!-- TOOLBAR SEARCH & QUICK PILLS (WITH CLEAR VERTICAL GAP) -->
    <div class="toolbar" style="gap:12px;margin-bottom:18px;margin-top:8px;">
      <div class="search-box-group" style="flex:1;min-width:260px;max-width:440px;">
        <svg class="search-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="deb-search-input" type="text" placeholder="Cari nama, no. rekening, KTP..." value="${debState.search}" onkeydown="if(event.key==='Enter') executeDebiturSearch()"/>
        <button class="search-box-btn" type="button" onclick="executeDebiturSearch()">
          <span class="material-symbols-outlined" style="font-size:16px;">search</span>
          <span>Cari</span>
        </button>
      </div>

      <!-- Filter KOL Pills -->
      <div class="kol-filter" style="margin-bottom:0;">
        <button class="kol-pill ${debState.filter === 'all' ? 'kp-active' : ''}" onclick="setDebFilter('all')">Semua <span class="kp-count">${counts.Semua || 0}</span></button>
        <button class="kol-pill kp-lancar ${debState.filter === 'Lancar' ? 'kp-active' : ''}" onclick="setDebFilter('Lancar')">Lancar <span class="kp-count">${counts.Lancar || 0}</span></button>
        <button class="kol-pill kp-dpk ${debState.filter === 'DPK' ? 'kp-active' : ''}" onclick="setDebFilter('DPK')">DPK <span class="kp-count">${counts.DPK || 0}</span></button>
        <button class="kol-pill kp-kuranglancar ${debState.filter === 'Kurang Lancar' ? 'kp-active' : ''}" onclick="setDebFilter('Kurang Lancar')">KL <span class="kp-count">${counts['Kurang Lancar'] || 0}</span></button>
        <button class="kol-pill kp-diragukan ${debState.filter === 'Diragukan' ? 'kp-active' : ''}" onclick="setDebFilter('Diragukan')">Diragukan <span class="kp-count">${counts.Diragukan || 0}</span></button>
        <button class="kol-pill kp-macet ${debState.filter === 'Macet' ? 'kp-active' : ''}" onclick="setDebFilter('Macet')">Macet <span class="kp-count">${counts.Macet || 0}</span></button>
      </div>
    </div>

    <!-- DEBITUR TABLE -->
    <div class="table-wrap">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th style="width:50px;text-align:center;">No.</th>
              <th>No. Rekening</th>
              <th>Nama Debitur</th>
              <th>AO</th>
              <th>KOL</th>
              <th class="num">Baki Debet</th>
              <th class="num">Tunggakan</th>
              <th>Jatuh Tempo</th>
              <th style="text-align:center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${list.length === 0 ? '<tr><td colspan="9" class="empty-st">Tidak ada data debitur yang cocok dengan filter</td></tr>' : list.map((d, idx) => {
              const rowNo = (page - 1) * limit + idx + 1;
              return `
              <tr onclick="viewDebiturDetail('${d.id}')" style="cursor:pointer;">
                <td style="text-align:center;" class="mono text-muted font-bold">${rowNo}</td>
                <td class="mono font-bold" style="color:var(--brand);">${d.id}</td>
                <td>
                  <div class="tbl-name">${d.nama}</div>
                  <div class="tbl-sub">${d.telepon || '-'} &middot; ${d.kota || '-'}</div>
                </td>
                <td style="font-size:12.5px;font-weight:600;">${d.ao || '-'}</td>
                <td><span class="badge ${getKolBadgeClass(d.kol)}">${d.kol}</span></td>
                <td class="num mono font-bold">${formatRupiah(d.bakiDebet)}</td>
                <td class="num mono text-danger">${formatRupiah(d.totalTunggakan || d.tPokok + d.tMargin)}</td>
                <td class="mono" style="font-size:12px;">${formatDate(d.tglJt)}</td>
                <td onclick="event.stopPropagation()" style="text-align:center;">
                  <div class="tbl-acts" style="justify-content:center;">
                    <button class="tbl-btn wa" title="WhatsApp" onclick="window.open('https://wa.me/${formatPhone(d.telepon)}')">💬</button>
                    <button class="tbl-btn call" title="Telepon" onclick="window.open('tel:${d.telepon}')">📞</button>
                    <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;" onclick="viewDebiturDetail('${d.id}')">👁️ Detail</button>
                  </div>
                </td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Pagination Controls Bar -->
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-top:16px;padding:12px 18px;background:var(--surface);border:1px solid var(--border);border-radius:12px;">
      <div style="font-size:13px;color:var(--text-2);">
        Menampilkan <strong>${start} - ${end}</strong> dari <strong>${total.toLocaleString('id-ID')}</strong> debitur (Halaman ${page} dari ${totalPages})
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn btn-sm" ${page <= 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="loadDebiturView(${page - 1})">&laquo; Sebelumnya</button>
        
        ${renderPageButtons(page, totalPages)}

        <button class="btn btn-sm" ${page >= totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''} onclick="loadDebiturView(${page + 1})">Selanjutnya &raquo;</button>
      </div>
    </div>
  `;
}

function renderPageButtons(current, totalPages) {
  let btns = '';
  const range = [];

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
      range.push(i);
    }
  }

  let last = 0;
  for (const i of range) {
    if (last && i - last > 1) {
      btns += `<span style="font-size:12px;color:var(--text-3);padding:0 4px;">...</span>`;
    }
    const isActive = i === current;
    btns += `<button class="btn btn-sm ${isActive ? 'btn-primary' : ''}" style="min-width:32px;" onclick="loadDebiturView(${i})">${i}</button>`;
    last = i;
  }

  return btns;
}

function applyDebFilters() {
  const kolVal = document.getElementById('deb-filter-kol')?.value || 'all';
  const aoVal = document.getElementById('deb-filter-ao')?.value || 'all';
  const jtVal = document.getElementById('deb-filter-jt')?.value || 'all';
  const statusVal = document.getElementById('deb-filter-status')?.value || 'all';

  debState.filter = kolVal;
  debState.ao = aoVal;
  debState.jt = jtVal;
  debState.status = statusVal;
  loadDebiturView(1);
}

function resetDebFilters() {
  debState.filter = 'all';
  debState.ao = 'all';
  debState.jt = 'all';
  debState.status = 'all';
  debState.search = '';
  loadDebiturView(1);
}

function setDebFilter(f) {
  debState.filter = f;
  const select = document.getElementById('deb-filter-kol');
  if (select) select.value = f;
  loadDebiturView(1);
}

function setDebAoFilter(ao) {
  debState.ao = ao;
  const select = document.getElementById('deb-filter-ao');
  if (select) select.value = ao;
  loadDebiturView(1);
}

function toggleDebJtFilter() {
  debState.jt = debState.jt === 'hari_ini' ? 'all' : 'hari_ini';
  const select = document.getElementById('deb-filter-jt');
  if (select) select.value = debState.jt;
  loadDebiturView(1);
}

function executeDebiturSearch() {
  const input = document.getElementById('deb-search-input');
  if (input) {
    debState.search = input.value.trim();
    loadDebiturView(1);
  }
}


function getKolBadgeClass(kol) {
  if (!kol) return 'badge-gray';
  const k = String(kol).toLowerCase();
  if (k === '1' || k === 'lancar') return 'badge-green';
  if (k === '2' || k === 'dpk') return 'badge-blue';
  if (k === '3' || k === 'kurang lancar') return 'badge-yellow';
  if (k === '4' || k === 'diragukan') return 'badge-purple';
  if (k === '5' || k === 'macet') return 'badge-red';
  return 'badge-gray';
}

function kolBadge(kol) {
  if (kol === undefined || kol === null || kol === '') return '<span class="badge badge-gray">-</span>';
  const label = String(kol).toUpperCase().startsWith('KOL') ? kol : `KOL ${kol}`;
  return `<span class="badge ${getKolBadgeClass(kol)}">${label}</span>`;
}

function formatPhone(phone) {
  if (!phone) return '';
  let p = phone.replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '62' + p.substring(1);
  return p;
}

async function viewDebiturDetail(id) {
  const body = document.getElementById('dmd-body');
  const title = document.getElementById('dmd-title');
  if (!body) return;

  body.innerHTML = `<div class="empty-st"><p>Memuat detail debitur...</p></div>`;
  openModal('modal-debitur');

  try {
    const d = await apiCall(`/debitur/${id}`);
    if (title) title.innerText = `Detail Debitur — ${d.nama}`;

    const pctPaid = d.plafon > 0 ? Math.max(0, Math.min(100, Math.round(((d.plafon - d.bakiDebet) / d.plafon) * 100))) : 0;
    
    // Status Bayar Badge Class
    let statusBayarBadge = 'badge-red';
    if (d.statusBayar === 'Sudah Bayar') statusBayarBadge = 'badge-green';
    else if (d.statusBayar === 'Bayar Sebagian') statusBayarBadge = 'badge-yellow';

    // Calculate Age
    let ageText = d.umur;
    if (!ageText && d.tglLahir) {
      const birth = new Date(d.tglLahir);
      if (!isNaN(birth.getTime())) {
        const ageYears = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        ageText = `${ageYears} thn`;
      }
    }

    body.innerHTML = `
      <!-- Header Badges -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
        <div>
          <div style="font-size:18px;font-weight:800;color:var(--text);">${d.nama}</div>
          <div class="mono" style="font-size:12px;color:var(--text-3);margin-top:2px;">Rek: ${d.id} &middot; CIF: ${d.cif || '-'}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <span class="badge ${getKolBadgeClass(d.kol)}" style="font-size:12px;padding:5px 12px;">KOL ${d.kol}</span>
          <span class="badge ${statusBayarBadge}" style="font-size:12px;padding:5px 12px;">${d.statusBayar || 'Belum Bayar'}</span>
          <span class="badge badge-purple" style="font-size:12px;padding:5px 12px;">Risiko ${d.resiko || 'Sedang'}</span>
          ${d.restruk > 0 ? `<span class="badge badge-yellow" style="font-size:12px;padding:5px 12px;">Restruk ${d.restruk}x</span>` : ''}
        </div>
      </div>

      <!-- Terbayar vs Plafon Progress Bar -->
      <div style="background:var(--surface);padding:14px 16px;border-radius:12px;border:1px solid var(--border);margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:6px;">
          <span>Pelunasan Pembiayaan (${pctPaid}%)</span>
          <span>${formatRupiah(d.plafon - d.bakiDebet)} / ${formatRupiah(d.plafon)}</span>
        </div>
        <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden;">
          <div style="height:100%;width:${pctPaid}%;background:var(--brand);transition:width 0.4s ease;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);margin-top:6px;">
          <span>Baki Debet: <strong class="mono" style="color:var(--text);">${formatRupiah(d.bakiDebet)}</strong></span>
          <span>Plafon: <strong class="mono" style="color:var(--text);">${formatRupiah(d.plafon)}</strong></span>
        </div>
      </div>

      <!-- Data Diri Section -->
      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--brand);margin-bottom:8px;">1. Data Diri Nasabah</div>
      <div class="m-card-grid mb-4">
        <div><div class="m-field-label">NIK / No. KTP</div><div class="m-field-value mono">${d.nik || '-'}</div></div>
        <div><div class="m-field-label">Tgl Lahir / Umur</div><div class="m-field-value">${formatDate(d.tglLahir)} ${ageText ? `(${ageText})` : ''}</div></div>
        <div><div class="m-field-label">No. Telepon</div><div class="m-field-value font-bold">${d.telepon || '-'}</div></div>
        <div><div class="m-field-label">Pekerjaan</div><div class="m-field-value">${d.pekerjaan || '-'}</div></div>
        <div><div class="m-field-label">Agama</div><div class="m-field-value">${d.agama || '-'}</div></div>
        <div style="grid-column:span 3;"><div class="m-field-label">Alamat Lengkap</div><div class="m-field-value">${d.alamat || '-'}, ${d.kota || ''}</div></div>
      </div>

      <div class="divider"></div>

      <!-- Data Pembiayaan Section -->
      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--brand);margin-bottom:8px;">2. Data Pembiayaan &amp; Akad</div>
      <div class="m-card-grid mb-4">
        <div><div class="m-field-label">Jenis Akad / Pembiayaan</div><div class="m-field-value" style="grid-column:span 2;">${d.jenisMargin || '-'}</div></div>
        <div><div class="m-field-label">Account Officer (AO)</div><div class="m-field-value font-bold">${d.ao || '-'}</div></div>
        <div><div class="m-field-label">Rate Margin</div><div class="m-field-value mono">${d.rateMargin ? d.rateMargin + '%' : '-'}</div></div>
        <div><div class="m-field-label">Jangka Waktu (JW)</div><div class="m-field-value">${d.jw} Bulan</div></div>
        <div><div class="m-field-label">No. SPK</div><div class="m-field-value mono">${d.spkNumber || '-'}</div></div>
        <div><div class="m-field-label">Tanggal Akad</div><div class="m-field-value">${formatDate(d.tglAwal)}</div></div>
        <div><div class="m-field-label">Tanggal Jatuh Tempo</div><div class="m-field-value">${formatDate(d.tglJt)}</div></div>
        <div><div class="m-field-label">Tgl Angsuran Terakhir</div><div class="m-field-value">${formatDate(d.tglAngsuranTerakhir)}</div></div>
        <div><div class="m-field-label">Angsuran Pokok / Bln</div><div class="m-field-value mono">${formatRupiah(d.angsPrincipal)}</div></div>
        <div><div class="m-field-label">Angsuran Margin / Bln</div><div class="m-field-value mono">${formatRupiah(d.angsMargin)}</div></div>
        <div><div class="m-field-label">Total Kewajiban / Bln</div><div class="m-field-value mono font-bold text-blue">${formatRupiah(d.angsPrincipal + d.angsMargin)}</div></div>
      </div>

      <div class="divider"></div>

      <!-- Rincian Tunggakan Section -->
      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--danger);margin-bottom:8px;">3. Rincian Tunggakan</div>
      <div class="m-card-grid mb-4" style="grid-template-columns:1fr 1fr 1fr 1fr;">
        <div><div class="m-field-label">Tunggakan Pokok</div><div class="m-field-value mono text-danger">${formatRupiah(d.tPokok)}</div></div>
        <div><div class="m-field-label">Tunggakan Margin</div><div class="m-field-value mono text-danger">${formatRupiah(d.tMargin)}</div></div>
        <div><div class="m-field-label">Total Tunggakan</div><div class="m-field-value mono font-bold text-danger">${formatRupiah(d.totalTunggakan || d.tPokok + d.tMargin)}</div></div>
        <div><div class="m-field-label">Frekuensi Tunggakan</div><div class="m-field-value font-bold">${d.frHari || 0} Hari (${d.fr || 0}x)</div></div>
      </div>

      <div class="divider"></div>

      <!-- Tabungan & Agunan Section -->
      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--brand);margin-bottom:8px;">4. Informasi Agunan &amp; Tabungan</div>
      <div class="m-card-grid mb-4">
        <div><div class="m-field-label">Rekening Tabungan</div><div class="m-field-value mono">${d.rekTabungan || '-'}</div></div>
        <div><div class="m-field-label">Saldo Tabungan</div><div class="m-field-value mono text-green">${formatRupiah(d.saldoTabungan)}</div></div>
        <div><div class="m-field-label">Jenis Agunan</div><div class="m-field-value">${d.jenisAgunan || '-'}</div></div>
        <div><div class="m-field-label">Nilai Agunan / Jaminan</div><div class="m-field-value mono">${formatRupiah(d.nilaiJaminan)}</div></div>
      </div>

      <div class="divider"></div>

      <!-- Riwayat Baki Debet (KOL History) -->
      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--brand);margin-bottom:8px;">5. Riwayat Baki Debet &amp; Kolektibilitas</div>
      <div class="tbl-wrap" style="border:1px solid var(--border);border-radius:10px;margin-bottom:16px;overflow-x:auto;">
        <table class="tbl" style="width:100%;font-size:12px;min-width:440px;">
          <thead style="background:var(--th-bg);">
            <tr>
              <th style="padding:8px 12px;text-align:left;white-space:nowrap;">Periode Snapshot</th>
              <th style="padding:8px 12px;text-align:left;white-space:nowrap;">KOL</th>
              <th style="padding:8px 12px;text-align:right;white-space:nowrap;">Baki Debet</th>
            </tr>
          </thead>
          <tbody>
            ${!d.kolHistory || d.kolHistory.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:12px;color:var(--text-3);">Belum ada riwayat snapshot KOL</td></tr>' : d.kolHistory.map(h => `
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:8px 12px;font-weight:600;white-space:nowrap;">${h.bulanLabel || formatDate(h.tanggalSnapshot)}</td>
                <td style="padding:8px 12px;white-space:nowrap;"><span class="badge ${getKolBadgeClass(h.kol)}">${h.kol}</span></td>
                <td style="padding:8px 12px;text-align:right;white-space:nowrap;" class="mono font-bold">${formatRupiah(h.bakiDebet)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Riwayat Desk Call Ringkasan -->
      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--brand);margin-bottom:8px;">6. Ringkasan Desk Call Penagihan</div>
      <div style="background:var(--surface);padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:16px;">
        ${!d.deskCalls || d.deskCalls.length === 0 ? `
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge badge-gray" style="font-size:11px;">Belum Pernah Dihubungi</span>
            <span style="font-size:12px;color:var(--text-2);">Belum ada pencatatan penagihan desk call.</span>
          </div>
        ` : `
          <div style="font-size:12px;line-height:1.6;">
            <div>Total Kontak Desk Call: <strong>${d.deskCalls.length} kali</strong></div>
            <div>Panggilan Terakhir: <strong>${formatDate(d.deskCalls[0].tanggal)} ${d.deskCalls[0].waktu || ''}</strong> &middot; <span class="badge ${d.deskCalls[0].statusKontak==='Terhubung'?'badge-green':'badge-yellow'}">${d.deskCalls[0].statusKontak}</span></div>
            ${d.deskCalls[0].tindakLanjut ? `<div>Tindak Lanjut: <strong>${d.deskCalls[0].tindakLanjut}</strong> ${d.deskCalls[0].nominalJanji ? `(Janji: ${formatRupiah(d.deskCalls[0].nominalJanji)})` : ''}</div>` : ''}
          </div>
        `}
      </div>

      <!-- Action Buttons Modal Footer -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:20px;padding-top:14px;border-top:1px solid var(--border);">
        <button class="btn btn-outline btn-sm" onclick="window.open('https://wa.me/${formatPhone(d.telepon)}')">💬 Hubungi WA</button>
        <button class="btn btn-outline btn-sm" onclick="window.open('tel:${d.telepon}')">📞 Panggil Telepon</button>
        ${state.user?.posisi === 'desk_call' || state.user?.posisi === 'admin' ? `
          <button class="btn btn-secondary btn-sm" onclick="closeModal('modal-debitur');openDCModal('${d.id}')">📝 Catat Desk Call</button>
        ` : ''}
        ${state.user?.posisi === 'legal' || state.user?.posisi === 'admin' || state.user?.posisi === 'kabid_p3' ? `
          <button class="btn btn-outline btn-sm" onclick="closeModal('modal-debitur');openLegalForm('${d.id}')">⚖️ Tambah Berkas Legal</button>
        ` : ''}
        <button class="btn btn-primary btn-sm" onclick="closeModal('modal-debitur');openPayForm('${d.id}')">💰 Catat Pembayaran</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-st"><p>Gagal memuat detail: ${err.message}</p></div>`;
  }
}

// 3. DESK CALL VIEW
let currentDCTab = 'harian';

async function loadDeskCallView() {
  const container = document.getElementById('dc-content');
  const hdrActions = document.getElementById('dc-hdr-actions');
  if (!container) return;

  // Render top right header action buttons
  if (hdrActions) {
    hdrActions.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="btn btn-outline btn-sm" onclick="exportDeskCallPDF()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Export PDF
        </button>
        <button class="btn btn-primary btn-sm" onclick="openDCForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Catat Call
        </button>
      </div>
    `;
  }

  container.innerHTML = `<div class="empty-st"><p>Memuat data Desk Call...</p></div>`;

  try {
    const endpoint = currentDCTab === 'insight' ? '/deskcall/insight' : (currentDCTab === 'bulanan' ? '/deskcall/bulanan' : '/deskcall/harian');
    const res = await apiCall(endpoint);
    renderDeskCallTab(res);
  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat data Desk Call: ${err.message}</p></div>`;
  }
}

function switchDCTab(tab) {
  currentDCTab = tab;
  document.querySelectorAll('.dc-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`dctab-${tab}`)?.classList.add('active');
  loadDeskCallView();
}

function renderDeskCallTab(res) {
  const container = document.getElementById('dc-content');
  if (!container) return;

  if (currentDCTab === 'insight') {
    const stats = res?.stats || {};
    const calls = res?.calls || [];

    container.innerHTML = `
      <div class="stats-grid mb-4">
        <div class="stat-card">
          <div class="stat-label">Total Call</div>
          <div class="stat-value">${stats.totalCalls || calls.length || 0}</div>
          <div class="stat-sub">Periode Berjalan</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">Contact Rate</div>
          <div class="stat-value text-blue">${stats.contactRate || 0}%</div>
          <div class="stat-sub">Terhubung ke Debitur</div>
        </div>
        <div class="stat-card warn">
          <div class="stat-label">Komitmen PTP</div>
          <div class="stat-value text-green">${stats.janjiBayar || 0}</div>
          <div class="stat-sub">PTP Rate: ${stats.ptpRate || 0}%</div>
        </div>
        <div class="stat-card dang">
          <div class="stat-label">Nominal Janji</div>
          <div class="stat-value mono font-bold">${formatRupiah(stats.nominalJanji || 0)}</div>
          <div class="stat-sub">Estimasi Pemulihan</div>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--brand);">Analisis Customer Insight &amp; Profil Kontak</h4>
        <div class="m-card-grid" style="grid-template-columns:1fr 1fr;">
          <div><div class="m-field-label">Panggilan Terhubung</div><div class="m-field-value text-green font-bold">${stats.terhubung || 0} Kali</div></div>
          <div><div class="m-field-label">Panggilan Tidak Diangkat / Tidak Aktif</div><div class="m-field-value text-danger font-bold">${(stats.totalCalls || 0) - (stats.terhubung || 0)} Kali</div></div>
          <div><div class="m-field-label">Janji Bayar Disepakati</div><div class="m-field-value text-blue font-bold">${stats.janjiBayar || 0} Debitur</div></div>
          <div><div class="m-field-label">Total Nominal Potensi Recovery</div><div class="m-field-value mono font-bold text-green">${formatRupiah(stats.nominalJanji || 0)}</div></div>
        </div>
      </div>
    `;
    return;
  }

  if (currentDCTab === 'bulanan') {
    window._currentBulananData = res;
    const stats = res?.stats || {};
    const weeklyRekap = res?.weeklyRekap || [];

    container.innerHTML = `
      <div class="stats-grid mb-4">
        <div class="stat-card">
          <div class="stat-label">Total Call Bulan Ini</div>
          <div class="stat-value">${stats.totalCalls || 0}</div>
          <div class="stat-sub">Panggilan Terdaftar</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">Terhubung (Contact %)</div>
          <div class="stat-value text-blue">${stats.terhubung || 0} <span style="font-size:13px;font-weight:600;">(${stats.connectionRate || 0}%)</span></div>
          <div class="stat-sub">Ke Debitur</div>
        </div>
        <div class="stat-card warn">
          <div class="stat-label">PTP (Janji Bayar %)</div>
          <div class="stat-value text-green">${stats.ptp || 0} <span style="font-size:13px;font-weight:600;">(${stats.ptpRate || 0}%)</span></div>
          <div class="stat-sub">PTP Rate</div>
        </div>
        <div class="stat-card dang">
          <div class="stat-label">Total Nominal Janji</div>
          <div class="stat-value mono font-bold">${formatRupiah(stats.totalNominalJanji || 0)}</div>
          <div class="stat-sub">Janji Pembayaran</div>
        </div>
      </div>

      <div class="card mb-4" style="padding:16px 20px;">
        <div style="font-size:14px;font-weight:800;color:var(--text);margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <span>📅 Rekap Penagihan Per Minggu (Dalam Sebulan)</span>
          <span class="badge badge-teal" style="font-size:12px;">Periode: ${res?.periode || 'Bulan Ini'}</span>
        </div>
        <p style="font-size:12px;color:var(--text-3);margin-bottom:14px;">💡 Klik baris minggu untuk melihat rincian detail harian &amp; daftar panggilan minggu tersebut.</p>

        <div class="table-wrap">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Periode Minggu</th>
                  <th class="num">Total Call</th>
                  <th class="num">Terhubung</th>
                  <th class="num">Contact Rate</th>
                  <th class="num">Janji Bayar (PTP)</th>
                  <th class="num">PTP Rate</th>
                  <th class="num">Nominal Janji</th>
                  <th style="width:40px;"></th>
                </tr>
              </thead>
              <tbody>
                ${weeklyRekap.length === 0 ? '<tr><td colspan="8" class="empty-st">Belum ada data penagihan bulan ini</td></tr>' : weeklyRekap.map(w => `
                  <tr style="cursor:pointer;background:var(--bg-card);" onclick="toggleWeekDetail(${w.weekNum})">
                    <td style="font-size:13px;color:var(--brand);font-weight:800;">
                      <span class="mono">▶</span> ${w.label}
                    </td>
                    <td class="num mono font-bold">${w.totalCall}</td>
                    <td class="num mono text-blue">${w.terhubung}</td>
                    <td class="num mono text-blue font-bold">${w.connectionRate}%</td>
                    <td class="num mono text-green">${w.ptp}</td>
                    <td class="num mono text-green font-bold">${w.ptpRate}%</td>
                    <td class="num mono text-green font-bold">${formatRupiah(w.nominalJanji)}</td>
                    <td style="text-align:center;">
                      <svg id="week-icon-${w.weekNum}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform .2s;"><polyline points="6 9 12 15 18 9"/></svg>
                    </td>
                  </tr>
                  <!-- EXPANDABLE WEEK DETAIL ROW -->
                  <tr id="week-detail-row-${w.weekNum}" style="display:none;background:var(--bg);">
                    <td colspan="8" style="padding:14px 16px;">
                      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;box-shadow:var(--sh-sm);">
                        <div style="font-size:13px;font-weight:800;color:var(--brand);margin-bottom:10px;">📌 Detail Harian — ${w.label}</div>
                        ${w.dailyBreakdown && w.dailyBreakdown.length > 0 ? `
                          <table style="width:100%;margin-bottom:14px;font-size:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                            <thead style="background:var(--bg);">
                              <tr>
                                <th style="padding:6px 10px;">Tanggal</th>
                                <th class="num" style="padding:6px 10px;">Total Call</th>
                                <th class="num" style="padding:6px 10px;">Terhubung</th>
                                <th class="num" style="padding:6px 10px;">Janji Bayar (PTP)</th>
                                <th class="num" style="padding:6px 10px;">Nominal Janji</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${w.dailyBreakdown.map(d => `
                                <tr style="border-top:1px solid var(--border);">
                                  <td style="padding:6px 10px;" class="mono font-bold">${formatDate(d.tanggal)}</td>
                                  <td style="padding:6px 10px;" class="num mono">${d.totalCall}</td>
                                  <td style="padding:6px 10px;" class="num mono text-blue">${d.terhubung}</td>
                                  <td style="padding:6px 10px;" class="num mono text-green">${d.ptp}</td>
                                  <td style="padding:6px 10px;" class="num mono text-green font-bold">${formatRupiah(d.nominalJanji)}</td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        ` : '<p style="font-size:12px;color:var(--text-3);margin-bottom:12px;">Tidak ada rekap harian pada minggu ini.</p>'}

                        <div style="font-size:13px;font-weight:800;color:var(--brand);margin-bottom:10px;">📞 Rincian Panggilan Debitur Minggu Ini (${(w.calls || []).length} Call)</div>
                        ${w.calls && w.calls.length > 0 ? `
                          <div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">
                            <table style="width:100%;font-size:11.5px;">
                              <thead style="background:var(--bg);">
                                <tr>
                                  <th style="padding:6px 8px;">Tgl &amp; Waktu</th>
                                  <th style="padding:6px 8px;">Nama Debitur</th>
                                  <th style="padding:6px 8px;">Kontak</th>
                                  <th style="padding:6px 8px;">Status</th>
                                  <th style="padding:6px 8px;">Tindak Lanjut</th>
                                  <th class="num" style="padding:6px 8px;">Nominal Janji</th>
                                  <th style="padding:6px 8px;">Petugas</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${w.calls.map(c => `
                                  <tr style="border-top:1px solid var(--border);cursor:pointer;" onclick="viewDCDetail('${c.id}')">
                                    <td style="padding:6px 8px;" class="mono">${formatDate(c.tanggal)} ${c.waktu || ''}</td>
                                    <td style="padding:6px 8px;" class="font-bold">${c.namaDebitur}</td>
                                    <td style="padding:6px 8px;">${c.jenisKontak === 'WhatsApp' ? '💬 WA' : '📞 Telp'}</td>
                                    <td style="padding:6px 8px;"><span class="badge ${c.statusKontak === 'Terhubung' ? 'badge-green' : 'badge-yellow'}" style="font-size:10px;">${c.statusKontak}</span></td>
                                    <td style="padding:6px 8px;"><span class="badge ${c.tindakLanjut === 'Janji Bayar' ? 'badge-teal' : 'badge-gray'}" style="font-size:10px;">${c.tindakLanjut || '-'}</span></td>
                                    <td style="padding:6px 8px;" class="num mono font-bold text-green">${formatRupiah(c.nominalJanji)}</td>
                                    <td style="padding:6px 8px;">${c.petugas?.nama || c.petugasId || '-'}</td>
                                  </tr>
                                `).join('')}
                              </tbody>
                            </table>
                          </div>
                        ` : '<p style="font-size:12px;color:var(--text-3);">Belum ada riwayat panggilan pada minggu ini.</p>'}
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    return;
  }

  // TAB HARIAN (Default)
  window._currentHarianData = res;
  const stats = res?.stats || {};
  const calls = res?.calls || [];

  container.innerHTML = `
    <div class="stats-grid mb-4">
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">TOTAL PANGGILAN HARI INI</span>
          <span class="stat-pill stat-pill-green">↗ +12%</span>
        </div>
        <div class="stat-value">${stats.totalCalls || 0}</div>
        <div class="stat-sub">Target: 180 Panggilan</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">CONNECTION RATE</span>
          <span class="stat-pill stat-pill-teal">✓ Tinggi</span>
        </div>
        <div class="stat-value text-blue">${stats.totalCalls > 0 ? ((stats.terhubung / stats.totalCalls) * 100).toFixed(1) : '0'}%</div>
        <div class="stat-sub">${stats.terhubung || 0} Terhubung / ${stats.totalCalls || 0} Call</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">PTP RATE (JANJI BAYAR)</span>
          <span class="stat-pill stat-pill-yellow">⚡ Aktif</span>
        </div>
        <div class="stat-value text-green">${stats.terhubung > 0 ? ((stats.janjiBayar / stats.terhubung) * 100).toFixed(1) : '0'}%</div>
        <div class="stat-sub">${stats.janjiBayar || 0} Nasabah Berjanji</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-top">
          <span class="stat-label">TOTAL NOMINAL JANJI BAYAR</span>
          <span class="stat-pill stat-pill-teal">IDR</span>
        </div>
        <div class="stat-value text-green" style="font-size:24px;">${formatRupiah(stats.nominalJanji || 0)}</div>
        <div class="stat-sub">Estimasi Penagihan Akhir Bulan</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="filter-pill ${!window._dcFilterTindak ? 'active' : ''}" onclick="filterDCHarian('')">Semua Panggilan</button>
        <button class="filter-pill ${window._dcFilterTindak === 'Janji Bayar' ? 'active' : ''}" onclick="filterDCHarian('Janji Bayar')">🤝 Khusus Janji Bayar (PTP)</button>
      </div>
      <div class="tbl-hint">← Geser tabel ke samping →</div>
    </div>

    <div class="tbl-wrap">
      <table class="tbl" style="min-width:860px;">
        <thead>
          <tr>
            <th style="white-space:nowrap;">Waktu</th>
            <th style="white-space:nowrap;">Nama Debitur</th>
            <th style="white-space:nowrap;">Jenis</th>
            <th style="white-space:nowrap;">Status Kontak</th>
            <th style="white-space:nowrap;">Tindak Lanjut</th>
            <th style="white-space:nowrap;background:var(--brand-light);color:var(--brand);font-weight:800;">📅 Tenggat Janji Bayar</th>
            <th class="num" style="white-space:nowrap;">Nominal Janji</th>
            <th style="white-space:nowrap;">Petugas</th>
          </tr>
        </thead>
        <tbody>
          ${calls.length === 0 ? '<tr><td colspan="8" class="empty-st">Belum ada riwayat Desk Call untuk kriteria ini</td></tr>' : calls.filter(c => !window._dcFilterTindak || c.tindakLanjut === window._dcFilterTindak).map(c => {
            const hasJanji = c.tindakLanjut === 'Janji Bayar';
            const janjiStr = c.tanggalJanjiBayar ? formatDate(c.tanggalJanjiBayar) : '-';

            // Calculate if promise date is today or due
            let isDueToday = false;
            if (c.tanggalJanjiBayar) {
              const pDate = new Date(c.tanggalJanjiBayar).toDateString();
              const tDate = new Date().toDateString();
              if (pDate === tDate) isDueToday = true;
            }

            return `
              <tr style="cursor:pointer; ${isDueToday ? 'background:var(--warning-bg);' : ''}" onclick="viewDCDetail('${c.id}')">
                <td class="mono font-bold" style="white-space:nowrap;">${formatDate(c.tanggal)} ${c.waktu || ''}</td>
                <td class="tbl-name" style="white-space:nowrap;">${c.namaDebitur}</td>
                <td style="white-space:nowrap;">${c.jenisKontak === 'WhatsApp' ? '💬 WA' : '📞 Telp'}</td>
                <td style="white-space:nowrap;"><span class="badge ${c.statusKontak === 'Terhubung' ? 'badge-green' : 'badge-yellow'}">${c.statusKontak}</span></td>
                <td style="white-space:nowrap;"><span class="badge ${hasJanji ? 'badge-teal' : 'badge-gray'}">${c.tindakLanjut || '-'}</span></td>
                <td style="white-space:nowrap;">
                  ${c.tanggalJanjiBayar ? `
                    <span class="badge ${isDueToday ? 'badge-yellow' : 'badge-teal'}" style="font-size:11.5px;padding:3px 8px;">
                      ${isDueToday ? '🚨 HARI INI: ' : '📅 '}${janjiStr}
                    </span>
                  ` : '<span style="color:var(--text-3);">-</span>'}
                </td>
                <td class="num mono font-bold" style="white-space:nowrap;">${formatRupiah(c.nominalJanji)}</td>
                <td style="white-space:nowrap;">${c.petugas?.nama || c.petugasId || '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function filterDCHarian(tindakLanjut) {
  window._dcFilterTindak = tindakLanjut;
  loadDeskCallView();
}

function toggleWeekDetail(weekNum) {
  const row = document.getElementById(`week-detail-row-${weekNum}`);
  const icon = document.getElementById(`week-icon-${weekNum}`);
  if (!row) return;
  const isHidden = row.style.display === 'none';
  row.style.display = isHidden ? 'table-row' : 'none';
  if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
}

function exportDeskCallPDF() {
  if (currentDCTab === 'bulanan' && window._currentBulananData) {
    const res = window._currentBulananData;
    const stats = res.stats || {};
    const weeklyRekap = res.weeklyRekap || [];
    const ptName = state.settings?.pt_name || 'PT BPRS Mitra Harmoni Yogyakarta';

    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      showToast('Gagal membuka jendela cetak. Izinkan pop-up di browser.', 'w');
      return;
    }

    const weeklyBlocksHtml = weeklyRekap.map(w => `
      <div style="margin-bottom:24px;border:1.5px solid #0F766E;border-radius:10px;overflow:hidden;page-break-inside:avoid;">
        <div style="background:#0F766E;color:#fff;padding:10px 14px;font-weight:800;font-size:14px;display:flex;justify-content:space-between;align-items:center;">
          <span>📅 ${w.label}</span>
          <span style="font-size:12px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:6px;">${w.totalCall} Call</span>
        </div>
        <div style="padding:14px;">
          <!-- WEEK SUMMARY METRICS -->
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;background:#F4F7F6;padding:10px;border-radius:8px;">
            <div><div style="font-size:10px;color:#666;font-weight:700;">TOTAL CALL</div><div style="font-size:15px;font-weight:800;">${w.totalCall}</div></div>
            <div><div style="font-size:10px;color:#666;font-weight:700;">TERHUBUNG</div><div style="font-size:15px;font-weight:800;color:#1A5FA8;">${w.terhubung} (${w.connectionRate}%)</div></div>
            <div><div style="font-size:10px;color:#666;font-weight:700;">JANJI BAYAR (PTP)</div><div style="font-size:15px;font-weight:800;color:#0D7A4E;">${w.ptp} (${w.ptpRate}%)</div></div>
            <div><div style="font-size:10px;color:#666;font-weight:700;">NOMINAL JANJI</div><div style="font-size:15px;font-weight:800;color:#0D7A4E;" class="mono">${formatRupiah(w.nominalJanji)}</div></div>
          </div>

          <!-- DAILY BREAKDOWN -->
          ${w.dailyBreakdown && w.dailyBreakdown.length > 0 ? `
            <div style="font-size:12px;font-weight:800;color:#0F766E;margin-bottom:6px;">📌 Rekap Harian</div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px;">
              <thead>
                <tr style="background:#E6F4F1;">
                  <th style="padding:6px;border:1px solid #DDE6E4;">Tanggal</th>
                  <th style="padding:6px;border:1px solid #DDE6E4;" class="num">Total Call</th>
                  <th style="padding:6px;border:1px solid #DDE6E4;" class="num">Terhubung</th>
                  <th style="padding:6px;border:1px solid #DDE6E4;" class="num">Janji Bayar (PTP)</th>
                  <th style="padding:6px;border:1px solid #DDE6E4;" class="num">Nominal Janji</th>
                </tr>
              </thead>
              <tbody>
                ${w.dailyBreakdown.map(d => `
                  <tr>
                    <td style="padding:5px 6px;border:1px solid #DDE6E4;" class="mono font-bold">${formatDate(d.tanggal)}</td>
                    <td style="padding:5px 6px;border:1px solid #DDE6E4;" class="num mono">${d.totalCall}</td>
                    <td style="padding:5px 6px;border:1px solid #DDE6E4;" class="num mono text-blue">${d.terhubung}</td>
                    <td style="padding:5px 6px;border:1px solid #DDE6E4;" class="num mono text-green">${d.ptp}</td>
                    <td style="padding:5px 6px;border:1px solid #DDE6E4;" class="num mono font-bold text-green">${formatRupiah(d.nominalJanji)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          <!-- FULL CALL DETAILS -->
          <div style="font-size:12px;font-weight:800;color:#0F766E;margin-bottom:6px;">📞 Detail Panggilan Debitur (${(w.calls || []).length} Panggilan)</div>
          ${w.calls && w.calls.length > 0 ? `
            <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
              <thead>
                <tr style="background:#F1F5F4;">
                  <th style="padding:5px;border:1px solid #DDE6E4;">Tgl &amp; Waktu</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;">Nama Debitur</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;">Rekening</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;">Kontak</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;">Status</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;">Tindak Lanjut</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;" class="num">Nominal Janji</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;">Catatan</th>
                  <th style="padding:5px;border:1px solid #DDE6E4;">Petugas</th>
                </tr>
              </thead>
              <tbody>
                ${w.calls.map(c => `
                  <tr>
                    <td style="padding:5px;border:1px solid #DDE6E4;" class="mono">${formatDate(c.tanggal)} ${c.waktu || ''}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;" class="font-bold">${c.namaDebitur}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;" class="mono">${c.debiturId || '-'}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;">${c.jenisKontak}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;">${c.statusKontak}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;">${c.tindakLanjut || '-'}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;" class="num mono font-bold text-green">${formatRupiah(c.nominalJanji)}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;font-size:10px;">${c.hasilKomunikasi || '-'}</td>
                    <td style="padding:5px;border:1px solid #DDE6E4;">${c.petugas?.nama || c.petugasId || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p style="font-size:11px;color:#888;">Belum ada riwayat panggilan pada minggu ini.</p>'}
        </div>
      </div>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Bulanan Desk Call per Minggu — ${res.periode || ''}</title>
        <style>
          body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 24px; color: #111; line-height: 1.5; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 2.5px solid #0F766E; padding-bottom: 12px; }
          .header h2 { margin: 0; color: #0F766E; font-size: 20px; font-weight: 800; }
          .header p { margin: 4px 0 0; font-size: 13px; color: #4A6360; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .meta { font-size: 12px; color: #555; margin-bottom: 18px; display: flex; justify-content: space-between; background: #F4F7F6; padding: 10px 14px; border-radius: 8px; border: 1px solid #DDE6E4; }
          .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 22px; }
          .stat-card { border: 1px solid #DDE6E4; background: #FFF; padding: 12px; border-radius: 10px; }
          .stat-label { font-size: 10px; color: #666; text-transform: uppercase; font-weight: bold; }
          .stat-value { font-size: 18px; font-weight: bold; color: #0F766E; margin-top: 4px; }
          .stat-sub { font-size: 10.5px; color: #888; margin-top: 2px; }
          .num { text-align: right; }
          .mono { font-family: 'JetBrains Mono', monospace; }
          .font-bold { font-weight: bold; }
          .text-green { color: #0D7A4E; }
          .text-blue { color: #1A5FA8; }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${ptName}</h2>
          <p>LAPORAN BULANAN DESK CALL PENAGIHAN PER MINGGU (${res.periode || ''})</p>
        </div>
        <div class="meta">
          <span>Dicetak Oleh: <strong>${state.user?.nama || 'Admin'} (${state.user?.posisi || 'Role'})</strong></span>
          <span>Tanggal Cetak: <strong>${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}</strong></span>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Call Bulan Ini</div>
            <div class="stat-value">${stats.totalCalls || 0}</div>
            <div class="stat-sub">Panggilan Terdaftar</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Terhubung (Contact %)</div>
            <div class="stat-value text-blue">${stats.terhubung || 0} (${stats.connectionRate || 0}%)</div>
            <div class="stat-sub">Ke Debitur</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">PTP (Janji Bayar %)</div>
            <div class="stat-value text-green">${stats.ptp || 0} (${stats.ptpRate || 0}%)</div>
            <div class="stat-sub">PTP Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Nominal Janji</div>
            <div class="stat-value mono text-green">${formatRupiah(stats.totalNominalJanji || 0)}</div>
            <div class="stat-sub">Janji Pembayaran</div>
          </div>
        </div>

        <div>
          ${weeklyBlocksHtml}
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 300);
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
    return;
  }

  // HARIAN DESK CALL EXPORT (Matching REKAP DESKCALL TGL.md format + PTP Table below)
  const res = window._currentHarianData || {};
  const calls = res.calls || [];
  const ptName = state.settings?.pt_name || 'PT BPRS MITRA HARMONI YOGYAKARTA';

  const printWindow = window.open('', '_blank', 'width=1100,height=850');
  if (!printWindow) {
    showToast('Gagal membuka jendela cetak. Izinkan pop-up di browser.', 'w');
    return;
  }

  // Separate calls into Terhubung vs Gagal Terhubung
  const terhubungList = calls.filter(c => c.statusKontak === 'Terhubung');
  const gagalList = calls.filter(c => c.statusKontak !== 'Terhubung');

  // Filter calls for Janji Bayar (PTP)
  const ptpList = calls.filter(c => c.tindakLanjut === 'Janji Bayar' || (c.nominalJanji && c.nominalJanji > 0));
  const totalNominalPTP = ptpList.reduce((sum, c) => sum + (c.nominalJanji || 0), 0);

  const tglHeaderStr = calls.length > 0 && calls[0].tanggal
    ? formatDate(calls[0].tanggal).toUpperCase()
    : new Date().toLocaleDateString('id-ID', { dateStyle: 'full' }).toUpperCase();

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>REKAP DESKCALL TGL ${tglHeaderStr}</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; font-size: 11px; color: #111; line-height: 1.4; padding: 10px; }
        .hdr { text-align: center; margin-bottom: 16px; border-bottom: 2.5px solid #0F766E; padding-bottom: 8px; }
        .hdr h2 { margin: 0; font-size: 18px; font-weight: 800; color: #0F766E; text-transform: uppercase; }
        .hdr p { margin: 3px 0 0; font-size: 12px; font-weight: 700; color: #334155; }
        .meta-bar { display: flex; justify-content: space-between; font-size: 11px; background: #F8FAFC; padding: 8px 12px; border-radius: 6px; border: 1px solid #CBD5E1; margin-bottom: 14px; }
        .sec-header { background: #0F766E; color: #fff; padding: 6px 10px; font-weight: 800; font-size: 12px; margin-top: 16px; margin-bottom: 6px; border-radius: 4px; }
        .sec-header.gagal { background: #C0392C; }
        .sec-header.ptp { background: #059669; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10.5px; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th { background: #F1F5F9; color: #0F172A; font-weight: 800; font-size: 10px; text-transform: uppercase; padding: 6px; border: 1px solid #CBD5E1; text-align: left; }
        td { padding: 5.5px 6px; border: 1px solid #CBD5E1; vertical-align: middle; }
        .num { text-align: right; }
        .text-center { text-align: center; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .font-bold { font-weight: bold; }
        .text-green { color: #059669; }
        .text-red { color: #DC2626; }
        .summary-badge { background: #F1F5F9; border: 1.5px solid #0F766E; color: #0F766E; font-weight: 800; font-size: 12px; padding: 6px 12px; border-radius: 6px; display: inline-block; margin-bottom: 14px; }
        .summary-badge.gagal { border-color: #C0392C; color: #C0392C; }
        .total-keseluruhan { background: #F8FAFC; border: 1.5px solid #334155; padding: 10px 14px; border-radius: 8px; margin: 16px 0; font-size: 12px; }
        .catatan-box { font-size: 11px; color: #475569; margin-top: 6px; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      <div class="hdr">
        <h2>${ptName}</h2>
        <p>REKAP HASIL PENAGIHAN DESK CALL — TANGGAL ${tglHeaderStr}</p>
      </div>

      <div class="meta-bar">
        <span>Petugas Cetak: <strong>${state.user?.nama || 'Admin'} (${state.user?.posisi || 'Staff'})</strong></span>
        <span>Tanggal Cetak: <strong>${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}</strong></span>
      </div>

      <!-- TABEL 1: NASABAH BERHASIL TERHUBUNG -->
      <div class="sec-header">NASABAH BERHASIL TERHUBUNG — TANGGAL ${tglHeaderStr}</div>
      <table>
        <thead>
          <tr>
            <th style="width:110px;">No Rekening</th>
            <th>Nama Debitur</th>
            <th style="width:95px;">No Telefon</th>
            <th style="width:110px;">Keterangan</th>
            <th style="width:50px;text-align:center;">Tgl Jt</th>
            <th>Catatan Hasil Call</th>
            <th style="width:75px;">Tgl Entry</th>
            <th class="num" style="width:45px;">Tgk</th>
            <th class="num" style="width:35px;">KOL</th>
            <th style="width:80px;">AO</th>
          </tr>
        </thead>
        <tbody>
          ${terhubungList.length === 0 ? '<tr><td colspan="10" class="text-center">Tidak ada data nasabah berhasil terhubung.</td></tr>' : terhubungList.map(c => `
            <tr>
              <td class="mono font-bold">${c.debiturId || '-'}</td>
              <td class="font-bold">${c.namaDebitur || '-'}</td>
              <td class="mono">${c.debitur?.telepon || c.noHp || '-'}</td>
              <td>${c.jenisKontak || 'Aktif'}</td>
              <td class="text-center">${c.debitur?.tglJt || '-'}</td>
              <td>${c.hasilKomunikasi || c.tindakLanjut || '-'}</td>
              <td class="mono">${formatDate(c.tanggal)}</td>
              <td class="num mono">${c.debitur?.totalTunggakan != null ? c.debitur.totalTunggakan : '1'}</td>
              <td class="num mono font-bold">${c.kol || c.debitur?.kol || '1'}</td>
              <td>${c.debitur?.ao || c.petugas?.nama || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="summary-badge">TOTAL TERHUBUNG = ${terhubungList.length}</div>

      <!-- TABEL 2: NASABAH GAGAL TERHUBUNG -->
      <div class="sec-header gagal">NASABAH GAGAL TERHUBUNG — TANGGAL ${tglHeaderStr}</div>
      <table>
        <thead>
          <tr>
            <th style="width:110px;">No Rekening</th>
            <th>Nama Debitur</th>
            <th style="width:95px;">No Telefon</th>
            <th style="width:110px;">Keterangan</th>
            <th style="width:50px;text-align:center;">Tgl Jt</th>
            <th>Catatan Hasil Call</th>
            <th style="width:75px;">Tgl Entry</th>
            <th class="num" style="width:45px;">Tgk</th>
            <th class="num" style="width:35px;">KOL</th>
            <th style="width:80px;">AO</th>
          </tr>
        </thead>
        <tbody>
          ${gagalList.length === 0 ? '<tr><td colspan="10" class="text-center">Tidak ada data nasabah gagal terhubung.</td></tr>' : gagalList.map(c => `
            <tr>
              <td class="mono font-bold">${c.debiturId || '-'}</td>
              <td class="font-bold">${c.namaDebitur || '-'}</td>
              <td class="mono">${c.debitur?.telepon || c.noHp || '-'}</td>
              <td>${c.statusKontak || 'Tidak Menjawab'}</td>
              <td class="text-center">${c.debitur?.tglJt || '-'}</td>
              <td>${c.hasilKomunikasi || 'Nomor aktif tidak responsif'}</td>
              <td class="mono">${formatDate(c.tanggal)}</td>
              <td class="num mono">${c.debitur?.totalTunggakan != null ? c.debitur.totalTunggakan : '1'}</td>
              <td class="num mono font-bold">${c.kol || c.debitur?.kol || '1'}</td>
              <td>${c.debitur?.ao || c.petugas?.nama || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="summary-badge gagal">TOTAL GAGAL TERHUBUNG = ${gagalList.length}</div>

      <div class="total-keseluruhan">
        <div style="font-weight:800;font-size:13px;color:#0F172A;">TOTAL KESELURUHAN = ${calls.length}</div>
        <div class="catatan-box">
          <strong>CATATAN =</strong> Nasabah yang gagal di telepon <strong>Nomor Aktif</strong> rata-rata di telepon 3-6x dan di Follow up melalui WhatsApp belum ada respon.
        </div>
      </div>

      <!-- TABEL 3: KLASIFIKASI DEBITUR JANJI BAYAR (PTP) -->
      <div class="sec-header ptp">KLASIFIKASI NASABAH JANJI BAYAR (PTP - PROMISE TO PAY)</div>
      <table>
        <thead>
          <tr style="background:#ECFDF5;color:#065F46;">
            <th style="width:35px;text-align:center;">No.</th>
            <th style="width:110px;">No. Rekening</th>
            <th>Nama Debitur</th>
            <th style="width:95px;">No. Telefon</th>
            <th style="width:110px;">Tgl Janji Bayar</th>
            <th class="num" style="width:130px;">Nominal Janji (Rp)</th>
            <th>Catatan / Rencana Pembayaran</th>
            <th style="width:90px;">AO</th>
          </tr>
        </thead>
        <tbody>
          ${ptpList.length === 0 ? '<tr><td colspan="8" class="text-center">Belum ada klasifikasi janji bayar (PTP) pada periode ini.</td></tr>' : ptpList.map((c, idx) => `
            <tr>
              <td class="text-center font-bold">${idx + 1}</td>
              <td class="mono font-bold">${c.debiturId || '-'}</td>
              <td class="font-bold">${c.namaDebitur || '-'}</td>
              <td class="mono">${c.debitur?.telepon || c.noHp || '-'}</td>
              <td class="mono font-bold text-green">${c.tanggalJanjiBayar ? formatDate(c.tanggalJanjiBayar) : '-'}</td>
              <td class="num mono font-bold text-green">${formatRupiah(c.nominalJanji || 0)}</td>
              <td>${c.hasilKomunikasi || c.tindakLanjut || '-'}</td>
              <td>${c.debitur?.ao || c.petugas?.nama || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#F0FDF4;font-weight:bold;">
            <td colspan="4" style="text-align:right;padding:8px 10px;">TOTAL NOMINAL JANJI BAYAR:</td>
            <td colspan="2" class="num mono text-green font-bold" style="font-size:12px;padding:8px 10px;">${formatRupiah(totalNominalPTP)}</td>
            <td colspan="2" style="font-size:11px;color:#047857;padding:8px 10px;">(${ptpList.length} Debitur Berjanji)</td>
          </tr>
        </tfoot>
      </table>

      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); }, 300);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

async function viewDCDetail(id) {
  const body = document.getElementById('dcd-body');
  const title = document.getElementById('dcd-title');
  if (!body) return;

  body.innerHTML = `<div class="empty-st"><p>Memuat detail Desk Call...</p></div>`;
  openModal('modal-dc-detail');

  try {
    const c = await apiCall(`/deskcall/${id}`);
    if (title) title.innerText = `Detail Desk Call — ${c.namaDebitur}`;

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text);">${c.namaDebitur}</div>
          <div class="mono" style="font-size:12px;color:var(--text-3);margin-top:2px;">Rek: ${c.debiturId}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span class="badge ${c.statusKontak === 'Terhubung' ? 'badge-green' : 'badge-yellow'}">${c.statusKontak}</span>
          <span class="badge badge-teal">${c.jenisKontak}</span>
          <span class="badge badge-purple">Prioritas ${c.prioritas}</span>
        </div>
      </div>

      <div class="m-card-grid mb-4" style="grid-template-columns:1fr 1fr;">
        <div><div class="m-field-label">Tanggal &amp; Waktu</div><div class="m-field-value mono font-bold">${formatDate(c.tanggal)} ${c.waktu || ''}</div></div>
        <div><div class="m-field-label">Petugas Desk Call</div><div class="m-field-value font-bold">${c.petugas?.nama || c.petugasId || '-'}</div></div>
        <div><div class="m-field-label">KOL saat Call</div><div class="m-field-value"><span class="badge ${getKolBadgeClass(c.kol)}">${c.kol}</span></div></div>
        <div><div class="m-field-label">Baki Debet saat Call</div><div class="m-field-value mono">${formatRupiah(c.bakiDebet)}</div></div>
        <div><div class="m-field-label">Tindak Lanjut</div><div class="m-field-value font-bold">${c.tindakLanjut || '-'}</div></div>
        <div><div class="m-field-label">Nominal Janji Bayar</div><div class="m-field-value mono text-green font-bold">${formatRupiah(c.nominalJanji)}</div></div>
        <div><div class="m-field-label">Tanggal Janji Bayar</div><div class="m-field-value">${formatDate(c.tanggalJanjiBayar)}</div></div>
        <div><div class="m-field-label">Waktu Pencatatan</div><div class="m-field-value mono">${formatDate(c.createdAt)}</div></div>
      </div>

      <div class="divider"></div>

      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--brand);margin-bottom:8px;">Hasil Komunikasi &amp; Catatan</div>
      <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:10px;font-size:13px;line-height:1.6;color:var(--text);margin-bottom:16px;">
        ${c.hasilKomunikasi || '<span style="color:var(--text-3);">Tidak ada catatan tambahan.</span>'}
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">
        <button class="btn btn-outline btn-sm" onclick="closeModal('modal-dc-detail');viewDebiturDetail('${c.debiturId}')">👤 Buka Profile Debitur</button>
        <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-dc-detail')">Tutup</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-st"><p>Gagal memuat detail Desk Call: ${err.message}</p></div>`;
  }
}

// 4. P3 (PENAGIHAN LAPANGAN) VIEW & STATE
let p3State = {
  selectedDate: '', // YYYY-MM-DD
  prioritas: 'Semua', // Semua, Kritis, Tinggi, Sedang, Rendah
  status: 'Semua', // Semua, Terjadwal, Dalam Proses, Selesai, Lewat Jatuh Tempo, Batal
  q: '',
  petugasId: ''
};

async function loadP3View() {
  const container = document.getElementById('p3-content');
  if (!container) return;

  container.innerHTML = `<div class="empty-st"><p>Memuat jadwal penagihan P3...</p></div>`;

  try {
    // Build query string
    const queryParams = new URLSearchParams();
    if (p3State.selectedDate) queryParams.append('tanggal', p3State.selectedDate);
    if (p3State.prioritas && p3State.prioritas !== 'Semua') queryParams.append('prioritas', p3State.prioritas);
    if (p3State.status && p3State.status !== 'Semua') queryParams.append('status', p3State.status);
    if (p3State.petugasId) queryParams.append('petugasId', p3State.petugasId);
    if (p3State.q) queryParams.append('q', p3State.q);

    const [p3Res, calRes, petugasList] = await Promise.all([
      apiCall(`/p3/jadwal?${queryParams.toString()}`),
      apiCall('/p3/calendar'),
      apiCall('/p3/petugas').catch(() => [])
    ]);

    const schedules = Array.isArray(p3Res) ? p3Res : (p3Res?.jadwals || []);
    const stats = p3Res?.stats || {
      totalJadwal: schedules.length,
      selesai: schedules.filter(s => s.status === 'Selesai').length,
      dalamProses: schedules.filter(s => s.status === 'Dalam Proses').length,
      lewatJatuhTempo: schedules.filter(s => s.status === 'Lewat Jatuh Tempo').length
    };

    const calItems = Array.isArray(calRes) ? calRes : [];

    // Prioritas badge helper
    const getPrioBadgeClass = (prio) => {
      if (prio === 'Kritis') return 'badge-red';
      if (prio === 'Tinggi') return 'badge-yellow';
      if (prio === 'Sedang') return 'badge-teal';
      return 'badge-gray';
    };

    // Status badge helper
    const getStatusBadgeClass = (stat) => {
      if (stat === 'Selesai') return 'badge-green';
      if (stat === 'Dalam Proses') return 'badge-teal';
      if (stat === 'Lewat Jatuh Tempo') return 'badge-red';
      if (stat === 'Batal') return 'badge-gray';
      return 'badge-yellow';
    };

    container.innerHTML = `
      <!-- 4 STAT CARDS -->
      <div class="stats-grid mb-4">
        <div class="stat-card">
          <div class="stat-label">Total Jadwal</div>
          <div class="stat-num">${stats.totalJadwal || 0}</div>
          <div class="stat-sub">Jadwal Penagihan P3</div>
        </div>
        <div class="stat-card success">
          <div class="stat-label">Selesai</div>
          <div class="stat-num text-success">${stats.selesai || 0}</div>
          <div class="stat-sub">Penagihan Berhasil</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">Dalam Proses</div>
          <div class="stat-num text-blue">${stats.dalamProses || 0}</div>
          <div class="stat-sub">Sedang Ditindaklanjuti</div>
        </div>
        <div class="stat-card ${stats.lewatJatuhTempo > 0 ? 'dang' : ''}">
          <div class="stat-label">Lewat Jatuh Tempo</div>
          <div class="stat-num" style="color:var(--danger);">${stats.lewatJatuhTempo || 0}</div>
          <div class="stat-sub">Jadwal Tertunda</div>
        </div>
      </div>

      <!-- 14-DAY CALENDAR STRIP -->
      <div class="p3-cal-strip-box">
        <div style="font-size:12.5px;font-weight:800;color:var(--brand);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span>📅 CALENDAR STRIP AGENDA PENAGIHAN (14 HARI)</span>
          </div>
          ${p3State.selectedDate ? `
            <button class="btn btn-ghost btn-sm" onclick="selectP3CalDate('')" style="font-size:11.5px;padding:3px 10px;">✕ Reset Filter Tanggal (${formatDate(p3State.selectedDate)})</button>
          ` : '<span style="font-size:11.5px;color:var(--text-3);font-weight:600;">Klik tanggal untuk menyaring agenda penagihan</span>'}
        </div>
        <div style="display:flex;gap:10px;overflow-x:auto;padding:4px 2px 10px 2px;scrollbar-width:thin;">
          ${calItems.length === 0 ? '<div style="font-size:12px;color:var(--text-3);">Memuat tanggal...</div>' : calItems.map(c => {
            const dateObj = new Date(c.date + 'T00:00:00');
            const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const monthName = dateObj.toLocaleDateString('id-ID', { month: 'short' });
            const isSelected = p3State.selectedDate === c.date;
            const isTodayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === c.date;

            return `
              <div class="p3-cal-item ${isSelected ? 'active' : ''} ${isTodayDate ? 'is-today' : ''}" onclick="selectP3CalDate('${c.date}')">
                <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:${isSelected ? 'var(--brand)' : 'var(--text-3)'};">${dayName}</div>
                <div style="font-size:17px;font-weight:800;color:${isSelected ? 'var(--brand)' : 'var(--text)'};margin:3px 0;">${dayNum}</div>
                <div style="font-size:10px;color:var(--text-3);font-weight:600;">${monthName}</div>
                ${c.count > 0 ? `
                  <div class="p3-cal-count-badge">${c.count}</div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- STRUCTURED TOOLBAR BOX -->
      <div class="p3-toolbar-box">
        <!-- TOP HEADER ROW -->
        <div class="p3-toolbar-top">
          <div>
            <div style="font-size:15px;font-weight:800;color:var(--text);">📋 Agenda &amp; Jadwal Penagihan Lapangan</div>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px;">Kelola kunjungan tim P3, target penagihan, dan dokumentasi foto lapangan</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <div class="search-box-group" style="width:280px;">
              <svg class="search-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="p3-search-input" type="text" placeholder="Cari nama / rek / no..." value="${p3State.q}" onkeydown="if(event.key==='Enter') executeP3Search()"/>
              <button class="search-box-btn" type="button" onclick="executeP3Search()">
                <span class="material-symbols-outlined" style="font-size:15px;">search</span>
                <span>Cari</span>
              </button>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openP3Form()" style="padding:8px 14px;">
              Buat Jadwal P3 Baru
            </button>
          </div>
        </div>

        <!-- BOTTOM FILTER BAR -->
        <div class="p3-toolbar-bottom">
          <!-- PRIORITY PILLS -->
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:11.5px;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-right:4px;">Prioritas:</span>
            ${['Semua', 'Kritis', 'Tinggi', 'Sedang', 'Rendah'].map(prio => `
              <button class="filter-pill ${p3State.prioritas === prio ? 'active' : ''}" onclick="filterP3Prioritas('${prio}')">${prio}</button>
            `).join('')}
          </div>

          <!-- STATUS & PETUGAS DROPDOWNS -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select class="form-select" style="width:auto;font-size:12.5px;padding:6px 14px;border-radius:9999px;" onchange="filterP3Status(this.value)">
              <option value="Semua"${p3State.status === 'Semua' ? ' selected' : ''}>Semua Status</option>
              <option value="Terjadwal"${p3State.status === 'Terjadwal' ? ' selected' : ''}>Terjadwal</option>
              <option value="Dalam Proses"${p3State.status === 'Dalam Proses' ? ' selected' : ''}>Dalam Proses</option>
              <option value="Selesai"${p3State.status === 'Selesai' ? ' selected' : ''}>Selesai</option>
              <option value="Lewat Jatuh Tempo"${p3State.status === 'Lewat Jatuh Tempo' ? ' selected' : ''}>Lewat Jatuh Tempo</option>
              <option value="Batal"${p3State.status === 'Batal' ? ' selected' : ''}>Batal</option>
            </select>

            ${['admin', 'kabid_p3'].includes(state.user?.posisi) && Array.isArray(petugasList) && petugasList.length > 0 ? `
              <select class="form-select" style="width:auto;font-size:12.5px;padding:6px 14px;border-radius:9999px;" onchange="filterP3Petugas(this.value)">
                <option value="">Semua Petugas P3</option>
                ${petugasList.map(u => `<option value="${u.id}"${p3State.petugasId === u.id ? ' selected' : ''}>${u.nama}</option>`).join('')}
              </select>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- SCHEDULE TABLE WITH SPACIOUS STRUCTURED COLUMNS -->
      <div class="tbl-wrap">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="tbl-hint">← Geser tabel ke samping untuk melihat detail →</div>
          ${schedules.length > 0 ? `<div style="font-size:11.5px;color:var(--text-3);font-weight:600;">Menampilkan <strong>${schedules.length}</strong> agenda penagihan</div>` : ''}
        </div>
        <table class="tbl" style="min-width:920px;">
          <thead>
            <tr>
              <th style="white-space:nowrap;padding:12px 14px;">No. Jadwal &amp; Waktu</th>
              <th style="white-space:nowrap;padding:12px 14px;">Nama Debitur &amp; Lokasi</th>
              <th style="white-space:nowrap;padding:12px 14px;">Prioritas</th>
              <th style="white-space:nowrap;padding:12px 14px;">Status &amp; KOL</th>
              <th class="num" style="white-space:nowrap;padding:12px 14px;">Target &amp; Baki Debet</th>
              <th class="num" style="white-space:nowrap;padding:12px 14px;">Realisasi</th>
              <th style="white-space:nowrap;padding:12px 14px;">Petugas P3</th>
              <th style="white-space:nowrap;text-align:center;padding:12px 14px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${schedules.length === 0 ? '<tr><td colspan="8" class="empty-st">Belum ada jadwal penagihan P3 untuk kriteria ini</td></tr>' : schedules.map(s => {
              const photoCount = s.fotos?.length || 0;
              return `
                <tr style="cursor:pointer;" onclick="viewP3Detail('${s.id}')">
                  <td style="white-space:nowrap;padding:12px 14px;">
                    <div class="mono font-bold" style="color:var(--brand);font-size:13px;">${s.nomorJadwal}</div>
                    <div class="mono" style="font-size:11px;color:var(--text-2);margin-top:2px;">📅 ${formatDate(s.tanggal)} &middot; ${s.waktuMulai || ''}</div>
                  </td>
                  <td class="tbl-name" style="white-space:nowrap;padding:12px 14px;">
                    <div style="font-size:13.5px;font-weight:700;">${s.namaDebitur}</div>
                    <div class="mono" style="font-size:11px;color:var(--text-3);margin-top:2px;">Rek: ${s.debiturId} &middot; 📍 ${s.area || '-'}</div>
                  </td>
                  <td style="white-space:nowrap;padding:12px 14px;">
                    <span class="badge ${getPrioBadgeClass(s.prioritas)}" style="font-size:11px;padding:4px 9px;">${s.prioritas}</span>
                  </td>
                  <td style="white-space:nowrap;padding:12px 14px;">
                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;">
                      <span class="badge ${getStatusBadgeClass(s.status)}" style="font-size:11px;padding:3px 8px;">${s.status}</span>
                      <span class="badge ${getKolBadgeClass(s.kol)}" style="font-size:10.5px;padding:2px 7px;">${s.kol}</span>
                    </div>
                  </td>
                  <td class="num" style="white-space:nowrap;padding:12px 14px;">
                    <div class="mono font-bold" style="font-size:13px;">${formatRupiah(s.targetTagih)}</div>
                    <div class="mono" style="font-size:11px;color:var(--text-3);margin-top:2px;">Baki: ${formatRupiah(s.bakiDebet)}</div>
                  </td>
                  <td class="num mono font-bold text-green" style="white-space:nowrap;padding:12px 14px;font-size:13px;">
                    ${s.nominalRealisasi ? formatRupiah(s.nominalRealisasi) : '<span style="color:var(--text-3);font-weight:normal;">-</span>'}
                  </td>
                  <td style="white-space:nowrap;padding:12px 14px;font-size:12.5px;font-weight:600;">
                    ${s.petugas?.nama || s.petugasId || '-'}
                  </td>
                  <td style="white-space:nowrap;text-align:center;padding:12px 14px;" onclick="event.stopPropagation()">
                    <div style="display:flex;gap:6px;justify-content:center;">
                      <button class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:11.5px;" onclick="viewP3Detail('${s.id}')">👁️ Detail</button>
                      <button class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:11.5px;" onclick="viewP3Detail('${s.id}')">📷 Foto (${photoCount})</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat P3: ${err.message}</p></div>`;
  }
}

// P3 FILTER HELPERS
function selectP3CalDate(dateStr) {
  p3State.selectedDate = dateStr;
  loadP3View();
}

function filterP3Prioritas(prio) {
  p3State.prioritas = prio;
  loadP3View();
}

function filterP3Status(stat) {
  p3State.status = stat;
  loadP3View();
}

function filterP3Petugas(pId) {
  p3State.petugasId = pId;
  loadP3View();
}

function executeP3Search() {
  const input = document.getElementById('p3-search-input');
  if (input) {
    p3State.q = input.value.trim();
    loadP3View();
  }
}

// P3 DETAIL & VISIT RESULT & PHOTO UPLOAD HANDLERS
async function viewP3Detail(id) {
  const body = document.getElementById('p3d-body');
  const title = document.getElementById('p3d-title');
  if (!body) return;

  body.innerHTML = `<div class="empty-st"><p>Memuat detail penagihan P3...</p></div>`;
  openModal('modal-p3-detail');

  try {
    const s = await apiCall(`/p3/jadwal/${id}`);
    if (title) title.innerText = `Detail Jadwal P3 — ${s.nomorJadwal}`;

    const getPrioBadgeClass = (prio) => {
      if (prio === 'Kritis') return 'badge-red';
      if (prio === 'Tinggi') return 'badge-yellow';
      if (prio === 'Sedang') return 'badge-teal';
      return 'badge-gray';
    };

    const getStatusBadgeClass = (stat) => {
      if (stat === 'Selesai') return 'badge-green';
      if (stat === 'Dalam Proses') return 'badge-teal';
      if (stat === 'Lewat Jatuh Tempo') return 'badge-red';
      if (stat === 'Batal') return 'badge-gray';
      return 'badge-yellow';
    };

    const photos = s.fotos || [];

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text);">${s.namaDebitur}</div>
          <div class="mono" style="font-size:12px;color:var(--text-3);margin-top:2px;">Rek: ${s.debiturId} &middot; No. Jadwal: ${s.nomorJadwal}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span class="badge ${getStatusBadgeClass(s.status)}">${s.status}</span>
          <span class="badge ${getPrioBadgeClass(s.prioritas)}">Prioritas ${s.prioritas}</span>
          <span class="badge ${getKolBadgeClass(s.kol)}">${s.kol}</span>
        </div>
      </div>

      <div class="m-card-grid mb-4" style="grid-template-columns:1fr 1fr;">
        <div><div class="m-field-label">Tanggal &amp; Waktu</div><div class="m-field-value mono font-bold">${formatDate(s.tanggal)} ${s.waktuMulai || ''}</div></div>
        <div><div class="m-field-label">Petugas Penanggung Jawab</div><div class="m-field-value font-bold">${s.petugas?.nama || s.petugasId || '-'}</div></div>
        <div><div class="m-field-label">Area / Kota</div><div class="m-field-value">${s.area || '-'}</div></div>
        <div><div class="m-field-label">Metode &amp; Jenis Tagih</div><div class="m-field-value font-bold">${s.jenisTagih} &middot; ${s.metode}</div></div>
        <div><div class="m-field-label">Baki Debet saat Jadwal</div><div class="m-field-value mono">${formatRupiah(s.bakiDebet)}</div></div>
        <div><div class="m-field-label">Target Tagih (Rp)</div><div class="m-field-value mono font-bold text-green">${formatRupiah(s.targetTagih)}</div></div>
        <div><div class="m-field-label">Alamat Debitur</div><div class="m-field-value">${s.alamat || '-'}</div></div>
        <div><div class="m-field-label">Waktu Dibuat</div><div class="m-field-value mono">${formatDate(s.createdAt)}</div></div>
      </div>

      <div class="divider"></div>

      <!-- FORM UPDATE HASIL KUNJUNGAN -->
      <div style="background:var(--bg-card);border:1.5px solid var(--brand-light);border-radius:12px;padding:16px;margin-bottom:18px;">
        <div style="font-weight:800;font-size:13.5px;color:var(--brand);margin-bottom:12px;display:flex;align-items:center;gap:6px;">
          <span>📝 Catat Hasil Kunjungan &amp; Update Status</span>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Status Realisasi</label>
            <select id="p3d-status" class="form-select">
              <option value="Terjadwal"${s.status === 'Terjadwal' ? ' selected' : ''}>Terjadwal</option>
              <option value="Dalam Proses"${s.status === 'Dalam Proses' ? ' selected' : ''}>Dalam Proses</option>
              <option value="Selesai"${s.status === 'Selesai' ? ' selected' : ''}>Selesai</option>
              <option value="Lewat Jatuh Tempo"${s.status === 'Lewat Jatuh Tempo' ? ' selected' : ''}>Lewat Jatuh Tempo</option>
              <option value="Batal"${s.status === 'Batal' ? ' selected' : ''}>Batal</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Nominal Realisasi (Rp)</label>
            <input id="p3d-realisasi" class="form-input mono" type="number" placeholder="0" min="0" value="${s.nominalRealisasi || ''}"/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Hasil Komunikasi &amp; Catatan Kunjungan</label>
          <textarea id="p3d-hasil" class="form-input" rows="3" placeholder="Catat hasil komitmen, negosiasi, atau kendala di lapangan...">${s.hasil || s.catatan || ''}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;">
          <button class="btn btn-primary btn-sm" onclick="saveP3VisitResult('${s.id}')">Simpan Hasil Kunjungan</button>
        </div>
      </div>

      <!-- FOTO KUNJUNGAN SECTION (DRAG & DROP + THUMBNAILS + LIGHTBOX) -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="font-weight:800;font-size:13.5px;color:var(--brand);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;">
          <span>📷 Foto Bukti Kunjungan Lapangan (${photos.length}/5 Foto)</span>
          <span style="font-size:11px;color:var(--text-3);">Maksimal 5 foto per kunjungan</span>
        </div>

        ${photos.length < 5 ? `
          <div class="import-zone mb-3" style="padding:16px;border-dash:2px dashed var(--brand);"
               onclick="document.getElementById('p3-photo-file-input').click()"
               ondragover="event.preventDefault();this.classList.add('drag-over')"
               ondragleave="this.classList.remove('drag-over')"
               ondrop="event.preventDefault();this.classList.remove('drag-over');uploadP3PhotosFromDrop('${s.id}', event.dataTransfer.files)">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="margin:0 auto 6px;color:var(--brand);"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            <p style="font-size:12.5px;font-weight:700;color:var(--brand);margin:0;">Pilih / Ambil Foto Kunjungan Baru</p>
            <p style="font-size:11px;color:var(--text-3);margin-top:2px;">Drag &amp; drop atau klik untuk menggunakan Kamera HP / Galeri · Format PNG/JPG/WebP · Maks 8MB</p>
          </div>
          <input type="file" id="p3-photo-file-input" accept="image/*" capture="environment" multiple style="display:none;" onchange="uploadP3PhotosFromDrop('${s.id}', this.files)"/>
        ` : '<div style="font-size:11.5px;color:var(--text-3);margin-bottom:10px;">⚠️ Jumlah foto sudah mencapai batas maksimum (5 foto). Hapus foto lama jika ingin mengganti.</div>'}

        <!-- THUMBNAIL GRID -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(110px, 1fr));gap:10px;margin-top:10px;">
          ${photos.length === 0 ? '<div style="font-size:12px;color:var(--text-3);grid-column:1/-1;">Belum ada foto kunjungan yang diunggah.</div>' : photos.map((f, idx) => `
            <div style="position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--border);background:#000;aspect-ratio:1/1;">
              <img src="${f.filePath}" alt="Foto ${idx+1}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" onclick="openLightbox('${f.filePath}', 'Foto Kunjungan P3 — ${s.nomorJadwal}')"/>
              <button onclick="deleteP3Photo('${s.id}', '${f.id}')" title="Hapus Foto" style="position:absolute;top:4px;right:4px;background:rgba(217,45,32,0.85);color:#fff;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">
        <button class="btn btn-outline btn-sm" onclick="closeModal('modal-p3-detail');viewDebiturDetail('${s.debiturId}')">👤 Buka Profile Debitur</button>
        <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-p3-detail')">Tutup</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-st"><p>Gagal memuat detail P3: ${err.message}</p></div>`;
  }
}

async function saveP3VisitResult(id) {
  const status = document.getElementById('p3d-status')?.value;
  const nominalRealisasi = document.getElementById('p3d-realisasi')?.value;
  const hasil = document.getElementById('p3d-hasil')?.value;

  try {
    showToast('Menyimpan hasil kunjungan...', 'i');
    await apiCall(`/p3/jadwal/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        status,
        nominalRealisasi: nominalRealisasi ? parseFloat(nominalRealisasi) : 0,
        hasil
      })
    });
    showToast('Hasil kunjungan P3 berhasil diperbarui', 's');
    viewP3Detail(id);
    loadP3View();
  } catch (err) {
    showToast(`Gagal memperbarui hasil: ${err.message}`, 'e');
  }
}

async function uploadP3PhotosFromDrop(jadwalId, files) {
  if (!files || files.length === 0) return;
  const fd = new FormData();
  for (let i = 0; i < files.length; i++) {
    fd.append('files', files[i]);
  }

  try {
    showToast('Mengunggah & mengompres foto kunjungan...', 'i');
    const res = await apiCall(`/p3/jadwal/${jadwalId}/foto`, {
      method: 'POST',
      body: fd
    });
    showToast(res.message || 'Foto berhasil diunggah', 's');
    viewP3Detail(jadwalId);
    loadP3View();
  } catch (err) {
    showToast(`Gagal mengunggah foto: ${err.message}`, 'e');
  }
}

async function deleteP3Photo(jadwalId, fotoId) {
  if (!confirm('Apakah Anda yakin ingin menghapus foto kunjungan ini?')) return;

  try {
    showToast('Menghapus foto...', 'i');
    await apiCall(`/p3/jadwal/${jadwalId}/foto/${fotoId}`, {
      method: 'DELETE'
    });
    showToast('Foto berhasil dihapus', 's');
    viewP3Detail(jadwalId);
    loadP3View();
  } catch (err) {
    showToast(`Gagal menghapus foto: ${err.message}`, 'e');
  }
}

// P3 JADWAL FORM HANDLERS
let selectedP3DebiturId = '';
let p3AcDebounce = null;

async function openP3Form(debiturId) {
  selectedP3DebiturId = debiturId || '';
  const p3fDeb = document.getElementById('p3f-debitur');
  const p3fTanggal = document.getElementById('p3f-tanggal');
  const p3fWaktu = document.getElementById('p3f-waktu');
  const p3fPetugas = document.getElementById('p3f-petugas');
  const p3fPrioritas = document.getElementById('p3f-prioritas');
  const p3fArea = document.getElementById('p3f-area');
  const p3fJenis = document.getElementById('p3f-jenis');
  const p3fMetode = document.getElementById('p3f-metode');
  const p3fTarget = document.getElementById('p3f-target');
  const p3fCatatan = document.getElementById('p3f-catatan');
  const p3fAc = document.getElementById('p3f-ac');

  if (p3fAc) p3fAc.style.display = 'none';

  // Set defaults
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  if (p3fTanggal) p3fTanggal.value = `${year}-${month}-${day}`;
  if (p3fWaktu) p3fWaktu.value = `${hours}:${mins}`;
  if (p3fPrioritas) p3fPrioritas.value = 'Sedang';
  if (p3fJenis) p3fJenis.value = 'Penagihan Tunggakan';
  if (p3fMetode) p3fMetode.value = 'Kunjungan Langsung';
  if (p3fTarget) p3fTarget.value = '';
  if (p3fCatatan) p3fCatatan.value = '';
  if (p3fArea) p3fArea.value = '';

  // Load petugas dropdown
  if (p3fPetugas) {
    p3fPetugas.innerHTML = '<option value="">— Memuat petugas... —</option>';
    try {
      const petugasList = await apiCall('/p3/petugas');
      const list = Array.isArray(petugasList) ? petugasList : [];
      if (list.length === 0) {
        p3fPetugas.innerHTML = '<option value="">— Tidak ada petugas tersedia —</option>';
      } else {
        p3fPetugas.innerHTML = list.map(u =>
          `<option value="${u.id}"${u.id === state.user?.id ? ' selected' : ''}>${u.nama} (${u.posisi})</option>`
        ).join('');
      }
    } catch (err) {
      p3fPetugas.innerHTML = `<option value="${state.user?.id || ''}">${state.user?.nama || 'Petugas'}</option>`;
    }
  }

  // Pre-fill debitur if given
  if (debiturId) {
    try {
      const d = await apiCall(`/debitur/${debiturId}`);
      if (p3fDeb) p3fDeb.value = `${d.nama} (${d.id})`;
      if (p3fArea) p3fArea.value = d.kota || '';
      if (p3fTarget) p3fTarget.value = d.totalTunggakan || '';
    } catch (err) {
      if (p3fDeb) p3fDeb.value = debiturId;
    }
  } else {
    if (p3fDeb) p3fDeb.value = '';
  }

  openModal('modal-p3-form');
}

function p3Autocomplete(val) {
  const ac = document.getElementById('p3f-ac');
  if (!ac) return;
  if (!val || val.length < 2) {
    ac.style.display = 'none';
    return;
  }

  if (p3AcDebounce) clearTimeout(p3AcDebounce);
  p3AcDebounce = setTimeout(async () => {
    try {
      const res = await apiCall(`/debitur?q=${encodeURIComponent(val)}&limit=6`);
      const list = res.debiturs || [];
      if (list.length === 0) {
        ac.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:var(--text-3);">Tidak ada debitur ditemukan</div>`;
      } else {
        ac.innerHTML = list.map(d => `
          <div style="padding:8px 12px;font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--border);"
               onmouseover="this.style.background='var(--bg-hover)'"
               onmouseout="this.style.background='none'"
               onclick="selectP3Debitur('${d.id}', '${d.nama.replace(/'/g, "\\'")}', '${(d.kota || '').replace(/'/g, "\\'")}', ${d.totalTunggakan || 0})">
            <div style="font-weight:700;">${d.nama}</div>
            <div class="mono" style="font-size:11px;color:var(--text-3);">${d.id} &middot; ${d.kota || '-'} &middot; Tunggakan: ${formatRupiah(d.totalTunggakan)}</div>
          </div>
        `).join('');
      }
      ac.style.display = 'block';
    } catch (err) {}
  }, 250);
}

function selectP3Debitur(id, nama, kota, totalTunggakan) {
  selectedP3DebiturId = id;
  const p3fDeb = document.getElementById('p3f-debitur');
  const p3fArea = document.getElementById('p3f-area');
  const p3fTarget = document.getElementById('p3f-target');
  const ac = document.getElementById('p3f-ac');
  if (p3fDeb) p3fDeb.value = `${nama} (${id})`;
  if (p3fArea && kota) p3fArea.value = kota;
  if (p3fTarget && totalTunggakan) p3fTarget.value = totalTunggakan;
  if (ac) ac.style.display = 'none';
}

async function saveP3Form() {
  const p3fDeb = document.getElementById('p3f-debitur')?.value || '';
  const p3fTanggal = document.getElementById('p3f-tanggal')?.value || '';
  const p3fWaktu = document.getElementById('p3f-waktu')?.value || '';
  const p3fPetugas = document.getElementById('p3f-petugas')?.value || '';
  const p3fPrioritas = document.getElementById('p3f-prioritas')?.value || 'Sedang';
  const p3fArea = document.getElementById('p3f-area')?.value || '';
  const p3fJenis = document.getElementById('p3f-jenis')?.value || 'Penagihan Tunggakan';
  const p3fMetode = document.getElementById('p3f-metode')?.value || 'Kunjungan Langsung';
  const p3fTarget = document.getElementById('p3f-target')?.value || '';
  const p3fCatatan = document.getElementById('p3f-catatan')?.value || '';

  let debiturId = selectedP3DebiturId;
  if (!debiturId && p3fDeb.includes('(') && p3fDeb.includes(')')) {
    const matches = p3fDeb.match(/\(([^)]+)\)/);
    if (matches && matches[1]) debiturId = matches[1].trim();
  }

  // Smart fallback: search by name or ID
  if (!debiturId && p3fDeb.trim()) {
    try {
      const qRes = await apiCall(`/debitur?q=${encodeURIComponent(p3fDeb.trim())}&limit=1`);
      if (qRes.debiturs && qRes.debiturs.length > 0) {
        debiturId = qRes.debiturs[0].id;
      }
    } catch (e) {}
  }

  if (!debiturId) {
    showToast('Debitur tidak ditemukan. Pilih dari daftar autocomplete.', 'w');
    return;
  }

  if (!p3fTanggal) {
    showToast('Tanggal jadwal wajib diisi', 'w');
    return;
  }

  if (!p3fWaktu) {
    showToast('Waktu mulai wajib diisi', 'w');
    return;
  }

  if (!p3fPetugas) {
    showToast('Petugas wajib dipilih', 'w');
    return;
  }

  if (!p3fTarget || parseFloat(p3fTarget) <= 0) {
    showToast('Target Tagih harus lebih dari 0', 'w');
    return;
  }

  const payload = {
    debiturId,
    tanggal: p3fTanggal,
    waktuMulai: p3fWaktu,
    petugasId: p3fPetugas,
    area: p3fArea,
    prioritas: p3fPrioritas,
    jenisTagih: p3fJenis,
    metode: p3fMetode,
    targetTagih: parseFloat(p3fTarget),
    catatan: p3fCatatan
  };

  try {
    showToast('Menyimpan jadwal penagihan...', 'i');
    await apiCall('/p3/jadwal', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Jadwal penagihan berhasil dibuat', 's');
    closeModal('modal-p3-form');
    if (typeof loadP3View === 'function') loadP3View();
  } catch (err) {
    showToast(`Gagal menyimpan jadwal: ${err.message}`, 'e');
  }
}

// 5. LEGAL VIEW
let legalState = {
  berkas: [],
  filterStatus: 'Semua',
  searchQuery: '',
  openCardId: null
};

async function loadLegalView() {
  const container = document.getElementById('legal-content');
  if (!container) return;

  container.innerHTML = `<div class="empty-st"><p>Memuat berkas legal...</p></div>`;

  try {
    const res = await apiCall('/legal/berkas');
    legalState.berkas = Array.isArray(res) ? res : (res?.berkas || []);
    renderLegalView();
  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat berkas legal: ${err.message}</p></div>`;
  }
}

function renderLegalView() {
  const container = document.getElementById('legal-content');
  if (!container) return;

  const berkas = legalState.berkas;
  
  // Calculate summary counts
  const totalCount = berkas.length;
  const lengkapCount = berkas.filter(b => b.status === 'Lengkap').length;
  const prosesCount = berkas.filter(b => b.status === 'Proses').length;
  const kurangCount = berkas.filter(b => b.status === 'Kurang').length;

  // Filter berkas
  let filtered = berkas;
  if (legalState.filterStatus && legalState.filterStatus !== 'Semua') {
    filtered = filtered.filter(b => b.status === legalState.filterStatus);
  }
  if (legalState.searchQuery) {
    const q = legalState.searchQuery.toLowerCase();
    filtered = filtered.filter(b => 
      (b.debitur?.nama || '').toLowerCase().includes(q) ||
      (b.debiturId || '').toLowerCase().includes(q) ||
      (b.notaris || '').toLowerCase().includes(q) ||
      (b.noAkad || '').toLowerCase().includes(q)
    );
  }

  container.innerHTML = `
    <!-- SUMMARY STATS -->
    <div class="legal-summary-grid mb-4">
      <div class="stat-card">
        <div class="stat-label">Total Berkas Legal</div>
        <div class="stat-num">${totalCount}</div>
        <div class="stat-sub">Nasabah terdaftar berkas</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Berkas Lengkap</div>
        <div class="stat-num text-success">${lengkapCount}</div>
        <div class="stat-sub">100% Checklist Terpenuhi</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Dalam Proses</div>
        <div class="stat-num text-warning">${prosesCount}</div>
        <div class="stat-sub">50% - 99% Checklist</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Berkas Kurang</div>
        <div class="stat-num text-danger">${kurangCount}</div>
        <div class="stat-sub">&lt; 50% Checklist</div>
      </div>
    </div>

    <!-- SEARCH & FILTER TOOLBAR -->
    <div class="toolbar-wrap mb-4" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;">
      <div class="search-box-group" style="flex:1;min-width:260px;max-width:420px;">
        <svg class="search-box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input id="legal-search-input" type="text" placeholder="Cari nama, no. rekening, notaris, no. akad..." value="${legalState.searchQuery}" onkeydown="if(event.key==='Enter') executeLegalSearch()"/>
        <button class="search-box-btn" type="button" onclick="executeLegalSearch()">
          <span class="material-symbols-outlined" style="font-size:16px;">search</span>
          <span>Cari</span>
        </button>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="font-size:12px;font-weight:700;color:var(--text-2);">Status:</span>
        <select class="form-select" onchange="handleLegalFilter(this.value)" style="width:auto;font-size:12.5px;">
          <option value="Semua" ${legalState.filterStatus === 'Semua' ? 'selected' : ''}>Semua Status</option>
          <option value="Lengkap" ${legalState.filterStatus === 'Lengkap' ? 'selected' : ''}>Lengkap (100%)</option>
          <option value="Proses" ${legalState.filterStatus === 'Proses' ? 'selected' : ''}>Proses (50-99%)</option>
          <option value="Kurang" ${legalState.filterStatus === 'Kurang' ? 'selected' : ''}>Kurang (&lt;50%)</option>
        </select>
      </div>
    </div>

    <!-- ACCORDION CARDS LIST -->
    <div class="legal-cards-list">
      ${filtered.length === 0 ? `
        <div class="empty-st">
          <p>Tidak ada berkas legal yang cocok dengan filter</p>
        </div>
      ` : filtered.map(b => renderLegalCard(b)).join('')}
    </div>
  `;
}

function renderLegalCard(b) {
  const isOpen = legalState.openCardId === b.id;
  const statusClass = b.status === 'Lengkap' ? 'badge-green' : b.status === 'Proses' ? 'badge-yellow' : 'badge-red';
  const checkedCount = b.checkedChecklists || b.checklists?.filter(c => c.checked).length || 0;
  const totalCount = b.totalChecklists || b.checklists?.length || 14;
  const pct = b.percentage !== undefined ? b.percentage : (totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0);

  // Group checklists by kategori
  const categories = ['Identitas', 'Usaha', 'Agunan', 'Akad & Notarial'];
  const checklistsByCat = {};
  categories.forEach(cat => {
    checklistsByCat[cat] = (b.checklists || []).filter(c => c.kategori === cat);
  });

  return `
    <div class="legal-card ${isOpen ? 'open' : ''}" id="legal-card-${b.id}">
      <div class="legal-card-hdr" onclick="toggleLegalAccordion('${b.id}')">
        <div class="legal-card-info">
          <div class="legal-card-icon">${b.id}</div>
          <div class="legal-card-titles">
            <div class="legal-card-name">${b.debitur?.nama || b.debiturId}</div>
            <div class="legal-card-sub">No. Rek: <span class="mono font-bold">${b.debiturId}</span> &middot; Plafon: ${formatRupiah(b.plafon)}</div>
          </div>
        </div>
        <div class="legal-card-badges">
          <span class="badge ${statusClass}">${b.status}</span>
          <span class="badge badge-teal">${pct}% (${checkedCount}/${totalCount})</span>
          <div class="legal-card-chevron">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        </div>
      </div>

      <div class="legal-card-body">
        <!-- PROGRESS BAR -->
        <div class="legal-progress-wrap">
          <div class="legal-progress-top">
            <span>Kelengkapan Berkas Legal</span>
            <span>${pct}% Selesai (${checkedCount} dari ${totalCount} Dokumen Verified)</span>
          </div>
          <div class="legal-progress-bar">
            <div class="legal-progress-fill" style="width: ${pct}%; background: ${pct === 100 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'}"></div>
          </div>
        </div>

        <!-- METADATA GRID -->
        <div class="legal-meta-grid">
          <div class="legal-meta-item">
            <div class="legal-meta-label">Jenis Agunan</div>
            <div class="legal-meta-val">${b.jenisAgunan || '-'}</div>
          </div>
          <div class="legal-meta-item">
            <div class="legal-meta-label">Notaris / PPAT</div>
            <div class="legal-meta-val">${b.notaris || '-'}</div>
          </div>
          <div class="legal-meta-item">
            <div class="legal-meta-label">No. Akad Pembiayaan</div>
            <div class="legal-meta-val mono">${b.noAkad || '-'}</div>
          </div>
          <div class="legal-meta-item">
            <div class="legal-meta-label">Lokasi Arsip Dokumen</div>
            <div class="legal-meta-val">${b.lokasiArsip || '-'}</div>
          </div>
        </div>

        <!-- 4 CATEGORY CHECKLIST GRID -->
        <div style="margin-bottom:8px;font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.5px;">📋 Checklist Kelengkapan Dokumen:</div>
        <div class="legal-checklist-grid">
          ${categories.map(cat => {
            const items = checklistsByCat[cat] || [];
            const catChecked = items.filter(i => i.checked).length;
            return `
              <div class="legal-category-box">
                <div class="legal-category-title">
                  <span>${cat}</span>
                  <span style="font-size:10.5px;color:var(--text-2);font-weight:600;">${catChecked}/${items.length}</span>
                </div>
                ${items.length === 0 ? '<div style="font-size:11px;color:var(--text-3);">Belum ada item</div>' : items.map(item => `
                  <label class="legal-check-item">
                    <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="toggleLegalChecklist('${b.id}', '${item.id}', this.checked)"/>
                    <span style="${item.checked ? 'text-decoration:line-through;opacity:.75;' : ''}">${item.itemName}</span>
                  </label>
                `).join('')}
              </div>
            `;
          }).join('')}
        </div>

        <!-- FILE ATTACHMENTS & UPLOAD ZONE -->
        <div class="legal-files-box">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <div style="font-size:12px;font-weight:800;color:var(--text);text-transform:uppercase;letter-spacing:.5px;">📎 Dokumen Terlampir:</div>
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('legal-file-input-${b.id}').click()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Upload Dokumen
            </button>
            <input type="file" id="legal-file-input-${b.id}" style="display:none;" onchange="uploadLegalFile('${b.id}', this.files[0])"/>
          </div>

          <div id="legal-files-list-${b.id}">
            ${(!b.files || b.files.length === 0) ? `
              <div style="font-size:11.5px;color:var(--text-3);padding:6px 0;text-align:center;">Belum ada berkas terlampir (PDF/Gambar)</div>
            ` : b.files.map(f => `
              <div class="legal-file-item">
                <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="color:var(--brand);flex-shrink:0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span style="font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.fileName}</span>
                </div>
                <div style="display:flex;gap:6px;">
                  <a href="${f.filePath}" target="_blank" class="btn btn-ghost btn-sm" style="padding:3px 8px;font-size:11px;">Buka / Unduh</a>
                  <button class="btn btn-danger-out btn-sm" style="padding:3px 8px;font-size:11px;" onclick="deleteLegalFile('${b.id}', '${f.id}')">Hapus</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

      </div>
    </div>
  `;
}

function executeLegalSearch() {
  const input = document.getElementById('legal-search-input');
  if (input) {
    legalState.searchQuery = input.value.trim();
    renderLegalView();
  }
}

function handleLegalFilter(val) {
  legalState.filterStatus = val;
  renderLegalView();
}

function toggleLegalAccordion(id) {
  legalState.openCardId = legalState.openCardId === id ? null : id;
  renderLegalView();
}

async function toggleLegalChecklist(berkasId, checklistId, checked) {
  try {
    const res = await apiCall(`/legal/berkas/${berkasId}/checklist`, {
      method: 'PUT',
      body: JSON.stringify({ checklistId, checked })
    });
    
    // Update local state item & recalculate
    const berkas = legalState.berkas.find(b => b.id === berkasId);
    if (berkas) {
      const item = (berkas.checklists || []).find(c => c.id === checklistId);
      if (item) item.checked = checked;
      berkas.status = res.berkasStatus || berkas.status;
      berkas.percentage = res.percentage;
      berkas.checkedChecklists = (berkas.checklists || []).filter(c => c.checked).length;
    }

    renderLegalView();
    showToast('Checklist legal berhasil diperbarui', 's');
  } catch (err) {
    showToast(`Gagal mengupdate checklist: ${err.message}`, 'e');
    loadLegalView();
  }
}

async function uploadLegalFile(berkasId, file) {
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('Mengunggah dokumen legal...', 'i');
    await apiCall(`/legal/berkas/${berkasId}/files`, {
      method: 'POST',
      body: formData
    });
    showToast('Dokumen legal berhasil diunggah', 's');
    loadLegalView();
  } catch (err) {
    showToast(`Gagal mengunggah dokumen: ${err.message}`, 'e');
  }
}

async function deleteLegalFile(berkasId, fileId) {
  if (!confirm('Apakah Anda yakin ingin menghapus dokumen legal ini?')) return;
  try {
    await apiCall(`/legal/berkas/${berkasId}/files/${fileId}`, {
      method: 'DELETE'
    });
    showToast('Dokumen legal berhasil dihapus', 's');
    loadLegalView();
  } catch (err) {
    showToast(`Gagal menghapus dokumen: ${err.message}`, 'e');
  }
}

let selectedLegalDebiturId = '';
let legalAcDebounce = null;

async function openLegalForm(debiturId) {
  selectedLegalDebiturId = debiturId || '';
  const legDeb = document.getElementById('legalf-debitur');
  const legJenis = document.getElementById('legalf-jenis-agunan');
  const legNotaris = document.getElementById('legalf-notaris');
  const legAkad = document.getElementById('legalf-no-akad');
  const legArsip = document.getElementById('legalf-lokasi-arsip');
  const legAc = document.getElementById('legalf-ac');

  if (legAc) legAc.style.display = 'none';

  if (legJenis) legJenis.value = 'Sertifikat Hak Milik (SHM)';
  if (legNotaris) legNotaris.value = '';
  if (legAkad) legAkad.value = '';
  if (legArsip) legArsip.value = '';

  if (debiturId) {
    try {
      const d = await apiCall(`/debitur/${debiturId}`);
      if (legDeb) legDeb.value = `${d.nama} (${d.id})`;
      if (legJenis && d.jenisAgunan) legJenis.value = d.jenisAgunan;
      if (legAkad && d.spkNumber) legAkad.value = d.spkNumber;
    } catch (err) {
      if (legDeb) legDeb.value = debiturId;
    }
  } else {
    if (legDeb) legDeb.value = '';
  }

  openModal('modal-legal-form');
}

function legalAutocomplete(val) {
  const ac = document.getElementById('legalf-ac');
  if (!ac) return;
  if (!val || val.length < 2) {
    ac.style.display = 'none';
    return;
  }

  if (legalAcDebounce) clearTimeout(legalAcDebounce);
  legalAcDebounce = setTimeout(async () => {
    try {
      const res = await apiCall(`/debitur?q=${encodeURIComponent(val)}&limit=6`);
      const list = res.debiturs || [];
      if (list.length === 0) {
        ac.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:var(--text-3);">Tidak ada debitur ditemukan</div>`;
      } else {
        ac.innerHTML = list.map(d => `
          <div style="padding:9px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border);" 
            onclick="selectLegalDebitur('${d.id}', '${d.nama.replace(/'/g, "\\'")}', '${(d.jenisAgunan||'').replace(/'/g, "\\'")}', '${(d.spkNumber||'').replace(/'/g, "\\'")}')">
            <strong>${d.nama}</strong> <span class="mono" style="color:var(--text-2);">(${d.id})</span>
            <div style="font-size:11px;color:var(--text-3);">${d.kota} &middot; Agunan: ${d.jenisAgunan||'-'}</div>
          </div>
        `).join('');
      }
      ac.style.display = 'block';
    } catch (e) {
      ac.style.display = 'none';
    }
  }, 250);
}

function selectLegalDebitur(id, nama, jenisAgunan, spkNumber) {
  selectedLegalDebiturId = id;
  const legDeb = document.getElementById('legalf-debitur');
  const legJenis = document.getElementById('legalf-jenis-agunan');
  const legAkad = document.getElementById('legalf-no-akad');
  const ac = document.getElementById('legalf-ac');

  if (legDeb) legDeb.value = `${nama} (${id})`;
  if (legJenis && jenisAgunan) legJenis.value = jenisAgunan;
  if (legAkad && spkNumber) legAkad.value = spkNumber;
  if (ac) ac.style.display = 'none';
}

async function saveLegalForm() {
  if (!selectedLegalDebiturId) {
    showToast('Pilih debitur terlebih dahulu dari autocomplete', 'w');
    return;
  }

  const jenisAgunan = document.getElementById('legalf-jenis-agunan')?.value || '';
  const notaris = document.getElementById('legalf-notaris')?.value || '';
  const noAkad = document.getElementById('legalf-no-akad')?.value || '';
  const lokasiArsip = document.getElementById('legalf-lokasi-arsip')?.value || '';

  if (!jenisAgunan || !notaris || !noAkad || !lokasiArsip) {
    showToast('Semua field (Agunan, Notaris, No. Akad, Lokasi Arsip) wajib diisi', 'w');
    return;
  }

  const payload = {
    debiturId: selectedLegalDebiturId,
    jenisAgunan,
    notaris,
    noAkad,
    lokasiArsip
  };

  try {
    showToast('Membuat berkas legal...', 'i');
    await apiCall('/legal/berkas', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Berkas legal berhasil ditambahkan', 's');
    closeModal('modal-legal-form');
    legalState.filterStatus = 'Semua';
    legalState.searchQuery = '';
    loadLegalView();
  } catch (err) {
    showToast(`Gagal menambahkan berkas legal: ${err.message}`, 'e');
  }
}

// 6. RIWAYAT BAYAR VIEW & PDF EXPORT
let bayarSelectedDate = new Date().toISOString().substring(0, 10);

async function loadBayarView() {
  const container = document.getElementById('bayar-content');
  if (!container) return;

  container.innerHTML = `<div class="empty-st"><p>Memuat riwayat pembayaran...</p></div>`;

  try {
    const res = await apiCall('/pembayaran');
    const payments = Array.isArray(res) ? res : (res?.pembayaran || []);
    const stats = res?.stats || {};

    // Filter by selected date if set
    const filteredPayments = payments.filter(p => {
      if (!bayarSelectedDate) return true;
      const pDate = new Date(p.tanggal).toISOString().substring(0, 10);
      return pDate === bayarSelectedDate;
    });

    container.innerHTML = `
      <div class="stats-grid mb-4">
        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">TOTAL TRANSAKSI</span>
            <span class="stat-pill stat-pill-green">💳 Transaksi</span>
          </div>
          <div class="stat-value">${stats.totalTransaksi || payments.length || 0} Transaksi</div>
          <div class="stat-sub">Bulan Ini</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">TOTAL SETORAN MASUK</span>
            <span class="stat-pill stat-pill-teal">IDR</span>
          </div>
          <div class="stat-value text-blue" style="font-size:24px;">${formatRupiah(stats.totalMasuk || 0)}</div>
          <div class="stat-sub">Akumulasi Pembayaran</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">TRANSFER BANK</span>
            <span class="stat-pill stat-pill-blue">🏦 Non-Tunai</span>
          </div>
          <div class="stat-value text-blue" style="font-size:24px;">${formatRupiah(stats.totalTransfer || 0)}</div>
          <div class="stat-sub">Metode Non-Tunai</div>
        </div>

        <div class="stat-card">
          <div class="stat-card-top">
            <span class="stat-label">PEMBAYARAN TUNAI</span>
            <span class="stat-pill stat-pill-yellow">💵 Tunai</span>
          </div>
          <div class="stat-value text-warning" style="font-size:24px;">${formatRupiah(stats.totalTunai || 0)}</div>
          <div class="stat-sub">Teller / Direct Cash</div>
        </div>
      </div>

      <!-- FILTER & TOOLBAR HARIAN -->
      <div class="card mb-4" style="padding:16px 20px;border-radius:18px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <label class="form-label" style="margin-bottom:0;font-size:12px;font-weight:800;color:var(--text-2);">FILTER TANGGAL TRANSAKSI:</label>
            <input type="date" id="bayar-date-filter" class="form-input" style="max-width:190px;font-size:13px;padding:6px 14px;" value="${bayarSelectedDate}" onchange="changeBayarDate(this.value)"/>
            <button class="btn btn-ghost btn-sm" onclick="changeBayarDate('')" style="font-size:12px;">Tampilkan Semua Tanggal</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="exportPembayaranPdfHarian(document.getElementById('bayar-date-filter')?.value)" style="font-size:13px;padding:8px 18px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Cetak PDF Rekap Harian
            </button>
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th style="width:40px;text-align:center;">No.</th>
                <th>Tanggal</th>
                <th>Debitur</th>
                <th>Metode</th>
                <th class="num">Nominal Bayar</th>
                <th>KOL Snapshot</th>
                <th>Petugas</th>
              </tr>
            </thead>
            <tbody>
              ${filteredPayments.length === 0 ? '<tr><td colspan="7" class="empty-st">Tidak ada catatan pembayaran untuk tanggal ini.</td></tr>' : filteredPayments.map((p, idx) => `
                <tr style="cursor:pointer;" onclick="viewPayDetail('${p.id}')">
                  <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
                  <td class="mono font-bold">${formatDate(p.tanggal)}</td>
                  <td class="tbl-name">${p.nama}</td>
                  <td>${p.metode}</td>
                  <td class="num mono font-bold text-green">${formatRupiah(p.nominal)}</td>
                  <td><span class="badge ${getKolBadgeClass(p.kol)}">${p.kol}</span></td>
                  <td>${p.petugas}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat pembayaran: ${err.message}</p></div>`;
  }
}

function changeBayarDate(dateStr) {
  bayarSelectedDate = dateStr;
  loadBayarView();
}

function exportPembayaranPdfHarian(filterTanggalStr = null) {
  const targetDateStr = filterTanggalStr || bayarSelectedDate || new Date().toISOString().substring(0, 10);
  
  showToast('Menyiapkan laporan PDF harian...', 'i');

  apiCall('/pembayaran').then(res => {
    const allPayments = Array.isArray(res) ? res : (res?.pembayaran || []);
    
    // Filter payments for target date (YYYY-MM-DD) if targetDateStr is set
    const dayPayments = allPayments.filter(p => {
      if (!targetDateStr) return true;
      const pDate = new Date(p.tanggal).toISOString().substring(0, 10);
      return pDate === targetDateStr;
    });

    const ptName = state.settings?.pt_name || 'PT BPRS MITRA HARMONI YOGYAKARTA';
    const totalSetoran = dayPayments.reduce((sum, p) => sum + (p.nominal || 0), 0);
    const totalTunai = dayPayments.filter(p => (p.metode || '').toLowerCase().includes('tunai')).reduce((sum, p) => sum + (p.nominal || 0), 0);
    const totalTransfer = totalSetoran - totalTunai;

    const printWindow = window.open('', '_blank', 'width=1100,height=850');
    if (!printWindow) {
      showToast('Gagal membuka jendela cetak. Izinkan pop-up di browser.', 'w');
      return;
    }

    const rowsHtml = dayPayments.length === 0 ? `
      <tr>
        <td colspan="7" style="text-align:center;padding:28px;color:#64748B;font-style:italic;">
          Tidak ada data pembayaran nasabah yang dicatat pada tanggal ${targetDateStr ? formatDate(targetDateStr) : 'pilihan'}.
        </td>
      </tr>
    ` : dayPayments.map((p, idx) => `
      <tr>
        <td style="text-align:center;font-weight:bold;">${idx + 1}</td>
        <td style="font-family:'JetBrains Mono',monospace;font-weight:bold;">${p.debiturId || '-'}</td>
        <td style="font-weight:bold;color:#0F172A;">${p.nama || '-'}</td>
        <td style="text-align:center;"><span class="badge-pdf">${p.kol ? 'KOL ' + p.kol : '-'}</span></td>
        <td style="text-align:center;font-weight:600;">${p.metode || '-'}</td>
        <td style="text-align:right;font-family:'JetBrains Mono',monospace;font-weight:bold;color:#059669;">${formatRupiah(p.nominal || 0)}</td>
        <td style="font-size:12px;color:#475569;">${p.petugas || '-'}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Laporan Rekapitulasi Pembayaran Harian — ${targetDateStr || 'Semua Tanggal'}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
          body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; color: #0F172A; margin: 0; padding: 24px; font-size: 13px; line-height: 1.5; }
          .hdr-kop { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #0F766E; padding-bottom: 12px; margin-bottom: 20px; }
          .kop-brand { font-size: 18px; font-weight: 800; color: #0F766E; letter-spacing: -0.3px; text-transform: uppercase; }
          .kop-sub { font-size: 13px; font-weight: 700; color: #334155; margin-top: 2px; }
          .kop-meta { text-align: right; font-size: 11px; color: #64748B; }
          
          .report-title { text-align: center; margin-bottom: 22px; }
          .report-title h2 { font-size: 17px; font-weight: 800; color: #0F172A; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .report-title p { font-size: 13px; font-weight: 600; color: #0F766E; margin: 0; }

          .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px; }
          .meta-item label { display: block; font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
          .meta-item val { font-size: 15px; font-weight: 800; color: #0F172A; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12.5px; }
          th { background: #F1F5F9; color: #334155; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px 12px; border: 1px solid #CBD5E1; text-align: left; }
          td { padding: 9px 12px; border: 1px solid #E2E8F0; vertical-align: middle; }
          tr:nth-child(even) td { background: #FAFCFB; }

          .badge-pdf { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #CCFBF1; color: #0F766E; border: 1px solid #99F6E4; }
          
          .summary-box { background: #ECFDF5; border: 1.5px solid #A7F3D0; border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
          .summary-title { font-size: 13px; font-weight: 800; color: #065F46; text-transform: uppercase; }
          .summary-val { font-size: 18px; font-weight: 800; color: #047857; font-family: 'JetBrains Mono', monospace; }

          .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; page-break-inside: avoid; }
          .sig-box { text-align: center; }
          .sig-title { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 60px; }
          .sig-name { font-size: 13px; font-weight: 800; color: #0F172A; text-decoration: underline; }
          .sig-role { font-size: 11px; color: #64748B; margin-top: 2px; }

          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="hdr-kop">
          <div>
            <div class="kop-brand">${ptName}</div>
            <div class="kop-sub">Sistem Informasi Penagihan Terpadu AO, P3 &amp; Desk Call</div>
          </div>
          <div class="kop-meta">
            <div>Tanggal Cetak: <strong>${formatDate(new Date())}</strong></div>
            <div>Waktu: <strong>${new Date().toLocaleTimeString('id-ID')} WIB</strong></div>
          </div>
        </div>

        <div class="report-title">
          <h2>Laporan Rekapitulasi Pembayaran Nasabah Harian</h2>
          <p>Tanggal Transaksi: ${targetDateStr ? formatDate(targetDateStr) : 'Semua Tanggal Transaksi'}</p>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <label>Total Transaksi Harian</label>
            <val>${dayPayments.length} Transaksi</val>
          </div>
          <div class="meta-item">
            <label>Setoran Tunai</label>
            <val style="color:#2563EB;">${formatRupiah(totalTunai)}</val>
          </div>
          <div class="meta-item">
            <label>Transfer Bank Non-Tunai</label>
            <val style="color:#7C3AED;">${formatRupiah(totalTransfer)}</val>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:35px;text-align:center;">No.</th>
              <th style="width:140px;">No. Rekening</th>
              <th>Nama Debitur</th>
              <th style="width:90px;text-align:center;">KOL</th>
              <th style="width:110px;text-align:center;">Metode</th>
              <th style="width:150px;text-align:right;">Nominal Setoran</th>
              <th style="width:130px;">Petugas Input</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="summary-box">
          <div class="summary-title">Grand Total Setoran Masuk (${targetDateStr ? formatDate(targetDateStr) : 'Hari Ini'}):</div>
          <div class="summary-val">${formatRupiah(totalSetoran)}</div>
        </div>

        <div class="signature-section">
          <div class="sig-box">
            <div class="sig-title">Dibuat Oleh (Petugas Operasional / Kasir)</div>
            <div class="sig-name">${state.user?.nama || 'Petugas Administrasi'}</div>
            <div class="sig-role">${state.user?.posisi || 'Staff Operasional'}</div>
          </div>
          <div class="sig-box">
            <div class="sig-title">Disetujui Oleh (Kabid / Head Officer)</div>
            <div class="sig-name">Kabid P3 &amp; Restrukturisasi</div>
            <div class="sig-role">PT BPRS Mitra Harmoni Yogyakarta</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 400);
          }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }).catch(err => {
    showToast(`Gagal mengeksport PDF: ${err.message}`, 'e');
  });
}

async function viewPayDetail(id) {
  const body = document.getElementById('payd-body');
  const title = document.getElementById('payd-title');
  if (!body) return;

  body.innerHTML = `<div class="empty-st"><p>Memuat detail pembayaran...</p></div>`;
  openModal('modal-pay-detail');

  try {
    const p = await apiCall(`/pembayaran/${id}`);
    if (title) title.innerText = `Detail Pembayaran — ${p.nama}`;

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text);">${p.nama}</div>
          <div class="mono" style="font-size:12px;color:var(--text-3);margin-top:2px;">Rek: ${p.debiturId}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span class="badge badge-teal">${p.metode}</span>
          <span class="badge ${getKolBadgeClass(p.kol)}">KOL ${p.kol}</span>
        </div>
      </div>

      <div class="m-card-grid mb-4" style="grid-template-columns:1fr 1fr;">
        <div><div class="m-field-label">Tanggal Bayar</div><div class="m-field-value mono font-bold">${formatDate(p.tanggal)}</div></div>
        <div><div class="m-field-label">Nominal Pembayaran</div><div class="m-field-value mono text-green font-bold" style="font-size:16px;">${formatRupiah(p.nominal)}</div></div>
        <div><div class="m-field-label">Metode Pembayaran</div><div class="m-field-value font-bold">${p.metode}</div></div>
        <div><div class="m-field-label">Petugas Pencatat</div><div class="m-field-value font-bold">${p.petugas || '-'}</div></div>
        <div><div class="m-field-label">KOL saat Pembayaran</div><div class="m-field-value"><span class="badge ${getKolBadgeClass(p.kol)}">${p.kol}</span></div></div>
        <div><div class="m-field-label">Waktu Pencatatan</div><div class="m-field-value mono">${formatDate(p.createdAt)}</div></div>
      </div>

      <div class="divider"></div>

      <div class="sec-label" style="font-weight:800;font-size:13px;color:var(--brand);margin-bottom:8px;">Catatan Pembayaran</div>
      <div style="background:var(--surface);padding:14px;border:1px solid var(--border);border-radius:10px;font-size:13px;line-height:1.6;color:var(--text);margin-bottom:16px;">
        ${p.keterangan || '<span style="color:var(--text-3);">Tidak ada catatan opsional.</span>'}
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">
        <button class="btn btn-outline btn-sm" onclick="closeModal('modal-pay-detail');viewDebiturDetail('${p.debiturId}')">👤 Buka Profile Debitur</button>
        <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-pay-detail')">Tutup</button>
      </div>
    `;
  } catch (err) {
    body.innerHTML = `<div class="empty-st"><p>Gagal memuat detail pembayaran: ${err.message}</p></div>`;
  }
}

// 7. KPI & SCORECARD VIEW
// ============================================================================
// KPI & SCORECARD MODULE — 9 SECTIONS (PRD & PROTOTYPE COMPLIANT)
// ============================================================================
let _kpiRollcureData = null;
let _kpiRollcureMethod = 'p3';
let _kpiP3Schedules = [];
let _kpiOfficersData = [];
let _kpiDashboardData = null;

const RBB_FIELD_DEFS = [
  { k: 'npfGross', label: 'Target NPF Gross (%)', hint: 'Batas rasio pembiayaan bermasalah', unit: '%' },
  { k: 'collectionRate', label: 'Target Collection Rate (%)', hint: 'Realisasi vs target tagihan P3', unit: '%' },
  { k: 'recoveryRate', label: 'Target Recovery Rate (%)', hint: 'Tunggakan NPF berhasil tertagih', unit: '%' },
  { k: 'cureRate', label: 'Target Cure Rate (%)', hint: 'Debitur bermasalah kembali lancar', unit: '%' },
  { k: 'ptpRate', label: 'Target PTP Rate (%)', hint: 'Janji bayar dari yang terhubung', unit: '%' },
  { k: 'promiseKept', label: 'Target Promise Kept (%)', hint: 'Janji bayar yang ditepati', unit: '%' },
  { k: 'coverageRatio', label: 'Target Coverage Ratio (%)', hint: 'Rekening NPF yang sudah di-P3-kan', unit: '%' },
  { k: 'kunjunganPerPetugas', label: 'Target Kunjungan/Petugas', hint: 'Kunjungan P3 per petugas per bulan', unit: '' },
  { k: 'restrukSuccess', label: 'Target Restrukturisasi Success (%)', hint: 'Restrukturisasi yang berhasil tuntas', unit: '%' },
  { k: 'ppapCoverage', label: 'Target PPAP Coverage (%)', hint: 'Belum ada data PPAP — placeholder', unit: '%' }
];

function canEditRBB() {
  return state.user && (state.user.posisi === 'admin' || state.user.posisi === 'kabid_p3');
}

function kpiIndCard(label, value, unit, target, inverse) {
  const valNum = parseFloat(value) || 0;
  const tgtNum = parseFloat(target) || 0;
  const pct = tgtNum ? Math.min(100, Math.max(0, inverse ? (100 - (valNum / tgtNum * 100 - 100)) : (valNum / tgtNum * 100))) : 0;
  const ok = inverse ? valNum <= tgtNum : valNum >= tgtNum;
  const clr = ok ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  return `
    <div class="kpi-ind-card">
      <div class="kpi-ind-label">${label}</div>
      <div class="kpi-ind-value" style="color:${clr};">${valNum.toFixed(1)}${unit}</div>
      <div class="kpi-ind-target">Target: ${tgtNum}${unit}</div>
      <div class="kpi-ind-bar-track"><div class="kpi-ind-bar-fill" style="width:${pct.toFixed(0)}%;background:${clr};"></div></div>
    </div>
  `;
}

async function loadKpiView() {
  const container = document.getElementById('kpi-content');
  if (!container) return;

  container.innerHTML = `<div class="empty-st"><p>Memuat scorecard KPI & Regulasi RBB...</p></div>`;

  try {
    const [dashRes, offRes, rcRes, p3Res] = await Promise.all([
      apiCall('/kpi/dashboard'),
      apiCall('/kpi/officers'),
      apiCall('/kpi/rollrate'),
      apiCall('/p3/jadwal')
    ]);

    _kpiDashboardData = dashRes || {};
    _kpiOfficersData = Array.isArray(offRes) ? offRes : [];
    _kpiRollcureData = rcRes || { method1: [], method2: [] };
    _kpiP3Schedules = Array.isArray(p3Res) ? p3Res : (p3Res?.jadwal || []);

    const target = _kpiDashboardData.target || {};
    const stats = _kpiDashboardData.stats || {};
    const editable = canEditRBB();

    const uniquePetugas = [...new Set(_kpiP3Schedules.map(p => p.petugas?.nama || p.petugas || 'Petugas'))];

    container.innerHTML = `


      <!-- SECTION A: TARGET RBB BULAN INI -->
      <div class="card kpi-group mb-4">
        <div class="kpi-group-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 style="font-size:15px;font-weight:800;color:var(--text);">🎯 Target RBB Bulan Ini</h3>
          ${!editable ? '<span class="badge badge-gray">Lihat Saja</span>' : ''}
        </div>
        <div class="rbb-target-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:16px;">
          ${RBB_FIELD_DEFS.map(f => `
            <div class="rbb-field">
              <div class="rbb-field-label" style="font-size:11.5px;font-weight:800;color:var(--text);margin-bottom:2px;">${f.label}</div>
              <div class="rbb-field-hint" style="font-size:10.5px;color:var(--text-3);margin-bottom:8px;">${f.hint}</div>
              <div class="rbb-field-input-row" style="display:flex;align-items:center;gap:8px;">
                <input class="form-input" id="rbb-${f.k}" type="number" step="0.1" value="${target[f.k] ?? 0}" ${editable ? '' : 'disabled'} style="font-weight:700;" />
                <span class="rbb-field-unit" style="font-size:12px;font-weight:700;color:var(--text-2);flex-shrink:0;">${f.unit}</span>
              </div>
            </div>
          `).join('')}
        </div>
        ${editable ? `
          <div style="display:flex;gap:10px;">
            <button class="btn btn-primary btn-sm" onclick="saveRBBTargets()">💾 Simpan Target RBB</button>
            <button class="btn btn-ghost btn-sm" onclick="resetRBBTargets()">🔄 Reset ke Default</button>
          </div>
        ` : ''}
      </div>

      <!-- SECTION B: 4 GRUP INDIKATOR (16 CARDS) -->
      <!-- GRUP 1: KUALITAS PEMBIAYAAN -->
      <div class="kpi-group mb-4">
        <div class="kpi-group-title mb-2"><span class="kpi-group-dot" style="background:var(--success);"></span><h3>Indikator Kualitas Pembiayaan</h3></div>
        <div class="kpi-ind-grid">
          ${kpiIndCard('NPF Gross', stats.npfGross ?? 0, '%', target.npfGross ?? 5.0, true)}
          ${kpiIndCard('PPAP Coverage', stats.ppapCoverage ?? 100, '%', target.ppapCoverage ?? 100, false)}
          ${kpiIndCard('Recovery Rate', stats.recoveryRate ?? 0, '%', target.recoveryRate ?? 40.0, false)}
          ${kpiIndCard('Cure Rate', stats.cureRate ?? 0, '%', target.cureRate ?? 20.0, false)}
        </div>
      </div>

      <!-- GRUP 2: EFEKTIVITAS PENAGIHAN -->
      <div class="kpi-group mb-4">
        <div class="kpi-group-title mb-2"><span class="kpi-group-dot" style="background:var(--info);"></span><h3>Indikator Efektivitas Penagihan</h3></div>
        <div class="kpi-ind-grid">
          ${kpiIndCard('Collection Rate', stats.collectionRate ?? 0, '%', target.collectionRate ?? 70.0, false)}
          ${kpiIndCard('PTP Rate', stats.ptpRate ?? 0, '%', target.ptpRate ?? 40.0, false)}
          ${kpiIndCard('Promise Kept Rate', stats.promiseKeptRate ?? 0, '%', target.promiseKept ?? 60.0, false)}
          ${kpiIndCard('Roll Rate', stats.rollRate ?? 0, '%', 30.0, true)}
        </div>
      </div>

      <!-- GRUP 3: PRODUKTIVITAS PETUGAS -->
      <div class="kpi-group mb-4">
        <div class="kpi-group-title mb-2"><span class="kpi-group-dot" style="background:var(--brand);"></span><h3>Indikator Produktivitas Petugas</h3></div>
        <div class="kpi-ind-grid">
          ${kpiIndCard('Coverage Ratio', stats.coverageRatio ?? 0, '%', target.coverageRatio ?? 80.0, false)}
          ${kpiIndCard('Kunjungan/Petugas', stats.kunjunganPerPetugas ?? 0, '', target.kunjunganPerPetugas ?? 15, false)}
          ${kpiIndCard('Achievement Rate', stats.achievementRate ?? 0, '%', 80.0, false)}
          <div class="kpi-ind-card">
            <div class="kpi-ind-label">Avg Tagihan/Kunjungan</div>
            <div class="kpi-ind-value" style="font-size:16px;">${fmtRp(stats.avgTagihanKunjungan ?? 0)}</div>
            <div class="kpi-ind-target">Rata-rata per kunjungan P3</div>
          </div>
        </div>
      </div>

      <!-- GRUP 4: RESTRUKTURISASI & PENYELESAIAN -->
      <div class="kpi-group mb-4">
        <div class="kpi-group-title mb-2"><span class="kpi-group-dot" style="background:var(--purple);"></span><h3>Indikator Restrukturisasi & Penyelesaian</h3></div>
        <div class="kpi-ind-grid">
          ${kpiIndCard('Restrukturisasi Success', stats.restrukSuccessRate ?? 0, '%', target.restrukSuccess ?? 50.0, false)}
          <div class="kpi-ind-card">
            <div class="kpi-ind-label">Total Restrukturisasi</div>
            <div class="kpi-ind-value">${stats.totalRestrukturisasi ?? 0}</div>
            <div class="kpi-ind-target">Debitur (kumulatif)</div>
          </div>
          ${kpiIndCard('Legal Action Rate', stats.legalActionRate ?? 0, '%', 30.0, false)}
          <div class="kpi-ind-card">
            <div class="kpi-ind-label">AYDA / Aset Bermasalah</div>
            <div class="kpi-ind-value" style="color:var(--text-3);font-size:14px;">${stats.aydaCount ?? 0} Berkas</div>
            <div class="kpi-ind-target">Input via modul Legal</div>
          </div>
        </div>
      </div>

      <!-- SECTION C: KINERJA PER PETUGAS (RANKING) -->
      <div class="card kpi-group mb-4">
        <div class="kpi-group-title" style="margin-bottom:12px;"><h3>🏆 Kinerja Per Petugas (Ranking RBB)</h3></div>
        <div class="tbl-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M9 18l6-6-6-6"/></svg>Geser untuk semua kolom</div>
        <div class="table-scroll"><table style="min-width:820px;">
          <thead>
            <tr>
              <th></th>
              <th>Petugas</th>
              <th class="num">Jadwal</th>
              <th class="num">Selesai</th>
              <th class="num">Coverage</th>
              <th class="num">Target</th>
              <th class="num">Realisasi</th>
              <th class="num">Achv %</th>
              <th class="num">PTP %</th>
              <th class="num">Promise Kept</th>
              <th class="num">Roll %</th>
              <th>KOL Dom.</th>
            </tr>
          </thead>
          <tbody>
            ${_kpiOfficersData.length === 0 ? '<tr><td colspan="12" class="empty-st">Belum ada data kinerja petugas P3</td></tr>' : _kpiOfficersData.map((p, i) => `
              <tr>
                <td class="petugas-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                <td class="tbl-name">${p.nama}</td>
                <td class="num">${p.totalJadwal}</td>
                <td class="num">${p.selesai}</td>
                <td class="num">${p.totalJadwal ? ((p.selesai / p.totalJadwal) * 100).toFixed(0) : 0}%</td>
                <td class="num mono">${fmtRp(p.totalTarget)}</td>
                <td class="num mono">${fmtRp(p.totalRealisasi)}</td>
                <td class="num" style="font-weight:800;color:${p.achievement >= (target.collectionRate || 70) ? 'var(--success)' : p.achievement >= 50 ? 'var(--warning)' : 'var(--danger)'};">${p.achievement.toFixed(1)}%</td>
                <td class="num">${p.ptpRate.toFixed(1)}%</td>
                <td class="num">${p.promiseKept.toFixed(1)}%</td>
                <td class="num">${p.rollRate.toFixed(1)}%</td>
                <td>${kolBadge(p.dominantKol)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      </div>

      <!-- SECTION D: PERBANDINGAN KINERJA PETUGAS (2 CHARTS) -->
      <div class="dash-grid-2 mb-4">
        <div class="chart-card">
          <div class="chart-title">Achievement Rate per Petugas</div>
          <div class="chart-wrap" style="height:220px;"><canvas id="kpi-achv-chart"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">Distribusi Status Penagihan</div>
          <div class="chart-wrap" style="height:220px;"><canvas id="kpi-statusdist-chart"></canvas></div>
        </div>
      </div>

      <!-- SECTION E: ROLL RATE & CURE RATE PER KOL (DUA METODE) -->
      <div class="card kpi-group mb-4">
        <div class="kpi-group-title" style="margin-bottom:12px;"><h3>📊 Roll Rate & Cure Rate per KOL</h3></div>
        <div class="rollcure-method-tabs" style="margin-bottom:14px;">
          <div class="rollcure-method-tab ${!_kpiRollcureMethod || _kpiRollcureMethod === 'p3' ? 'active' : ''}" id="rc-tab-p3" onclick="switchRollcureMethod('p3')">Berbasis Kunjungan P3</div>
          <div class="rollcure-method-tab ${_kpiRollcureMethod === 'deb' ? 'active' : ''}" id="rc-tab-deb" onclick="switchRollcureMethod('deb')">Berbasis Riwayat KOL Debitur</div>
        </div>
        <div id="rollcure-content"></div>
      </div>

      <!-- SECTION F: DAFTAR JADWAL P3 -->
      <div class="card kpi-group mb-4">
        <div class="kpi-group-title" style="margin-bottom:12px;"><h3>📋 Daftar Jadwal Penagihan P3</h3></div>
        <div class="filter-bar" style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">
          <select class="form-select" style="width:auto;min-width:160px;" id="kpi-filter-petugas" onchange="renderKpiJadwalTable()">
            <option value="">Semua Petugas</option>
            ${uniquePetugas.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
          <select class="form-select" style="width:auto;min-width:160px;" id="kpi-filter-status" onchange="renderKpiJadwalTable()">
            <option value="">Semua Status</option>
            <option value="Terjadwal">Terjadwal</option>
            <option value="Dalam Proses">Dalam Proses</option>
            <option value="Selesai">Selesai</option>
            <option value="Batal">Batal</option>
            <option value="Lewat Jatuh Tempo">Lewat Jatuh Tempo</option>
          </select>
        </div>
        <div class="tbl-hint"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M9 18l6-6-6-6"/></svg>Geser untuk semua kolom</div>
        <div class="table-scroll"><table style="min-width:900px;">
          <thead>
            <tr>
              <th>No. Jadwal</th>
              <th>Tanggal</th>
              <th>Petugas</th>
              <th>Debitur</th>
              <th>KOL</th>
              <th>Area</th>
              <th class="num">Target Tagih</th>
              <th class="num">Realisasi</th>
              <th class="num">Achv %</th>
              <th>Status</th>
              <th>Prioritas</th>
            </tr>
          </thead>
          <tbody id="kpi-jadwal-tbody"></tbody>
        </table></div>
      </div>

      <!-- SECTION G: KEPATUHAN & REGULASI -->
      <div class="kpi-group mb-4">
        <div class="kpi-group-title" style="margin-bottom:12px;"><h3>⚖️ Kepatuhan & Regulasi OJK / DSN-MUI</h3></div>
        <div class="compliance-grid">
          <div class="compliance-card">
            <div class="compliance-card-hdr">
              <div class="compliance-card-title">POJK No.3/2022</div>
              ${(stats.npfGross ?? 0) <= (target.npfGross ?? 5.0) ? '<span class="badge badge-green">Sesuai</span>' : '<span class="badge badge-red">Perlu Perhatian</span>'}
            </div>
            <div class="compliance-card-sub">Kualitas Aset BPR/BPRS</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>NPF Gross saat ini ${(stats.npfGross ?? 0).toFixed(1)}%, ambang batas ${target.npfGross ?? 5.0}%</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Klasifikasi kolektibilitas mengikuti 5 kategori standar OJK</div>
          </div>
          <div class="compliance-card">
            <div class="compliance-card-hdr">
              <div class="compliance-card-title">POJK No.21/2023</div>
              ${(stats.collectionRate ?? 0) >= (target.collectionRate ?? 70.0) ? '<span class="badge badge-green">Sesuai</span>' : '<span class="badge badge-yellow">Di Bawah Target</span>'}
            </div>
            <div class="compliance-card-sub">Rencana Bisnis Bank (RBB)</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Collection Rate saat ini ${(stats.collectionRate ?? 0).toFixed(1)}% dari target ${target.collectionRate ?? 70.0}%</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Realisasi RBB dipantau bulanan</div>
          </div>
          <div class="compliance-card">
            <div class="compliance-card-hdr">
              <div class="compliance-card-title">Fatwa DSN-MUI</div>
              <span class="badge badge-blue">Wajib Dipenuhi</span>
            </div>
            <div class="compliance-card-sub">Penagihan Syariah</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Tidak ada unsur tekanan berlebihan saat penagihan</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Musyawarah diutamakan dalam penyelesaian pembiayaan</div>
          </div>
          <div class="compliance-card">
            <div class="compliance-card-hdr">
              <div class="compliance-card-title">SE OJK No.13/2017</div>
              <span class="badge badge-purple">Periodik</span>
            </div>
            <div class="compliance-card-sub">Pelaporan SLIK/SID</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Update status kolektibilitas ke SLIK secara berkala</div>
            <div class="compliance-check-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>Data debitur bermasalah dilaporkan sesuai jadwal OJK</div>
          </div>
        </div>
      </div>
    `;

    renderKpiJadwalTable();
    renderRollcureContent();
    setTimeout(() => buildKPICharts(), 100);
  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat Scorecard KPI: ${err.message}</p></div>`;
  }
}

async function saveRBBTargets() {
  if (!canEditRBB()) {
    showToast('Hanya Admin & Kabid P3 yang dapat mengubah target RBB.', 'warning');
    return;
  }
  const payload = { periode: new Date().toISOString().substring(0, 7) };
  RBB_FIELD_DEFS.forEach(f => {
    const el = document.getElementById(`rbb-${f.k}`);
    if (el) payload[f.k] = parseFloat(el.value) || 0;
  });

  try {
    await apiCall('/kpi/targets', { method: 'POST', body: payload });
    showToast('Target RBB berhasil diperbarui!', 'success');
    loadKpiView();
  } catch (e) {
    showToast(`Gagal menyimpan target: ${e.message}`, 'danger');
  }
}

async function resetRBBTargets() {
  if (!canEditRBB()) return;
  const payload = {
    periode: new Date().toISOString().substring(0, 7),
    npfGross: 5.0, collectionRate: 70.0, recoveryRate: 40.0, cureRate: 20.0,
    ptpRate: 40.0, promiseKept: 60.0, coverageRatio: 80.0, kunjunganPerPetugas: 15,
    restrukSuccess: 50.0, ppapCoverage: 100.0
  };
  try {
    await apiCall('/kpi/targets', { method: 'POST', body: payload });
    showToast('Target RBB dikembalikan ke default.', 'info');
    loadKpiView();
  } catch (e) {
    showToast(`Gagal reset target: ${e.message}`, 'danger');
  }
}

function switchRollcureMethod(method) {
  _kpiRollcureMethod = method;
  const btnP3 = document.getElementById('rc-tab-p3');
  const btnDeb = document.getElementById('rc-tab-deb');
  if (btnP3) btnP3.classList.toggle('active', method === 'p3');
  if (btnDeb) btnDeb.classList.toggle('active', method === 'deb');
  renderRollcureContent();
}

function renderRollcureContent() {
  const el = document.getElementById('rollcure-content');
  if (!el || !_kpiRollcureData) return;

  const dataList = _kpiRollcureMethod === 'deb' ? (_kpiRollcureData.method2 || []) : (_kpiRollcureData.method1 || []);
  const subtitle = _kpiRollcureMethod === 'deb'
    ? 'Dihitung dari perubahan status KOL debitur antar snapshot bulan'
    : 'Dihitung dari hasil akhir kunjungan penagihan P3 per kategori KOL';

  el.innerHTML = `
    <div style="font-size:12px;color:var(--text-3);margin-bottom:12px;">${subtitle}</div>
    <div class="rollcure-kol-grid">
      ${dataList.length === 0 ? '<div class="empty-st"><p>Tidak ada sampel data Roll/Cure Rate</p></div>' : dataList.map(d => `
        <div class="rollcure-kol-card">
          <div class="rollcure-kol-name">${d.kol} <span style="color:var(--text-3);font-weight:400;font-size:10.5px;">(n=${d.totalSamples ?? d.n ?? 0})</span></div>
          <div class="rollcure-metric-row">
            <div class="rollcure-metric-top"><span>Roll Rate</span><span style="color:var(--danger);">${(d.rollRate ?? d.roll ?? 0).toFixed(1)}%</span></div>
            <div class="kpi-ind-bar-track"><div class="kpi-ind-bar-fill" style="width:${Math.min(100, (d.rollRate ?? d.roll ?? 0)).toFixed(0)}%;background:var(--danger);"></div></div>
          </div>
          <div class="rollcure-metric-row">
            <div class="rollcure-metric-top"><span>Cure Rate</span><span style="color:var(--success);">${(d.cureRate ?? d.cure ?? 0).toFixed(1)}%</span></div>
            <div class="kpi-ind-bar-track"><div class="kpi-ind-bar-fill" style="width:${Math.min(100, (d.cureRate ?? d.cure ?? 0)).toFixed(0)}%;background:var(--success);"></div></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderKpiJadwalTable() {
  const tb = document.getElementById('kpi-jadwal-tbody');
  if (!tb) return;

  const filterPetugas = document.getElementById('kpi-filter-petugas')?.value || '';
  const filterStatus = document.getElementById('kpi-filter-status')?.value || '';

  let list = _kpiP3Schedules;
  if (filterPetugas) {
    list = list.filter(s => (s.petugas?.nama || s.petugas) === filterPetugas);
  }
  if (filterStatus) {
    list = list.filter(s => s.status === filterStatus);
  }

  tb.innerHTML = list.length === 0 ? '<tr><td colspan="11" class="empty-st">Tidak ada jadwal penagihan P3 sesuai filter</td></tr>' : list.map(s => {
    const targetVal = s.targetTagih || 0;
    const realisasiVal = s.nominalRealisasi || 0;
    const achv = targetVal ? ((realisasiVal / targetVal) * 100).toFixed(0) : 0;
    const petName = s.petugas?.nama || s.petugas || '—';
    const debName = s.debitur?.nama || s.namaDebitur || '—';

    return `
      <tr>
        <td class="mono" style="font-size:11px;">${s.nomorJadwal || s.id}</td>
        <td style="font-size:12px;">${s.tanggal ? s.tanggal.substring(0, 10) : '—'}</td>
        <td>${petName}</td>
        <td class="tbl-name">${debName}</td>
        <td>${kolBadge(s.kol)}</td>
        <td style="font-size:12px;">${s.area || '—'}</td>
        <td class="num mono">${fmtRp(targetVal)}</td>
        <td class="num mono" style="${realisasiVal > 0 ? 'color:var(--success);font-weight:700;' : ''}">${fmtRp(realisasiVal)}</td>
        <td class="num" style="font-weight:700;">${achv}%</td>
        <td><span class="badge ${s.status === 'Selesai' ? 'badge-green' : s.status === 'Lewat Jatuh Tempo' ? 'badge-red' : 'badge-yellow'}">${s.status}</span></td>
        <td><span class="badge badge-gray">${s.prioritas || 'Sedang'}</span></td>
      </tr>
    `;
  }).join('');
}

function buildKPICharts() {
  if (typeof Chart === 'undefined') return;

  // Chart 1: Achievement Rate per Petugas
  const ctx1 = document.getElementById('kpi-achv-chart');
  if (ctx1) {
    if (window._chartAchvInstance) window._chartAchvInstance.destroy();
    const names = _kpiOfficersData.map(o => o.nama.split(' ')[0]);
    const values = _kpiOfficersData.map(o => o.achievement);
    const colors = values.map(v => v >= 70 ? '#0D7A4E' : v >= 50 ? '#B05C08' : '#C0392C');

    window._chartAchvInstance = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: names.length ? names : ['Tidak ada data'],
        datasets: [{
          data: values.length ? values : [0],
          backgroundColor: colors.length ? colors : ['#0F766E'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => v + '%' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Chart 2: Distribusi Status Penagihan
  const ctx2 = document.getElementById('kpi-statusdist-chart');
  if (ctx2) {
    if (window._chartStatusInstance) window._chartStatusInstance.destroy();
    const statuses = ['Terjadwal', 'Dalam Proses', 'Selesai', 'Batal', 'Lewat Jatuh Tempo'];
    const counts = statuses.map(st => _kpiP3Schedules.filter(s => s.status === st).length);
    const bgColors = ['#1A5FA8', '#B05C08', '#0D7A4E', '#8FA8A5', '#C0392C'];

    window._chartStatusInstance = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: ['Terjadwal', 'Proses', 'Selesai', 'Batal', 'Overdue'],
        datasets: [{
          data: counts,
          backgroundColor: bgColors,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

// 8. MANAJEMEN USER VIEW
let _allUsersCache = [];

async function loadUsersView() {
  const container = document.getElementById('users-content');
  const hdrActions = document.getElementById('users-hdr-actions');
  if (!container) return;

  if (hdrActions) {
    hdrActions.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="openAddUserModal()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah User Baru
      </button>
    `;
  }

  container.innerHTML = `<div class="empty-st"><p>Memuat daftar pengguna...</p></div>`;

  try {
    const activeUsers = await apiCall('/users/active');
    const pendingUsers = await apiCall('/users/pending');

    const activeList = Array.isArray(activeUsers) ? activeUsers : (activeUsers?.users || []);
    const pendingList = Array.isArray(pendingUsers) ? pendingUsers : (pendingUsers?.users || []);

    _allUsersCache = [...pendingList, ...activeList];

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div style="font-size:13.5px;font-weight:700;color:var(--text);">Total Pengguna: ${_allUsersCache.length} Akun</div>
        <button class="btn btn-primary btn-sm" onclick="openAddUserModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:4px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Tambah User Baru
        </button>
      </div>

      <div class="table-wrap">
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Nama Lengkap</th>
                <th>Email</th>
                <th>Posisi / Divisi</th>
                <th>Status</th>
                <th style="width:230px;">Aksi / Pindah Divisi</th>
              </tr>
            </thead>
            <tbody>
              ${_allUsersCache.length === 0 ? '<tr><td colspan="6" class="empty-st">Tidak ada daftar pengguna</td></tr>' : _allUsersCache.map(u => `
                <tr>
                  <td class="mono font-bold">${u.username}</td>
                  <td class="font-bold">${u.nama}</td>
                  <td>${u.email}</td>
                  <td>
                    <select class="form-select" style="font-size:12px;padding:4px 12px;border-radius:9999px;width:auto;" onchange="quickChangeUserDivisi('${u.id}', this.value)">
                      <option value="admin" ${u.posisi==='admin'?'selected':''}>Administrator Utama</option>
                      <option value="kabid_p3" ${u.posisi==='kabid_p3'?'selected':''}>Kabid P3</option>
                      <option value="staff_p3" ${u.posisi==='staff_p3'?'selected':''}>Staff P3 (Penagihan)</option>
                      <option value="desk_call" ${u.posisi==='desk_call'?'selected':''}>Staff Desk Call</option>
                      <option value="legal" ${u.posisi==='legal'?'selected':''}>Staff Legal & Agunan</option>
                    </select>
                  </td>
                  <td>
                    <span class="badge ${u.status==='active'?'badge-green':u.status==='pending'?'badge-yellow':u.status==='inactive'?'badge-gray':'badge-red'}">
                      ${u.status}
                    </span>
                  </td>
                  <td>
                    <div style="display:flex;gap:6px;align-items:center;">
                      ${u.status === 'pending' ? `
                        <button class="btn btn-primary btn-sm" style="padding:4px 8px;font-size:11px;" onclick="approveUser('${u.id}')">Setujui</button>
                        <button class="btn btn-danger-out btn-sm" style="padding:4px 8px;font-size:11px;" onclick="rejectUser('${u.id}')">Tolak</button>
                      ` : ''}
                      <button class="btn btn-outline btn-sm" style="padding:4px 8px;font-size:11px;" onclick="openEditUserModal('${u.id}')">Edit</button>
                      ${state.user?.id !== u.id ? `
                        <button class="btn btn-danger-out btn-sm" style="padding:4px 8px;font-size:11px;" onclick="deleteUser('${u.id}', '${u.username}')">Hapus</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-st"><p>Gagal memuat user: ${err.message}</p></div>`;
  }
}

function openAddUserModal() {
  document.getElementById('uf-title').innerText = 'Tambah Pengguna Baru';
  document.getElementById('uf-id').value = '';
  document.getElementById('uf-username').value = '';
  document.getElementById('uf-username').readOnly = false;
  document.getElementById('uf-nama').value = '';
  document.getElementById('uf-email').value = '';
  document.getElementById('uf-ttl').value = '';
  document.getElementById('uf-posisi').value = 'staff_p3';
  document.getElementById('uf-status').value = 'active';
  document.getElementById('uf-password').value = '';
  document.getElementById('uf-err').innerText = '';
  openModal('modal-user-form');
}

function openEditUserModal(id) {
  const u = _allUsersCache.find(x => x.id === id);
  if (!u) return;

  document.getElementById('uf-title').innerText = `Edit User: ${u.username}`;
  document.getElementById('uf-id').value = u.id;
  document.getElementById('uf-username').value = u.username;
  document.getElementById('uf-username').readOnly = true;
  document.getElementById('uf-nama').value = u.nama || '';
  document.getElementById('uf-email').value = u.email || '';
  document.getElementById('uf-ttl').value = u.tglLahir ? u.tglLahir.substring(0, 10) : '';
  document.getElementById('uf-posisi').value = u.posisi || 'staff_p3';
  document.getElementById('uf-status').value = u.status || 'active';
  document.getElementById('uf-password').value = '';
  document.getElementById('uf-err').innerText = '';
  openModal('modal-user-form');
}

async function saveUserForm() {
  const id = document.getElementById('uf-id').value;
  const username = document.getElementById('uf-username').value.trim();
  const nama = document.getElementById('uf-nama').value.trim();
  const email = document.getElementById('uf-email').value.trim();
  const tgl_lahir = document.getElementById('uf-ttl').value;
  const posisi = document.getElementById('uf-posisi').value;
  const status = document.getElementById('uf-status').value;
  const password = document.getElementById('uf-password').value;
  const errEl = document.getElementById('uf-err');

  if (errEl) errEl.innerText = '';

  if (!username || !nama || !email || !posisi) {
    if (errEl) errEl.innerText = 'Username, Nama, Email, dan Posisi wajib diisi.';
    return;
  }

  try {
    if (id) {
      // EDIT existing user
      await apiCall(`/users/${id}/edit`, {
        method: 'PUT',
        body: JSON.stringify({ nama, email, posisi, status, password })
      });
      showToast('Data pengguna & posisi divisi berhasil diperbarui', 'success');
    } else {
      // CREATE new user
      if (!password || password.length < 6) {
        if (errEl) errEl.innerText = 'Password minimal 6 karakter untuk user baru.';
        return;
      }
      await apiCall('/users/create', {
        method: 'POST',
        body: JSON.stringify({ username, password, nama, email, tgl_lahir: tgl_lahir || '1990-01-01', posisi })
      });
      showToast('Pengguna baru berhasil ditambahkan', 'success');
    }

    closeModal('modal-user-form');
    loadUsersView();
  } catch (err) {
    if (errEl) errEl.innerText = err.message || 'Gagal menyimpan data pengguna';
  }
}

async function quickChangeUserDivisi(id, newPosisi) {
  try {
    await apiCall(`/users/${id}/edit`, {
      method: 'PUT',
      body: JSON.stringify({ posisi: newPosisi })
    });
    showToast(`Posisi divisi berhasil dipindahkan ke ${newPosisi}`, 'success');
    loadUsersView();
  } catch (err) {
    showToast(`Gagal memindahkan divisi: ${err.message}`, 'error');
    loadUsersView();
  }
}

async function deleteUser(id, username) {
  if (!confirm(`Apakah Anda yakin ingin menghapus user "${username}" secara permanen?`)) return;

  try {
    const res = await apiCall(`/users/${id}`, { method: 'DELETE' });
    showToast(res.message || 'User berhasil dihapus', 'warning');
    loadUsersView();
  } catch (err) {
    showToast(`Gagal menghapus user: ${err.message}`, 'error');
  }
}

async function approveUser(id) {
  try {
    const res = await apiCall(`/users/${id}/approve`, { method: 'POST' });
    showToast(res.message || 'User disetujui', 'success');
    loadUsersView();
  } catch (err) {}
}

async function rejectUser(id) {
  try {
    const res = await apiCall(`/users/${id}/reject`, { method: 'POST' });
    showToast(res.message || 'User ditolak', 'warning');
    loadUsersView();
  } catch (err) {}
}

// 9. MANAJEMEN APLIKASI VIEW
async function loadAppMgmtView() {
  const container = document.getElementById('appmgmt-content');
  if (!container) return;

  await loadAppSettings();

  container.innerHTML = `
    <div class="dash-grid-2 mb-4">
      <div class="card">
        <h3 class="mb-4">Identitas Institusi</h3>
        <div class="form-group">
          <label class="form-label">Nama Bank / PT</label>
          <input type="text" id="set-pt-name" class="form-input" value="${state.settings.pt_name}"/>
        </div>
        <div class="color-swatch-row">
          <div class="color-swatch-label">
            <div class="color-swatch-name">Aksen Light Mode</div>
            <div class="color-swatch-sub">Warna tema utama</div>
          </div>
          <input type="color" id="set-accent-light" class="color-picker-input" value="${state.settings.accent_light}"/>
        </div>
        <div class="color-swatch-row">
          <div class="color-swatch-label">
            <div class="color-swatch-name">Aksen Dark Mode</div>
            <div class="color-swatch-sub">Warna tema malam</div>
          </div>
          <input type="color" id="set-accent-dark" class="color-picker-input" value="${state.settings.accent_dark}"/>
        </div>
        <button class="btn btn-primary btn-block mt-4" onclick="saveAppSettings()">Simpan Pengaturan</button>
      </div>

      <!-- COMBINED LOGO & FAVICON CAPSULE CARD -->
      <div class="card">
        <h3 class="mb-1">Logo &amp; Aset Visual Website</h3>
        <p style="font-size:12.5px;color:var(--text-2);margin-bottom:20px;">Kelola logo perusahaan dan favicon tab browser dalam satu capsule yang rapi.</p>

        <!-- SUB-SECTION LOGO PERUSAHAAN -->
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">🏢 Logo Perusahaan</div>
          <div style="font-size:11.5px;color:var(--text-3);margin-bottom:12px;">Tampil pada header aplikasi, sidebar drawer, dan halaman login.</div>
          <div class="logo-upload-zone" onclick="document.getElementById('logo-file-input').click()">
            <div class="logo-preview-box">
              ${state.settings.logo_url ? `<img src="${state.settings.logo_url}" alt="Logo"/>` : 'BM'}
            </div>
            <div>
              <div style="font-weight:700;font-size:13px;">Klik untuk Upload Logo Baru</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px;">Format PNG, JPG, SVG (Max 2MB)</div>
            </div>
          </div>
          <input type="file" id="logo-file-input" class="hidden" accept=".png,.jpg,.jpeg,.svg" onchange="uploadLogoFile(this.files[0])"/>
        </div>

        <!-- SUB-SECTION FAVICON WEBSITE -->
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:16px;">
          <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">🌐 Favicon Website</div>
          <div style="font-size:11.5px;color:var(--text-3);margin-bottom:12px;">Ikon tab browser yang tampil di samping judul halaman web.</div>
          <div class="logo-upload-zone" onclick="document.getElementById('favicon-file-input').click()">
            <div class="logo-preview-box" style="width:48px;height:48px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;">
              ${state.settings.favicon_url ? `<img src="${state.settings.favicon_url}" alt="Favicon" style="width:100%;height:100%;object-fit:contain;"/>` : '🌐'}
            </div>
            <div>
              <div style="font-weight:700;font-size:13px;">Klik untuk Upload Favicon Baru</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px;">Format ICO, PNG, SVG, JPG (Max 2MB)</div>
            </div>
          </div>
          <input type="file" id="favicon-file-input" class="hidden" accept=".ico,.png,.svg,.jpg,.jpeg" onchange="uploadFaviconFile(this.files[0])"/>
        </div>
      </div>
    </div>
  `;
}

async function saveAppSettings() {
  const pt_name = document.getElementById('set-pt-name')?.value;
  const accent_light = document.getElementById('set-accent-light')?.value;
  const accent_dark = document.getElementById('set-accent-dark')?.value;

  try {
    const res = await apiCall('/app-settings', {
      method: 'POST',
      body: JSON.stringify({ pt_name, accent_light, accent_dark })
    });
    state.settings = { ...state.settings, ...res };
    showToast('Pengaturan aplikasi berhasil disimpan', 'success');
  } catch (err) {}
}

async function uploadLogoFile(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);

  try {
    showToast('Mengunggah logo perusahaan...', 'info');
    const res = await apiCall('/app-settings/logo', {
      method: 'POST',
      body: fd
    });
    state.settings.logo_url = res.logo_url;
    applyLogo(res.logo_url);
    showToast('Logo perusahaan berhasil diupload', 'success');
    loadAppMgmtView();
  } catch (err) {
    showToast(`Gagal mengunggah logo: ${err.message}`, 'danger');
  }
}

async function uploadFaviconFile(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);

  try {
    showToast('Mengunggah favicon website...', 'info');
    const res = await apiCall('/app-settings/favicon', {
      method: 'POST',
      body: fd
    });
    state.settings.favicon_url = res.favicon_url;
    applyFavicon(res.favicon_url);
    showToast('Favicon website berhasil diupload', 'success');
    loadAppMgmtView();
  } catch (err) {
    showToast(`Gagal mengunggah favicon: ${err.message}`, 'danger');
  }
}

// 10. IMPORT CBS VIEW
async function loadImportCbsView() {
  const container = document.getElementById('importcbs-content');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px;">
      <!-- CARD UPLOAD FILE CBS -->
      <div class="card" style="max-width:960px;margin:0 auto;width:100%;">
        <h3 class="mb-2">Upload File CSV CBS (100 Kolom)</h3>
        <p class="text-muted" style="font-size:12.5px;margin-bottom:16px;">Ekspor dari Assist-BPRS.Net untuk sinkronisasi harian baki debet &amp; kolektibilitas.</p>

        <div class="foto-zone" onclick="document.getElementById('cbs-file').click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
          <p>Tarik file CSV CBS Anda kemari, atau klik untuk memilih file</p>
        </div>
        <input type="file" id="cbs-file" accept=".csv" class="hidden" onchange="uploadCbsCsv(this.files[0])"/>

        <div id="cbs-preview" style="margin-top:16px;display:none;"></div>
      </div>

      <!-- CARD LOG HISTORY IMPORT CBS -->
      <div class="card" style="max-width:960px;margin:0 auto;width:100%;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div>
            <h3 style="margin:0;font-size:16px;font-weight:800;display:flex;align-items:center;gap:8px;">
              📊 Log History Import &amp; Staging CBS
            </h3>
            <p class="text-muted" style="font-size:12px;margin-top:2px;margin-bottom:0;">Riwayat perubahan kolektibilitas, debitur baru, dan status upload staging ke database.</p>
          </div>
          <button class="btn btn-outline btn-sm" onclick="loadCbsImportHistory()" style="font-size:12px;display:flex;align-items:center;gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh Log History
          </button>
        </div>

        <div id="cbs-history-table-container">
          <div style="text-align:center;padding:24px;color:var(--text-3);font-size:13px;">Memuat log history import...</div>
        </div>
      </div>
    </div>
  `;

  await loadCbsImportHistory();
}

async function loadCbsImportHistory() {
  const tableContainer = document.getElementById('cbs-history-table-container');
  if (!tableContainer) return;

  try {
    const history = await apiCall('/import/cbs/history');
    if (!history || history.length === 0) {
      tableContainer.innerHTML = `
        <div class="empty-st" style="padding:28px 0;text-align:center;">
          <p style="margin:0;color:var(--text-3);font-size:13px;">Belum ada riwayat log upload file CBS.</p>
        </div>
      `;
      return;
    }

    tableContainer.innerHTML = `
      <div class="tbl-hint">← Geser tabel ke samping untuk melihat seluruh kolom →</div>
      <div class="tbl-wrap" style="width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <table class="tbl" style="width:100%;font-size:12.5px;min-width:850px;">
          <thead>
            <tr>
              <th style="white-space:nowrap;">Waktu Upload</th>
              <th style="white-space:nowrap;">Nama File &amp; Snapshot</th>
              <th style="white-space:nowrap;">Pengunggah</th>
              <th style="text-align:center;white-space:nowrap;">Total Baris</th>
              <th style="white-space:nowrap;">Data Berubah (Kolektibilitas / Status)</th>
              <th style="text-align:center;white-space:nowrap;">Status</th>
              <th style="text-align:right;white-space:nowrap;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(item => {
              let statusBadge = '<span class="badge badge-teal">Selesai (Applied)</span>';
              if (item.status === 'pending_review') {
                statusBadge = '<span class="badge badge-amber">Menunggu Commit</span>';
              } else if (item.status === 'failed') {
                statusBadge = '<span class="badge badge-red">Gagal</span>';
              }

              const formattedUploadTime = item.uploadedAt ? formatDateTime(item.uploadedAt) : '-';
              const formattedCutoff = item.tanggalSnapshot ? formatDate(item.tanggalSnapshot) : '-';

              return `
                <tr>
                  <td style="white-space:nowrap;font-size:12px;">
                    <div style="font-weight:700;color:var(--text);">${formattedUploadTime}</div>
                  </td>
                  <td>
                    <div style="font-weight:700;color:var(--brand);">${item.fileName || 'file.csv'}</div>
                    <div style="font-size:11px;color:var(--text-3);margin-top:2px;">Snapshot Cutoff: ${formattedCutoff}</div>
                  </td>
                  <td>
                    <span style="font-weight:600;font-size:12px;">👤 ${item.uploadedBy || 'System'}</span>
                  </td>
                  <td style="text-align:center;" class="mono font-bold">
                    ${(item.totalRowsParsed || 0).toLocaleString('id-ID')}
                  </td>
                  <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:11px;">
                      <span title="Data debitur yang baki debet / kolektibilitasnya diperbarui" style="color:var(--brand);background:var(--brand-light);padding:3px 8px;border-radius:6px;font-weight:700;">
                        🔄 ${item.totalUpdated || 0} Update
                      </span>
                      <span title="Debitur baru yang ditambahkan" style="color:var(--success);background:rgba(16,185,129,0.1);padding:3px 8px;border-radius:6px;font-weight:700;">
                        ✨ ${item.totalNewDetected || 0} Baru
                      </span>
                      <span title="Debitur yang tidak ada di CSV / lunas" style="color:var(--danger);background:rgba(239,68,68,0.1);padding:3px 8px;border-radius:6px;font-weight:700;">
                        ⚠️ ${item.totalMissingDetected || 0} Lunas/Missing
                      </span>
                    </div>
                  </td>
                  <td style="text-align:center;">
                    ${statusBadge}
                  </td>
                  <td style="text-align:right;">
                    ${item.status === 'pending_review' ? `
                      <button class="btn btn-primary btn-sm" onclick="commitCbsImport('${item.id}')" style="font-size:11px;padding:4px 10px;">
                        Terapkan
                      </button>
                    ` : `
                      <span style="font-size:11px;color:var(--text-3);">${item.appliedAt ? formatDate(item.appliedAt) : '-'}</span>
                    `}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    tableContainer.innerHTML = `
      <div class="auth-error" style="margin:12px 0;">Gagal memuat log history: ${err.message}</div>
    `;
  }
}

async function uploadCbsCsv(file) {
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);

  showToast('Memproses file staging CBS...', 'info');

  try {
    const res = await apiCall('/import/cbs', {
      method: 'POST',
      body: fd
    });

    const preview = document.getElementById('cbs-preview');
    if (preview) {
      preview.style.display = 'block';
      preview.innerHTML = `
        <div style="background:var(--bg);padding:16px;border-radius:10px;border:1px solid var(--border);">
          <h4>Hasil Parsing Staging</h4>
          <p class="text-muted" style="font-size:11px;margin-top:2px;">Tanggal Snapshot: <strong>${formatDate(res.tanggalSnapshot)}</strong></p>
          <div class="m-card-grid mt-3">
            <div><div class="m-field-label">Total Baris</div><div class="m-field-value mono">${res.totalRowsParsed}</div></div>
            <div><div class="m-field-label">Update Debitur</div><div class="m-field-value mono text-blue">${res.totalUpdated}</div></div>
            <div><div class="m-field-label">Debitur Baru</div><div class="m-field-value mono text-green">${res.totalNewDetected}</div></div>
            <div><div class="m-field-label">Missing</div><div class="m-field-value mono text-danger">${res.totalMissingDetected}</div></div>
          </div>
          <button class="btn btn-primary btn-block mt-4" onclick="commitCbsImport('${res.batchId}')">Terapkan Import (Atomic Upsert)</button>
        </div>
      `;
    }
    await loadCbsImportHistory();
  } catch (err) {
    showToast(`Gagal memproses file: ${err.message}`, 'danger');
  }
}

async function commitCbsImport(batchId) {
  showToast('Menerapkan sinkronisasi database...', 'info');
  try {
    const res = await apiCall(`/import/cbs/${batchId}/commit`, { method: 'POST' });
    showToast(res.message, 'success');
    loadImportCbsView();
  } catch (err) {
    showToast(`Gagal menerapkan import: ${err.message}`, 'danger');
  }
}

// 11. DESK CALL & PEMBAYARAN FORM HANDLERS
let selectedDCDebiturId = '';
let dcAcDebounce = null;

async function openDCModal(debiturId) {
  selectedDCDebiturId = debiturId || '';
  const dcfDeb = document.getElementById('dcf-debitur');
  const dcfTgl = document.getElementById('dcf-tgl');
  const dcfJenis = document.getElementById('dcf-jenis');
  const dcfStatus = document.getElementById('dcf-status');
  const dcfPrio = document.getElementById('dcf-prioritas');
  const dcfTindak = document.getElementById('dcf-tindak');
  const dcfNominal = document.getElementById('dcf-nominal');
  const dcfTglJanji = document.getElementById('dcf-tgl-janji');
  const dcfBaki = document.getElementById('dcf-baki');
  const dcfCatatan = document.getElementById('dcf-catatan');
  const dcfAc = document.getElementById('dcf-ac');

  if (dcfAc) dcfAc.style.display = 'none';

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const mins = String(now.getMinutes()).padStart(2, '0');
  if (dcfTgl) dcfTgl.value = `${year}-${month}-${day}T${hours}:${mins}`;

  if (dcfJenis) dcfJenis.value = 'Telepon';
  if (dcfStatus) dcfStatus.value = 'Terhubung';
  if (dcfPrio) dcfPrio.value = 'Sedang';
  if (dcfTindak) dcfTindak.value = '';
  if (dcfNominal) dcfNominal.value = '';
  if (dcfTglJanji) dcfTglJanji.value = '';
  if (dcfCatatan) dcfCatatan.value = '';
  if (dcfBaki) dcfBaki.value = '';

  if (debiturId) {
    try {
      const d = await apiCall(`/debitur/${debiturId}`);
      if (dcfDeb) dcfDeb.value = `${d.nama} (${d.id})`;
      if (dcfBaki) dcfBaki.value = formatRupiah(d.bakiDebet);
    } catch (err) {
      if (dcfDeb) dcfDeb.value = debiturId;
    }
  } else {
    if (dcfDeb) dcfDeb.value = '';
  }

  openModal('modal-dc-form');
}

function openDCForm(debiturId) {
  openDCModal(debiturId);
}

function dcAutocomplete(val) {
  const ac = document.getElementById('dcf-ac');
  if (!ac) return;
  if (!val || val.length < 2) {
    ac.style.display = 'none';
    return;
  }

  if (dcAcDebounce) clearTimeout(dcAcDebounce);
  dcAcDebounce = setTimeout(async () => {
    try {
      const res = await apiCall(`/debitur?q=${encodeURIComponent(val)}&limit=6`);
      const list = res.debiturs || [];
      if (list.length === 0) {
        ac.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:var(--text-3);">Tidak ada debitur ditemukan</div>`;
      } else {
        ac.innerHTML = list.map(d => `
          <div style="padding:8px 12px;font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--border);" 
               onmouseover="this.style.background='var(--bg-hover)'" 
               onmouseout="this.style.background='none'" 
               onclick="selectDCDebitur('${d.id}', '${d.nama.replace(/'/g, "\\'")}', ${d.bakiDebet})">
            <div style="font-weight:700;">${d.nama}</div>
            <div class="mono" style="font-size:11px;color:var(--text-3);">${d.id} &middot; Baki: ${formatRupiah(d.bakiDebet)}</div>
          </div>
        `).join('');
      }
      ac.style.display = 'block';
    } catch (err) {}
  }, 250);
}

function selectDCDebitur(id, nama, bakiDebet) {
  selectedDCDebiturId = id;
  const dcfDeb = document.getElementById('dcf-debitur');
  const dcfBaki = document.getElementById('dcf-baki');
  const ac = document.getElementById('dcf-ac');
  if (dcfDeb) dcfDeb.value = `${nama} (${id})`;
  if (dcfBaki) dcfBaki.value = formatRupiah(bakiDebet);
  if (ac) ac.style.display = 'none';
}

async function saveDC() {
  const dcfDeb = document.getElementById('dcf-debitur')?.value || '';
  const dcfTgl = document.getElementById('dcf-tgl')?.value || '';
  const dcfJenis = document.getElementById('dcf-jenis')?.value || 'Telepon';
  const dcfStatus = document.getElementById('dcf-status')?.value || 'Terhubung';
  const dcfPrio = document.getElementById('dcf-prioritas')?.value || 'Sedang';
  const dcfTindak = document.getElementById('dcf-tindak')?.value || '';
  const dcfNominal = document.getElementById('dcf-nominal')?.value || '';
  const dcfTglJanji = document.getElementById('dcf-tgl-janji')?.value || '';
  const dcfCatatan = document.getElementById('dcf-catatan')?.value || '';

  let debiturId = selectedDCDebiturId;
  if (!debiturId && dcfDeb.includes('(') && dcfDeb.includes(')')) {
    const matches = dcfDeb.match(/\(([^)]+)\)/);
    if (matches && matches[1]) debiturId = matches[1].trim();
  }

  // Smart fallback: search by name or ID if user typed directly without selecting autocomplete
  if (!debiturId && dcfDeb.trim()) {
    try {
      const qRes = await apiCall(`/debitur?q=${encodeURIComponent(dcfDeb.trim())}&limit=1`);
      if (qRes.debiturs && qRes.debiturs.length > 0) {
        debiturId = qRes.debiturs[0].id;
      }
    } catch (e) {}
  }

  if (!debiturId) {
    showToast('Debitur tidak ditemukan. Pilih dari daftar atau ketik nama/no. rek yang valid', 'w');
    return;
  }

  const nowStr = new Date().toISOString();
  let [tanggal, waktu] = dcfTgl ? dcfTgl.split('T') : [nowStr.substring(0, 10), '10:00'];
  if (!waktu) waktu = '10:00';

  const payload = {
    debiturId,
    tanggal,
    waktu,
    jenisKontak: dcfJenis,
    statusKontak: dcfStatus,
    prioritas: dcfPrio,
    tindakLanjut: dcfTindak || 'Tidak Ada',
    nominalJanji: dcfNominal ? parseFloat(dcfNominal) : null,
    tanggalJanjiBayar: dcfTglJanji || null,
    hasilKomunikasi: dcfCatatan
  };

  try {
    showToast('Menyimpan catatan Desk Call...', 'i');
    await apiCall('/deskcall', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Catatan Desk Call berhasil disimpan', 's');
    closeModal('modal-dc-form');
    if (typeof loadDeskCallView === 'function') loadDeskCallView();
    if (typeof loadDashboardView === 'function') loadDashboardView();
  } catch (err) {
    showToast(`Gagal menyimpan Desk Call: ${err.message}`, 'e');
  }
}

let selectedPayDebiturId = '';
let payAcDebounce = null;

async function openPayForm(debiturId) {
  selectedPayDebiturId = debiturId || '';
  const payfDeb = document.getElementById('payf-debitur');
  const payfTgl = document.getElementById('payf-tanggal');
  const payfJml = document.getElementById('payf-jumlah');
  const payfKol = document.getElementById('payf-kol');
  const payfMetode = document.getElementById('payf-metode');
  const payfPetugas = document.getElementById('payf-petugas');
  const payfKet = document.getElementById('payf-keterangan');
  const payfAc = document.getElementById('payf-ac');

  if (payfAc) payfAc.style.display = 'none';

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  if (payfTgl) payfTgl.value = `${year}-${month}-${day}`;

  if (payfJml) payfJml.value = '';
  if (payfMetode) payfMetode.value = 'Transfer';
  if (payfPetugas) payfPetugas.value = state.user?.nama || 'Petugas';
  if (payfKet) payfKet.value = '';

  if (debiturId) {
    try {
      const d = await apiCall(`/debitur/${debiturId}`);
      if (payfDeb) payfDeb.value = `${d.nama} (${d.id})`;
      if (payfKol) payfKol.value = d.kol;
    } catch (err) {
      if (payfDeb) payfDeb.value = debiturId;
    }
  } else {
    if (payfDeb) payfDeb.value = '';
    if (payfKol) payfKol.value = 'Lancar';
  }

  openModal('modal-pay-form');
}

function payAutocomplete(val) {
  const ac = document.getElementById('payf-ac');
  if (!ac) return;
  if (!val || val.length < 2) {
    ac.style.display = 'none';
    return;
  }

  if (payAcDebounce) clearTimeout(payAcDebounce);
  payAcDebounce = setTimeout(async () => {
    try {
      const res = await apiCall(`/debitur?q=${encodeURIComponent(val)}&limit=6`);
      const list = res.debiturs || [];
      if (list.length === 0) {
        ac.innerHTML = `<div style="padding:8px 12px;font-size:12px;color:var(--text-3);">Tidak ada debitur ditemukan</div>`;
      } else {
        ac.innerHTML = list.map(d => `
          <div style="padding:8px 12px;font-size:12.5px;cursor:pointer;border-bottom:1px solid var(--border);" 
               onmouseover="this.style.background='var(--bg-hover)'" 
               onmouseout="this.style.background='none'" 
               onclick="selectPayDebitur('${d.id}', '${d.nama.replace(/'/g, "\\'")}', '${d.kol}')">
            <div style="font-weight:700;">${d.nama}</div>
            <div class="mono" style="font-size:11px;color:var(--text-3);">${d.id} &middot; KOL: ${d.kol}</div>
          </div>
        `).join('');
      }
      ac.style.display = 'block';
    } catch (err) {}
  }, 250);
}

function selectPayDebitur(id, nama, kol) {
  selectedPayDebiturId = id;
  const payfDeb = document.getElementById('payf-debitur');
  const payfKol = document.getElementById('payf-kol');
  const ac = document.getElementById('payf-ac');
  if (payfDeb) payfDeb.value = `${nama} (${id})`;
  if (payfKol) payfKol.value = kol;
  if (ac) ac.style.display = 'none';
}

async function savePayForm() {
  const payfDeb = document.getElementById('payf-debitur')?.value || '';
  const payfTgl = document.getElementById('payf-tanggal')?.value || '';
  const payfJml = document.getElementById('payf-jumlah')?.value || '';
  const payfKol = document.getElementById('payf-kol')?.value || 'Lancar';
  const payfMetode = document.getElementById('payf-metode')?.value || 'Transfer';
  const payfKet = document.getElementById('payf-keterangan')?.value || '';

  let debiturId = selectedPayDebiturId;
  if (!debiturId && payfDeb.includes('(') && payfDeb.includes(')')) {
    const matches = payfDeb.match(/\(([^)]+)\)/);
    if (matches && matches[1]) debiturId = matches[1].trim();
  }

  // Smart fallback: search by name or ID if user typed directly without selecting autocomplete
  if (!debiturId && payfDeb.trim()) {
    try {
      const qRes = await apiCall(`/debitur?q=${encodeURIComponent(payfDeb.trim())}&limit=1`);
      if (qRes.debiturs && qRes.debiturs.length > 0) {
        debiturId = qRes.debiturs[0].id;
      }
    } catch (e) {}
  }

  if (!debiturId) {
    showToast('Debitur tidak ditemukan. Pilih dari daftar atau ketik nama/no. rek yang valid', 'w');
    return;
  }

  const tanggal = payfTgl || new Date().toISOString().substring(0, 10);

  if (!payfJml || parseFloat(payfJml) <= 0) {
    showToast('Jumlah Bayar harus lebih dari 0', 'w');
    return;
  }

  const payload = {
    debiturId,
    tanggal,
    nominal: parseFloat(payfJml),
    kol: payfKol,
    metode: payfMetode,
    keterangan: payfKet
  };

  try {
    showToast('Menyimpan pencatatan pembayaran...', 'i');
    await apiCall('/pembayaran', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Pembayaran berhasil dicatat', 's');
    closeModal('modal-pay-form');
    if (typeof loadBayarView === 'function') loadBayarView();
    if (typeof loadDebiturView === 'function') loadDebiturView();
    if (typeof loadDashboardView === 'function') loadDashboardView();
  } catch (err) {
    showToast(`Gagal mencatat pembayaran: ${err.message}`, 'e');
  }
}

// Initializer on Page Load
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  await loadAppSettings();

  if (state.accessToken && state.user) {
    try {
      const freshUser = await apiCall('/auth/me');
      if (freshUser && !freshUser.error) {
        state.user = { ...state.user, ...freshUser };
        localStorage.setItem('user', JSON.stringify(state.user));
      }
    } catch (e) {}

    setupAppShell();
    const initialHash = window.location.hash.replace('#/', '') || 'dashboard';
    switchPane(initialHash);
  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
  }
});
