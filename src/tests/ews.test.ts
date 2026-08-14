import { describe, it, expect } from 'vitest';
import { computeEwsStatus, getEwsKolsForRole } from '../services/ewsService.js';

describe('Early Warning System (EWS) Scoring & Role Filter Tests', () => {

  describe('EWS Status Categorization Logic', () => {
    it('should categorize future due date (>1 day) as Lancar/Normal GREEN', () => {
      const today = new Date();
      // Set due date 10 days in the future
      const futureDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
      
      const status = computeEwsStatus(futureDate, 0);
      expect(status.category).toBe('LOW');
      expect(status.code).toBe('GREEN');
      expect(status.badgeClass).toBe('badge-green');
    });

    it('should categorize DPD 1-7 days as HIGH / ORANGE', () => {
      const today = new Date();
      // Past due date
      const pastDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3);
      
      const status = computeEwsStatus(pastDate, 3);
      expect(status.category).toBe('HIGH');
      expect(status.code).toBe('ORANGE');
      expect(status.badgeClass).toBe('badge-orange');
    });

    it('should categorize DPD 8-14 days as VERY_HIGH / PURPLE', () => {
      const today = new Date();
      const pastDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
      
      const status = computeEwsStatus(pastDate, 10);
      expect(status.category).toBe('VERY_HIGH');
      expect(status.code).toBe('PURPLE');
      expect(status.badgeClass).toBe('badge-purple');
    });

    it('should categorize DPD > 14 days as CRITICAL / RED', () => {
      const today = new Date();
      // Set due date to 1st of current month, with frhPokok = 20 days
      const dueDay1 = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const status = computeEwsStatus(dueDay1, 20);
      expect(status.category).toBe('CRITICAL');
      expect(status.code).toBe('RED');
      expect(status.badgeClass).toBe('badge-red');
    });
  });

  describe('Role-based KOL Scope Filtering', () => {
    it('should return KOL 1-3 for AO and Kabid AO', () => {
      const aoKols = getEwsKolsForRole('ao');
      const kabidAoKols = getEwsKolsForRole('kabid_ao');
      
      expect(aoKols).toContain('Lancar');
      expect(aoKols).toContain('DPK');
      expect(aoKols).toContain('Kurang Lancar');
      expect(aoKols).not.toContain('Diragukan');
      expect(aoKols).not.toContain('Macet');
      
      expect(kabidAoKols).toEqual(aoKols);
    });

    it('should return KOL 3-5 for P3 Field Officers', () => {
      const p3Kols = getEwsKolsForRole('staff_p3');
      expect(p3Kols).toContain('Kurang Lancar');
      expect(p3Kols).toContain('Diragukan');
      expect(p3Kols).toContain('Macet');
      expect(p3Kols).not.toContain('Lancar');
    });

    it('should return null (unrestricted) for Admin', () => {
      const adminKols = getEwsKolsForRole('admin');
      expect(adminKols).toBeNull();
    });
  });
});
