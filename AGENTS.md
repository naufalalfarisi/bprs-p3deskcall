# PEDOMAN PENGEMBANGAN & ATURAN SISTEM (SISTEM INFORMASI PENAGIHAN TERPADU BPRS MITRA HARMONI)

Dokumen ini adalah pedoman arsitektur, batasan teknis (*boundaries*), dan aturan bisnis untuk pengembang dan AI Coding Assistant guna meminimalisir regresi (*zero regression*) dan mempercepat debugging.

---

## 1. 🏛️ Arsitektur & Teknologi Utama
- **Backend**: Node.js + Hono Framework + TypeScript + Prisma ORM (SQLite / MySQL)
- **Frontend**: Vanilla ES6 JS Modules (`public/js/modules/`) + Tailwind & Custom Modern CSS
- **Validasi Skema**: Zod v4 (`src/schemas/`) untuk seluruh *request body* & *parameters*
- **Background Tasks**: `src/services/taskQueue.ts` + `/api/tasks`
- **Testing**: Vitest (`src/tests/`)

---

## 2. 🛡️ Aturan Emas Pengembangan (AI Safety Rules)

### A. Validasi Skema (Zod First)
1. Setiap pembuatan/perubahan endpoint POST, PUT, PATCH **WAJIB** menggunakan validasi skema Zod dari `src/schemas/`.
2. Jangan pernah langsung mengekstrak `await c.req.json()` tanpa melewatkannya ke `schema.safeParse()`.

### B. Aturan Bisnis NPF & Perbankan Syariah
1. **Klasifikasi Kolektibilitas (KOL)**:
   - `KOL 1 (Lancar)` & `KOL 2 (DPK)` = **Non-NPF / Performing Loans**.
   - `KOL 3 (Kurang Lancar)`, `KOL 4 (Diragukan)`, `KOL 5 (Macet)` = **NPF (Non-Performing Financing)**.
2. **Early Warning System (EWS)**:
   - DPD > 14 hari = `CRITICAL`
   - DPD 8–14 hari = `VERY_HIGH`
   - DPD 1–7 hari = `HIGH`
   - H-1 s/d Hari-H = `MEDIUM` (Reminder)
   - Belum Jatuh Tempo = `LOW` (Normal)
3. **P3 & Desk Call**:
   - Follow-up janji bayar **tidak boleh** menimpa tanggal/waktu riwayat panggilan asli.
   - Status kunjungan P3: `terjadwal`, `selesai`, `batal`, `reschedule`.

### C. Frontend & UI Guidelines (Anti-Slop)
1. **Dilarang keras menggunakan emoji dekoratif** di tombol, header, atau tabel. Gunakan ikon vektor SVG outline atau badge CSS resmi.
2. Setiap akses DOM (`document.getElementById`) **wajib di-guard** untuk mencegah *crash* saat navigasi tab SPA.

---

## 3. ⚡ Perintah Validasi Cepat (Quick Check Command)
Sebelum menyelesaikan setiap task atau perbaikan bug, jalankan:
```bash
npm run check
```
Perintah ini otomatis mengecek kompilasi TypeScript (`tsc --noEmit`) dan menjalankan seluruh unit test Vitest (`vitest run`).
Semua test **harus 100% passed** sebelum perubahan dianggap selesai.
