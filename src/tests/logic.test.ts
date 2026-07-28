import { describe, it, expect } from 'vitest';

// 1. Delimiter detection logic
function detectDelimiter(headerRow: string): string {
  const commaCount = (headerRow.match(/,/g) || []).length;
  const semicolonCount = (headerRow.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

// 2. Indonesian date parsing logic
function parseIndonesianDate(str: string): Date | null {
  if (!str) return null;
  let cleanStr = str.replace(/Sampai Tanggal/gi, '').trim();
  const parts = cleanStr.split(/\s+/);
  if (parts.length < 3) return null;

  const day = parseInt(parts[0], 10);
  const monthName = parts[1].toLowerCase();
  const year = parseInt(parts[2], 10);

  const months: { [key: string]: number } = {
    januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
    juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11
  };

  const month = months[monthName];
  if (month === undefined || isNaN(day) || isNaN(year)) return null;

  const d = new Date(year, month, day);
  if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return null;

  return d;
}

// 3. NIK scientific notation validation logic
function isValidNIK(nik: string): boolean {
  if (!nik) return false;
  const clean = String(nik).trim();
  if (clean.toUpperCase().includes('E+') || clean.toUpperCase().includes('E-')) {
    return false; // Scientific notation corrupt data is invalid
  }
  return clean.length === 16;
}

// 4. Legal status calculation logic
function calculateLegalStatus(checkedCount: number, totalCount: number): string {
  if (totalCount === 0) return 'Kurang';
  const percentage = (checkedCount / totalCount) * 100;
  if (percentage === 100) return 'Lengkap';
  if (percentage >= 50) return 'Proses';
  return 'Kurang';
}

describe('BPRS Dashboard Logic Verification Tests', () => {
  
  describe('Delimiter Autodetect', () => {
    it('should detect semicolon as delimiter if there are more semicolons', () => {
      const headerRow = 'RekeningBaru;Nama;NoIdentitas;TglLahir;Alamat;Telepon';
      expect(detectDelimiter(headerRow)).toBe(';');
    });

    it('should detect comma as delimiter if there are more commas', () => {
      const headerRow = 'RekeningBaru,Nama,NoIdentitas,TglLahir,Alamat,Telepon';
      expect(detectDelimiter(headerRow)).toBe(',');
    });
  });

  describe('Indonesian Date Parser', () => {
    it('should correctly parse Indonesian cutoff date from string', () => {
      const str = 'Sampai Tanggal 18 Juli 2026';
      const parsed = parseIndonesianDate(str);
      expect(parsed).not.toBeNull();
      expect(parsed?.getDate()).toBe(18);
      expect(parsed?.getMonth()).toBe(6); // July is 6 in JS Date (0-indexed)
      expect(parsed?.getFullYear()).toBe(2026);
    });

    it('should return null for invalid date string formats', () => {
      expect(parseIndonesianDate('Tanggal tidak valid')).toBeNull();
      expect(parseIndonesianDate('Sampai Tanggal 40 Desember 2026')).toBeNull();
    });
  });

  describe('NIK Scientific Notation Validator', () => {
    it('should reject NIK written in scientific notation format', () => {
      const corruptNik = '3.37403E+15';
      expect(isValidNIK(corruptNik)).toBe(false);
    });

    it('should accept valid 16-digit numeric NIK', () => {
      const validNik = '3374031206960002';
      expect(isValidNIK(validNik)).toBe(true);
    });
  });

  describe('Legal Berkas Status Calculator', () => {
    it('should calculate Lengkap if all items are checked (100%)', () => {
      expect(calculateLegalStatus(14, 14)).toBe('Lengkap');
    });

    it('should calculate Proses if checklist percentage is between 50% and 99%', () => {
      expect(calculateLegalStatus(7, 14)).toBe('Proses');
      expect(calculateLegalStatus(10, 14)).toBe('Proses');
    });

    it('should calculate Kurang if checklist percentage is less than 50%', () => {
      expect(calculateLegalStatus(6, 14)).toBe('Kurang');
      expect(calculateLegalStatus(0, 14)).toBe('Kurang');
    });
  });
});
