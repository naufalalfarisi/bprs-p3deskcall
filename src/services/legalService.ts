import { prisma } from '../db.js';

export const DEFAULT_CHECKLISTS = [
  { kategori: 'Identitas', name: 'KTP Debitur' },
  { kategori: 'Identitas', name: 'KTP Pasangan' },
  { kategori: 'Identitas', name: 'Kartu Keluarga' },
  { kategori: 'Identitas', name: 'NPWP' },
  
  { kategori: 'Usaha', name: 'Surat Keterangan Usaha' },
  { kategori: 'Usaha', name: 'Foto Usaha' },
  { kategori: 'Usaha', name: 'Laporan Keuangan' },
  
  { kategori: 'Agunan', name: 'Sertifikat/BPKB Asli' },
  { kategori: 'Agunan', name: 'SPPT PBB' },
  { kategori: 'Agunan', name: 'Bukti Kepemilikan' },
  { kategori: 'Agunan', name: 'Foto Agunan' },
  
  { kategori: 'Akad & Notarial', name: 'Akad Pembiayaan' },
  { kategori: 'Akad & Notarial', name: 'Surat Kuasa' },
  { kategori: 'Akad & Notarial', name: 'APHT/Fidusia' }
];

export function calculateStatus(checkedCount: number, totalCount: number): string {
  if (totalCount === 0) return 'Kurang';
  const percentage = (checkedCount / totalCount) * 100;
  if (percentage === 100) return 'Lengkap';
  if (percentage >= 50) return 'Proses';
  return 'Kurang';
}

/**
 * List Legal Berkas with filters & percentage computation.
 */
export async function getLegalBerkas(q?: string, status?: string) {
  const whereClause: any = {};
  if (q) {
    whereClause.OR = [
      { id: { contains: q } },
      { debitur: { nama: { contains: q } } },
      { debiturId: { contains: q } }
    ];
  }
  if (status) {
    whereClause.status = status;
  }

  const berkas = await prisma.legalBerkas.findMany({
    where: whereClause,
    include: {
      debitur: {
        select: {
          nama: true,
          bakiDebet: true,
          jenisMargin: true,
          ao: true
        }
      },
      checklists: true,
      files: true
    },
    orderBy: { createdAt: 'desc' }
  });

  return berkas.map((b) => {
    const total = b.checklists.length;
    const checked = b.checklists.filter((c) => c.checked).length;
    return {
      ...b,
      totalChecklists: total,
      checkedChecklists: checked,
      percentage: total > 0 ? Math.round((checked / total) * 100) : 0
    };
  });
}

export interface CreateLegalBerkasParams {
  debiturId: string;
  jenisAgunan: string;
  notaris: string;
  noAkad: string;
  lokasiArsip: string;
}

export async function createLegalBerkas(params: CreateLegalBerkasParams) {
  const { debiturId, jenisAgunan, notaris, noAkad, lokasiArsip } = params;

  if (!debiturId || !jenisAgunan || !notaris || !noAkad || !lokasiArsip) {
    throw new Error('Semua field wajib diisi');
  }

  const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
  if (!debitur) {
    throw new Error('Debitur tidak ditemukan');
  }

  const existing = await prisma.legalBerkas.findFirst({ where: { debiturId } });
  if (existing) {
    throw new Error('Berkas legal untuk debitur ini sudah ada');
  }

  const count = await prisma.legalBerkas.count();
  const id = `LF-${(count + 1).toString().padStart(3, '0')}`;

  return prisma.$transaction(async (tx) => {
    const bk = await tx.legalBerkas.create({
      data: {
        id,
        debiturId,
        plafon: debitur.plafon,
        jenisAgunan,
        notaris,
        noAkad,
        lokasiArsip,
        status: 'Kurang'
      }
    });

    await Promise.all(
      DEFAULT_CHECKLISTS.map((item) =>
        tx.legalBerkasChecklist.create({
          data: {
            legalBerkasId: bk.id,
            kategori: item.kategori,
            itemName: item.name,
            checked: false
          }
        })
      )
    );

    return bk;
  });
}

export async function getLegalBerkasById(id: string) {
  const berkas = await prisma.legalBerkas.findUnique({
    where: { id },
    include: {
      debitur: true,
      checklists: true,
      files: true
    }
  });

  if (!berkas) {
    throw new Error('Berkas legal tidak ditemukan');
  }

  const total = berkas.checklists.length;
  const checked = berkas.checklists.filter((c) => c.checked).length;
  const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;

  return {
    ...berkas,
    totalChecklists: total,
    checkedChecklists: checked,
    percentage
  };
}

export async function toggleChecklistItem(legalBerkasId: string, checklistId: string, checked: boolean, userId?: string) {
  const checklist = await prisma.legalBerkasChecklist.findUnique({ where: { id: checklistId } });
  if (!checklist || checklist.legalBerkasId !== legalBerkasId) {
    throw new Error('Checklist item tidak ditemukan');
  }

  const updatedChecklist = await prisma.legalBerkasChecklist.update({
    where: { id: checklistId },
    data: {
      checked,
      checkedAt: checked ? new Date() : null,
      checkedBy: checked ? userId : null
    }
  });

  const allChecklists = await prisma.legalBerkasChecklist.findMany({
    where: { legalBerkasId }
  });

  const total = allChecklists.length;
  const checkedCount = allChecklists.filter((c) => c.checked).length;
  const newStatus = calculateStatus(checkedCount, total);

  await prisma.legalBerkas.update({
    where: { id: legalBerkasId },
    data: { status: newStatus }
  });

  return updatedChecklist;
}

// ── SURAT LEGAL (SP1, SP2, SOMASI) SERVICES ──

export async function getSuratLegalList(q?: string, jenis?: string, status?: string) {
  const whereClause: any = {};
  if (jenis) whereClause.jenisSurat = jenis;
  if (status) whereClause.status = status;
  if (q) {
    whereClause.OR = [
      { nomorSurat: { contains: q } },
      { namaDebitur: { contains: q } },
      { debiturId: { contains: q } }
    ];
  }

  return prisma.suratLegal.findMany({
    where: whereClause,
    include: {
      debitur: {
        select: {
          nama: true,
          alamat: true,
          telepon: true,
          tglJt: true,
          jenisMargin: true,
          ao: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export interface CreateSuratParams {
  debiturId: string;
  jenisSurat: string;
  tanggalSurat: string | Date;
  tglJatuhTempo?: string | Date | null;
  hal?: string;
  catatan?: string;
}

export async function createSuratLegal(user: any, params: CreateSuratParams) {
  const { debiturId, jenisSurat, tanggalSurat, tglJatuhTempo, hal, catatan } = params;

  if (!debiturId || !jenisSurat || !tanggalSurat) {
    throw new Error('Debitur, Jenis Surat, dan Tanggal wajib diisi');
  }

  const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
  if (!debitur) {
    throw new Error('Debitur tidak ditemukan');
  }

  const prefixMap: Record<string, string> = {
    'SP1': 'SP1',
    'SP2': 'SP2',
    'Somasi 1': 'SOM1',
    'Somasi 2': 'SOM2',
    'Eksekusi Jaminan': 'EKS'
  };
  const prefix = prefixMap[jenisSurat] || 'SUR';
  const now = new Date(tanggalSurat);
  const yearStr = now.getFullYear();
  const monthStr = (now.getMonth() + 1).toString().padStart(2, '0');

  const count = await prisma.suratLegal.count({ where: { jenisSurat } });
  const seq = (count + 1).toString().padStart(3, '0');
  const nomorSurat = `${prefix}/${yearStr}/${monthStr}/${seq}`;

  let calcJt = tglJatuhTempo ? new Date(tglJatuhTempo) : null;
  if (!calcJt) {
    calcJt = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // Default +7 hari
  }

  return prisma.suratLegal.create({
    data: {
      nomorSurat,
      jenisSurat,
      debiturId: debitur.id,
      namaDebitur: debitur.nama,
      tanggalSurat: new Date(tanggalSurat),
      tglJatuhTempo: calcJt,
      hal: hal || `Surat Peringatan (${jenisSurat}) atas Tunggakan Pembiayaan ${debitur.jenisMargin}`,
      totalTunggakan: debitur.totalTunggakan,
      tPokok: debitur.tPokok,
      tMargin: debitur.tMargin,
      bakiDebet: debitur.bakiDebet,
      status: 'Diterbitkan',
      petugas: user?.nama || user?.username || 'Legal Officer',
      catatan
    }
  });
}

// ── SP AUTO-TRIGGER ENGINE ──

export interface SpRecommendation {
  debiturId: string;
  namaDebitur: string;
  kol: string;
  frhPokok: number;
  totalTunggakan: number;
  recommendedJenisSurat: string;
  reason: string;
  urgency: 'HIGH' | 'MEDIUM' | 'CRITICAL';
  lastSurat: any | null;
}

/**
 * Evaluates active debiturs against DPD (frhPokok) & existing Surat Legal to determine SP recommendations.
 * - frhPokok >= 30: Eligible for SP1 (if no SP1 active)
 * - frhPokok >= 60: Eligible for SP2 (if SP1 active/past due)
 * - frhPokok >= 90: Eligible for Somasi 1 / SP3 (if SP2 active/past due)
 */
export async function getSpRecommendations(q?: string): Promise<SpRecommendation[]> {
  const whereClause: any = {
    statusDebitur: 'Aktif',
    frhPokok: { gte: 30 }
  };

  if (q) {
    whereClause.OR = [
      { nama: { contains: q } },
      { id: { contains: q } }
    ];
  }

  const debiturs = await prisma.debitur.findMany({
    where: whereClause,
    include: {
      suratLegal: {
        orderBy: { createdAt: 'desc' }
      }
    },
    orderBy: { frhPokok: 'desc' }
  });

  const now = new Date();
  const recommendations: SpRecommendation[] = [];

  for (const d of debiturs) {
    const existingSurats = d.suratLegal || [];
    const hasSp1 = existingSurats.some(s => s.jenisSurat === 'SP1');
    const hasSp2 = existingSurats.some(s => s.jenisSurat === 'SP2');
    const hasSomasi1 = existingSurats.some(s => s.jenisSurat.includes('Somasi'));

    const dpd = d.frhPokok || 0;
    const lastSurat = existingSurats.length > 0 ? existingSurats[0] : null;

    let recommendedJenisSurat = '';
    let reason = '';
    let urgency: 'HIGH' | 'MEDIUM' | 'CRITICAL' = 'MEDIUM';

    if (dpd >= 90) {
      if (!hasSomasi1) {
        recommendedJenisSurat = 'Somasi 1';
        reason = `Tunggakan ${dpd} hari (>= 90 hari) & masuk KOL Macet / Diragukan. Perlu Somasi Resmi.`;
        urgency = 'CRITICAL';
      } else {
        recommendedJenisSurat = 'Somasi 2';
        reason = `Somasi 1 telah terbit sebelumnya. Tunggakan ${dpd} hari belum diselesaikan.`;
        urgency = 'CRITICAL';
      }
    } else if (dpd >= 60) {
      if (!hasSp2) {
        recommendedJenisSurat = 'SP2';
        reason = `Tunggakan ${dpd} hari (>= 60 hari). Draf SP 2 perlu diterbitkan.`;
        urgency = 'HIGH';
      } else {
        recommendedJenisSurat = 'Somasi 1';
        reason = `SP 2 telah terbit. Tunggakan ${dpd} hari belum lunas.`;
        urgency = 'CRITICAL';
      }
    } else if (dpd >= 30) {
      if (!hasSp1) {
        recommendedJenisSurat = 'SP1';
        reason = `Tunggakan ${dpd} hari (>= 30 hari). Draf SP 1 harus segera diterbitkan.`;
        urgency = 'MEDIUM';
      } else {
        recommendedJenisSurat = 'SP2';
        reason = `SP 1 sudah diterbitkan. Tunggakan ${dpd} hari berlanjut.`;
        urgency = 'HIGH';
      }
    }

    if (recommendedJenisSurat) {
      recommendations.push({
        debiturId: d.id,
        namaDebitur: d.nama,
        kol: d.kol,
        frhPokok: dpd,
        totalTunggakan: d.totalTunggakan,
        recommendedJenisSurat,
        reason,
        urgency,
        lastSurat
      });
    }
  }

  return recommendations;
}

/**
 * Auto-generates SP for a debitur based on auto-trigger rules.
 */
export async function autoGenerateSp(user: any, debiturId: string, requestedJenisSurat?: string) {
  const debitur = await prisma.debitur.findUnique({
    where: { id: debiturId },
    include: { suratLegal: { orderBy: { createdAt: 'desc' } } }
  });

  if (!debitur) {
    throw new Error('Debitur tidak ditemukan');
  }

  let jenisSurat = requestedJenisSurat;
  if (!jenisSurat) {
    const dpd = debitur.frhPokok || 0;
    const existing = debitur.suratLegal || [];
    const hasSp1 = existing.some(s => s.jenisSurat === 'SP1');
    const hasSp2 = existing.some(s => s.jenisSurat === 'SP2');

    if (dpd >= 90) {
      jenisSurat = hasSp2 ? 'Somasi 1' : 'SP2';
    } else if (dpd >= 60) {
      jenisSurat = hasSp1 ? 'SP2' : 'SP1';
    } else {
      jenisSurat = 'SP1';
    }
  }

  const now = new Date();
  const tglJatuhTempo = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 hari batas waktu

  return createSuratLegal(user, {
    debiturId: debitur.id,
    jenisSurat,
    tanggalSurat: now,
    tglJatuhTempo,
    hal: `Surat Peringatan (${jenisSurat}) atas Tunggakan Pembiayaan ${debitur.jenisMargin}`,
    catatan: `Otomatis digenerate oleh sistem pada tunggakan ${debitur.frhPokok} hari (DPD ${debitur.frhPokok}).`
  });
}
