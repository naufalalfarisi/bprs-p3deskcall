import { describe, it, expect } from 'vitest';
import { runDatabaseBackup, cleanupOldBackups } from '../services/backupService.js';
import app from '../index.js';

describe('System Health & Automated Backup Tests', () => {

  describe('Database Backup Service', () => {
    it('should create an atomic database backup file in backups directory', async () => {
      const result = await runDatabaseBackup();
      expect(result.success).toBe(true);
      expect(result.fileName).toBeDefined();
      expect(result.fileName?.startsWith('bprs_backup_')).toBe(true);
      expect(result.fileName?.endsWith('.db')).toBe(true);
      expect(result.sizeBytes).toBeGreaterThan(0);
    });

    it('should execute retention cleanup without throwing errors', () => {
      const deleted = cleanupOldBackups(30);
      expect(Array.isArray(deleted)).toBe(true);
    });
  });

  describe('Health Check API Endpoint (/api/health)', () => {
    it('should return 200 OK with healthy status and system diagnostics', async () => {
      const res = await app.request('/api/health');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('healthy');
      expect(json.service).toBe('BPRS Mitra Harmoni Sistem Informasi Penagihan Terpadu API');
      expect(json.database.status).toBe('connected');
      expect(typeof json.database.latencyMs).toBe('number');
      expect(json.system.memory.heapUsedMb).toBeGreaterThan(0);
      expect(json.uptime.formatted).toBeDefined();
    });
  });
});
