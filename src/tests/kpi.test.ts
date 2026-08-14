import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS, KOL_VALUES } from '../services/kpiService.js';

describe('KPI Scorecard & Perbankan Syariah Formula Tests', () => {

  describe('Default Target Constants', () => {
    it('should have standard banking RBB benchmark targets', () => {
      expect(DEFAULT_TARGETS.npfGross).toBe(7.0);
      expect(DEFAULT_TARGETS.collectionRate).toBe(70.0);
      expect(DEFAULT_TARGETS.recoveryRate).toBe(40.0);
      expect(DEFAULT_TARGETS.cureRate).toBe(20.0);
      expect(DEFAULT_TARGETS.ptpRate).toBe(40.0);
      expect(DEFAULT_TARGETS.promiseKept).toBe(60.0);
      expect(DEFAULT_TARGETS.ppapCoverage).toBe(100.0);
    });

    it('should correctly map KOL categories to ordinal rank values', () => {
      expect(KOL_VALUES['Lancar']).toBe(1);
      expect(KOL_VALUES['DPK']).toBe(2);
      expect(KOL_VALUES['Kurang Lancar']).toBe(3);
      expect(KOL_VALUES['Diragukan']).toBe(4);
      expect(KOL_VALUES['Macet']).toBe(5);
    });
  });

  describe('NPF Gross Calculation', () => {
    it('should compute NPF Gross percentage correctly', () => {
      const totalBakiDebet = 10_000_000_000; // 10 Miliar
      const npfBakiDebet = 450_000_000; // 450 Juta (KOL 3, 4, 5)
      
      const npfGross = (npfBakiDebet / totalBakiDebet) * 100;
      expect(npfGross).toBe(4.5); // 4.5% (Sehat / di bawah batas 5% OJK)
    });

    it('should return 0% when total baki debet is zero to prevent division by zero', () => {
      const totalBakiDebet = 0;
      const npfBakiDebet = 0;
      const npfGross = totalBakiDebet > 0 ? (npfBakiDebet / totalBakiDebet) * 100 : 0;
      expect(npfGross).toBe(0);
    });
  });

  describe('Recovery Rate Calculation', () => {
    it('should calculate recovery rate on non-performing financing', () => {
      const totalTunggakanNpf = 500_000_000;
      const totalPaidNpf = 200_000_000;
      
      const recoveryRate = Math.min((totalPaidNpf / totalTunggakanNpf) * 100, 100);
      expect(recoveryRate).toBe(40.0);
    });

    it('should cap recovery rate at 100% even if payments exceed outstanding arrears', () => {
      const totalTunggakanNpf = 100_000_000;
      const totalPaidNpf = 150_000_000;
      
      const recoveryRate = Math.min(totalTunggakanNpf > 0 ? (totalPaidNpf / totalTunggakanNpf) * 100 : 0, 100);
      expect(recoveryRate).toBe(100);
    });
  });

  describe('Collection Rate & PTP Success Calculation', () => {
    it('should compute P3 Field Collection Rate based on realization vs target', () => {
      const targetTagih = 250_000_000;
      const realisasiTagih = 187_500_000;
      
      const collectionRate = (realisasiTagih / targetTagih) * 100;
      expect(collectionRate).toBe(75.0);
    });

    it('should compute PTP Rate from connected calls', () => {
      const connectedCalls = 120;
      const ptpAgreedCalls = 48;
      
      const ptpRate = connectedCalls > 0 ? (ptpAgreedCalls / connectedCalls) * 100 : 0;
      expect(ptpRate).toBe(40.0);
    });
  });

  describe('Roll Rate & Cure Transition Logic', () => {
    it('should detect cure when KOL rank decreases', () => {
      const prevKol = 'Kurang Lancar'; // rank 3
      const currKol = 'DPK'; // rank 2
      
      const prevRank = KOL_VALUES[prevKol];
      const currRank = KOL_VALUES[currKol];
      const isCured = currRank < prevRank;
      
      expect(isCured).toBe(true);
    });

    it('should detect deterioration / roll-over when KOL rank increases', () => {
      const prevKol = 'DPK'; // rank 2
      const currKol = 'Kurang Lancar'; // rank 3 (Roll into NPF)
      
      const prevRank = KOL_VALUES[prevKol];
      const currRank = KOL_VALUES[currKol];
      const isDeteriorated = currRank > prevRank;
      
      expect(isDeteriorated).toBe(true);
    });
  });
});
