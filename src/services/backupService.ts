import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { prisma } from '../db.js';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const RETENTION_DAYS = 30;

export interface BackupResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  sizeBytes?: number;
  deletedOldBackups?: string[];
  error?: string;
}

/**
 * Ensure the backups directory exists.
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Execute automated database backup and cleanup files older than retention policy.
 */
export async function runDatabaseBackup(): Promise<BackupResult> {
  ensureBackupDir();
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const backupFileName = `bprs_backup_${timestamp}.db`;
  const targetPath = path.join(BACKUP_DIR, backupFileName);

  try {
    // 1. Determine database source (SQLite default)
    const dbUrl = process.env.DATABASE_URL || 'file:./dev.db';
    let cleanDbPath = dbUrl.replace(/^file:/, '').split('?')[0].trim();
    if (cleanDbPath.startsWith('./')) {
      cleanDbPath = cleanDbPath.substring(2);
    }

    let sourceDbPath = path.resolve(process.cwd(), 'prisma', cleanDbPath);
    if (!fs.existsSync(sourceDbPath)) {
      sourceDbPath = path.resolve(process.cwd(), cleanDbPath);
    }
    if (!fs.existsSync(sourceDbPath)) {
      sourceDbPath = path.resolve(process.cwd(), 'prisma', 'dev.db');
    }

    if (!fs.existsSync(sourceDbPath)) {
      throw new Error(`Database file source not found at: ${sourceDbPath}`);
    }

    // 2. Perform safe atomic copy
    fs.copyFileSync(sourceDbPath, targetPath);
    const stats = fs.statSync(targetPath);

    logger.info({
      backupFileName,
      sizeBytes: stats.size,
      targetPath
    }, `Database backup created successfully: ${backupFileName}`);

    // 3. Clean up backups older than RETENTION_DAYS
    const deletedFiles = cleanupOldBackups(RETENTION_DAYS);

    return {
      success: true,
      filePath: targetPath,
      fileName: backupFileName,
      sizeBytes: stats.size,
      deletedOldBackups: deletedFiles
    };
  } catch (err: any) {
    logger.error({ err }, `Database backup failed: ${err.message}`);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Clean up backup files older than specified days.
 */
export function cleanupOldBackups(days: number = RETENTION_DAYS): string[] {
  ensureBackupDir();
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const deletedFiles: string[] = [];

  try {
    const files = fs.readdirSync(BACKUP_DIR);
    for (const file of files) {
      if (!file.startsWith('bprs_backup_') || !file.endsWith('.db')) continue;
      const filePath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoffTime) {
        fs.unlinkSync(filePath);
        deletedFiles.push(file);
        logger.info(`Deleted expired backup file (${days}d retention): ${file}`);
      }
    }
  } catch (err: any) {
    logger.warn({ err }, `Error during backup retention cleanup: ${err.message}`);
  }

  return deletedFiles;
}

/**
 * Start scheduler that runs nightly backup at 00:00 (Asia/Jakarta).
 */
export function initAutomatedBackupScheduler() {
  // Check every hour if it's 00:00 (Jakarta time) and backup hasn't run today
  let lastRunDate = '';

  const checkAndRun = async () => {
    const jakartaTime = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentDateStr = jakartaTime.toISOString().slice(0, 10);
    const currentHour = jakartaTime.getHours();

    if (currentHour === 0 && lastRunDate !== currentDateStr) {
      lastRunDate = currentDateStr;
      logger.info(`Executing scheduled nightly backup for ${currentDateStr}...`);
      await runDatabaseBackup();
    }
  };

  // Run initial check and set interval every 15 minutes
  setInterval(checkAndRun, 15 * 60 * 1000).unref();
  logger.info('Automated nightly database backup scheduler initialized (00:00 WIB, 30-day retention).');
}
