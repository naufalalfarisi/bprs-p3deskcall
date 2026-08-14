/* BPRS Mitra Harmoni Yogyakarta — Utility & Helper Functions Module */
import { state } from './state.js';

export function formatRupiah(num) {
  if (num === null || num === undefined) return 'Rp 0';
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

export function fmtRp(num) {
  return formatRupiah(num);
}

export function fmtM(num) {
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

export function formatCurrencyInput(inputEl) {
  if (!inputEl) return;
  let val = inputEl.value;
  let rawDigits = val.replace(/\D/g, '');
  if (!rawDigits) {
    inputEl.value = '';
    return;
  }
  let formatted = parseInt(rawDigits, 10).toLocaleString('id-ID');
  inputEl.value = formatted;
}

export function parseCurrencyInput(valueOrEl) {
  if (!valueOrEl) return 0;
  const str = typeof valueOrEl === 'string' ? valueOrEl : (valueOrEl.value || '');
  const digits = str.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatJatuhTempoBulanIni(tglJtVal, refDateStr = null) {
  if (!tglJtVal) return '-';
  const refDate = refDateStr ? new Date(refDateStr) : new Date();
  const validRef = isNaN(refDate.getTime()) ? new Date() : refDate;

  let dayNum = null;
  const d = new Date(tglJtVal);
  if (!isNaN(d.getTime())) {
    dayNum = d.getDate();
  } else {
    const parsed = parseInt(tglJtVal, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
      dayNum = parsed;
    }
  }

  if (dayNum) {
    const jtDate = new Date(validRef.getFullYear(), validRef.getMonth(), dayNum);
    return formatDate(jtDate);
  }
  return formatDate(tglJtVal);
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function showToast(message, type = 'info') {
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

export async function shareDebiturSummary(nama, telepon, debiturId, totalTunggakan, alamat) {
  const shareText = `*RINGKASAN DEBITUR - BPRS MITRA HARMONI*\n` +
    `Nama: ${nama}\n` +
    `No. Rekening: ${debiturId}\n` +
    `No. Telp: ${telepon || '-'}\n` +
    `Total Tunggakan: ${formatRupiah(totalTunggakan || 0)}\n` +
    `Alamat: ${alamat || '-'}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: `Debitur ${nama}`,
        text: shareText
      });
      showToast('Ringkasan debitur berhasil dibagikan', 'success');
      return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        fallbackShareWA(shareText);
      }
    }
  } else {
    fallbackShareWA(shareText);
  }
}

export function fallbackShareWA(text) {
  copyToClipboard(text, 'Ringkasan Debitur');
  const encoded = encodeURIComponent(text);
  window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
}

export function copyToClipboard(text, label = 'Data') {
  if (!text) return;
  const cleanText = String(text).trim();
  if (!cleanText) return;

  const handleSuccess = () => {
    showToast(`${label} ("${cleanText}") berhasil disalin ke clipboard`, 'success');
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cleanText).then(handleSuccess).catch(() => {
      fallbackCopyText(cleanText, label);
    });
  } else {
    fallbackCopyText(cleanText, label);
  }
}

export function fallbackCopyText(text, label) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    document.execCommand('copy');
    showToast(`${label} ("${text}") berhasil disalin ke clipboard`, 'success');
  } catch (err) {
    showToast(`Gagal menyalin ${label}`, 'warning');
  }
  document.body.removeChild(textArea);
}

// Table Density Mode (Compact vs Normal)
let tableDensityState = localStorage.getItem('table_density') || 'normal';

export function initTableDensity() {
  document.documentElement.setAttribute('data-table-density', tableDensityState);
  updateTableDensityButtons();
}

export function toggleTableDensity() {
  tableDensityState = tableDensityState === 'compact' ? 'normal' : 'compact';
  localStorage.setItem('table_density', tableDensityState);
  document.documentElement.setAttribute('data-table-density', tableDensityState);
  updateTableDensityButtons();
  showToast(`Mode tampilan tabel diubah ke: ${tableDensityState === 'compact' ? 'Ringkas (Compact)' : 'Normal'}`, 'info');
}

export function updateTableDensityButtons() {
  const btns = document.querySelectorAll('.btn-density-toggle');
  btns.forEach(btn => {
    btn.innerText = tableDensityState === 'compact' ? 'Mode Normal' : 'Mode Ringkas';
  });
}

// Search term auto-highlighting
export function highlightSearchTerm(text, query) {
  if (!text) return '';
  const str = String(text);
  if (!query || !query.trim()) return str;

  const q = query.trim();
  const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return str.replace(regex, '<mark style="background:#FEF08A;color:#854D0E;padding:0 3px;border-radius:3px;font-weight:700;">$1</mark>');
}

// Smart double-submit protection
export async function protectButtonSubmit(buttonEl, asyncFn) {
  if (!buttonEl) return asyncFn();
  if (buttonEl.disabled || buttonEl.getAttribute('data-submitting') === 'true') return;

  buttonEl.disabled = true;
  buttonEl.setAttribute('data-submitting', 'true');
  const originalText = buttonEl.innerHTML;
  buttonEl.innerHTML = `<svg style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:6px;animation:spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg> Memproses...`;

  try {
    const result = await asyncFn();
    return result;
  } finally {
    setTimeout(() => {
      buttonEl.disabled = false;
      buttonEl.removeAttribute('data-submitting');
      buttonEl.innerHTML = originalText;
    }, 1000);
  }
}

// Quick date filter presets
export function setQuickDateRange(preset, startDateId, endDateId, onApplyCallback) {
  const startInput = document.getElementById(startDateId);
  const endInput = document.getElementById(endDateId);

  const today = new Date();
  const formatYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  let startStr = '';
  let endStr = formatYMD(today);

  if (preset === 'today') {
    startStr = formatYMD(today);
  } else if (preset === 'week') {
    const d = new Date(today);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    startStr = formatYMD(monday);
  } else if (preset === 'month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    startStr = formatYMD(firstDay);
  }

  if (startInput) startInput.value = startStr;
  if (endInput) endInput.value = endStr;

  if (typeof onApplyCallback === 'function') {
    onApplyCallback();
  }
}
