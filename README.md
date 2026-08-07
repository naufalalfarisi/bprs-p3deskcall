# Enterprise Banking Portal — Sistem Informasi Penagihan Terpadu (AO, P3 & Desk Call)
### PT BPRS Mitra Harmoni Yogyakarta

Sistem Informasi Penagihan Terpadu adalah platform manajemen penagihan pembiayaan dan pemantauan kualitas aset perbankan syariah (Non-Performing Financing / NPF) yang dirancang untuk mengintegrasikan alur kerja Account Officer (AO), Petugas Penagihan Lapangan (P3), dan Petugas Desk Call dalam satu sistem terpadu.

---

## 📌 Ruang Lingkup & Tujuan Sistem

Aplikasi ini dikembangkan untuk menangani penagihan pembiayaan bermasalah secara terstruktur, terukur, dan mematuhi regulasi perbankan syariah. Fitur utama mencakup:

1. **Efisiensi Operasional Desk Call**: Pengingat otomatis jatuh tempo janji bayar, penanganan follow-up berjenjang, dan analisis waktu panggilan paling produktif (*Golden Hour*).
2. **Akuntabilitas Kunjungan Lapangan (P3)**: Penjadwalan kunjungan presisi, validasi foto lokasi ber-geotag koordinat, dan berita acara hasil penagihan lapangan.
3. **Manajemen Portofolio & Legalitas Agunan**: Pengawasan 14 jenis dokumen legalitas akad dan penanganan Aset Yang Diambil Alih (AYDA).
4. **Evaluasi Kinerja & Indikator RBB**: Scorecard 16 indikator KPI perbankan (NPF Gross, Recovery Rate, Collection Rate, Promise Kept Rate, Roll-Over & Roll-Cure Rate).

---

## ⚡ Fitur Utama & Modul Sistem

### 1. Modul Manajemen Debitur & Portofolio Pembiayaan
* **Monitoring Portofolio NPF**: Visualisasi total Baki Debet, tunggakan pokok, margin, dan distribusi kolektibilitas (KOL 1 - LANCAR, KOL 2 - DPK, KOL 3 - KL, KOL 4 - D, KOL 5 - M).
* **Pencarian & Penyaringan Dinamis**: Filtering instan berdasarkan Account Officer (AO), status kolektibilitas, dan periode jatuh tempo (Hari Ini, H-7, H-14).
* **Quick Action & Profil Debitur**: Akses cepat riwayat kontak, jadwal janji bayar, dokumen agunan, dan riwayat pembayaran per nasabah.

### 2. Modul Desk Call & Customer Behavior Insight
* **Pencatatan Panggilan Kontak**: Log komunikasi harian via Telepon atau WhatsApp dengan kategori respon (Terhubung, Tidak Diangkat, Sibuk, Tidak Aktif, Salah Nomor).
* **Customer Behavior Insight**:
  * **Golden Hour Analysis**: Identifikasi jam paling produktif nasabah mengangkat panggilan.
  * **Distribusi Kanal**: Evaluasi efektivitas saluran komunikasi (Telepon vs. WhatsApp).
  * **Evaluasi Produktivitas Petugas**: Peringkat rasio keterhubungan (Contact Rate %) dan nominal komitmen PTP per petugas.
* **Analytics Success Rate Janji Bayar (PTP Resolution Rate)**:
  * Klasifikasi status komitmen: `Selesai (Sudah Bayar)`, `Dalam Follow-Up`, dan `Ingkar Janji (Overdue)`.
  * Kartu filter interaktif untuk menyaring daftar nasabah per kategori secara real-time.
  * Kategorisasi performa penagihan: *Sangat Baik (≥ 70%)*, *Sedang (40% - 69%)*, dan *Perlu Perhatian (< 40%)*.

### 3. Modul Follow-Up Notifikasi & Otomatisasi Pelunasan
* **Notifikasi Berjenjang**: Pengingat otomatis H-1 dan Hari-H jatuh tempo janji bayar dengan kuota maksimal 3x follow-up per nasabah.
* **Preservasi Tanggal Panggilan**: Tindak lanjut melalui notifikasi secara otomatis meng-update status catatan awal menjadi "Sudah Bayar" tanpa menggeser tanggal ke hari ini, menjaga kebersihan laporan harian desk call.
* **Auto-Sync Pembayaran**: Mengubah status ke "Sudah Bayar" secara otomatis mencatat transaksi pada modul Pembayaran.

### 4. Modul Penagihan Lapangan (P3 / Penagihan Pihak Ke-3)
* **Penjadwalan Kunjungan Lapangan**: Kalender interaktif 14 hari agenda kunjungan tim P3.
* **Validasi Geotagging & Kompresi Foto**: Dokumentasi foto kunjungan lapangan berkoordinat lat-long dengan kompresi otomatis untuk efisiensi penyimpanan server.
* **Berita Acara & Hasil Kunjungan**: Pencatatan respon nasabah di lokasi, estimasi tanggal bayar, dan tindak lanjut penanganan.

### 5. Modul Berkas Legalitas Akad & Agunan (AYDA)
* **14 Checklist Audit Legalitas**: Verifikasi dokumen fisik (KTP, SKU, Akad Pembiayaan, APHT, Sertifikat Agunan, IMB, SKMHT, dll).
* **Indikator Kelengkapan Berkas**: Persentase kelengkapan dokumen per nasabah (`Lengkap`, `Dalam Proses`, `Kurang`).
* **Pengawasan Agunan (AYDA)**: Pencatatan aset bermasalah yang siap atau sedang dalam proses pengambilalihan.

### 6. Modul Pembayaran & Laporan Rekapitulasi
* **Pencatatan Angsuran**: Input pembayaran tunai / transfer bank dengan update otomatis pada baki debet nasabah.
* **Import Batch Data**: Fasilitas pengunggahan berkas transaksi masal format Excel (`.xlsx`) atau CSV (`.csv`).
* **Cetak Laporan Rekapitulasi PDF**: Penerbitan laporan resmi harian ber-kop surat PT BPRS Mitra Harmoni Yogyakarta lengkap dengan kolom tanda tangan otorisasi.

### 7. Modul KPI Scorecard & Target Rencana Bisnis Bank (RBB)
* **16 Indikator Perbankan**:
  * *Kualimasi Pembiayaan*: NPF Gross, PPAP Coverage, Recovery Rate, Cure Rate.
  * *Efektivitas Penagihan*: Collection Rate, PTP Rate, Promise Kept Rate, Roll Rate.
  * *Produktivitas Petugas*: Coverage Ratio, Kunjungan/Petugas, Achievement Rate, Rata-rata Tagihan/Kunjungan.
  * *Restrukturisasi & Legal*: Restrukturisasi Success Rate, Total Restrukturisasi, Legal Action Rate, Berkas AYDA.
* **Roll Rate & Roll Cure Matrix**: Evaluasi pergerakan kolektibilitas nasabah dari bulan ke bulan.

### 8. Fitur Keamanan, RBAC & Progressive Web App (PWA)
* **Role-Based Access Control (RBAC)**: Otorisasi hak akses berjenjang (Admin, Kabid P3, Staff Desk Call, Staff P3, Account Officer).
* **Progressive Web App (PWA)**: Layar aplikasi mandiri (*standalone*), offline caching via Service Worker, dan dukungan instalasi di Desktop/Android/iOS.

---

## 🛠️ Arsitektur & Teknologi

* **Backend Environment**: Node.js dengan Framework **Hono** (High performance, low footprint).
* **Database & ORM**: SQLite (Development) / MySQL (Production) diakses via **Prisma ORM**.
* **Frontend UI Engine**: HTML5, Vanilla JavaScript (ES6+), Vanilla CSS (Custom Design System, Dark/Light Mode), Chart.js.
* **Media & Document Processing**: `sharp` (Image Compression), `pdfkit` & `pdfkit-table` (PDF Report Generation), `exceljs` & `fast-csv` (Excel/CSV Data I/O).
* **Keamanan & Otorisasi**: Standardisasi JWT (`jose`) dan enkripsi password `bcryptjs`.

---

## ⚙️ Persyaratan Lingkungan (System Requirements)

* **Node.js**: Versi `18.x` atau `20.x` LTS.
* **Package Manager**: `npm` versi `9.x` atau lebih baru.
* **Database Server**: SQLite (Lokal) atau MySQL 5.7+ / MariaDB 10.4+ (Production).

---

## 📄 Lisensi & Hak Cipta

Dikembangkan oleh **Muhammad Naufal AlFarisi** & © 2026 **PT BPRS Mitra Harmoni Yogyakarta**. Hak cipta dilindungi undang-undang.
