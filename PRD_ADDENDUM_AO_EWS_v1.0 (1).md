# PRD ADDENDUM — Dashboard Early Warning System (EWS) untuk Account Officer
## PT BPRS Mitra Harmoni Yogyakarta

**Versi:** 1.0
**Tanggal:** 21 Juli 2026
**Status:** Siap untuk implementasi (vibe coding)
**Dokumen induk:** `PRD_MASTER_BPRS_v3.md` — dokumen ini **tidak berdiri sendiri**, melainkan perluasan dari sistem yang sudah dispesifikasikan lengkap di PRD Master. Seluruh bagian yang tidak disebut ulang di sini (autentikasi dasar, skema tabel `debitur`/`pembayaran`/dst, Dashboard umum, KPI umum, Sistem Notifikasi umum) **tetap berlaku seperti didokumentasikan di PRD Master**, hanya diperluas di titik-titik yang disebutkan eksplisit di dokumen ini.

---

## DAFTAR ISI

1. [Ringkasan Perubahan](#1-ringkasan-perubahan)
2. [Perluasan RBAC — 2 Role Baru](#2-perluasan-rbac--2-role-baru)
3. [User Flow](#3-user-flow)
4. [Perubahan pada Alur Register](#4-perubahan-pada-alur-register)
5. [Skema Database — Perubahan & Tabel Baru](#5-skema-database--perubahan--tabel-baru)
6. [Modul Baru: Dashboard EWS Account Officer](#6-modul-baru-dashboard-ews-account-officer)
7. [Business Rules Khusus AO](#7-business-rules-khusus-ao)
8. [Perluasan Sistem Notifikasi](#8-perluasan-sistem-notifikasi)
9. [Perluasan Modul KPI](#9-perluasan-modul-kpi)
10. [Riwayat Keputusan Addendum Ini](#10-riwayat-keputusan-addendum-ini)

---

## 1. RINGKASAN PERUBAHAN

### 1.1 Apa yang Ditambahkan

- 2 role baru: `ao` (Account Officer) dan `kabid_ao` (Kepala Bidang Account Officer)
- 1 modul baru: **Dashboard EWS** — khusus diakses `ao`, `kabid_ao`, `admin`
- 1 tabel baru inti: `ao_collection_log` — pencatatan tindak lanjut AO, terpisah dari `desk_call`
- Perluasan tabel `users` dan `debitur` untuk relasi kepemilikan AO
- Perluasan Sistem Notifikasi: reminder EWS (push notif + email)
- Perluasan modul Dashboard/KPI existing dengan filter portofolio AO

### 1.2 Prinsip Arsitektur Kunci

**Login, register, dan seluruh infrastruktur autentikasi TETAP SATU SISTEM** dengan P3/Desk Call/Legal — `ao` dan `kabid_ao` hanyalah 2 nilai tambahan di enum `posisi` yang sudah ada, melalui alur login/register yang identik (§5 PRD Master), bukan sistem terpisah.

**Pembagian kerja penagihan — 3 lapisan paralel, bukan pengganti satu sama lain:**

| Tim | Basis penugasan | Cakupan KOL |
|---|---|---|
| Desk Call | Berbasis KOL | Utamanya KOL 1-2 (reminder), fleksibel ke KOL lain untuk kepentingan mendesak kantor |
| P3 | Berbasis KOL | KOL 3-4-5 (penagihan lapangan NPF) |
| **AO (baru)** | **Berbasis kepemilikan nasabah (relationship-based)** | **Semua KOL** — AO mengawasi dan aktif menagih nasabah binaannya sendiri lintas kategori |

Satu nasabah NPF secara sah bisa disentuh **P3** (karena KOL-nya) **dan** **AO-nya sendiri** (karena itu nasabah binaannya) secara bersamaan — ini bukan tabrakan proses seperti kasus Desk Call vs P3 dulu, karena basis penugasannya beda dimensi (KOL vs kepemilikan), bukan tumpang tindih di dimensi yang sama.

### 1.3 Prinsip "Lihat Semua, Edit Milik Sendiri"

Berbeda dari pembatasan akses data di PRD Master (dimana semua role melihat semua debitur tanpa batas), modul AO memperkenalkan **dua lapis aturan berbeda** untuk pertama kalinya di sistem ini:

- **Melihat data debitur**: tidak dibatasi — AO tetap bisa lihat seluruh debitur seperti role lain (konsisten §18.7 PRD Master)
- **Mengedit Collection Log**: **dibatasi ketat** — hanya AO yang namanya cocok dengan `debitur.ao_id` untuk nasabah itu yang boleh mencatat/mengubah Collection Log. AO lain tidak bisa menyentuh Collection Log nasabah binaan AO lain, meski bisa melihat datanya.

---

## 2. PERLUASAN RBAC — 2 ROLE BARU

### 2.1 Matriks Akses Menu (Diperluas dari §4.2 PRD Master)

| Menu | admin | kabid_p3 | staff_p3 | desk_call | legal | **ao** | **kabid_ao** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Debitur | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Desk Call | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| P3 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Legal | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Riwayat Bayar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| KPI & Scorecard | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Manajemen User | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manajemen Aplikasi | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Import Data CBS | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dashboard EWS (baru)** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

> Ditegaskan sesuai instruksi eksplisit: modul Dashboard EWS **tidak bisa diakses** `kabid_p3`, `desk_call`, `staff_p3`, maupun `legal` — murni `admin`, `ao`, `kabid_ao`.

### 2.2 Deskripsi Role Baru

| Role | Deskripsi | Cakupan data Collection Log |
|---|---|---|
| `ao` | Account Officer — mengawasi dan menagih nasabah binaan sendiri lintas semua KOL | Hanya nasabah dengan `debitur.ao_id` = dirinya sendiri |
| `kabid_ao` | Kepala Bidang Account Officer — pengawas seluruh AO | **Melihat semua** portofolio semua AO (mirip pola Kabid P3), namun **tidak mengedit** Collection Log milik AO manapun — murni pengawasan (lihat §7.3 untuk penjelasan) |

### 2.3 Judul Header Dinamis (Perluasan §4.3 PRD Master)

| Role | Subtitle header |
|---|---|
| `ao` | Account Officer |
| `kabid_ao` | Pembinaan Account Officer |

---

## 3. USER FLOW

### 3.1 Alur Registrasi AO

```
1. Buka halaman Register
2. Isi: Nama, Username, Tanggal Lahir, Email
3. Pilih Posisi → muncul 2 opsi baru: "Account Officer", "Kepala Bidang Account Officer"
4. JIKA posisi = "Account Officer":
   → Field baru muncul: "Pilih Anda AO yang mana?"
   → Dropdown diisi dari daftar nama AO unik hasil import CBS (lihat §5.3)
   → WAJIB dipilih untuk lanjut submit
5. JIKA posisi = "Kepala Bidang Account Officer":
   → Field pemilihan AO TIDAK muncul (Kabid AO mengawasi semua, tidak terikat satu nama AO)
6. JIKA posisi SELAIN itu (P3/Desk Call/Legal/dst):
   → Field pemilihan AO TIDAK muncul sama sekali — perilaku form persis seperti sebelumnya, tidak berubah
7. Isi password + konfirmasi → Submit
8. Status akun: pending
```

### 3.2 Alur Approval (Diperluas dari §14.2 PRD Master)

Untuk pendaftar dengan posisi AO, panel approval admin (Manajemen User) menampilkan **tambahan info**: nama AO yang dipilih pendaftar. Admin diharapkan **memverifikasi kecocokan** nama AO yang dipilih dengan identitas asli pendaftar sebelum approve — mencegah user asal pilih nama AO siapa pun saat register. Ini murni catatan visual tambahan di panel yang sudah ada, bukan mekanisme verifikasi otomatis baru.

### 3.3 Alur Harian AO (setelah login)

```
1. Login → Dashboard (tampilan sama seperti role lain, §7 PRD Master)
2. Notifikasi bell menampilkan reminder EWS nasabah binaannya (§8.1)
3. Buka menu "Dashboard EWS" →
   a. Lihat ringkasan KPI portofolio pribadi
   b. Lihat tabel Detail Nasabah Binaan, cari/filter/sort
   c. Klik satu nasabah → modal detail (perluasan modal Debitur §8.4 PRD Master)
      + section baru: Collection Log
   d. Catat tindak lanjut baru, ATAU
   e. Klik tombol reminder (WA dengan teks otomatis) ke nasabah
4. AO TIDAK bisa membuka Collection Log nasabah binaan AO lain untuk diedit
   (tetap bisa lihat datanya di modul Debitur biasa, hanya Collection Log yang terkunci)
```

### 3.4 Alur Kabid AO

```
1. Login → Dashboard EWS menampilkan agregat SEMUA AO (bukan satu AO saja)
2. Bisa lihat leaderboard perbandingan kinerja antar AO (§9.2)
3. Bisa lihat (read-only) Collection Log semua AO untuk keperluan pengawasan
4. TIDAK bisa mengedit Collection Log milik AO manapun
```

> ⚠️ **Asumsi yang perlu dikonfirmasi**: poin 4 di atas (Kabid AO tidak bisa edit, murni mengawasi) adalah interpretasi saya dari kata "mengawasi" yang dipakai untuk mendeskripsikan cakupan Kabid AO — belum dikonfirmasi eksplisit. Jika ternyata Kabid AO perlu kemampuan edit/koreksi Collection Log AO bawahannya (misal saat AO cuti/tidak sempat update), ini perlu direvisi jadi izin khusus terpisah dari aturan "hanya pemilik yang edit".


---

## 4. PERUBAHAN PADA ALUR REGISTER

### 4.1 Field Baru di Form Register

| Field | Tipe | Kondisi Tampil | Wajib |
|---|---|---|---|
| Pilih AO | Dropdown (select) | Hanya jika Posisi = "Account Officer" | Ya, jika kondisi terpenuhi |

**Sumber data dropdown**: `SELECT DISTINCT ao FROM debitur WHERE ao IS NOT NULL ORDER BY ao ASC` — daftar nama AO yang PERNAH muncul di data hasil import CBS. Ini berarti dropdown ini **kosong/tidak lengkap** sampai minimal satu kali Import CBS (§16 PRD Master) berhasil dijalankan — perlu dipastikan urutan operasional: Import CBS pertama kali harus selesai sebelum staff AO mulai mendaftar, supaya nama mereka tersedia di pilihan.

### 4.2 Validasi Tambahan

- Jika Posisi = "Account Officer" dan field "Pilih AO" tidak diisi → form tidak bisa submit, pesan error jelas
- Tidak ada validasi bahwa satu nama AO hanya bisa dipilih oleh satu akun (secara teori dua akun bisa memilih nama AO yang sama — ini kondisi anomali yang diserahkan ke admin untuk ditangani manual saat proses approve, bukan divalidasi otomatis sistem)

---

## 5. SKEMA DATABASE — PERUBAHAN & TABEL BARU

### 5.1 Perubahan pada Tabel `users` (existing, PRD Master §6.1)

| Kolom baru | Tipe | Keterangan |
|---|---|---|
| `posisi` | ENUM | **Diperluas**: tambah nilai `ao`, `kabid_ao` ke enum yang sudah ada (admin, kabid_p3, staff_p3, desk_call, legal) |
| `ao_name_ref` | VARCHAR(150) | Nullable. Diisi HANYA saat posisi = `ao`. Menyimpan string nama AO **persis** seperti dipilih dari dropdown (yang bersumber dari `debitur.ao`) — bukan diketik bebas, sehingga terjamin match persis tanpa typo |

### 5.2 Perubahan pada Tabel `debitur` (existing, PRD Master §6.3)

| Kolom baru | Tipe | Keterangan |
|---|---|---|
| `ao_id` | FK → users.id, nullable | **Relasi hasil rekonsiliasi** — diisi otomatis oleh proses Import CBS (lihat §5.3), bukan diinput manual |

Kolom `ao` (VARCHAR, string mentah dari CBS) **tetap dipertahankan apa adanya** sebagai sumber kebenaran nama — `ao_id` adalah hasil pencocokan terhadap kolom ini, bukan penggantinya.

### 5.3 Proses Rekonsiliasi `ao_id` (Bagian dari Alur Import CBS, Perluasan §16.3 PRD Master)

Ditambahkan sebagai langkah baru dalam transaksi Import CBS, setelah UPSERT data debitur:

```
UNTUK setiap baris debitur yang baru di-upsert:
  CARI users WHERE posisi='ao' AND ao_name_ref = debitur.ao (match persis)
  JIKA ketemu:
    SET debitur.ao_id = users.id
  JIKA TIDAK ketemu (AO tersebut belum register/belum di-approve):
    debitur.ao_id tetap NULL — akan otomatis terisi di proses import BERIKUTNYA
    setelah AO yang bersangkutan register dan ter-approve
```

**Implikasi**: ada jeda alami antara "nasabah pertama kali tercatat di CBS dengan AO tertentu" dan "AO tersebut resmi ter-link di sistem" — yaitu sampai AO itu mendaftar dan disetujui admin. Ini bukan bug, melainkan konsekuensi logis dari urutan proses (import bisa duluan, registrasi AO belakangan, atau sebaliknya) — rekonsiliasi bersifat *self-healing* di setiap siklus import berikutnya, tidak perlu proses manual tambahan.

### 5.4 Tabel Baru: `ao_collection_log`

Struktur sengaja dibuat **mirip pola `desk_call`** untuk konsistensi kode, namun **tabel terpisah** — alasan pemisahan sudah dijelaskan di §1.2 & §1.3.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| debitur_id | FK → debitur | |
| nama_debitur | VARCHAR(150) | denormalized |
| ao_id | FK → users | **AO pemilik** — dasar otorisasi edit (§7.2) |
| tanggal | DATE | |
| waktu | TIME | |
| kol | VARCHAR(20) | snapshot KOL debitur saat dicatat |
| baki_debet | DECIMAL(18,2) | snapshot |
| jenis_aktivitas | ENUM | Telepon, WhatsApp, Kunjungan Langsung, Email — **lebih luas dari `desk_call.jenis_kontak`** karena AO juga bisa kunjungan lapangan langsung, bukan cuma kontak jarak jauh |
| status_tindak_lanjut | ENUM | **5 nilai** (lihat §6.4): Sudah Dihubungi, Janji Bayar pada Tanggal Tertentu, Perlu Kunjungan Lapangan, Menunggu Konfirmasi, Selesai Ditindaklanjuti |
| tanggal_janji | DATE | nullable, terisi jika status = Janji Bayar |
| catatan | TEXT | |
| created_at | DATETIME | |
| created_by | FK → users | biasanya = ao_id, tapi dicatat terpisah untuk jaga-jaga jika admin pernah mencatat atas nama AO |

### 5.5 Tabel Baru: `ao_reminder_email_log`

Mencegah email EWS terkirim berulang kali dalam satu siklus jatuh tempo yang sama (§7.4).

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID PK | |
| debitur_id | FK → debitur | |
| ao_id | FK → users | |
| periode | VARCHAR(7) | format `2026-07` — siklus bulan berjalan |
| sent_at | DATETIME | |

**Constraint unik**: kombinasi (`debitur_id`, `ao_id`, `periode`) harus unik — mencegah pencatatan/pengiriman dobel untuk siklus yang sama.


---

## 6. MODUL BARU: DASHBOARD EWS ACCOUNT OFFICER

**Akses**: `ao`, `kabid_ao`, `admin`

### 6.1 Ringkasan KPI (Header Halaman)

Stat card, dihitung dari portofolio yang relevan (AO: nasabah miliknya saja; Kabid AO/Admin: bisa toggle "Semua AO" atau pilih satu AO tertentu via filter):

| Kartu | Formula |
|---|---|
| Total Nasabah | `COUNT(debitur WHERE ao_id = konteks)` |
| Total Nasabah Lancar | `COUNT(... WHERE kol='Lancar')` |
| Total Nasabah Dalam Perhatian | `COUNT(... WHERE kol='DPK')` |
| Distribusi Kolektibilitas | Breakdown 5 KOL — **reuse komponen chart yang sama dengan Dashboard umum** (§7.2 PRD Master), sumber data difilter `ao_id` |
| Total Nominal Tunggakan | `SUM(total_tunggakan WHERE ao_id = konteks)` |
| Jumlah Nasabah per Status Risiko | `GROUP BY resiko` |

### 6.2 Logika Early Warning System

Status EWS dihitung **on-demand** per debitur (tidak disimpan sebagai kolom statis), berdasar posisi tanggal hari ini terhadap estimasi tanggal jatuh tempo angsuran bulan berjalan:

```
due_day = DAY(debitur.tgl_jt)   // ekstrak angka tanggal saja dari JTHTMP
due_date_bulan_ini = DATE(tahun_berjalan, bulan_berjalan, due_day)

JIKA due_day > jumlah_hari_di_bulan_berjalan:
    due_date_bulan_ini = hari_terakhir_bulan_berjalan   // kasus tepi: tanggal 31 di bulan Februari, dst

selisih_hari = due_date_bulan_ini - tanggal_hari_ini

status_ews =
    selisih_hari BETWEEN 1 AND 7        → "Reminder" (H-7 s.d. H-1)
    selisih_hari == 0                    → "Jatuh Tempo Hari Ini"
    selisih_hari < 0 DAN frh_pokok BETWEEN 1 AND 30   → "DPD 1 / Dalam Perhatian"
    selisih_hari < 0 DAN frh_pokok > 30  → "DPD 2+ / Bermasalah"
    selisih_hari > 7                     → tidak ada status EWS aktif (masih jauh dari jatuh tempo)
```

> Field `frh_pokok` (hari tunggakan pokok) sudah tersedia di skema `debitur` hasil Import CBS (PRD Master §6.3) — dipakai langsung untuk menentukan tingkat DPD, tidak perlu dihitung ulang dari nol.

### 6.3 Sistem Pengkodean Warna

| Warna | Kondisi |
|---|---|
| 🟢 Hijau | Lancar, tidak ada status EWS aktif |
| 🟡 Kuning | Status EWS = Reminder (H-7 s.d H-1) atau Jatuh Tempo Hari Ini |
| 🟠 Oranye | DPD 1 (1-30 hari tunggak) |
| 🔴 Merah | DPD 2+ (>30 hari tunggak) |

Konsisten dipakai di badge tabel, penanda kalender, dan indikator visual lain di seluruh modul ini.

### 6.4 Tabel Detail Nasabah Binaan

Kolom: Nama, No. Rekening, Jenis Produk (`jenis_margin`), Plafon, Outstanding (`baki_debet`), Tanggal Jatuh Tempo (estimasi bulan berjalan, hasil kalkulasi §6.2), Nominal Angsuran (`angs_principal + angs_margin`), DPD (`frh_pokok`), Status Kolektibilitas (KOL), **Status EWS** (hasil §6.2, dengan badge warna §6.3)

**Pencarian**: nama atau no. rekening
**Filter**: AO (untuk Kabid AO/Admin), Jenis Produk, KOL, rentang DPD, Status EWS
**Sorting**: tingkat risiko, nominal tunggakan, tanggal jatuh tempo

### 6.5 Modal Detail Nasabah — Section Collection Log

Modal detail nasabah untuk modul ini **reuse struktur modal Debitur** (§8.4 PRD Master) sepenuhnya — data diri, progress bar, riwayat baki debet, dst — **ditambah satu section baru** khusus muncul di konteks modul EWS:

**Section Collection Log**:
- Riwayat seluruh entri `ao_collection_log` untuk debitur ini, urut terbaru dulu
- Form tambah entri baru (hanya aktif/terbuka jika `debitur.ao_id` = user yang login; untuk Kabid AO/Admin ditampilkan **read-only**, tidak ada form input)
- Field form: Jenis Aktivitas, Status Tindak Lanjut, Tanggal Janji (kondisional), Catatan

**Tombol Reminder Cepat**: mirip tombol WA existing di modal Debitur (PRD Master §8.3), namun teks pesan **tersusun otomatis** dari template berisi nama nasabah, nominal tunggakan, tanggal jatuh tempo — AO tinggal review sebelum kirim, bukan mengetik dari nol.

### 6.6 Nilai Tambah — Belum Termasuk Cakupan Wajib Fase Ini

Dua fitur berikut dari daftar awal permintaan **sudah punya jalur implementasi jelas** namun statusnya **menyusul**, bukan prioritas gelombang pertama modul ini:

- **Leaderboard/ranking AO** — reuse pola persis Section C KPI "Kinerja Per Petugas" (§13.3 PRD Master), tinggal ganti sumber data dari `jadwal_penagihan` ke `ao_collection_log` + `debitur` grouped by `ao_id`. Didetailkan di §9.
- **Automated Reminder via WhatsApp API otomatis (tanpa klik manual)** — di luar cakupan fase ini; versi yang dibangun sekarang adalah **klik-untuk-kirim** (semi-otomatis, teks sudah tersusun tapi tetap perlu aksi AO), bukan pengiriman background sepenuhnya otomatis. Integrasi API WhatsApp Business (kemungkinan lewat Mekari Qontak yang sudah dipakai bank ini untuk kebutuhan lain) adalah pengembangan lanjutan terpisah.


---

## 7. BUSINESS RULES KHUSUS AO

### 7.1 Basis Penugasan Berbeda dari Desk Call/P3

Ditegaskan ulang dari §1.2: AO **tidak dibatasi KOL tertentu** — mengawasi dan menagih nasabah binaannya di **semua kategori KOL**, berbeda dari Desk Call (utamanya KOL 1-2) dan P3 (KOL 3-4-5). Tumpang tindih dengan tim lain pada nasabah yang sama **adalah perilaku yang disengaja dan diterima**, bukan kondisi yang perlu dicegah.

### 7.2 Otorisasi Edit Collection Log — Kepemilikan Ketat

```
BOLEH mencatat/mengubah ao_collection_log JIKA DAN HANYA JIKA:
  user.role == 'ao' DAN debitur.ao_id == user.id
ATAU
  user.role == 'admin'   // admin selalu punya akses penuh untuk koreksi darurat
```

`kabid_ao` **tidak termasuk** kondisi di atas — lihat §7.3.

### 7.3 Kabid AO — Murni Pengawasan, Bukan Eksekusi

Berdasar penggunaan kata "mengawasi" untuk mendeskripsikan cakupan kerja Kabid AO, role ini didesain sebagai **read-only** terhadap Collection Log seluruh AO — bisa melihat semua, tidak bisa mengedit satu pun. Jika kebutuhan sebenarnya berbeda (misal Kabid AO perlu mengoreksi entri saat AO berhalangan), ini perlu direvisi sebagai pengecualian eksplisit terpisah dari aturan §7.2 — **ditandai sebagai asumsi yang perlu dikonfirmasi**, sesuai catatan di §3.4.

### 7.4 Frekuensi Pengiriman Email Reminder

**Push notifikasi dalam aplikasi**: muncul setiap hari selama window aktif (H-7 hingga H-1, atau tepat hari-H) — konsisten dengan pola notifikasi Janji Bayar Desk Call yang sudah ada (§17.1 PRD Master).

**Email**: dikirim **hanya sekali per siklus jatuh tempo** (saat pertama kali memasuki window H-7), dicatat di `ao_reminder_email_log` untuk mencegah pengiriman dobel. Keputusan ini diambil untuk mencegah 7 email berturut-turut untuk nasabah yang sama terasa spam dan diabaikan penerima.

### 7.5 Kasus Tepi Tanggal Jatuh Tempo

Untuk debitur dengan `tgl_jt` jatuh di tanggal 29, 30, atau 31 — bulan yang tidak memiliki tanggal tersebut (Februari, atau bulan 30-hari untuk tanggal 31) menggunakan **hari terakhir bulan itu** sebagai pengganti (lihat formula §6.2). Ini estimasi yang secara sadar disederhanakan mengingat CBS tidak menyediakan kolom tanggal jatuh tempo angsuran bulanan yang eksplisit — didokumentasikan sebagai keterbatasan sumber data yang sudah diketahui sejak awal, bukan bug.

---

## 8. PERLUASAN SISTEM NOTIFIKASI

Menambah **2 jenis baru** ke 5 jenis yang sudah ada di §17.1 PRD Master:

| # | Jenis | Role penerima | Trigger | Kanal |
|---|---|---|---|---|
| 6 | Reminder EWS jatuh tempo | `ao` (nasabah miliknya), `kabid_ao` (agregat semua) | Debitur dengan `ao_id` terkait memasuki window H-7 s.d hari-H (§6.2) | Push notif (harian selama window) + Email (sekali per siklus, §7.4) |
| 7 | Daily/Weekly Digest AO | `ao` | Terjadwal (cron harian atau mingguan sesuai preferensi) | Email — ringkasan nasabah jatuh tempo hari ini, status EWS baru, tunggakan baru, jadwal tindak lanjut belum selesai |

Keduanya mengikuti **prinsip yang sama** dengan 5 jenis existing (§17.2 PRD Master): dihitung on-demand dari data yang sudah ada, tidak memerlukan tabel `notifications` terpisah — kecuali `ao_reminder_email_log` yang memang secara khusus dibutuhkan untuk deduplikasi pengiriman email (§5.5).

---

## 9. PERLUASAN MODUL KPI

Ditambahkan sebagai bagian dari modul KPI existing (§13 PRD Master) — **bukan** menu KPI terpisah untuk AO, melainkan section tambahan yang tampil ketika viewer punya akses (`ao`, `kabid_ao`, `admin`).

### 9.1 Indikator Kinerja AO

Reuse pola perhitungan yang sudah ada di §13.2 PRD Master, sumber data diganti dari `jadwal_penagihan`/`desk_call` ke `ao_collection_log` + `debitur` (grouped by `ao_id`):

| Indikator | Formula |
|---|---|
| NPF Ratio per AO | `SUM(baki_debet WHERE kol NPF AND ao_id=X) / SUM(baki_debet WHERE ao_id=X) * 100` |
| Recovery Rate per AO | Sama pola dengan §13.2 Grup 1, difilter `ao_id` |
| Tingkat Keberhasilan Penagihan | `% ao_collection_log dengan status_tindak_lanjut='Selesai Ditindaklanjuti'` |
| Persentase Nasabah Lancar | `COUNT(kol='Lancar' AND ao_id=X) / COUNT(total ao_id=X) * 100` |

### 9.2 Leaderboard AO

Reuse struktur tabel Section C "Kinerja Per Petugas" (§13.3 PRD Master) — ranking 🥇🥈🥉, kolom disesuaikan ke konteks AO (Total Nasabah, NPF Ratio, Recovery Rate, Tingkat Keberhasilan). Hanya tampil untuk `kabid_ao` dan `admin` (AO individu tidak melihat perbandingan dengan rekan lain — konsisten dengan pola serupa di §9.1.3 PRD Master untuk Customer Insight Desk Call).

---

## 10. RIWAYAT KEPUTUSAN ADDENDUM INI

- **Basis penugasan AO awalnya disalahpahami** sebagai berbasis KOL (seperti Desk Call/P3) — dikoreksi menjadi berbasis kepemilikan nasabah, lintas semua KOL
- **Sumber pilihan nama AO saat register**: awalnya diusulkan input bebas + rekonsiliasi manual, **direvisi** jadi dropdown dari data CBS langsung — menghilangkan risiko typo sejak dari sumbernya
- **Perhitungan reminder H-7**: awalnya diusulkan estimasi dari `tgl_angsuran_terakhir + 1 bulan`, **dikoreksi** oleh arahan langsung menjadi ekstraksi angka tanggal dari `JTHTMP` sebagai acuan berulang tiap bulan — pendekatan lebih sederhana dan tidak bergantung riwayat pembayaran
- **Frekuensi email reminder**: diputuskan sekali per siklus (bukan harian selama window) untuk mencegah kesan spam — keputusan sepihak tim teknis, ditandai untuk konfirmasi jika tidak sesuai ekspektasi
- **Kewenangan edit Kabid AO**: diasumsikan read-only murni (mengawasi, tidak eksekusi) — **masih berupa asumsi**, belum dikonfirmasi eksplisit, ditandai di §3.4 dan §7.3
- **Automated WhatsApp API sepenuhnya otomatis**: ditunda, bukan cakupan fase ini (§6.6) — versi awal cukup klik-untuk-kirim dengan teks tersusun otomatis

---

*Dokumen ini adalah perluasan dari `PRD_MASTER_BPRS_v3.md`. Pembaruan lebih lanjut dicatat dengan penambahan entri baru di §10, konsisten dengan prinsip dokumentasi hidup yang sama.*
