import { Context } from 'hono';
import { prisma } from '../db.js';

export async function logAudit(
  c: Context,
  action: string,
  tableName: string,
  recordId: string,
  oldValue: any | null = null,
  newValue: any | null = null
) {
  try {
    const user = c.get('user' as any) as any;
    const userId = user ? user.id : 'system';
    
    // Get client IP address
    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0].trim() || 
                      c.req.header('x-real-ip') || 
                      '127.0.0.1';

    await prisma.auditLog.create({
      data: {
        userId: userId,
        action,
        tableName,
        recordId,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        ipAddress
      }
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
