import { describe, it, expect } from 'vitest';
import {
  RegisterSchema,
  VerifyOtpSchema,
  ResendOtpSchema,
  ConfirmRoleSchema
} from '../schemas/index.js';
import { sendOtpEmail } from '../services/emailService.js';

describe('Auth OTP & Role Confirmation Schemas & Services', () => {
  describe('RegisterSchema Validation', () => {
    it('should validate a valid registration payload', () => {
      const validPayload = {
        username: 'petugas_p3_baru',
        password: 'Password123!',
        nama: 'Ahmad Syafiq',
        email: 'ahmad.syafiq@bprs.co.id',
        tgl_lahir: '1995-04-12',
        posisi: 'staff_p3'
      };
      const result = RegisterSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const invalidEmailPayload = {
        username: 'petugas_p3_baru',
        password: 'Password123!',
        nama: 'Ahmad Syafiq',
        email: 'not-an-email',
        tgl_lahir: '1995-04-12',
        posisi: 'staff_p3'
      };
      const result = RegisterSchema.safeParse(invalidEmailPayload);
      expect(result.success).toBe(false);
    });

    it('should reject password with less than 8 characters', () => {
      const shortPwPayload = {
        username: 'petugas_p3_baru',
        password: 'short',
        nama: 'Ahmad Syafiq',
        email: 'ahmad@bprs.co.id',
        tgl_lahir: '1995-04-12',
        posisi: 'staff_p3'
      };
      const result = RegisterSchema.safeParse(shortPwPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('VerifyOtpSchema & ResendOtpSchema Validation', () => {
    it('should accept 6-digit numeric OTP code', () => {
      const validOtp = {
        email: 'ahmad@bprs.co.id',
        otpCode: '829401'
      };
      const result = VerifyOtpSchema.safeParse(validOtp);
      expect(result.success).toBe(true);
    });

    it('should reject OTP code that is not 6 characters long', () => {
      const invalidLength = {
        email: 'ahmad@bprs.co.id',
        otpCode: '123'
      };
      const result = VerifyOtpSchema.safeParse(invalidLength);
      expect(result.success).toBe(false);
    });

    it('should validate resend OTP payload', () => {
      const validResend = { email: 'petugas@bprs.co.id' };
      const result = ResendOtpSchema.safeParse(validResend);
      expect(result.success).toBe(true);
    });
  });

  describe('ConfirmRoleSchema Validation (Admin Role Governance)', () => {
    it('should allow admin to confirm user with valid role and AO mapping', () => {
      const validConfirmation = {
        posisi: 'ao',
        aoNameRef: '001 - FIRDAUS'
      };
      const result = ConfirmRoleSchema.safeParse(validConfirmation);
      expect(result.success).toBe(true);
    });

    it('should allow admin to change role to kabid_p3 without AO ref', () => {
      const validConfirmation = {
        posisi: 'kabid_p3',
        aoNameRef: null
      };
      const result = ConfirmRoleSchema.safeParse(validConfirmation);
      expect(result.success).toBe(true);
    });

    it('should reject invalid role enum', () => {
      const invalidRole = {
        posisi: 'super_hacker_role',
        aoNameRef: null
      };
      const result = ConfirmRoleSchema.safeParse(invalidRole);
      expect(result.success).toBe(false);
    });
  });

  describe('sendOtpEmail Service Execution', () => {
    it('should generate and attempt delivery via Resend or safe dev fallback without crashing', async () => {
      const result = await sendOtpEmail('test.petugas@bprs.co.id', '654321', 'Budi Santoso');
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(true);
    });
  });
});
