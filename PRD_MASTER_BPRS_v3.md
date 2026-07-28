# PRD MASTER — Sistem Dashboard Penagihan NPF
## PT BPRS Mitra Harmoni Yogyakarta

**Versi:** 3.0 (Final Konsolidasi)
**Tanggal:** 18 Juli 2026
**Status:** Siap untuk implementasi (vibe coding)
**Dasar dokumen:** Konsolidasi seluruh sesi diskusi requirement, prototype `BPRS_Dashboard_v4_FINAL.html`, dan seluruh keputusan desain yang telah disepakati.

---

## DAFTAR ISI

1. [Ringkasan Eksekutif](#1-ringkasan-eksekutif)
2. [Tujuan & Ruang Lingkup](#2-tujuan--ruang-lingkup)
3. [Tech Stack & Arsitektur](#3-tech-stack--arsitektur)
4. [Role & Hak Akses (RBAC)](#4-role--hak-akses-rbac)
5. [Alur Autentikasi & Keamanan](#5-alur-autentikasi--keamanan)
6. [Skema Database Lengkap](#6-skema-database-lengkap)
7. [Modul: Dashboard](#7-modul-dashboard)
8. [Modul: Debitur](#8-modul-debitur)
9. [Modul: Desk Call & Customer Insight](#9-modul-desk-call--customer-insight)
10. [Modul: P3 (Penagihan Lapangan)](#10-modul-p3-penagihan-lapangan)
11. [Modul: Legal](#11-modul-legal)
12. [Modul: Riwayat Bayar](#12-modul-riwayat-bayar)
13. [Modul: KPI & Scorecard](#13-modul-kpi--scorecard)
14. [Modul: Manajemen User](#14-modul-manajemen-user)
15. [Modul: Manajemen Aplikasi](#15-modul-manajemen-aplikasi)
16. [Modul: Import Data CBS Kolektibilitas](#16-modul-import-data-cbs-kolektibilitas)
17. [Sistem Notifikasi](#17-sistem-notifikasi)
18. [Business Rules Konsolidasi](#18-business-rules-konsolidasi)
19. [Desain Mobile-First & Responsif](#19-desain-mobile-first--responsif)
20. [Tema, Styling & Animasi](#20-tema-styling--animasi)
21. [Non-Functional Requirements](#21-non-functional-requirements)
22. [Item Ditunda / Di Luar Cakupan Fase Ini](#22-item-ditunda--di-luar-cakupan-fase-ini)
23. [Riwayat Keputusan (Changelog Kronologis)](#23-riwayat-keputusan-changelog-kronologis)
24. [Lampiran: Spesifikasi Kolom Import CSV](#24-lampiran-spesifikasi-kolom-import-csv)

---

## 1. RINGKASAN EKSEKUTIF

PT BPRS Mitra Harmoni Yogyakarta membutuhkan sistem dashboard internal untuk mengelola proses penagihan pembiayaan bermasalah (NPF — Non Performing Financing), menggantikan sistem lama yang berupa file HTML tunggal berbasis `localStorage` (`bprs_dashboard_with_export.html`) tanpa autentikasi, tanpa database sungguhan, dan tanpa pemisahan hak akses.

Sistem baru ini adalah aplikasi web full-stack dengan:
- Autentikasi dan otorisasi berbasis role (5 peran pengguna)
- Database relasional sungguhan (bukan localStorage)
- Sinkronisasi data harian dari Core Banking System (CBS) internal bank
- 10 modul fungsional yang saling terhubung
- Desain mobile-first (dominan pengguna adalah staff lapangan dengan HP/tablet)

Dokumen ini adalah spesifikasi tunggal dan lengkap untuk membangun seluruh sistem — mencakup alur bisnis, skema database, hak akses per role, dan seluruh aturan bisnis yang telah disepakati sepanjang proses requirement gathering. Dokumen ini ditulis untuk dikonsumsi langsung oleh AI coding assistant (vibe coding) maupun developer manusia.

### 1.1 Konteks Bisnis

BPRS Mitra Harmoni Yogyakarta adalah Bank Perekonomian Rakyat Syariah dengan sekitar 1.400+ debitur pembiayaan aktif. Tim penagihan terdiri dari:
- **Desk Call** — tim yang menghubungi nasabah lewat telepon/WhatsApp untuk penagihan jarak jauh
- **P3 (Petugas Penagihan Pembiayaan)** — tim yang melakukan kunjungan lapangan langsung
- **Legal** — tim yang menangani proses hukum untuk kasus bermasalah lanjut
- **Kabid P3** — pengawas yang memantau kinerja tim dan menyusun target RBB (Rencana Bisnis Bank)
- **Admin** — mengelola sistem, user, dan sinkronisasi data dari CBS

### 1.2 Prinsip Desain Utama

1. **Data finansial (KOL, baki debet, tunggakan) adalah *read-only* dari sisi aplikasi** — nilai-nilai ini murni berasal dari sinkronisasi harian dengan CBS, tidak pernah diubah manual dari modul manapun di aplikasi ini.
2. **Setiap metrik dihitung ulang dari data mentah**, bukan disimpan sebagai angka statis — memastikan dashboard, KPI, dan laporan selalu konsisten satu sama lain.
3. **Mobile-first** — mayoritas pengguna mengakses dari HP/tablet di lapangan; tampilan desktop adalah penyempurnaan, bukan basis utama.
4. **Role menentukan alat, bukan hanya tampilan** — pembatasan akses tidak sekadar menyembunyikan tombol, tapi mencegah tabrakan proses bisnis (contoh: hanya Desk Call yang boleh menghubungi nasabah, mencegah nasabah dihubungi berkali-kali oleh staff berbeda tanpa koordinasi).

---

## 2. TUJUAN & RUANG LINGKUP

### 2.1 Tujuan

- Menyediakan satu sumber kebenaran (*single source of truth*) untuk data debitur, menggantikan pencatatan manual/tersebar
- Mengotomasi perhitungan KPI dan indikator kinerja tim penagihan sesuai kerangka RBB dan regulasi OJK
- Menyediakan jejak audit (*audit trail*) yang memadai untuk kebutuhan pelaporan OJK
- Memungkinkan koordinasi tim penagihan yang jelas melalui pembatasan akses berbasis peran

### 2.2 Ruang Lingkup Fase Ini

**Termasuk dalam cakupan:**
- Seluruh 10 modul yang dirinci di dokumen ini
- Sinkronisasi data harian dari CBS (semi-otomatis, dipicu manual oleh admin)
- Autentikasi, otorisasi, dan manajemen user dengan alur persetujuan
- Sistem notifikasi lintas modul
- Ekspor laporan (PDF/Excel) untuk Desk Call, P3, dan KPI

**Di luar cakupan fase ini** (lihat detail di §22):
- Migrasi data historis dari dashboard HTML lama
- Integrasi otomatis pelaporan ke portal OJK
- Deteksi duplikasi import pembayaran (wajib ada di fase produksi berikutnya)
- Infrastruktur deployment (VPS, domain, backup) — dibahas terpisah saat mendekati go-live

---

## 3. TECH STACK & ARSITEKTUR

### 3.1 Backend

| Komponen | Pilihan | Keterangan |
|---|---|---|
| Runtime | Node.js 20 LTS | |
| Framework | Hono 4.x | Ringan, cocok untuk VPS spek terbatas |
| Bahasa | TypeScript 5 | |
| ORM | Prisma 5 | |
| Database | MySQL 8 | |
| Cache/Session | Redis 7 | Untuk refresh token blacklist, rate limiting |
| Testing | Vitest | |
| Package manager | pnpm | |

### 3.2 Autentikasi & Keamanan

| Komponen | Pilihan |
|---|---|
| JWT | `jose` (HS256) |
| Hashing password | `bcryptjs` |
| Token revocation | Redis blacklist |

### 3.3 Pemrosesan File

| Kebutuhan | Library |
|---|---|
| Resize/compress gambar | Sharp (output WebP) |
| Baca/tulis Excel | ExcelJS (backend), SheetJS/xlsx (client-side untuk import) |
| Generate PDF | Puppeteer |

### 3.4 Deployment

| Komponen | Pilihan |
|---|---|
| Process manager | PM2 (cluster mode) |
| Reverse proxy | Nginx |
| Hosting | VPS |
| Timezone | `Asia/Jakarta` eksplisit via `process.env.TZ`, jangan mengasumsikan timezone server |

### 3.5 Frontend

Pendekatan **mobile-first**, dibangun sebagai SPA (Single Page Application) atau server-rendered dengan hydration ringan — keputusan framework spesifik (React/Vue/vanilla) diserahkan ke tim implementasi, namun **wajib** mengikuti:
- Breakpoint 3 tingkat (lihat §19)
- Navigasi drawer (Pola B) di semua breakpoint, sidebar tetap hanya di desktop besar
- Tema light/dark dengan warna aksen yang dapat dikustomisasi admin (lihat §15)
- Library chart: **Chart.js** (sudah divalidasi cocok untuk seluruh kebutuhan visualisasi di dashboard dan KPI)

---

## 4. ROLE & HAK AKSES (RBAC)

### 4.1 Lima Role Sistem

| Role | Deskripsi |
|---|---|
| `admin` | Administrator sistem — akses penuh termasuk Manajemen User & Aplikasi |
| `kabid_p3` | Kepala Bidang P3 — pengawas tim, menyusun Target RBB |
| `staff_p3` | Petugas penagihan lapangan |
| `desk_call` | Petugas penagihan telepon/WhatsApp |
| `legal` | Petugas penanganan berkas hukum |

### 4.2 Matriks Akses Menu

| Menu | admin | kabid_p3 | staff_p3 | desk_call | legal |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Debitur | ✅ | ✅ | ✅ | ✅ | ✅ |
| Desk Call | ✅ | ❌ | ❌ | ✅ | ❌ |
| P3 (Penagihan) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Legal | ✅ | ✅ | ❌ | ❌ | ✅ |
| Riwayat Bayar | ✅ | ✅ | ✅ | ✅ | ✅ |
| KPI & Scorecard | ✅ | ✅ | ✅ | ❌ | ✅ |
| Manajemen User | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manajemen Aplikasi | ✅ | ❌ | ❌ | ❌ | ❌ |
| Import Data CBS | ✅ | ❌ | ❌ | ❌ | ❌ |

Semua role melihat **seluruh debitur** (tidak difilter per AO secara default) — filter AO tersedia sebagai opsi, bukan pembatasan wajib.

### 4.3 Judul Header Dinamis per Role

| Role | Subtitle yang tampil di header |
|---|---|
| admin | Administrator |
| kabid_p3, staff_p3 | Pembinaan Pengawasan & Pembiayaan |
| desk_call | Desk Call |
| legal | Pembinaan Pengawasan & Pembiayaan · Legal |

### 4.4 Pembatasan Aksi Spesifik (bukan sekadar menu)

Beberapa aksi dibatasi lebih detail dari sekadar akses menu:

| Aksi | Role yang diizinkan | Alasan |
|---|---|---|
| Catat Desk Call (telepon/WA) | `desk_call` saja | Mencegah nasabah dihubungi berkali-kali oleh staff berbeda tanpa koordinasi; `desk_call` table jadi satu-satunya sumber kebenaran riwayat kontak |
| Catat Pembayaran Baru | Semua role yang akses Debitur/Riwayat Bayar | Mencatat kejadian yang sudah terjadi, bukan aksi kontak proaktif — risiko duplikasi rendah |
| Ubah/Edit data pembayaran tersimpan | `admin`, `kabid_p3` saja | Perubahan data finansial historis perlu otorisasi lebih tinggi |
| Set/Ubah Target RBB | `admin`, `kabid_p3` saja | Keputusan manajerial, bukan tugas eksekutor |
| Approve/Reject user baru | `admin` saja | |
| Import Data CBS | `admin` saja | |
| Ubah Manajemen Aplikasi (logo, warna) | `admin` saja | |

---

## 5. ALUR AUTENTIKASI & KEAMANAN

### 5.1 Login

- Username + password standar
- Rate limiting via Redis: 5x gagal berturut-turut → lockout 15 menit
- **Single device login**: sistem mendeteksi apakah user memiliki sesi aktif di perangkat lain saat login baru dicoba.
  - Alur: submit login → backend cek refresh token aktif untuk user ini → jika ada, kembalikan response khusus (bukan langsung 200) → frontend tampilkan dialog "Akun ini sedang aktif di perangkat lain, lanjutkan?" → jika user konfirmasi, kirim ulang request dengan flag `force: true` → backend revoke token lama, terbitkan token baru
  - Risiko diterima secara sadar: tidak ada notifikasi real-time ke device lama saat di-force-logout, device lama baru sadar saat request berikutnya gagal karena token sudah revoked
- **Idle timeout**: 30 menit tanpa aktivitas (mousemove/keydown/click/touchstart/scroll) → auto logout, terpisah dari masa berlaku JWT itu sendiri (8 jam). Ini murni logic sisi frontend (timer di-reset tiap event aktivitas terdeteksi).

### 5.2 Register & Approval

- Form register: nama lengkap, username, tanggal lahir, **email**, posisi (4 pilihan: Staff Divisi P3, Staff Desk Call, Kepala Bidang P3, Staff Legal — **tidak termasuk pilihan Admin**, admin hanya dibuat dari dalam sistem oleh admin lain), password, konfirmasi password
- Password minimal 8 karakter, indikator kekuatan password ditampilkan real-time
- Status akun: `pending` setelah register → admin approve → `active` (atau admin reject → `rejected`)
- **Register ulang dengan username sama diperbolehkan** setelah ditolak, maksimal **3x percobaan per hari** (dihitung per username, bukan per IP — risiko spam diterima mengingat basis user internal terbatas dan saling kenal)
- Admin mendapat notifikasi (bell) untuk setiap permintaan akun baru — lihat §17

### 5.3 Lupa Password

- Verifikasi identitas via **kombinasi username + tanggal lahir** (bukan email/OTP)
- **Risiko diterima secara eksplisit**: TTL bukan rahasia dan bisa ditebak sesama staff yang saling kenal. Ini disetujui mengingat aplikasi murni internal dengan basis user kecil (5–15 orang).
- Alur 2 tahap:
  1. Input username + TTL → verifikasi kecocokan dengan data user
  2. Jika cocok → form set password baru + konfirmasi → simpan

### 5.4 Data Sensitif

- **NIK terbuka untuk semua role** — ini kebutuhan operasional nyata (verifikasi identitas nasabah oleh siapa pun yang berinteraksi dengannya), bukan kelalaian keamanan. Sudah dipertimbangkan risikonya terhadap UU PDP dan diterima mengingat basis user internal.

---

## 6. SKEMA DATABASE LENGKAP

Seluruh tabel berikut menggunakan Prisma 5 sebagai ORM. Konvensi penamaan: `snake_case` untuk kolom database, timestamps `created_at`/`updated_at` otomatis di setiap tabel kecuali dinyatakan lain.

### 6.1 `users`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID / INT PK | |
| username | VARCHAR(50) UNIQUE | |
| password_hash | VARCHAR(255) | bcrypt |
| nama | VARCHAR(150) | |
| email | VARCHAR(150) | |
| tgl_lahir | DATE | dipakai untuk verifikasi Lupa Password |
| posisi | ENUM | admin, kabid_p3, staff_p3, desk_call, legal |
| status | ENUM | pending, active, rejected, inactive |
| register_attempt_count | INT | reset harian, maks 3 |
| last_register_attempt_at | DATETIME | |
| created_at, updated_at | DATETIME | |

### 6.2 `refresh_tokens`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| user_id | FK → users | |
| token_hash | VARCHAR(255) | |
| device_info | VARCHAR(255) | user agent, untuk keperluan single-device detection |
| revoked | BOOLEAN | default false |
| created_at | DATETIME | |
| expires_at | DATETIME | |

**Cron job**: pembersihan harian untuk baris yang `expires_at < now()` atau `revoked = true` lebih dari 30 hari — mencegah tabel membengkak tanpa batas.

### 6.3 `debitur`

Tabel inti — **field finansial hanya boleh diubah lewat proses Import CBS** (§16), tidak pernah lewat endpoint CRUD manual manapun.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id (no_rekening) | VARCHAR(30) PK | format `02.70.014865.001` — unique key per akad pembiayaan |
| cif | VARCHAR(20) | identitas per **orang**, satu CIF bisa punya banyak `no_rekening` (lihat §18.7) |
| nama | VARCHAR(150) | |
| nik | VARCHAR(16) | **write-once** — lihat aturan §18.5 |
| tgl_lahir | DATE | boleh ditimpa tiap import (tidak sekritis NIK) |
| umur | VARCHAR(10) | dihitung, bukan disimpan statis (opsional cache) |
| alamat | TEXT | |
| kota | VARCHAR(100) | |
| telepon | VARCHAR(20) | |
| pekerjaan | VARCHAR(100) | |
| agama | VARCHAR(30) | |
| resiko | VARCHAR(20) | Rendah/Sedang/Tinggi |
| jenis_margin | VARCHAR(150) | jenis akad pembiayaan |
| rate_margin | DECIMAL(5,2) | |
| jw | INT | jangka waktu (bulan) |
| tgl_awal | DATE | |
| tgl_jt | DATE | jatuh tempo akad |
| tgl_angsuran_terakhir | DATE | nullable |
| ao | VARCHAR(100) | Account Officer |
| plafon | DECIMAL(18,2) | |
| baki_debet | DECIMAL(18,2) | **read-only dari CBS import** |
| angs_principal | DECIMAL(18,2) | angsuran pokok bulanan |
| angs_margin | DECIMAL(18,2) | angsuran margin bulanan |
| t_pokok | DECIMAL(18,2) | tunggakan pokok (terpisah dari margin) |
| fr_pokok | INT | frekuensi tunggakan pokok |
| frh_pokok | INT | hari tunggakan pokok |
| t_margin | DECIMAL(18,2) | tunggakan margin |
| fr_margin | INT | frekuensi tunggakan margin |
| frh_margin | INT | hari tunggakan margin |
| total_tunggakan | DECIMAL(18,2) | t_pokok + t_margin |
| fr | INT | frekuensi gabungan (kompatibilitas laporan lama) |
| fr_hari | INT | hari gabungan |
| kol | ENUM | Lancar, DPK, Kurang Lancar, Diragukan, Macet |
| kol_murni | VARCHAR(10) | kode numerik asli dari CBS (1–5) |
| restruk | INT | jumlah kali direstrukturisasi |
| rek_tabungan | VARCHAR(30) | nullable |
| saldo_tabungan | DECIMAL(18,2) | nullable |
| jenis_agunan | VARCHAR(100) | nullable |
| nilai_jaminan | DECIMAL(18,2) | nullable |
| spk_number | VARCHAR(50) | nomor SPK/kontrak |
| status_debitur | ENUM | **Aktif, Lunas, TidakDitemukan** — lihat §18.1 |
| last_synced_at | DATETIME | kapan terakhir field finansial di-update via import |
| last_seen_in_import_at | DATETIME | untuk deteksi status TidakDitemukan |
| created_at, updated_at | DATETIME | |

### 6.4 `debitur_kol_history`

Dibangun **otomatis** oleh proses Import CBS setiap kali berjalan — menjadi basis data untuk grafik tren dashboard dan salah satu metode Roll Rate/Cure Rate di KPI.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| debitur_id | FK → debitur | |
| tanggal_snapshot | DATE | tanggal "Sampai Tanggal" dari file CBS yang diimpor |
| bulan_label | VARCHAR(20) | "Januari", "Februari", dst — untuk tampilan chart |
| kol | ENUM | snapshot KOL pada tanggal itu |
| baki_debet | DECIMAL(18,2) | snapshot baki debet pada tanggal itu |

### 6.5 `desk_call`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| debitur_id | FK → debitur (no_rekening) | |
| nama_debitur | VARCHAR(150) | denormalized untuk performa query |
| tanggal | DATE | |
| waktu | TIME | |
| petugas_id | FK → users | |
| kol | VARCHAR(20) | **snapshot** KOL debitur saat call dicatat (bukan live reference) |
| jenis_kontak | ENUM | Telepon, WhatsApp |
| status_kontak | ENUM | **6 nilai**: Terhubung, Tersambung Tidak Diangkat, Tidak Diangkat, Sibuk, Tidak Aktif, Salah Nomor (lihat §18.2 untuk definisi presisi) |
| hasil_komunikasi | TEXT | catatan bebas |
| tindak_lanjut | ENUM | Janji Bayar, Negosiasi, Restrukturisasi, Eskalasi, Tidak Ada, (kosong) |
| prioritas | ENUM | Kritis, Tinggi, Sedang, Rendah |
| nominal_janji | DECIMAL(18,2) | nullable |
| tanggal_janji_bayar | DATE | nullable — dipakai untuk sistem notifikasi §17 |
| baki_debet | DECIMAL(18,2) | **snapshot** — Opsi B, dikonfirmasi: nilai baki debet pada SAAT call dicatat, bukan live reference ke tabel debitur |
| created_at | DATETIME | |

### 6.6 `jadwal_penagihan` (P3)

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| nomor_jadwal | VARCHAR(30) | format `P3/2026/06/041` |
| tanggal | DATE | |
| waktu_mulai | TIME | |
| petugas_id | FK → users | |
| area | VARCHAR(100) | |
| prioritas | ENUM | **4 level**: Kritis, Tinggi, Sedang, Rendah |
| debitur_id | FK → debitur | |
| nama_debitur | VARCHAR(150) | denormalized |
| kol | VARCHAR(20) | snapshot |
| baki_debet | DECIMAL(18,2) | snapshot |
| target_tagih | DECIMAL(18,2) | |
| alamat | TEXT | |
| jenis_tagih | VARCHAR(100) | Penagihan Tunggakan, Negosiasi Restrukturisasi, Monitoring Rutin, dst |
| metode | VARCHAR(50) | Kunjungan Langsung, dst |
| status | ENUM | **5 nilai**: Terjadwal, Dalam Proses, Selesai, Batal, Lewat Jatuh Tempo |
| nominal_realisasi | DECIMAL(18,2) | default 0 |
| catatan | TEXT | |
| hasil | TEXT | diisi saat status Selesai |
| created_at, updated_at | DATETIME | dengan **optimistic locking** via `updated_at` check saat update |

> ⚠️ **Catatan penamaan status**: gunakan persis `"Dalam Proses"` (dengan spasi), bukan `"Proses"` — ini keputusan final untuk konsistensi dengan perhitungan KPI yang mencocokkan string secara persis.

### 6.7 `penagihan_foto`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| jadwal_id | FK → jadwal_penagihan | |
| file_path | VARCHAR(255) | path relatif di server |
| uploaded_at | DATETIME | |
| uploaded_by | FK → users | |

**Aturan upload**: partial success — jika dari 5 foto yang diupload 1 gagal, 4 yang berhasil tetap tersimpan (bukan all-or-nothing). Kompresi sisi klien (Canvas API, resize maks 1920px) sebelum dikirim ke server. Sharp digunakan di backend untuk resize final + konversi WebP. Maks ukuran per foto 8MB sebelum kompresi.

**Retensi**: auto-hapus foto + audit log terkait setelah **2 tahun** (cron job).

### 6.8 `legal_berkas`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | format `LF-001` |
| debitur_id | FK → debitur | |
| plafon | DECIMAL(18,2) | denormalized dari debitur saat berkas dibuat |
| jenis_agunan | VARCHAR(100) | |
| notaris | VARCHAR(150) | |
| no_akad | VARCHAR(50) | |
| lokasi_arsip | VARCHAR(100) | |
| status | ENUM | **Lengkap, Proses, Kurang** — **dihitung otomatis** dari persentase checklist tercentang (100% = Lengkap, ≥50% = Proses, <50% = Kurang), bukan diinput manual |
| created_at, updated_at | DATETIME | |

### 6.9 `legal_berkas_checklist`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| legal_berkas_id | FK → legal_berkas | |
| kategori | ENUM | **4 kategori**: Identitas, Usaha, Agunan, Akad & Notarial |
| item_name | VARCHAR(150) | nama item checklist |
| checked | BOOLEAN | default false |
| checked_at | DATETIME | nullable |
| checked_by | FK → users | nullable |

**Daftar item per kategori** (24 item total, mengikuti struktur asli):

| Kategori | Item |
|---|---|
| Identitas | KTP Debitur, KTP Pasangan, Kartu Keluarga, NPWP |
| Usaha | Surat Keterangan Usaha, Foto Usaha, Laporan Keuangan |
| Agunan | Sertifikat/BPKB Asli, SPPT PBB, Bukti Kepemilikan, Foto Agunan |
| Akad & Notarial | Akad Pembiayaan, Surat Kuasa, APHT/Fidusia |

### 6.10 `legal_files`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| legal_berkas_id | FK → legal_berkas | |
| file_name | VARCHAR(255) | |
| file_path | VARCHAR(255) | |
| uploaded_at | DATETIME | |
| uploaded_by | FK → users | |

### 6.11 `pembayaran`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| debitur_id | FK → debitur (no_rekening) | |
| nama | VARCHAR(150) | denormalized |
| tanggal | DATE | |
| nominal | DECIMAL(18,2) | |
| kol | VARCHAR(20) | **snapshot** KOL debitur saat pembayaran dicatat |
| metode | ENUM | Transfer, Tunai |
| petugas | VARCHAR(100) | nama petugas pencatat (bisa siapa saja, tidak dibatasi role) |
| keterangan | TEXT | |
| created_at | DATETIME | |
| updated_at | DATETIME | nullable |
| updated_by | FK → users | nullable — **hanya admin/kabid_p3 yang bisa mengisi kolom ini** |
| import_batch_id | FK → import pembayaran batch | nullable, untuk data hasil import Excel |

> ⚠️ **Aturan penting**: pencatatan di tabel ini **tidak pernah mengubah** `debitur.baki_debet`. Baki debet murni bersumber dari Import CBS (§16). Ini mencegah dua sumber kebenaran finansial yang bisa saling bentrok.

### 6.12 `rbb_targets`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| periode | VARCHAR(7) | format `2026-06` |
| npf_gross | DECIMAL(5,2) | default 5.0 |
| collection_rate | DECIMAL(5,2) | default 70.0 |
| recovery_rate | DECIMAL(5,2) | default 40.0 |
| cure_rate | DECIMAL(5,2) | default 20.0 |
| ptp_rate | DECIMAL(5,2) | default 40.0 |
| promise_kept | DECIMAL(5,2) | default 60.0 |
| coverage_ratio | DECIMAL(5,2) | default 80.0 |
| kunjungan_per_petugas | DECIMAL(5,1) | default 15 |
| restruk_success | DECIMAL(5,2) | default 50.0 |
| ppap_coverage | DECIMAL(5,2) | default 100.0 (placeholder — tidak ada sumber data PPAP saat ini) |
| updated_by | FK → users | hanya admin/kabid_p3 |
| updated_at | DATETIME | |

### 6.13 `audit_log`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| user_id | FK → users | |
| action | VARCHAR(50) | create, update, delete, approve, reject, import, dll |
| table_name | VARCHAR(50) | |
| record_id | VARCHAR(50) | |
| old_value | JSON | nullable |
| new_value | JSON | nullable |
| ip_address | VARCHAR(45) | |
| created_at | DATETIME | |

### 6.14 `app_settings`

| Kolom | Tipe | Keterangan |
|---|---|---|
| key | VARCHAR(50) PK | `pt_name`, `logo_url`, `accent_light`, `accent_dark` |
| value | TEXT | |
| updated_at | DATETIME | |
| updated_by | FK → users | |

Cache di localStorage frontend untuk menghindari fetch berulang; perubahan otomatis update header, footer, halaman login, PDF export.

### 6.15 `import_batches`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| uploaded_by | FK → users | |
| uploaded_at | DATETIME | |
| file_name | VARCHAR(255) | |
| tanggal_snapshot | DATE | tanggal "Sampai Tanggal" dari isi file |
| total_rows_parsed | INT | |
| total_updated | INT | |
| total_new_detected | INT | |
| total_missing_detected | INT | kandidat status TidakDitemukan |
| status | ENUM | pending_review, applied, failed |
| applied_at | DATETIME | nullable |

### 6.16 `import_staging_rows`

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| batch_id | FK → import_batches | |
| raw_data | JSON | hasil parsing satu baris, sebelum diterapkan |
| row_status | ENUM | valid, error |
| error_message | TEXT | nullable |

**Retensi**: staging rows dari batch yang sudah `applied` bisa dibersihkan setelah beberapa hari (untuk keperluan debug jangka pendek saja).

### 6.17 `pembayaran_import_batches` (opsional, untuk Import Excel Riwayat Bayar)

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| uploaded_by | FK → users | |
| uploaded_at | DATETIME | |
| file_name | VARCHAR(255) | |
| total_valid | INT | |
| total_ambiguous | INT | baris nama kembar tanpa no_rekening |
| total_failed | INT | |


---

## 7. MODUL: DASHBOARD

**Akses**: semua role (5/5)

### 7.1 Tujuan
Ringkasan visual kondisi portofolio pembiayaan secara keseluruhan — titik masuk pertama setelah login.

### 7.2 Komponen

**Filter periode**: pill button (Juni 2026, Mei 2026, April 2026, Q2 2026) — perilaku default dekoratif (mengganti tampilan aktif saja); perhitungan filter data sungguhan adalah pengembangan lanjutan pasca-MVP.

**4 Stat Card**:
| Kartu | Perhitungan |
|---|---|
| Total NOA | `COUNT(debitur WHERE status_debitur='Aktif')` |
| Total Baki Debet | `SUM(debitur.baki_debet)` |
| Baki Debet NPF | `SUM(baki_debet WHERE kol IN ('Kurang Lancar','Diragukan','Macet'))` |
| NPF Ratio | `(Baki Debet NPF / Total Baki Debet) * 100` |

**5 Chart** (Chart.js):
1. **Distribusi Kolektibilitas** — donut chart, toggle NOA ↔ Baki Debet, per 5 kategori KOL
2. **Tren Baki Debet & NPF** — area chart, garis ganda (Total Baki vs Baki NPF), sumbu X = 5 bulan terakhir dari `debitur_kol_history`
3. **Pergerakan KOL per Bulan** — stacked bar chart, toggle NOA ↔ Baki, per KOL per bulan
4. **NPF Ratio per Bulan** — line chart + garis putus-putus batas aman 5%
5. **Baki Debet per AO** — horizontal bar chart, diurutkan terbesar ke terkecil

**Desk Call Terbaru**: daftar 5 entri `desk_call` terbaru (sort by tanggal+waktu desc), badge status kontak

**Ringkasan per AO**: tabel NOA/Total Baki/NPF per AO

**Export**: tombol Export laporan (PDF/Excel) — *di luar cakupan detail teknis MVP ini, ditandai untuk pengembangan lanjutan*

---

## 8. MODUL: DEBITUR

**Akses**: semua role (5/5), dengan variasi tombol aksi per role

### 8.1 Filter & Pencarian

**Pill filter KOL** (bukan dropdown): Semua, Lancar, DPK, Kurang Lancar, Diragukan, Macet — setiap pill menampilkan **jumlah dinamis** di sampingnya, dihitung real-time dari data debitur.

**Search box**: mencari berdasar nama, no. rekening, kota, atau AO sekaligus (single search field, bukan multi-field terpisah).

**Filter AO**: dropdown terpisah, opsional.

### 8.2 Tampilan Data

- **Desktop**: tabel dengan kolom No. Rekening, Nama, Kota, KOL, Baki Debet, Tunggakan, AO
- **Mobile/tablet**: card per debitur dengan info sama, tersusun vertikal

### 8.3 Tombol Aksi (bervariasi per role)

| Tombol | Role yang melihat | Fungsi |
|---|---|---|
| Detail | Semua role | Buka modal detail lengkap |
| Catat Call | `desk_call` saja | Buka form Desk Call, debitur pre-filled |
| WhatsApp | `desk_call` saja | Buka `wa.me/62xxx` (konversi otomatis `08xx` → `628xx`) |
| Call biasa | `desk_call` saja | Buka `tel:` link |
| Catat Pembayaran Baru | Semua role | Buka form pembayaran, debitur pre-filled & terkunci |

**Ikon harus dibedakan secara visual**: ikon "Catat Call" (mencatat/pensil) ≠ ikon "Call biasa" (telepon) — keduanya melakukan hal yang sama sekali berbeda (satu membuka form pencatatan, satu benar-benar melakukan panggilan) dan harus tidak mudah tertukar secara visual.

### 8.4 Modal Detail Debitur — Struktur Lengkap

Urutan tampilan dari atas ke bawah:

1. **Badge status**: KOL, **Status Bayar** (baru — lihat §18.4), Risk level, Restrukturisasi (jika >0)
2. **Progress bar Terbayar vs Plafon**: `(plafon - baki_debet) / plafon * 100`, dengan **panah tren** naik/turun di sebelah nilai baki debet (dibanding entri `debitur_kol_history` bulan sebelumnya)
3. **Data diri**: No. Rekening, Tanggal Lahir + umur, NIK, Agama, Pekerjaan, Telepon
4. **Alamat** (baris penuh)
5. **Data pembiayaan**: Jenis Pembiayaan, Rate Margin, Jangka Waktu, AO, Tgl Mulai, Jatuh Tempo, Angsuran Pokok, Angsuran Margin
6. **Rincian Tunggakan** (baru — dipisah, bukan digabung): Tunggakan Pokok, Tunggakan Margin, Total (jumlah keduanya), Frekuensi tunggakan
7. **Riwayat Baki Debet**: tabel per bulan dari `debitur_kol_history`
8. **Riwayat Desk Call** (baru — section ringkasan):
   - Jika belum pernah dihubungi: badge "Belum Pernah Dihubungi"
   - Jika sudah pernah: Total kali dihubungi, Status terakhir + tanggal, Tindak lanjut terakhir (jika ada, termasuk tanggal janji bayar)
   - **Section ini tampil untuk semua role** (informasi, bukan aksi — tidak berisiko duplikasi kontak seperti tombol Call)
   - Menampilkan **ringkasan saja**, bukan daftar riwayat penuh (untuk detail lengkap, arahkan ke modul Desk Call)
9. **Tombol aksi** (sesuai §8.3, kondisional per role)

### 8.5 Status Bayar (field terhitung, bukan tersimpan)

| Kondisi | Label | Warna |
|---|---|---|
| `SUM(pembayaran bulan ini) >= (angs_principal + angs_margin)` | Sudah Bayar | Hijau |
| `0 < total < kewajiban` | Bayar Sebagian | Kuning |
| `total = 0` | Belum Bayar | Merah |


---

## 9. MODUL: DESK CALL & CUSTOMER INSIGHT

**Akses**: `admin`, `desk_call`

### 9.1 Tiga Sub-Tab

Desk Call terdiri dari 3 sub-halaman (tab), bukan 3 menu terpisah:

#### 9.1.1 Tab "Laporan Harian"

- 4 stat card: Total Call Hari Ini, Terhubung, Janji Bayar, Nominal Janji
- Filter: search nama, filter status kontak, filter tanggal (dropdown tanggal-tanggal yang ada data)
- Tabel/card: ID, Waktu, Debitur, KOL, Jenis Kontak, Status, Tindak Lanjut, Nominal Janji
- Aksi per baris: Detail, Hapus
- Tombol **Catat Call** dan **Export** di header

#### 9.1.2 Tab "Laporan Bulanan"

- 4 stat card agregat: Total Call, Terhubung (+ connection rate %), PTP (+ PTP rate %), Total Nominal Janji
- Tabel rekap **per hari**: Tanggal, Total Call, Terhubung, PTP, Nominal Janji, tombol Detail (lompat ke Laporan Harian tanggal itu)
- Baris Total di footer tabel
- Tombol **Export PDF** di header

#### 9.1.3 Tab "Customer Insight"

Dipisah dari laporan harian/bulanan sesuai keputusan eksplisit — tujuan pembacanya berbeda (evaluasi kinerja, bukan bukti administratif).

- 4 insight card: Total Call, **Connection Rate**, PTP Rate, Total Nominal Janji
- **Connection Rate dihitung HANYA dari status "Terhubung"** — status "Tersambung Tidak Diangkat" **tidak dihitung** sebagai keberhasilan koneksi meski secara teknis nomor tersambung (lihat §18.2 untuk definisi)
- Chart:
  - Breakdown Status Kontak (donut, 6 kategori)
  - Jenis Kontak — Telepon vs WhatsApp (donut)
  - Distribusi per KOL Nasabah yang dihubungi (bar)
  - Jam Paling Produktif — jumlah koneksi berhasil per jam (bar)
  - Tren Call per Hari — total vs terhubung (line)
- **Perbandingan Kinerja per Petugas** — tabel, **hanya tampil untuk `admin` dan `kabid_p3`** (staff desk_call individu tidak melihat perbandingan antar rekan, hanya data dirinya sendiri secara implisit karena mereka biasanya satu-satunya di role ini)
- Filter periode + filter petugas (untuk admin/kabid_p3)
- Tombol **Export PDF bulanan**

### 9.2 Form Catat Desk Call

| Field | Tipe | Wajib |
|---|---|---|
| Debitur | Autocomplete (nama/no. rekening) | Ya |
| Tanggal & Waktu | datetime-local | Ya |
| Jenis Kontak | Telepon / WhatsApp | Ya |
| Status Kontak | 6 pilihan (lihat §18.2) | Ya |
| Prioritas | Kritis/Tinggi/Sedang/Rendah | Ya |
| Tindak Lanjut | Janji Bayar/Negosiasi/Restrukturisasi/Eskalasi/Tidak Ada | Tidak |
| Nominal Janji | Rupiah | Tidak |
| Tanggal Janji Bayar | date — **field tunggal, bukan rentang**. Petugas memilih SATU tanggal spesifik yang dijanjikan nasabah | Tidak |
| Baki Debet saat Call | readonly, auto-terisi dari data debitur saat dipilih (snapshot Opsi B) | — |
| Catatan/Hasil Komunikasi | textarea | Tidak |

### 9.3 Export Laporan Desk Call — Format Detail

Format **dua tabel terpisah** (bukan satu tabel dengan filter status), sesuai contoh format existing yang sudah dipakai tim Desk Call:

**Tabel 1 — Nasabah Berhasil Terhubung**: hanya status "Terhubung"
**Tabel 2 — Nasabah Gagal Terhubung**: status Tersambung Tidak Diangkat, Tidak Diangkat, Sibuk, Tidak Aktif, Salah Nomor

**Kolom kedua tabel** (identik):

| Kolom | Sumber |
|---|---|
| No. Rekening | `debitur.id` (via join nama) |
| Nama | `desk_call.nama_debitur` |
| No. Telepon | `debitur.telepon` |
| Keterangan | `desk_call.status_kontak` (istilah sistem, **bukan istilah bebas manual** — demi konsistensi satu kosakata di seluruh sistem) |
| Tgl Jatuh Tempo | `debitur.tgl_jt` |
| Catatan | `desk_call.hasil_komunikasi` |
| Tanggal Entry | `desk_call.tanggal` |
| Tunggakan | `debitur.total_tunggakan` |
| Baki Debet | `desk_call.baki_debet` (snapshot) |
| KOL | `desk_call.kol` (snapshot) |
| AO | `debitur.ao` |
| Tenggat Janji Bayar | `desk_call.tanggal_janji_bayar` — **baris dengan janji yang jatuh tempo tepat pada tanggal laporan dibuat diberi penanda visual** (baris highlight warna, bukan kolom terpisah) |

Total per tabel + total keseluruhan di bawah. Catatan penjelas definisi tiap status kontak disertakan di footer laporan (untuk pembaca laporan cetak yang mungkin bukan pengguna sistem).

**Format output**: HTML printable (window.print() → simpan sebagai PDF via browser) untuk MVP; generate PDF sisi server via Puppeteer adalah penyempurnaan lanjutan yang direkomendasikan untuk fase produksi.

---

## 10. MODUL: P3 (PENAGIHAN LAPANGAN)

**Akses**: `admin`, `kabid_p3`, `staff_p3`, `legal`

### 10.1 Komponen

**4 stat card**: Total Jadwal, Selesai, Dalam Proses, Lewat Jatuh Tempo

**Calendar strip**: horizontal scroll, menampilkan ~14 hari (rentang dari beberapa hari lalu hingga seminggu ke depan), setiap hari menampilkan jumlah jadwal (jika ada), klik untuk filter tabel ke tanggal itu

**Filter**: pill prioritas (Semua/Kritis/Tinggi/Sedang/Rendah) + dropdown status

**Tabel/Card**: Nomor Jadwal, Tanggal, Debitur, KOL, Prioritas, Baki Debet, Target, Petugas, Status

### 10.2 Form Jadwal P3

| Field | Keterangan |
|---|---|
| Debitur | autocomplete |
| Tanggal, Waktu Mulai | |
| Petugas | |
| Area | auto dari kota debitur, bisa diubah |
| Prioritas | **4 level**: Kritis, Tinggi, Sedang, Rendah |
| Jenis Tagih | Penagihan Tunggakan, Negosiasi Restrukturisasi, Monitoring Rutin, dst |
| Metode | Kunjungan Langsung, dst |
| Target Tagih | Rupiah |
| Catatan | |

### 10.3 Modal Detail P3

Menampilkan seluruh data jadwal + hasil (jika status Selesai, termasuk nominal realisasi) + **section Foto Kunjungan**:

- Drag & drop zone + klik untuk pilih file
- Input file dengan `capture="environment"` — user bebas pilih kamera langsung ATAU galeri (tidak dipaksa salah satu)
- Kompresi sisi klien sebelum upload (resize maks 1920px via Canvas API)
- Grid thumbnail foto yang sudah diupload, klik untuk lightbox (preview besar), tombol hapus per foto
- **Partial success**: jika beberapa foto gagal upload, yang berhasil tetap tersimpan


---

## 11. MODUL: LEGAL

**Akses**: `admin`, `kabid_p3`, `legal`

### 11.1 Struktur Tampilan

Daftar berkas per debitur dalam bentuk **accordion card** (bukan tabel flat) — setiap card mewakili satu `legal_berkas`:

- Header card (selalu terlihat): Nama debitur, No. Rekening, Plafon, badge Status (Lengkap/Proses/Kurang — **dihitung otomatis**, lihat §6.8), persentase kelengkapan, ikon expand
- Body card (expand saat diklik):
  - Progress bar kelengkapan
  - Info ringkas: Jenis Agunan, Lokasi Arsip, Notaris, No. Akad
  - **4 kategori checklist** (lihat §6.9), setiap item punya checkbox yang bisa diklik langsung untuk toggle checked/unchecked
  - Daftar file terlampir dengan tombol Lihat (lightbox) dan Unduh
  - Zona upload berkas baru (drag & drop)

### 11.2 Filter

Search (nama/no. rekening) + dropdown filter status (Lengkap/Proses/Kurang)

### 11.3 Aturan Perhitungan Status

```
total_item = COUNT(semua checklist item di 4 kategori)
checked_item = COUNT(checklist item yang checked=true)
persentase = checked_item / total_item * 100

status = persentase == 100 ? "Lengkap"
       : persentase >= 50  ? "Proses"
       : "Kurang"
```

Status **tidak pernah diinput manual** — selalu hasil kalkulasi dari checklist.

---

## 12. MODUL: RIWAYAT BAYAR

**Akses**: semua role (5/5), dengan pembatasan aksi Edit

### 12.1 Komponen

**4 stat card**: Total Transaksi, Total Masuk (bulan berjalan), jumlah per Metode (Transfer/Tunai)

**Search dengan autocomplete**: ketik nama/no. rekening, pilih dari dropdown untuk filter tabel ke debitur itu

**Tabel/Card**: ID, Tanggal, Debitur, Jenis (Metode), Nominal, Keterangan, Petugas

**Aksi per baris**:
| Aksi | Role |
|---|---|
| Edit | `admin`, `kabid_p3` saja |
| Hapus | Semua role yang bisa akses modul ini |

### 12.2 Form Catat/Edit Pembayaran (Shared Component)

Form yang **sama persis** dipakai di 3 titik masuk:
1. Tombol "Tambah" di halaman Riwayat Bayar (debitur dipilih via autocomplete, field bisa diubah bebas)
2. Tombol "Catat Pembayaran Baru" di modal Debitur (debitur **pre-filled dan terkunci/read-only** — mencegah salah catat ke debitur lain)
3. Tombol "Edit" di tabel Riwayat Bayar, khusus admin/kabid_p3 (semua field pre-filled dari data existing)

| Field | Tipe | Keterangan |
|---|---|---|
| Debitur | Autocomplete atau readonly (tergantung titik masuk) | |
| Tanggal Bayar | date | |
| Jumlah Bayar | number | |
| KOL | select, auto-terisi dari KOL debitur saat ini, **tetap bisa diubah manual** | |
| Metode Bayar | Transfer / Tunai | |
| Petugas Pencatat | readonly, otomatis = user yang login | |
| Catatan | textarea | |

> ⚠️ **Aturan kritis**: menyimpan data di form ini **tidak pernah** mengubah `debitur.baki_debet`. Baki debet murni hasil Import CBS (§16).

### 12.3 Import Excel/CSV

**Format kolom** (header baris pertama harus persis sesuai nama berikut):

| Kolom | Label | Wajib |
|---|---|---|
| `noRek` | No. Rekening | Tidak |
| `namaDebitur` | Nama Debitur | **Ya** |
| `tanggal` | Tgl Bayar (YYYY-MM-DD) | **Ya** |
| `jumlah` | Jumlah Bayar (angka) | **Ya** |
| `kol` | KOL | Tidak |
| `metode` | Metode Bayar | Tidak |
| `petugas` | Petugas Pencatat | Tidak |
| `keterangan` | Catatan | Tidak |

**Aturan pemrosesan**:
1. Jika `noRek` **ada** di baris → dipakai sebagai kunci pencocokan utama, langsung akurat tanpa ambiguitas
2. Jika `noRek` **kosong** dan nama cocok ke **tepat satu** debitur → diproses otomatis
3. Jika `noRek` **kosong** dan nama cocok ke **lebih dari satu** debitur (nama kembar) → baris masuk kategori **"Perlu Review Manual"**, TIDAK diproses otomatis
4. Baris dengan field wajib kosong/nol → **dilewati**, dicatat di daftar error, ditampilkan ke admin (bukan silent-skip)
5. Setelah proses, tampilkan ringkasan: jumlah Valid / Perlu Review / Dilewati, beserta detail pesan error per baris bermasalah
6. Format file diterima: `.xlsx` (via SheetJS) dan `.csv`

**Wajib untuk fase produksi (belum di MVP)**: deteksi duplikasi import — mencegah file yang sama ter-upload dua kali menghasilkan data pembayaran dobel. MVP saat ini mengasumsikan tanggung jawab ada di admin untuk tidak upload ganda.


---

## 13. MODUL: KPI & SCORECARD

**Akses**: `admin`, `kabid_p3`, `staff_p3`, `legal`

Modul paling kompleks di sistem — terdiri dari **9 section** berurutan dalam satu halaman scroll (bukan sub-tab terpisah).

### 13.1 Section A — Target RBB Bulan Ini

Form **10 field target**, disimpan per periode di tabel `rbb_targets`:

| Field | Unit | Default |
|---|---|---|
| Target NPF Gross | % | 5.0 |
| Target Collection Rate | % | 70.0 |
| Target Recovery Rate | % | 40.0 |
| Target Cure Rate | % | 20.0 |
| Target PTP Rate | % | 40.0 |
| Target Promise Kept | % | 60.0 |
| Target Coverage Ratio | % | 80.0 |
| Target Kunjungan/Petugas | angka | 15 |
| Target Restrukturisasi Success | % | 50.0 |
| Target PPAP Coverage | % | 100.0 (placeholder, tidak ada sumber data PPAP) |

- **Editable hanya untuk `admin` dan `kabid_p3`** — role lain melihat form yang sama tapi seluruh input dalam kondisi `disabled` (read-only), dengan badge "Lihat Saja"
- Tombol Simpan Target + tombol Reset ke Default

### 13.2 Section B — 4 Grup Indikator (16 kartu total)

Setiap kartu menampilkan: label, nilai terhitung, target dari Section A, progress bar berwarna (hijau=tercapai, kuning=mendekati, merah=jauh dari target).

**Grup 1 — Indikator Kualitas Pembiayaan**
| Indikator | Formula |
|---|---|
| NPF Gross | `SUM(baki_debet WHERE kol NPF) / SUM(baki_debet total) * 100` |
| PPAP Coverage | Placeholder tetap 100% — **tidak ada sumber data PPAP**, bukan bug |
| Recovery Rate | `SUM(pembayaran dari debitur NPF) / SUM(total_tunggakan debitur NPF) * 100`, dibatasi maks 100% |
| Cure Rate | `% debitur NPF yang KOL-nya membaik dari snapshot bulan lalu ke sekarang` (dari `debitur_kol_history`) |

**Grup 2 — Indikator Efektivitas Penagihan**
| Indikator | Formula |
|---|---|
| Collection Rate | `SUM(jadwal_penagihan.nominal_realisasi) / SUM(jadwal_penagihan.target_tagih) * 100` |
| PTP Rate | `COUNT(desk_call tindak_lanjut='Janji Bayar') / COUNT(desk_call status_kontak='Terhubung') * 100` |
| Promise Kept Rate | `% janji bayar (PTP) yang punya entri pembayaran aktual sesudahnya dari debitur yang sama` |
| Roll Rate | `COUNT(jadwal_penagihan status='Lewat Jatuh Tempo') / COUNT(total jadwal) * 100` — **metode berbasis P3**, lihat §13.5 untuk metode alternatif |

**Grup 3 — Indikator Produktivitas Petugas**
| Indikator | Formula |
|---|---|
| Coverage Ratio | `COUNT(debitur NPF yang sudah punya jadwal P3) / COUNT(total debitur NPF) * 100` |
| Kunjungan/Petugas | `COUNT(total jadwal_penagihan) / COUNT(DISTINCT petugas)` |
| Achievement Rate | sama dengan Collection Rate (representasi agregat) |
| Avg Tagihan/Kunjungan | `SUM(target_tagih) / COUNT(jadwal_penagihan)` |

**Grup 4 — Indikator Restrukturisasi & Penyelesaian**
| Indikator | Formula |
|---|---|
| Restrukturisasi Success | `COUNT(jadwal dengan jenis_tagih mengandung 'restrukturisasi' AND status='Selesai') / COUNT(jadwal jenis_tagih restrukturisasi) * 100` |
| Total Restrukturisasi | `COUNT(debitur WHERE restruk > 0)` — angka kumulatif, bukan persentase |
| Legal Action Rate | `COUNT(legal_berkas) / COUNT(debitur NPF) * 100` |
| AYDA / Aset Bermasalah | **Manual — input via modul Legal**, tidak dihitung otomatis (tidak ada sumber data terstruktur) |

### 13.3 Section C — Kinerja Per Petugas

Tabel dengan ranking (🥇🥈🥉 untuk 3 teratas), diurutkan berdasar Achievement tertinggi:

Kolom: Petugas, Jadwal, Selesai, Coverage, Target, Realisasi, Achievement, PTP Rate, Promise Kept, Roll Rate, KOL Dominan

> Catatan: tabel ini **tidak terpengaruh** filter Section F (Daftar Jadwal P3) — selalu menampilkan data lengkap semua petugas.

### 13.4 Section D — Perbandingan Kinerja Petugas (2 Chart)

1. **Achievement Rate per Petugas** — bar chart
2. **Distribusi Status Penagihan** — bar chart, jumlah jadwal per status (Terjadwal/Dalam Proses/Selesai/Batal/Lewat Jatuh Tempo)

### 13.5 Section E — Roll Rate & Cure Rate per KOL (Dua Metode)

**Keputusan penting**: dua metodologi berbeda ditampilkan **keduanya**, dipilih via tab-toggle, bukan saling menggantikan — karena keduanya sah secara konsep namun mengukur hal berbeda.

**Metode 1 — "Berbasis Kunjungan P3"** (mengikuti definisi asli):
- Per kategori KOL (DPK, Kurang Lancar, Diragukan, Macet)
- Roll Rate = `% jadwal P3 kategori KOL itu yang berakhir 'Lewat Jatuh Tempo'`
- Cure Rate = `% jadwal P3 kategori KOL itu yang 'Selesai' dengan realisasi ≥ target`

**Metode 2 — "Berbasis Riwayat KOL Debitur"**:
- Per kategori KOL awal (snapshot bulan sebelumnya)
- Roll Rate = `% debitur di kategori itu yang KOL-nya memburuk di snapshot berikutnya`
- Cure Rate = `% debitur di kategori itu yang KOL-nya membaik di snapshot berikutnya`

Setiap kartu KOL menampilkan 2 progress bar (Roll Rate merah, Cure Rate hijau) + jumlah sampel (n).

### 13.6 Section F — Daftar Jadwal P3

Tabel detail seluruh `jadwal_penagihan`, dengan filter dropdown Petugas + Status.

Kolom: No. Jadwal, Tanggal, Petugas, Debitur, KOL, Area, Target, Realisasi, Achievement %, Status, Prioritas

### 13.7 Section G — Kepatuhan & Regulasi

4 kartu compliance:

| Kartu | Sifat | Logic status |
|---|---|---|
| POJK No.3/2022 — Kualitas Aset | **Dinamis** | Sesuai jika `npf_gross <= target npf_gross` |
| POJK No.21/2023 — RBB | **Dinamis** | Sesuai jika `collection_rate >= target collection_rate` |
| Fatwa DSN-MUI — Penagihan Syariah | **Statis** | Selalu "Wajib Dipenuhi" — checklist prinsip syariah (tidak ada unsur tekanan berlebihan, musyawarah diutamakan) |
| SE OJK No.13/2017 — Pelaporan SLIK/SID | **Statis** | Selalu "Periodik" — pengingat kewajiban pelaporan berkala, bukan hasil kalkulasi data |

> Dua kartu terakhir memang tidak pernah berubah berdasar data — ini bukan kekurangan implementasi, melainkan sifat asli kontennya (pengingat regulasi, bukan metrik).

---

## 14. MODUL: MANAJEMEN USER

**Akses**: `admin` saja

### 14.1 Komponen

**Section Permintaan Akun Baru**: daftar user berstatus `pending`, setiap baris menampilkan Nama, Username, Posisi, Email, Tanggal Daftar, tombol Setujui/Tolak

**Section Pengguna Aktif**: tabel seluruh user `active` — Nama, Username, Posisi, Email, Status, tombol Edit

### 14.2 Alur Approval

1. User baru register → status `pending`
2. Admin melihat notifikasi bell + daftar di Manajemen User
3. **Setujui** → status jadi `active`, user bisa login
4. **Tolak** → status jadi `rejected`, user tersebut boleh mendaftar ulang dengan username sama (maks 3x/hari)

### 14.3 Kontinjensi Admin Tunggal

Jika admin sedang cuti/tidak tersedia dan hanya ada satu admin, approval user baru akan tertunda tanpa batas waktu. **Ini risiko yang diterima secara sadar** — tidak ada role cadangan untuk approve user di fase ini.

---

## 15. MODUL: MANAJEMEN APLIKASI

**Akses**: `admin` saja

### 15.1 Identitas Institusi

- Input Nama Institusi (tersimpan di `app_settings`, key `pt_name`)
- Upload Logo: terima PNG/JPEG/SVG, **tidak dipaksa ukuran tertentu** — file apapun diterima dan ditampilkan proporsional (`object-fit: contain`) di kotak referensi 120×40px. Maks ukuran file 2MB.
- Logo yang tersimpan otomatis diterapkan ke: halaman login, header aplikasi, drawer navigasi, footer

### 15.2 Warna Aksen Tema

- **Cakupan kustomisasi**: HANYA satu warna aksen utama per mode tema (bukan seluruh palet warna) — dipilih terpisah untuk **mode terang** dan **mode gelap**
- Input: color picker (native `<input type="color">`) + input teks hex sebagai alternatif
- **Live preview**: perubahan warna langsung terlihat di preview bar sebelum disimpan
- Warna turunan (hover state, tint background, gradient header) **dihitung otomatis** dari satu warna yang dipilih (algoritma darken/lighten sederhana), admin tidak perlu memilih warna turunan secara manual
- Tombol "Kembalikan ke Default" — reset ke `#0F766E` (light) / `#3FAEA5` (dark)
- Warna semantik (sukses=hijau, gagal=merah, peringatan=kuning) **tetap tetap**, tidak ikut berubah — hanya warna aksen brand yang dikustomisasi, demi menjaga keterbacaan status di seluruh sistem


---

## 16. MODUL: IMPORT DATA CBS KOLEKTIBILITAS

**Akses**: `admin` saja

> ⚠️ **Catatan status implementasi**: modul ini adalah hasil pembahasan paling panjang dan detail dalam seluruh proses requirement gathering, namun **belum tercermin di prototype HTML terakhir** (`BPRS_Dashboard_v4_FINAL.html`) — murni karena terlewat saat sesi build, bukan dibatalkan. Modul ini **wajib dibangun** sebagai bagian dari sistem produksi. Spesifikasi di bawah ini final dan lengkap berdasarkan analisis mendalam terhadap sampel file CBS asli yang sudah diverifikasi.

### 16.1 Sumber Data

Core Banking System bank ini (Assist-BPRS.Net) dapat meng-generate file export "nasabah pembiayaan" dengan **100 kolom**, mencakup identitas lengkap, kontak, klasifikasi pembiayaan, data agunan, asuransi, hingga keterkaitan tabungan — jauh lebih lengkap dari sekadar laporan kolektibilitas ringkas.

**Karakteristik file yang sudah diverifikasi dari sampel nyata**:
- Baris pertama: judul berisi tanggal cutoff, format `"Sampai Tanggal DD Bulan YYYY"`
- Baris kedua: header 100 kolom
- Baris berikutnya: satu baris per akad pembiayaan (bukan per nasabah — satu nasabah dengan CIF sama bisa punya beberapa baris jika punya beberapa pembiayaan aktif)
- **Delimiter tidak konsisten antar hasil export** — kadang koma (`,`), kadang titik-koma (`;`). **Parser wajib mendeteksi delimiter secara otomatis** (hitung kemunculan kedua karakter di baris header, pakai yang lebih banyak)
- Tidak ada baris rekap/total di akhir file pada varian file 100-kolom ini (berbeda dari laporan kolektibilitas ringkas yang punya rekap NPL di akhir — rekap semacam itu **tidak diperlukan** karena seluruh agregat/NPF ratio **dihitung sendiri oleh backend** dari baris data mentah, bukan dibaca dari file)

### 16.2 Sifat "Sampai Tanggal" — Snapshot Titik Waktu, Bukan Rentang

**Temuan terverifikasi**: meski form generate di CBS menampilkan input rentang tanggal (misal "1–31 Juli"), hasil filenya adalah **snapshot kondisi tepat pada tanggal akhir** yang dipilih — bukan akumulasi transaksi sepanjang rentang, dan bukan filter hanya nasabah dengan aktivitas dalam rentang itu.

Bukti verifikasi: dua file dengan tanggal cutoff berbeda (6 Juli vs 31 Juli) untuk debitur yang sama menunjukkan **populasi rekening identik 100%**, namun nilai finansial (jumlah hari tunggakan, dsb) berubah konsisten sesuai perjalanan waktu antara kedua tanggal — mengonfirmasi ini snapshot penuh per titik waktu, bukan laporan periode.

**Implikasi desain**: setiap import merepresentasikan **kondisi lengkap seluruh debitur aktif pada satu tanggal**, bukan delta/perubahan. Logic import harus memperlakukan setiap file sebagai *full snapshot replace*, bukan *incremental append*.

### 16.3 Alur Import — Staging, Preview, Konfirmasi

Mengingat ini data finansial yang jadi sumber kebenaran seluruh sistem, import **tidak langsung menimpa** tabel `debitur` begitu file diupload.

```
1. Admin upload file (.csv, dari CBS)
   ↓
2. Parser & Normalizer
   - Deteksi delimiter otomatis
   - Strip baris judul & header
   - Konversi format angka Indonesia (hapus pemisah ribuan koma)
   - Konversi tanggal DD/MM/YYYY → ISO, dengan "00/00/0000" dipetakan ke null
   - Strip artefak Excel: tanda kutip di depan nomor telepon, notasi ilmiah di NIK (lihat §16.5)
   - Mapping kode KOL numerik (1–5) → label teks
   ↓
3. Simpan ke import_staging_rows (belum menyentuh tabel debitur)
   ↓
4. Tampilkan Preview ke Admin:
   - X baris berhasil diparsing
   - Y baris akan meng-update debitur existing
   - Z rekening baru terdeteksi (akan dibuat entri debitur baru — memungkinkan karena file 100 kolom punya data kontak lengkap)
   - W rekening ada di database tapi TIDAK ada di file baru ini (kandidat status TidakDitemukan)
   ↓
5. Admin klik "Terapkan Import"
   ↓
6. Transaksi database (atomik, all-or-nothing):
   - UPSERT ke tabel debitur (berdasar no_rekening sebagai kunci)
   - INSERT ke debitur_kol_history (snapshot tren)
   - UPDATE last_seen_in_import_at untuk semua rekening di file
   - Terapkan aturan write-once/overwrite per field (§16.6)
   - Catat ke import_batches + audit_log
   ↓
7. Efek berantai:
   - Dashboard otomatis ter-update (baca data live dari tabel debitur)
   - Rekening yang tidak ter-update last_seen_in_import_at → status_debitur diperbarui (lihat §16.4)
```

### 16.4 Deteksi Status Debitur — Lunas vs Tidak Ditemukan

Dua sinyal berbeda, **ditangani berbeda**, tidak digabung jadi satu logic otomatis:

| Sinyal | Status Baru | Perilaku |
|---|---|---|
| `baki_debet = 0` DAN rekening **masih muncul** di file terbaru | `Lunas` | Otomatis oleh sistem |
| Rekening **hilang total** dari file terbaru (tidak muncul sama sekali) | `TidakDitemukan` | **Bukan otomatis jadi Lunas** — kemungkinan sebab lain (hapus buku/write-off, migrasi nomor rekening karena restrukturisasi di CBS, atau galat data). Perlu **review manual admin** untuk menentukan status akhir yang sesuai. |

### 16.5 Masalah Kualitas Data yang Wajib Ditangani Parser

**NIK dalam notasi ilmiah**: sebagian hasil export CBS memiliki kolom NIK yang rusak akibat Excel mengonversi angka 16 digit jadi notasi ilmiah (`3.37403E+15`) — ini **kehilangan presisi permanen** (hanya menyisakan 6 digit signifikan). Parser harus mendeteksi pola ini dan **menolak nilai tersebut** (perlakukan sebagai data kosong/tidak valid), bukan menyimpannya apa adanya sebagai NIK yang salah namun terlihat valid.

**Nomor telepon dengan tanda kutip**: artefak Excel umum (`'081228099962`) — cukup di-strip karakter kutip di depan, tidak ada kehilangan data.

### 16.6 Aturan Tulis Per Field (Write Rules)

Tidak semua field diperlakukan sama saat proses UPSERT — field yang jarang berubah dan berisiko tinggi jika salah, dilindungi dari penimpaan data buruk:

| Field | Aturan |
|---|---|
| `nik` | **Write-once** — hanya diisi jika kolom di database masih kosong. Jika sudah ada nilai (dari import sebelumnya yang valid), import berikutnya **tidak pernah menimpanya**, meski file baru punya nilai NIK berbeda. Melindungi dari kasus file yang mengandung NIK rusak menimpa NIK yang sudah benar. |
| `tgl_lahir` | Boleh ditimpa tiap import (risiko lebih rendah dibanding NIK) |
| Seluruh field finansial (`baki_debet`, `kol`, `total_tunggakan`, dst) | Selalu ditimpa — ini justru tujuan utama proses import |
| Field kontak (`telepon`, `alamat`) | Selalu ditimpa — dianggap sumber CBS lebih update dibanding input manual lama |

### 16.7 Blokir Desk Call & P3 setelah Status Lunas

**Peringatan lunak, bukan blokir keras**: tombol "Catat Call" dan "Jadwal P3 Baru" untuk debitur berstatus `Lunas` tetap dapat diakses, namun memunculkan dialog konfirmasi ("Nasabah ini sudah tercatat Lunas, tetap lanjutkan?") sebelum submit.

**Jadwal/catatan yang sudah ada sebelum status berubah jadi Lunas**: **dibiarkan apa adanya** untuk ditutup manual oleh petugas terkait — sistem tidak otomatis membatalkan pekerjaan yang sedang berjalan hanya karena perubahan data semalam.

### 16.8 Frekuensi & Estimasi Durasi

Proses generate file di sisi CBS **manual** (tidak bisa dijadwalkan otomatis) dan **memerlukan waktu bervariasi tergantung seberapa jauh tanggal cutoff dari awal bulan** (~5 menit di awal bulan, ~20 menit mendekati akhir bulan — kemungkinan karena kalkulasi akrual harian yang bertambah). Ini **tidak menghalangi** import harian — staff cukup generate di sela pekerjaan lain, upload begitu file siap.

**Rekomendasi operasional**: sistem menampilkan **notifikasi pengingat** ke admin jika belum ada import yang diterapkan pada hari berjalan (lihat §17.2) — bukan mekanisme paksa, sekadar pengingat visual.

### 16.9 Field yang TIDAK Perlu Divalidasi

Sesuai keputusan awal proyek: **tidak ada validasi batas atas nominal** (baki debet, plafon, dst) — skala pembiayaan BPRS ini secara alami terbatas, risiko input absurd dari CBS dianggap sangat rendah.


---

## 17. SISTEM NOTIFIKASI

Satu ikon bell (header), dapat diakses semua role — isi notifikasi berbeda tergantung role yang login. Diklik membuka panel berisi daftar notifikasi, setiap item bisa diklik untuk lompat ke halaman terkait.

### 17.1 Lima Jenis Notifikasi

| # | Jenis | Role penerima | Trigger | Kapan berhenti muncul |
|---|---|---|---|---|
| 1 | Permintaan akun baru | `admin` | Ada user berstatus `pending` | Setelah di-approve/reject |
| 2 | Pengingat upload CSV harian | `admin` | Belum ada `import_batches` berstatus `applied` untuk tanggal berjalan | Setelah import diterapkan hari itu |
| 3 | Janji bayar jatuh tempo | `desk_call`, `admin` | `desk_call.tanggal_janji_bayar` = hari ini atau dalam 3 hari terakhir dan belum ada tindak lanjut baru | **4 hari** setelah tanggal janji (H+0 sampai H+3) — setelah itu notifikasi berhenti muncul namun **data riwayat call tetap tersimpan permanen**, hanya notifikasi aktifnya yang berakhir |
| 4 | P3 lewat jatuh tempo | `staff_p3`, `kabid_p3`, `admin` | `jadwal_penagihan.status = 'Lewat Jatuh Tempo'` | Setelah status jadwal berubah |
| 5 | Target RBB mendekati akhir bulan | `admin`, `kabid_p3` | Sisa ≤7 hari menuju akhir bulan berjalan | Setelah pergantian bulan (siklus RBB baru) |

### 17.2 Prinsip Implementasi

- Notifikasi **dihitung on-demand** dari data yang sudah ada di tabel-tabel terkait (tidak memerlukan tabel `notifications` terpisah yang disinkronkan manual) — menghindari risiko data notifikasi basi/tidak sinkron dengan kondisi sebenarnya
- Badge counter di ikon bell menampilkan total notifikasi relevan untuk role yang sedang login
- Setiap notifikasi punya aksi klik yang mengarahkan ke halaman/tab terkait

---

## 18. BUSINESS RULES KONSOLIDASI

Bagian ini merangkum aturan bisnis lintas-modul yang penting namun mudah terlewat jika hanya dibaca per-modul.

### 18.1 Baki Debet adalah Read-Only dari Aplikasi

`debitur.baki_debet` **hanya pernah diubah** melalui proses Import CBS (§16). Modul Riwayat Bayar, Desk Call, maupun P3 **tidak pernah** menulis ke field ini — mereka hanya membaca/snapshot nilainya pada saat pencatatan. Ini prinsip arsitektur paling fundamental di seluruh sistem; pelanggaran terhadap aturan ini akan membuat data finansial punya dua sumber kebenaran yang bisa saling bentrok.

### 18.2 Definisi Presisi 6 Status Kontak Desk Call

| Status | Definisi Operasional |
|---|---|
| Terhubung | Petugas berhasil berbicara langsung dengan nasabah |
| **Tersambung Tidak Diangkat** | Nomor aktif, panggilan **benar-benar berdering/tersambung** ke sistem operator nasabah, namun **tidak direspons** — sinyal nasabah menghindar, bukan masalah teknis nomor |
| Tidak Diangkat | Panggilan **gagal tersambung sama sekali** — petugas tidak yakin panggilan benar-benar sampai |
| Sibuk | Nada sibuk |
| Tidak Aktif | Nomor tidak aktif/tidak terdaftar |
| Salah Nomor | Nomor dalam data tidak sesuai pemilik sebenarnya |

**Dampak ke metrik**: hanya "Terhubung" yang dihitung sebagai keberhasilan koneksi (Connection Rate). "Tersambung Tidak Diangkat" sengaja dipisah agar tim bisa membedakan "nasabah aktif menghindar" (perlu strategi pendekatan berbeda) dari "nomor benar-benar bermasalah" (perlu update data kontak).

### 18.3 CIF vs No. Rekening — Satu Orang, Banyak Pembiayaan

File CBS membedakan `CIF` (identitas per **orang**) dari `no_rekening` (identitas per **akad pembiayaan**). Satu CIF bisa memiliki lebih dari satu `no_rekening` aktif secara bersamaan.

**Keputusan final**: seluruh modul (Desk Call, P3, Debitur) tetap beroperasi **per `no_rekening`**, bukan per CIF — nasabah dengan 2 pembiayaan aktif akan muncul sebagai 2 entri debitur terpisah, dihubungi/dikunjungi terpisah untuk masing-masing pembiayaan. CIF disimpan di skema (§6.3) untuk keperluan referensi/pelaporan, namun tidak mengubah unit kerja operasional modul manapun.

### 18.4 Field yang Dipisah, Bukan Digabung

Beberapa pasangan field sengaja dipisah demi presisi, mengikuti struktur asli data CBS — **jangan digabung kembali** saat implementasi:

- Tunggakan **Pokok** vs **Margin** (`t_pokok`, `t_margin` — terpisah dari `total_tunggakan` yang merupakan jumlah keduanya)
- Frekuensi/hari tunggakan **Pokok** (`fr_pokok`, `frh_pokok`) vs **Margin** (`fr_margin`, `frh_margin`)

### 18.5 Field yang Ditolak Validasinya secara Sengaja

Sesuai keputusan awal proyek, hal-hal berikut **sengaja tidak divalidasi ketat**, mengingat konteks internal dan skala terbatas:

- Batas atas nominal finansial (baki debet, plafon) — skala pembiayaan BPRS secara alami terbatas
- Kekuatan verifikasi Lupa Password (TTL+username bisa ditebak sesama staff) — diterima mengingat basis user internal kecil

### 18.6 Snapshot vs Live Reference

Field `kol` dan `baki_debet` di tabel `desk_call`, `jadwal_penagihan`, dan `pembayaran` adalah **snapshot** (nilai dibekukan pada saat baris dibuat), **bukan foreign key live** ke tabel `debitur`. Ini memastikan riwayat historis tetap akurat mencerminkan kondisi debitur pada saat itu, meski kondisi debitur berubah setelahnya lewat import berikutnya.

### 18.7 Semua Role Melihat Semua Debitur

Tidak ada pembatasan data debitur berdasar AO atau wilayah kerja — seluruh role dengan akses ke modul Debitur/Desk Call/P3/Legal melihat **seluruh** debitur. Filter AO tersedia sebagai kenyamanan pencarian, bukan pembatasan akses data.

---

## 19. DESAIN MOBILE-FIRST & RESPONSIF

### 19.1 Profil Pengguna

Mayoritas akses dari **HP Android dan tablet Android** (staff lapangan), Chrome sebagai browser dominan. Desktop tetap didukung penuh namun bukan basis desain utama — CSS dibangun mobile-first (base style untuk mobile, `min-width` media query untuk memperkaya tampilan desktop, bukan sebaliknya).

### 19.2 Tiga Tingkat Breakpoint

| Breakpoint | Rentang | Navigasi | Layout Data |
|---|---|---|---|
| HP | < 640px | Drawer (Pola B) | Card per baris |
| Tablet | 640–1023px | Drawer (Pola B) | Card, grid 2 kolom untuk beberapa komponen |
| Desktop | ≥ 1024px | Sidebar tetap | Tabel penuh |

**Drawer menu items disesuaikan per role** — hanya menampilkan menu yang role tersebut punya akses (bukan menampilkan semua lalu disable sebagian).

### 19.3 Interaksi Sentuh

- Touch target minimal **44×44px** — kritis untuk aplikasi finansial, salah pencet berisiko fatal (contoh: tombol hapus data)
- Semua interaksi berbasis `click`, tidak ada yang bergantung `hover` (tidak berfungsi di touch screen)
- Upload foto: `capture="environment"` di input file — memberi opsi kamera langsung TANPA memaksa (user tetap bisa pilih galeri)

### 19.4 Draft Offline

**Ditunda ke fase pengembangan berikutnya** — MVP ini mengandalkan pesan error jelas saat gagal koneksi, belum ada mekanisme penyimpanan draft lokal (IndexedDB) untuk kondisi sinyal lemah di lapangan.

---

## 20. TEMA, STYLING & ANIMASI

### 20.1 Palet Warna

- Default: **light mode**, warna aksen `#0F766E` (teal), dapat dikustomisasi admin (§15.2)
- Dark mode tersedia via toggle, persisten di localStorage, aksen terpisah `#3FAEA5`
- Font: **Plus Jakarta Sans** (UI), **JetBrains Mono** (angka/data tabular)

### 20.2 Glassmorphism — Selektif, Bukan Menyeluruh

| Elemen | Efek kaca? |
|---|---|
| Modal backdrop (belakang modal) | ✅ |
| Header saat halaman di-scroll | ✅ |
| Toast notification | ✅ |
| Card data/statistik | ❌ Solid — keterbacaan angka finansial adalah prioritas |
| Tabel | ❌ Solid |
| Drawer navigasi | ❌ Solid |

**Alasan**: `backdrop-filter: blur()` berat untuk HP kelas menengah-bawah (basis pengguna lapangan), dan mengurangi keterbacaan data finansial jika diterapkan sembarangan.

### 20.3 Animasi

- Drawer: `cubic-bezier` custom (terasa "spring", bukan linear)
- Tab switch: slide horizontal
- Card load: staggered fade-in (satu-satu dengan jeda kecil)
- Stat counter: roll-up animation saat pertama dimuat
- Toast: slide + bounce halus

### 20.4 Bahasa

**Bahasa Indonesia selamanya** — tidak ada kebutuhan internasionalisasi (i18n) untuk sistem ini.


---

## 21. NON-FUNCTIONAL REQUIREMENTS

### 21.1 Keamanan

- Rate limiting login via Redis (5x gagal → lockout 15 menit)
- JWT HS256 dengan refresh token, blacklist di Redis saat logout/force-logout
- Idle timeout 30 menit (sisi klien)
- Audit log untuk seluruh aksi create/update/delete/approve/reject/import — kebutuhan kepatuhan pelaporan OJK

### 21.2 Performa

- Skala data saat ini ~1.400 debitur aktif — proses import batch (upsert) selesai dalam hitungan sub-detik hingga beberapa detik, **tidak memerlukan job queue/worker terpisah** di fase ini
- Jika skala bertambah signifikan (puluhan ribu debitur) di masa depan, pertimbangkan job queue (Redis + BullMQ, infrastruktur Redis sudah tersedia)
- Export PDF dibatasi maksimal 500 baris per dokumen — di atas itu, arahkan pengguna ke Export Excel

### 21.3 Retensi Data

| Data | Retensi |
|---|---|
| Foto P3 + audit log terkait | Auto-hapus setelah 2 tahun |
| Refresh token expired/revoked | Cron job pembersihan harian |
| Staging rows import (setelah applied) | Bisa dibersihkan setelah beberapa hari |

### 21.4 Zona Waktu

`Asia/Jakarta` eksplisit via `process.env.TZ` di level aplikasi Node.js — tidak boleh mengasumsikan timezone default server hosting (VPS bisa saja di-provision dengan default UTC atau timezone lain).

### 21.5 Kompatibilitas Browser

Chrome/Chrome Android sebagai target utama (dikonfirmasi sesuai realita pengguna) — tidak perlu polyfill untuk browser lama.

---

## 22. ITEM DITUNDA / DI LUAR CAKUPAN FASE INI

Item berikut secara sadar **tidak** masuk cakupan pembangunan fase ini, namun dicatat agar tidak terlupa untuk roadmap berikutnya:

| Item | Alasan Ditunda |
|---|---|
| Migrasi data dari dashboard HTML lama (`bprs_dashboard_with_export.html`, berbasis localStorage) | Belum diputuskan apakah data lama perlu dipindah atau dianggap arsip terpisah |
| Deteksi duplikasi import Riwayat Bayar (Excel/CSV) | **Wajib ada di fase produksi berikutnya** — MVP mengasumsikan kehati-hatian admin |
| Integrasi otomatis pelaporan ke portal OJK | Sistem ini menyiapkan data yang relevan (lewat audit log & modul KPI), namun submit ke OJK tetap proses manual terpisah |
| Draft offline (P3/Desk Call di lokasi sinyal lemah) | Memerlukan IndexedDB + sync queue, kompleksitas signifikan |
| Spesifikasi infrastruktur deployment (VPS, domain, SSL, strategi backup) | Dibahas mendekati go-live, bukan bagian dari spesifikasi fungsional |
| Generate PDF sisi server (Puppeteer) untuk seluruh laporan | MVP memakai `window.print()` sisi klien; Puppeteer untuk hasil lebih presisi adalah penyempurnaan lanjutan |
| Perhitungan filter periode sungguhan di Dashboard & KPI | MVP: pill filter periode bersifat dekoratif (visual saja); perhitungan filter data sungguhan menyusul |
| Role cadangan untuk approval user saat admin tunggal tidak tersedia | Risiko diterima untuk fase ini |

---

## 23. RIWAYAT KEPUTUSAN (CHANGELOG KRONOLOGIS)

Bagian ini merangkum keputusan-keputusan kunci beserta alasannya, disusun per topik untuk kemudahan rujukan — berguna untuk memahami *mengapa* suatu pilihan diambil, bukan sekadar *apa* yang diputuskan.

### 23.1 Autentikasi & Akun

- Lupa password via TTL+username — **risiko diterima**, aplikasi internal saja
- Register ulang dengan username sama setelah ditolak — **diperbolehkan**, maksimal 3x/hari per username
- Single device login — **peringatan sebelum force-logout**, bukan otomatis tanpa konfirmasi
- NIK terbuka untuk semua role — **kebutuhan operasional nyata**, bukan kelalaian
- Idle timeout **30 menit**
- Field email **ditambahkan** ke form register (awalnya tidak ada di rancangan pertama)

### 23.2 Data & Konkurensi

- Optimistic locking di P3 via pengecekan `updated_at`
- Debitur lunas **tetap tampil** dengan badge hijau, bukan disembunyikan (soft-delete tersembunyi ditolak)
- Cron job pembersihan `refresh_tokens` — awalnya tidak direncanakan, ditambahkan setelah disadari tabel bisa membengkak tanpa batas
- **Tidak perlu** validasi batas atas nominal — skala BPRS ini secara alami terbatas

### 23.3 Evolusi Arsitektur Import CBS (paling banyak revisi)

1. **Awal**: dirancang untuk laporan kolektibilitas harian 21 kolom (murni data finansial, tanpa kontak/identitas)
2. **Temuan**: file 21-kolom ini tidak cukup untuk onboarding debitur baru (tidak ada telepon/NIK/alamat)
3. **Ditemukan**: file bulanan 100 kolom sudah mencakup SEMUA yang ada di file 21-kolom, plus identitas & agunan lengkap
4. **Pertanyaan**: bisakah file 100 kolom di-generate harian, bukan cuma bulanan? → **Bisa, tapi manual dan makan waktu**
5. **Keputusan awal**: dua pipeline (100-kolom bulanan/manual + 21-kolom harian/ringan)
6. **Revisi final**: karena generate 100-kolom TETAP manual apa pun frekuensinya, **tidak ada untungnya pegang dua sistem** — cukup **satu pipeline**, pakai file 100-kolom setiap hari
7. **Temuan tambahan**: delimiter file tidak konsisten (koma vs titik-koma) antar hasil export — parser wajib auto-detect
8. **Temuan tambahan**: NIK di sebagian file rusak (notasi ilmiah Excel) — field NIK dibuat write-once untuk melindungi dari penimpaan data buruk
9. **Temuan tambahan**: CBS ternyata hanya punya field "Sampai Tanggal" tunggal, bukan rentang awal-akhir sungguhan — dikonfirmasi lewat 3 sampel file nyata (6 Juli, 7 Juli, 31 Juli) bahwa hasilnya snapshot titik waktu, populasi selalu identik, hanya kondisi finansial yang berubah sesuai waktu berjalan
10. **Durasi generate**: 5–20 menit tergantung seberapa jauh dari awal bulan — dikonfirmasi tetap realistis untuk rutinitas harian

### 23.4 Desain Mobile & Navigasi

- Prioritas berubah dari "desktop dengan adaptasi mobile" menjadi **"mobile-first, tetap rapi di desktop"** setelah diketahui mayoritas pengguna adalah staff lapangan
- Pola navigasi: dibandingkan Bottom Navigation vs Drawer Menu secara visual → **dipilih Drawer (Pola B)** untuk semua breakpoint mobile/tablet, sidebar tetap hanya di desktop
- Drawer menu items **disesuaikan per role**, bukan seragam dengan sebagian disable

### 23.5 Status & Kategori (Evolusi Detail)

- P3 prioritas: **4 level** (Kritis/Tinggi/Sedang/Rendah), bukan 3 seperti rancangan awal
- P3 status: label `"Dalam Proses"` (final) — sempat tertulis `"Proses"` di draf prototype, direkonsiliasi ke penamaan asli sumber data
- Desk Call status kontak: **6 nilai final** — status "Tersambung Tidak Diangkat" ditambahkan setelah masukan langsung dari petugas Desk Call di lapangan ("yang tidak tersambung belum ada komitmen"), dipisah dari Connection Rate

### 23.6 Legal — Koreksi Kategori

Kategori checklist Legal yang dirancang di awal (Dokumen Akad/Jaminan/Surat Peringatan) **keliru** — setelah membaca ulang struktur asli, kategori yang benar adalah **Identitas, Usaha, Agunan, Akad & Notarial** (24 item total). Dikoreksi sebelum masuk prototype final.

### 23.7 KPI — Rebuild Total

- Desain KPI awal (7 metrik generik) **digantikan total** oleh struktur asli yang jauh lebih kaya: 9 section, 10 target RBB, 16 kartu indikator
- Roll Rate & Cure Rate: ditemukan **dua definisi berbeda** (berbasis kunjungan P3 vs berbasis riwayat KOL debitur) — keduanya dipertahankan sebagai sudut pandang terpisah, bukan saling menggantikan
- Nama petugas di filter: prototype pakai nama staff yang konsisten dengan sistem (bukan 5 nama dari file sumber asli yang tidak berhubungan)

### 23.8 Riwayat Bayar & Debitur — Integrasi

- Tombol "Catat Pembayaran Baru" ditambahkan ke modal Debitur, terhubung ke form yang sama dengan modul Riwayat Bayar (bukan form terpisah)
- Field No. Rekening/Nama dikunci (read-only) saat form dibuka dari konteks Debitur — mencegah salah catat
- Edit data pembayaran tersimpan **dibatasi Admin & Kabid P3** — awalnya tidak ada kemampuan edit sama sekali (hanya hapus)
- Ikon "Catat Call" vs "Call biasa" awalnya **identik** (bug ditemukan saat review) — dibedakan jadi ikon pensil vs ikon telepon

### 23.9 Gap yang Ditemukan Setelah Build Selesai

Modul Import Data CBS Kolektibilitas (§16) — meski menjadi topik diskusi terpanjang dan paling detail sepanjang proses requirement gathering — **tidak sempat masuk ke prototype final** karena terlewat dari checklist eksplisit saat sesi build besar dilakukan. Ditemukan saat review pasca-build, dicatat lengkap di dokumen ini untuk dibangun di tahap implementasi sungguhan.

---

## 24. LAMPIRAN: SPESIFIKASI KOLOM IMPORT CSV (100 KOLOM)

Daftar lengkap 100 kolom dari file export CBS "nasabah pembiayaan" yang menjadi sumber Import Data CBS (§16). Kolom-kolom kunci yang dipetakan langsung ke skema `debitur` (§6.3) ditandai tebal; kolom lain tersedia di file sumber namun belum punya field tujuan spesifik di skema saat ini (dicadangkan untuk kebutuhan lanjutan).

**Identitas & Kontak**: RekeningLama, **RekeningBaru**, RekeningEfektif, **NoSPk**, **CIFBaru**, CIFLama, CIFEfektif, **NoIdentitas** (NIK), **Nama**, **TglLahir**, **Alamat**, KodePos, Desa, Kecamatan, **Kota**, **Telepon**, **Pekerjaan**, **Agama**, **Resiko**

**Klasifikasi Pembiayaan**: SifatPembiayaan, JenisPenggunaan, SumberDana, PeriodePembayaran, GolonganDebitur, KategoriDebiturSlik, SektorEkonomiOJK, JenisUsaha, Referensi, KetReferensi, GolonganPenjamin, BagianDijamin

**Data Finansial**: **Plafond/ModalBank**, **RateMargin**, **JW**, **TglAwal**, **Tgl**, **JTHTMP**, **TglAngsuranTerakhir**, TotalKewajibanPokok, TotalKewajibanMargin, SaldoTerakhirPokok, SaldoTerakhirMargin, TotalAngsuran, **JenisMargin**, **Restrukturisasi**

**Baki & Angsuran**: **Bakidebet**, Provisi, BiayaTransaksi, BakiDebetNetto, **AngsMargin**, **AngsPokok**

**Tunggakan (terpisah pokok/margin)**: **T.Pokok**, **FRHPokok**, **FRPokok**, **T.Margin**, T.MarginReschedule, **FRHMargin**, **FRMargin**, **TotalTunggakan**, **FR**, **FRHari**

**Kolektibilitas**: **Kol**, KolMurni, KodeSebabMacet, KetKodeSebabMacet, KeteranganSebabMacet, CaraPerhitungan

**Relasi & Petugas**: KodeKeterkaitan, Keterkaitan, KodeAO, **AO**, KodeInstansi, Instansi, KodeKolektor, Kolektor, KodeJenisPengikatan, JenisPengikatan, TglMacet

**Agunan**: **JenisAgunan**, **NilaiJaminan**, NilaiUtkPPAP, NilaiPengurangPPAP, PPAP, DetailAgunan

**Akrual**: MarginBlnDepan, JmlHariPembagi, HariAccrual, Accrual, Accrual+TMargin

**Tabungan Terkait**: **RekTabungan**, **Saldo**, SaldoBlokir, SaldoMinimum, SaldoEfektif

**Asuransi**: Asuransi, KodeAsuransi, KeteranganAsuransi, Asuransi1, KodeAsuransi1, KeteranganAsuransi1

---

*Dokumen ini adalah spesifikasi hidup — pembaruan lebih lanjut akan dicatat dengan penambahan entri baru di §23, bukan menghapus/menimpa riwayat keputusan yang sudah ada.*
