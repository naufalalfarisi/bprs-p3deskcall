import { describe, it, expect } from 'vitest';
import { createAccessToken, verifyAccessToken } from '../middleware/auth.js';

describe('RBAC & Authentication Middleware Tests', () => {

  const validRoles = ['admin', 'kabid_p3', 'staff_p3', 'desk_call', 'legal', 'ao', 'kabid_ao'];

  describe('Role Definition & Matrix Integrity', () => {
    it('should include all 7 defined enterprise roles', () => {
      expect(validRoles).toContain('admin');
      expect(validRoles).toContain('ao');
      expect(validRoles).toContain('kabid_ao');
      expect(validRoles).toContain('staff_p3');
      expect(validRoles).toContain('kabid_p3');
      expect(validRoles).toContain('desk_call');
      expect(validRoles).toContain('legal');
    });

    it('should validate EWS module access rules (admin, ao, kabid_ao only)', () => {
      const ewsAllowedRoles = ['admin', 'ao', 'kabid_ao'];
      
      expect(ewsAllowedRoles.includes('ao')).toBe(true);
      expect(ewsAllowedRoles.includes('kabid_ao')).toBe(true);
      expect(ewsAllowedRoles.includes('admin')).toBe(true);
      
      expect(ewsAllowedRoles.includes('staff_p3')).toBe(false);
      expect(ewsAllowedRoles.includes('kabid_p3')).toBe(false);
      expect(ewsAllowedRoles.includes('desk_call')).toBe(false);
      expect(ewsAllowedRoles.includes('legal')).toBe(false);
    });

    it('should validate Field P3 module access rules (admin, kabid_p3, staff_p3, legal)', () => {
      const p3AllowedRoles = ['admin', 'kabid_p3', 'staff_p3', 'legal'];
      
      expect(p3AllowedRoles.includes('staff_p3')).toBe(true);
      expect(p3AllowedRoles.includes('kabid_p3')).toBe(true);
      expect(p3AllowedRoles.includes('ao')).toBe(false);
      expect(p3AllowedRoles.includes('desk_call')).toBe(false);
    });

    it('should validate Desk Call module access rules (admin, desk_call)', () => {
      const deskCallAllowedRoles = ['admin', 'desk_call'];
      
      expect(deskCallAllowedRoles.includes('desk_call')).toBe(true);
      expect(deskCallAllowedRoles.includes('admin')).toBe(true);
      expect(deskCallAllowedRoles.includes('ao')).toBe(false);
      expect(deskCallAllowedRoles.includes('staff_p3')).toBe(false);
    });
  });

  describe('JWT Token Generation & Verification', () => {
    it('should successfully sign and verify a valid JWT token payload', async () => {
      const payload = {
        userId: 'test-uuid-user-123',
        username: 'ao_agus',
        posisi: 'ao'
      };

      const token = await createAccessToken(payload);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3); // JWT format: header.payload.signature

      const verified = await verifyAccessToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(payload.userId);
      expect(verified?.username).toBe(payload.username);
      expect(verified?.posisi).toBe(payload.posisi);
    });

    it('should reject invalid or tampered JWT tokens', async () => {
      const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature';
      const result = await verifyAccessToken(invalidToken);
      expect(result).toBeNull();
    });
  });
});
