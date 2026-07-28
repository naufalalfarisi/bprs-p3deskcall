# Sistem Informasi Penagihan Terpadu (AO, P3 & Desk Call) — BPRS Mitra Harmoni Yogyakarta

Aplikasi Sistem Informasi Penagihan Terpadu (AO, P3, & Desk Call) adalah platform perbankan syariah modern yang dikembangkan untuk mengelola, melacak, dan mengoptimalkan penagihan pembiayaan bermasalah (NPF - Non-Performing Financing) di **PT BPRS Mitra Harmoni Yogyakarta**.

---

## 🚀 Fitur Utama

1. **Dashboard & Data Debitur Pembiayaan**
   * Pemantauan portofolio pembiayaan aktif, total baki debet, tunggakan pokok & margin, serta jumlah kasus NPF secara real-time.
   * Filter pencarian dinamis berdasarkan Status KOL (1-5), Account Officer (AO), dan Periode Jatuh Tempo (Hari Ini, 7 Hari, 14 Hari).
   * Tombol pintas penyaringan cepat (*Quick Pills*) dengan kalkulasi dinamis.

2. **Monitoring Desk Call**
   * Pencatatan produktivitas panggilan harian petugas (Telepon / WhatsApp).
   * Pelacakan respon nasabah (Terhubung, Sibuk, Tidak Aktif, Salah Nomor).
   * Manajemen janji bayar (*Promise to Pay / PTP*) dengan pencatatan tanggal & nominal janji.

3. **Penagihan Lapangan (P3)**
   * Manajemen jadwal kunjungan penagihan tim lapangan (P3).
   * Calendar strip agenda 14 hari interaktif.
   * Dokumentasi foto lapangan dengan fitur kompresi gambar otomatis (`sharp`) dan koordinat peta.

4. **Manajemen Berkas Legal & Agunan**
   * 14 checklist dokumen wajib sesuai standar legalitas perbankan (KTP, SKU, Akad, APHT/Fidusia, Sertifikat, dll).
   * Unggah dokumen bukti legalitas dan agunan nasabah.
   * Indikator persentase kelengkapan berkas (`Lengkap`, `Proses`, `Kurang`).

5. **Riwayat Pembayaran & Cetak Rekap PDF Harian**
   * Pencatatan transaksi pembayaran angsuran (Tunai/Transfer).
   * Fitur Import batch transaksi pembayaran via file Excel (XLSX/CSV).
   * **Cetak PDF Laporan Rekapitulasi Pembayaran Harian** dengan Kop Surat resmi perbankan dan tanda tangan otorisasi.

6. **Target & KPI Rencana Bisnis Bank (RBB)**
   * Grafik visual tren NPF ratio bulanan.
   * Evaluasi parameter target RBB, Recovery Rate, dan Promise Kept Rate petugas.

7. **Pengaturan Branding Aplikasi**
   * Kustomisasi nama institusi PT, logo utama, favicon, dan skema warna tema secara dinamis.

---

## 🛠️ Tech Stack

* **Backend**: Node.js & Hono Framework (super ringan dan kencang).
* **Database & ORM**: Prisma ORM dengan SQLite (default lokal).
* **Frontend**: HTML5, Vanilla CSS Modern (Glassmorphism, Dark Mode, Responsive Layout), TailwindCSS, Chart.js.
* **Libraries**: `sharp` (kompresi gambar), `exceljs` (pengolah berkas excel), `jose` (JWT authentication).

---

## ⚙️ Persyaratan Sistem

* Node.js versi `18.x` atau `20.x` (versi LTS direkomendasikan).
* npm (Node Package Manager).

---

## 💻 Cara Menjalankan di Lokal (Development)

1. **Clone repositori**:
   ```bash
   git clone https://github.com/naufalalfarisi/bprs-p3deskcall.git
   cd bprs-p3deskcall
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Setup Database (Prisma)**:
   ```bash
   npx prisma db push
   ```

4. **Isi Data Awal (Admin & Demo Account)**:
   ```bash
   npm run seed
   ```

5. **Jalankan Server Aplikasi**:
   ```bash
   npm run dev
   ```
   Aplikasi akan berjalan di port `3000` (akses: [http://localhost:3000](http://localhost:3000)).

---

## 🌐 Cara Membagikan Link Uji Coba Publik (Tunneling)

Untuk membagikan aplikasi dari laptop lokal Anda agar dapat diuji oleh tim lain melalui HP/Laptop di luar jaringan:
```bash
npm run share
```
Sistem akan memberikan link HTTPS publik gratis (localtunnel).

---

## ☁️ Panduan Deploy ke cPanel Hosting

1. Buat subdomain di cPanel (misal: `p3deskcall.bprs-mitraharmoni.co.id`).
2. Buat database MySQL baru di cPanel dan tambahkan hak akses user.
3. Di cPanel, buka menu **Setup Node.js App** ➔ **Create Application**.
   * Set Application root: `p3deskcall`
   * Set Startup file: `dist/index.js`
4. Upload seluruh file project (Kecuali folder `node_modules`).
5. Buat file `.env` di server dan masukkan URL koneksi database MySQL:
   ```env
   PORT=3000
   DATABASE_URL="mysql://username_db:password_db@localhost:3306/nama_db"
   JWT_SECRET="bprs-mitra-harmoni-yogyakarta-secure-jwt-key"
   ```
6. Buka terminal virtual env di cPanel, jalankan:
   ```bash
   npm install
   npm run build
   npx prisma db push
   ```
7. Klik **Restart Application** di menu Setup Node.js App.
