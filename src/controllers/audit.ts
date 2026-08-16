import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

export const auditRouter = new Hono<{
  Variables: {
    user: any;
  };
}>();

// Enforce authentication & role guard: admin, kabid_p3, kabid_ao, legal
auditRouter.use('*', authMiddleware, roleMiddleware(['admin', 'kabid_p3', 'kabid_ao', 'legal']));

// Field label mappings for human-readable audit diffs
export const FIELD_LABELS: Record<string, string> = {
  bakiDebet: 'Baki Debet',
  kol: 'Kolektibilitas (KOL)',
  kolMurni: 'KOL Murni (CBS)',
  tPokok: 'Tunggakan Pokok',
  tMargin: 'Tunggakan Margin',
  totalTunggakan: 'Total Tunggakan',
  frhPokok: 'Hari Tunggakan Pokok (DPD)',
  frhMargin: 'Hari Tunggakan Margin',
  angsPrincipal: 'Angsuran Pokok',
  angsMargin: 'Angsuran Margin',
  plafon: 'Plafon Pembiayaan',
  statusDebitur: 'Status Debitur',
  telepon: 'Nomor Telepon',
  alamat: 'Alamat Debitur',
  ao: 'Account Officer (AO)',
  restruk: 'Frekuensi Restrukturisasi',
  nominal: 'Nominal Pembayaran',
  metode: 'Metode Pembayaran',
  nominalJanji: 'Nominal Janji Bayar',
  tanggalJanjiBayar: 'Tanggal Janji Bayar',
  statusKontak: 'Status Kontak',
  hasilKomunikasi: 'Hasil Komunikasi',
  tindakLanjut: 'Tindak Lanjut',
  durasiPanggilan: 'Durasi Panggilan',
  prioritas: 'Prioritas Penagihan',
  targetTagih: 'Target Tagih',
  nominalRealisasi: 'Nominal Realisasi',
  catatan: 'Catatan Petugas',
  hasil: 'Hasil Kunjungan',
  posisi: 'Posisi / Role Akses',
  status: 'Status',
  nama: 'Nama',
  email: 'Email',
  username: 'Username',
  checked: 'Status Kelengkapan Berkas',
  jenisSurat: 'Jenis Surat Legal',
  nomorSurat: 'Nomor Surat',
  hal: 'Perihal Surat',
  npfGross: 'Target NPF Gross (%)',
  collectionRate: 'Target Collection Rate (%)'
};

export interface DiffItem {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
  type: 'added' | 'removed' | 'modified';
}

/**
 * Computes deep differences between oldValue and newValue objects.
 */
export function computeAuditDiff(oldRaw: any, newRaw: any): DiffItem[] {
  let oldObj = typeof oldRaw === 'string' ? safeJsonParse(oldRaw) : oldRaw;
  let newObj = typeof newRaw === 'string' ? safeJsonParse(newRaw) : newRaw;

  const diffs: DiffItem[] = [];
  const ignoredKeys = new Set(['updatedAt', 'createdAt', 'passwordHash', 'tokenHash', 'id']);

  if (!oldObj && !newObj) return diffs;

  // Case 1: Created (oldObj is null/empty)
  if (!oldObj && newObj && typeof newObj === 'object') {
    for (const key of Object.keys(newObj)) {
      if (ignoredKeys.has(key)) continue;
      const val = newObj[key];
      if (val !== undefined && val !== null && val !== '') {
        diffs.push({
          field: key,
          label: FIELD_LABELS[key] || formatFieldKey(key),
          oldValue: null,
          newValue: val,
          type: 'added'
        });
      }
    }
    return diffs;
  }

  // Case 2: Deleted (newObj is null/empty)
  if (oldObj && (!newObj || Object.keys(newObj).length === 0)) {
    for (const key of Object.keys(oldObj)) {
      if (ignoredKeys.has(key)) continue;
      const val = oldObj[key];
      if (val !== undefined && val !== null && val !== '') {
        diffs.push({
          field: key,
          label: FIELD_LABELS[key] || formatFieldKey(key),
          oldValue: val,
          newValue: null,
          type: 'removed'
        });
      }
    }
    return diffs;
  }

  // Case 3: Updated/Modified
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

  for (const key of allKeys) {
    if (ignoredKeys.has(key)) continue;

    const oldVal = oldObj ? oldObj[key] : undefined;
    const newVal = newObj ? newObj[key] : undefined;

    // Normalizing comparisons
    const isOldEmpty = oldVal === undefined || oldVal === null || oldVal === '';
    const isNewEmpty = newVal === undefined || newVal === null || newVal === '';

    if (isOldEmpty && isNewEmpty) continue;

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      let type: 'added' | 'removed' | 'modified' = 'modified';
      if (isOldEmpty && !isNewEmpty) type = 'added';
      else if (!isOldEmpty && isNewEmpty) type = 'removed';

      diffs.push({
        field: key,
        label: FIELD_LABELS[key] || formatFieldKey(key),
        oldValue: oldVal ?? null,
        newValue: newVal ?? null,
        type
      });
    }
  }

  return diffs;
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function formatFieldKey(key: string): string {
  // Convert camelCase or snake_case to Title Case
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// GET /api/audit - List audit logs with pagination and filters
auditRouter.get('/', async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(c.req.query('limit') || '25', 10)));
    const tableName = c.req.query('tableName') || '';
    const action = c.req.query('action') || '';
    const search = c.req.query('search') || '';
    const userId = c.req.query('userId') || '';
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    const where: any = {};

    if (tableName && tableName !== 'all' && tableName !== 'Semua') {
      where.tableName = tableName;
    }

    if (action && action !== 'all' && action !== 'Semua') {
      if (['create', 'update', 'delete'].includes(action.toLowerCase())) {
        where.action = { contains: action.toLowerCase() };
      } else {
        where.action = action;
      }
    }

    if (userId && userId !== 'all' && userId !== 'Semua') {
      where.userId = userId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    if (search) {
      where.OR = [
        { recordId: { contains: search } },
        { action: { contains: search } },
        { tableName: { contains: search } },
        { ipAddress: { contains: search } },
        { user: { nama: { contains: search } } },
        { user: { username: { contains: search } } }
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              nama: true,
              username: true,
              posisi: true,
              avatarUrl: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    const formattedLogs = logs.map((log) => {
      const diff = computeAuditDiff(log.oldValue, log.newValue);
      return {
        id: log.id,
        action: log.action,
        tableName: log.tableName,
        recordId: log.recordId,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt,
        user: log.user || {
          id: log.userId,
          nama: log.userId === 'system' ? 'Sistem Otomatis' : 'User Tidak Diketahui',
          username: log.userId,
          posisi: 'system'
        },
        diffCount: diff.length,
        summaryDiff: diff.slice(0, 3)
      };
    });

    return c.json({
      logs: formattedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (err: any) {
    return c.json({ error: 'Gagal memuat log audit: ' + err.message }, 500);
  }
});

// GET /api/audit/summary - Summary statistics of audit trail
auditRouter.get('/summary', async (c) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalLogs, todayLogs, tableCounts, actionCounts] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
      prisma.auditLog.groupBy({
        by: ['tableName'],
        _count: { _all: true },
        orderBy: { _count: { tableName: 'desc' } },
        take: 8
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { _all: true },
        orderBy: { _count: { action: 'desc' } },
        take: 8
      })
    ]);

    return c.json({
      totalLogs,
      todayLogs,
      tableCounts: tableCounts.map((t) => ({ tableName: t.tableName, count: t._count._all })),
      actionCounts: actionCounts.map((a) => ({ action: a.action, count: a._count._all }))
    });
  } catch (err: any) {
    return c.json({ error: 'Gagal memuat ringkasan audit: ' + err.message }, 500);
  }
});

// GET /api/audit/:id - Full details with calculated visual diff
auditRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            nama: true,
            username: true,
            posisi: true,
            avatarUrl: true
          }
        }
      }
    });

    if (!log) {
      return c.json({ error: 'Log audit tidak ditemukan' }, 404);
    }

    const diff = computeAuditDiff(log.oldValue, log.newValue);

    return c.json({
      id: log.id,
      action: log.action,
      tableName: log.tableName,
      recordId: log.recordId,
      oldValue: safeJsonParse(log.oldValue || '{}'),
      newValue: safeJsonParse(log.newValue || '{}'),
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
      user: log.user || {
        id: log.userId,
        nama: log.userId === 'system' ? 'Sistem Otomatis' : 'User Tidak Diketahui',
        username: log.userId,
        posisi: 'system'
      },
      diff
    });
  } catch (err: any) {
    return c.json({ error: 'Gagal memuat detail log: ' + err.message }, 500);
  }
});

// GET /api/audit/record/:tableName/:recordId - History for a specific record (e.g. Debitur no_rekening)
auditRouter.get('/record/:tableName/:recordId', async (c) => {
  try {
    const tableName = c.req.param('tableName');
    const recordId = c.req.param('recordId');

    const logs = await prisma.auditLog.findMany({
      where: {
        tableName,
        recordId
      },
      include: {
        user: {
          select: {
            id: true,
            nama: true,
            username: true,
            posisi: true,
            avatarUrl: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const formatted = logs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      ipAddress: log.ipAddress,
      user: log.user || {
        nama: log.userId === 'system' ? 'Sistem Otomatis' : 'User',
        username: log.userId,
        posisi: 'system'
      },
      diff: computeAuditDiff(log.oldValue, log.newValue)
    }));

    return c.json({
      tableName,
      recordId,
      history: formatted
    });
  } catch (err: any) {
    return c.json({ error: 'Gagal memuat riwayat record: ' + err.message }, 500);
  }
});
