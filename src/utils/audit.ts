import { Context } from 'hono';
import { rawPrisma } from '../db.js';
import { logger } from './logger.js';

export async function logAudit(
  c: Context | null,
  action: string,
  tableName: string,
  recordId: string,
  oldValue: any | null = null,
  newValue: any | null = null,
  dbClient?: any
) {
  try {
    let userId = 'system';
    let ipAddress = '127.0.0.1';

    if (c) {
      const user = c.get('user' as any) as any;
      userId = user ? user.id : '3d3d7eac-41e1-49db-bb1c-5ca164188f11';
      ipAddress =
        c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
        c.req.header('x-real-ip') ||
        '127.0.0.1';
    } else {
      userId = '3d3d7eac-41e1-49db-bb1c-5ca164188f11';
    }

    const client = dbClient || rawPrisma;
    await client.auditLog.create({
      data: {
        userId,
        action,
        tableName,
        recordId,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        ipAddress
      }
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to write audit log');
  }
}

