/* BPRS Mitra Harmoni Yogyakarta — Global State Module */

export const state = {
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
