import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';

export const auditRouter = new Hono<{
  Variables: {
    user: any;
  };
}>();

// Enforce authentication for all audit endpoints
auditRouter.use('*', authMiddleware);

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
  frPokok: 'Frekuensi Tunggakan Pokok',
  frMargin: 'Frekuensi Tunggakan Margin',
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
  nama: 'Nama Debitur',
  email: 'Email',
  username: 'Username',
  checked: 'Status Kelengkapan Berkas',
  jenisSurat: 'Jenis Surat Legal',
  nomorSurat: 'Nomor Surat',
  hal: 'Perihal Surat',
  npfGross: 'Target NPF Gross (%)',
  collectionRate: 'Target Collection Rate (%)',
  tanggalSnapshot: 'Tanggal Snapshot CBS'
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
  const ignoredKeys = new Set([
    'updatedAt',
    'createdAt',
    'passwordHash',
    'tokenHash',
    'id',
    'printCount',
    'lastPrintedAt',
    'masked',
    'unmaskedByUserId',
    'accessedFields',
    'unmaskedAt'
  ]);

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
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// GET /api/audit - List audit logs with pagination and filters (Restricted to Management & SKAI)
auditRouter.get('/', roleMiddleware(['admin', 'kabid_p3', 'kabid_ao', 'legal', 'skai']), async (c) => {
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

// GET /api/audit/summary - Summary statistics of audit trail (Restricted)
auditRouter.get('/summary', roleMiddleware(['admin', 'kabid_p3', 'kabid_ao', 'legal', 'skai']), async (c) => {
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

// Helper to determine event classification & badges for debitur audit timeline
function classifyDebiturAuditEvent(action: string, diff: DiffItem[], rawNewVal: any) {
  const act = action.toUpperCase();

  if (act.includes('KOL1_TO_KOL2') || act.includes('KOL_SHIFT') || (act.includes('RED_ALERT') && act.includes('KOL2'))) {
    return {
      category: 'kol_shift',
      badgeClass: 'badge-amber',
      badgeLabel: 'Pergeseran KOL 1 → KOL 2 (DPK)',
      icon: 'alert-triangle'
    };
  }

  if (act.includes('KOL_DEGRADATION') || act.includes('DEGRADASI')) {
    return {
      category: 'kol_degradation',
      badgeClass: 'badge-red',
      badgeLabel: 'Degradasi ke NPF (Macet / Kurang Lancar)',
      icon: 'alert-octagon'
    };
  }

  if (act.includes('KOL_CURING') || act.includes('CURING') || act.includes('IMPROVEMENT')) {
    return {
      category: 'kol_curing',
      badgeClass: 'badge-teal',
      badgeLabel: 'Penyelesaian / Perbaikan Kolektibilitas (Curing)',
      icon: 'check-circle'
    };
  }

  if (act.includes('RESTRUK')) {
    return {
      category: 'restruk',
      badgeClass: 'badge-purple',
      badgeLabel: 'Restrukturisasi Pembiayaan Baru',
      icon: 'file-text'
    };
  }

  if (act.includes('LUNAS') || diff.some(d => d.field === 'statusDebitur' && d.newValue === 'Lunas')) {
    return {
      category: 'lunas',
      badgeClass: 'badge-teal',
      badgeLabel: 'Pelunasan Pembiayaan (Lunas CBS)',
      icon: 'check-check'
    };
  }

  if (act.includes('PAYMENT') || act.includes('PEMBAYARAN')) {
    return {
      category: 'payment',
      badgeClass: 'badge-teal',
      badgeLabel: 'Pembayaran Angsuran',
      icon: 'banknote'
    };
  }

  if (act.includes('DESK_CALL') || act.includes('DESKCALL')) {
    return {
      category: 'deskcall',
      badgeClass: 'badge-blue',
      badgeLabel: 'Aktivitas Desk Call',
      icon: 'phone-call'
    };
  }

  if (act.includes('P3') || act.includes('PENAGIHAN')) {
    return {
      category: 'p3',
      badgeClass: 'badge-amber',
      badgeLabel: 'Kunjungan Lapangan P3',
      icon: 'map-pin'
    };
  }

  if (act.includes('LEGAL') || act.includes('SURAT')) {
    return {
      category: 'legal',
      badgeClass: 'badge-red',
      badgeLabel: 'Dokumen / Tindakan Legal',
      icon: 'file-warning'
    };
  }

  if (diff.some(d => d.field === 'kol')) {
    return {
      category: 'kol_change',
      badgeClass: 'badge-blue',
      badgeLabel: 'Perubahan Kolektibilitas (KOL)',
      icon: 'refresh-cw'
    };
  }

  return {
    category: 'general',
    badgeClass: 'badge-gray',
    badgeLabel: formatFieldKey(action),
    icon: 'activity'
  };
}

// GET /api/audit/record/:tableName/:recordId - History for a specific record (Accessible by all authenticated users: AO, P3, Legal, Kabid, Admin)
auditRouter.get('/record/:tableName/:recordId', async (c) => {
  try {
    const rawTableName = c.req.param('tableName') || '';
    const recordId = c.req.param('recordId');

    const tableNames = [
      rawTableName,
      rawTableName.toLowerCase(),
      rawTableName.toUpperCase(),
      rawTableName.charAt(0).toUpperCase() + rawTableName.slice(1).toLowerCase()
    ];

    // Exclude print surat peringatan and unmask PDP logs as requested
    const ignoredActions = [
      'PRINT_SURAT_PERINGATAN',
      'PRINT_SP',
      'print_sp',
      'PRINT_SURAT',
      'print_surat_peringatan',
      'cetak_sp',
      'CETAK_SP',
      'print_surat',
      'UNMASK_DEBITUR_PDP',
      'unmask_debitur_pdp',
      'UNMASK_PDP',
      'unmask_pdp',
      'unmask_debitur',
      'UNMASK_DEBITUR'
    ];

    const logs = await prisma.auditLog.findMany({
      where: {
        tableName: { in: tableNames },
        recordId,
        action: {
          notIn: ignoredActions
        }
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
      take: 100
    });

    // Filter out any lingering print SP or unmask PDP logs
    const filteredLogs = logs.filter(l => {
      const act = l.action.toLowerCase();
      return !act.includes('print_surat') && !act.includes('print_sp') && !act.includes('cetak_sp') && !act.includes('unmask') && !act.includes('pdp');
    });

    // Debitur-specific enrichment: Include snapshot history if querying debitur
    let debiturInfo: any = null;
    let snapshotHistory: any[] = [];

    if (rawTableName.toLowerCase() === 'debitur') {
      const [debitur, kolHistories] = await Promise.all([
        prisma.debitur.findUnique({
          where: { id: recordId },
          select: {
            id: true,
            nama: true,
            cif: true,
            kol: true,
            statusDebitur: true,
            bakiDebet: true,
            plafon: true,
            restruk: true,
            ao: true,
            lastSyncedAt: true
          }
        }),
        prisma.debiturKolHistory.findMany({
          where: { debiturId: recordId },
          orderBy: { tanggalSnapshot: 'desc' }
        })
      ]);

      debiturInfo = debitur;
      snapshotHistory = kolHistories;
    }    // Combine audit logs and snapshot history into chronological candidates
    const candidateEvents: any[] = [];

    for (const log of filteredLogs) {
      const parsedOld = safeJsonParse(log.oldValue || '{}');
      const parsedNew = safeJsonParse(log.newValue || '{}');
      let diff = computeAuditDiff(log.oldValue, log.newValue);
      const classification = classifyDebiturAuditEvent(log.action, diff, parsedNew);

      // If initial full auto-upsert with many fields, show only key financial & status fields
      if ((log.action === 'auto_upsert' || log.action === 'DEBITUR_BARU_CBS') && diff.length > 8) {
        const keyFields = new Set(['kol', 'bakiDebet', 'plafon', 'statusDebitur', 'restruk', 'totalTunggakan', 'tPokok', 'angsPrincipal', 'ao', 'tglJt', 'jenisMargin']);
        diff = diff.filter(d => keyFields.has(d.field));
      }

      candidateEvents.push({
        id: log.id,
        action: log.action,
        category: classification.category,
        badgeClass: classification.badgeClass,
        badgeLabel: classification.badgeLabel,
        icon: classification.icon,
        createdAt: log.createdAt,
        snapshotDate: parsedNew?.tanggalSnapshot || parsedOld?.tanggalSnapshot || null,
        ipAddress: log.ipAddress,
        user: log.user || {
          id: log.userId || 'system',
          nama: log.userId === 'system' ? 'Sistem Otomatis (CBS)' : 'Petugas',
          username: log.userId,
          posisi: 'system',
          avatarUrl: null
        },
        parsedOld,
        parsedNew,
        diff
      });
    }

    // Add snapshot transition events from debiturKolHistory if any exist
    if (snapshotHistory.length > 1) {
      for (let i = 0; i < snapshotHistory.length - 1; i++) {
        const currentSnap = snapshotHistory[i];
        const prevSnap = snapshotHistory[i + 1];

        if (currentSnap.kol !== prevSnap.kol || currentSnap.bakiDebet !== prevSnap.bakiDebet) {
          const snapTime = new Date(currentSnap.tanggalSnapshot).getTime();
          const alreadyLogged = candidateEvents.some(h => {
            if (!h.snapshotDate) return false;
            return Math.abs(new Date(h.snapshotDate).getTime() - snapTime) < 86400000;
          });

          if (!alreadyLogged) {
            const isKolChanged = currentSnap.kol !== prevSnap.kol;
            const diffs: DiffItem[] = [];

            if (isKolChanged) {
              diffs.push({
                field: 'kol',
                label: 'Kolektibilitas (KOL)',
                oldValue: prevSnap.kol,
                newValue: currentSnap.kol,
                type: 'modified'
              });
            }

            if (currentSnap.bakiDebet !== prevSnap.bakiDebet) {
              diffs.push({
                field: 'bakiDebet',
                label: 'Baki Debet',
                oldValue: prevSnap.bakiDebet,
                newValue: currentSnap.bakiDebet,
                type: 'modified'
              });
            }

            let badgeLabel = 'Perubahan Snapshot Bulanan CBS';
            let badgeClass = 'badge-blue';
            let category = 'kol_change';

            if (isKolChanged) {
              if (prevSnap.kol === 'Lancar' && currentSnap.kol === 'DPK') {
                badgeLabel = 'Pergeseran KOL 1 → KOL 2 (DPK)';
                badgeClass = 'badge-amber';
                category = 'kol_shift';
              } else if (['Kurang Lancar', 'Diragukan', 'Macet'].includes(currentSnap.kol) && ['Lancar', 'DPK'].includes(prevSnap.kol)) {
                badgeLabel = 'Degradasi ke NPF (Non-Performing)';
                badgeClass = 'badge-red';
                category = 'kol_degradation';
              } else if (['Lancar', 'DPK'].includes(currentSnap.kol) && ['Kurang Lancar', 'Diragukan', 'Macet'].includes(prevSnap.kol)) {
                badgeLabel = 'Perbaikan / Curing Kolektibilitas';
                badgeClass = 'badge-teal';
                category = 'kol_curing';
              }
            }

            candidateEvents.push({
              id: `snap-${currentSnap.id}`,
              action: 'SNAPSHOT_CBS_MONTHLY_CHANGE',
              category,
              badgeClass,
              badgeLabel,
              icon: 'calendar-check',
              createdAt: currentSnap.tanggalSnapshot,
              snapshotDate: currentSnap.tanggalSnapshot,
              ipAddress: '127.0.0.1',
              user: {
                id: 'system',
                nama: 'Sistem Sinkronisasi CBS',
                username: 'cbs_sync',
                posisi: 'system',
                avatarUrl: null
              },
              parsedOld: { kol: prevSnap.kol, bakiDebet: prevSnap.bakiDebet },
              parsedNew: { kol: currentSnap.kol, bakiDebet: currentSnap.bakiDebet },
              diff: diffs
            });
          }
        }
      }
    }

    // Sort candidate events chronologically (oldest to newest) for state tracking
    candidateEvents.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Deduplicate: ONLY record an event if a genuine change happened (not on repetitive unchanged uploads)
    const formattedHistory: any[] = [];
    let lastKnown: any = null;

    for (const ev of candidateEvents) {
      const act = ev.action.toUpperCase();
      const isDirectActivity = [
        'CREATE_PAYMENT', 'UPDATE_PAYMENT', 'DELETE_PAYMENT',
        'CREATE_DESK_CALL', 'UPDATE_DESK_CALL', 'RESOLVE_DESK_CALL',
        'CREATE_P3_SCHEDULE', 'UPDATE_P3_SCHEDULE', 'SAVE_P3_SIGNATURE', 'SYNC_OFFLINE_P3', 'UPLOAD_P3_PHOTOS',
        'CREATE_LEGAL_BERKAS', 'CREATE_SURAT_LEGAL', 'UPDATE_SURAT_LEGAL', 'RESOLVE_MISSING_DEBITUR'
      ].includes(act);

      if (isDirectActivity) {
        formattedHistory.push(ev);
        continue;
      }

      // Extract current debitur state from this event
      const currKol = ev.parsedNew?.kol || ev.diff?.find((d: any) => d.field === 'kol')?.newValue;
      const currRestruk = ev.parsedNew?.restruk !== undefined ? ev.parsedNew.restruk : ev.diff?.find((d: any) => d.field === 'restruk')?.newValue;
      const currStatus = ev.parsedNew?.statusDebitur || ev.diff?.find((d: any) => d.field === 'statusDebitur')?.newValue;
      const currBaki = ev.parsedNew?.bakiDebet !== undefined ? ev.parsedNew.bakiDebet : ev.diff?.find((d: any) => d.field === 'bakiDebet')?.newValue;

      if (!lastKnown) {
        // Initial baseline creation entry
        lastKnown = {
          kol: currKol,
          restruk: currRestruk,
          statusDebitur: currStatus,
          bakiDebet: currBaki
        };
        ev.badgeLabel = 'Inisialisasi Data Debitur dari CBS';
        ev.badgeClass = 'badge-teal';
        formattedHistory.push(ev);
        continue;
      }

      // Detect genuine state changes relative to last known state
      const kolChanged = currKol && lastKnown.kol && currKol !== lastKnown.kol;
      const restrukChanged = currRestruk !== undefined && lastKnown.restruk !== undefined && currRestruk !== lastKnown.restruk;
      const statusChanged = currStatus && lastKnown.statusDebitur && currStatus !== lastKnown.statusDebitur;
      const bakiChanged = currBaki !== undefined && lastKnown.bakiDebet !== undefined && Math.abs(currBaki - lastKnown.bakiDebet) > 100;

      const meaningfulDiffs: DiffItem[] = [];
      if (kolChanged) {
        meaningfulDiffs.push({ field: 'kol', label: 'Kolektibilitas (KOL)', oldValue: lastKnown.kol, newValue: currKol, type: 'modified' });
      }
      if (restrukChanged) {
        meaningfulDiffs.push({ field: 'restruk', label: 'Frekuensi Restrukturisasi', oldValue: lastKnown.restruk, newValue: currRestruk, type: 'modified' });
      }
      if (statusChanged) {
        meaningfulDiffs.push({ field: 'statusDebitur', label: 'Status Debitur', oldValue: lastKnown.statusDebitur, newValue: currStatus, type: 'modified' });
      }
      if (bakiChanged) {
        meaningfulDiffs.push({ field: 'bakiDebet', label: 'Baki Debet', oldValue: lastKnown.bakiDebet, newValue: currBaki, type: 'modified' });
      }

      if (meaningfulDiffs.length > 0) {
        ev.diff = meaningfulDiffs;
        const reclassified = classifyDebiturAuditEvent(ev.action, meaningfulDiffs, ev.parsedNew);
        ev.category = reclassified.category;
        ev.badgeClass = reclassified.badgeClass;
        ev.badgeLabel = reclassified.badgeLabel;

        formattedHistory.push(ev);

        // Update lastKnown state
        if (currKol) lastKnown.kol = currKol;
        if (currRestruk !== undefined) lastKnown.restruk = currRestruk;
        if (currStatus) lastKnown.statusDebitur = currStatus;
        if (currBaki !== undefined) lastKnown.bakiDebet = currBaki;
      } else {
        // No actual change occurred on this CBS upload -> Do not record/display redundant unchanged log
      }
    }

    // Sort descending (newest first) for UI display
    formattedHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return c.json({
      tableName: rawTableName,
      recordId,
      debitur: debiturInfo,
      history: formattedHistory
    });
  } catch (err: any) {
    return c.json({ error: 'Gagal memuat riwayat record: ' + err.message }, 500);
  }
});

// GET /api/audit/:id - Full details with calculated visual diff (Accessible by all authenticated users)
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
