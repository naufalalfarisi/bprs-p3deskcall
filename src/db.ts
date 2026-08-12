import { PrismaClient } from '@prisma/client';
import { getRequestContext } from './utils/context.js';
import { logger } from './utils/logger.js';

export const rawPrisma = new PrismaClient();

// Models monitored for automatic audit logging on mutations
const AUTO_AUDIT_MODELS = new Set(['Debitur', 'Pembayaran', 'DeskCallHistory', 'P3Jadwal']);
const WRITE_OPERATIONS = new Set(['create', 'update', 'delete', 'upsert']);

export const prisma = rawPrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);

        if (model && AUTO_AUDIT_MODELS.has(model) && WRITE_OPERATIONS.has(operation)) {
          try {
            const ctx = getRequestContext();
            const userId = ctx.userId || 'system';
            const ipAddress = ctx.ipAddress || '127.0.0.1';

            let recordId = 'unknown';
            if (result && typeof result === 'object' && result !== null && 'id' in result) {
              recordId = String((result as any).id);
            } else if (args && (args as any).where && 'id' in (args as any).where) {
              recordId = String((args as any).where.id);
            }

            // Async background creation using rawPrisma (prevents extension recursion)
            rawPrisma.auditLog.create({
              data: {
                userId,
                action: `auto_${operation}`,
                tableName: model,
                recordId,
                newValue: result ? JSON.stringify(result) : null,
                ipAddress
              }
            }).catch((err) => {
              logger.error({ err, model, operation }, 'Failed to record auto audit log');
            });
          } catch (err) {
            logger.error({ err, model, operation }, 'Error in auto audit log extension');
          }
        }

        return result;
      }
    }
  }
});
