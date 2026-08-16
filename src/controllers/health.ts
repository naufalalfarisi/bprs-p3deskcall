import { Hono } from 'hono';
import { prisma } from '../db.js';
import { taskQueue } from '../services/taskQueue.js';
import fs from 'fs';
import path from 'path';

export const healthRouter = new Hono();

// Helper to format uptime into human-readable duration
function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

// GET /api/health - Comprehensive system health and diagnostics
healthRouter.get('/', async (c) => {
  const startTime = Date.now();
  let dbStatus = 'connected';
  let dbLatencyMs = 0;
  let dbError: string | undefined;

  // 1. Database Ping & Latency check
  try {
    const dbPingStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbPingStart;
  } catch (err: any) {
    dbStatus = 'error';
    dbError = err.message;
  }

  // 2. Memory usage stats (in MB)
  const mem = process.memoryUsage();
  const memoryStats = {
    rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
    heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100
  };

  // 3. Background Task Queue status
  const recentTasks = taskQueue.listTasks();
  const processingTasks = recentTasks.filter(t => t.status === 'processing' || t.status === 'queued');

  // 4. Last Backup Info
  const backupDir = path.resolve(process.cwd(), 'backups');
  let lastBackupInfo: { fileName: string; sizeBytes: number; createdAt: Date } | null = null;
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('bprs_backup_') && f.endsWith('.db'));
    if (files.length > 0) {
      files.sort((a, b) => {
        const statA = fs.statSync(path.join(backupDir, a));
        const statB = fs.statSync(path.join(backupDir, b));
        return statB.mtimeMs - statA.mtimeMs;
      });
      const latestFile = files[0];
      const stat = fs.statSync(path.join(backupDir, latestFile));
      lastBackupInfo = {
        fileName: latestFile,
        sizeBytes: stat.size,
        createdAt: new Date(stat.mtimeMs)
      };
    }
  }

  const isHealthy = dbStatus === 'connected';
  const statusCode = isHealthy ? 200 : 503;

  return c.json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'BPRS Mitra Harmoni Sistem Informasi Penagihan Terpadu API',
    version: '3.2.0',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime())
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      error: dbError
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: memoryStats
    },
    taskQueue: {
      activeWorkers: processingTasks.length,
      recentJobs: recentTasks.length
    },
    backup: {
      lastBackup: lastBackupInfo
    },
    responseTimeMs: Date.now() - startTime
  }, statusCode);
});
