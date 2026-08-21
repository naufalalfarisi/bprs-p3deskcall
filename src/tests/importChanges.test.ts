import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../db.js';
import { processCbsUpload, commitCbsBatch, getCbsBatchChanges } from '../services/importService.js';

describe('CBS Import Changes & Snapshot Tracking', () => {
  let testUser: any = { id: '', nama: 'Test Admin' };

  beforeEach(async () => {
    // Get an existing active user or fallback
    const user = await prisma.user.findFirst({ where: { status: 'active' } });
    if (user) {
      testUser = { id: user.id, nama: user.nama };
    }

    // Clean test debiturs & batches
    await prisma.importStagingRow.deleteMany({});
    await prisma.importBatch.deleteMany({ where: { fileName: { startsWith: 'test_cbs_' } } });
    await prisma.debiturKolHistory.deleteMany({ where: { debiturId: { startsWith: 'TEST-REK-' } } });
    await prisma.debitur.deleteMany({ where: { id: { startsWith: 'TEST-REK-' } } });
  });

  afterAll(async () => {
    await prisma.importStagingRow.deleteMany({});
    await prisma.importBatch.deleteMany({ where: { fileName: { startsWith: 'test_cbs_' } } });
    await prisma.debiturKolHistory.deleteMany({ where: { debiturId: { startsWith: 'TEST-REK-' } } });
    await prisma.debitur.deleteMany({ where: { id: { startsWith: 'TEST-REK-' } } });
  });

  it('should detect KOL changes and new debiturs during CBS upload staging', async () => {
    // 1. Seed an existing active debitur with KOL Lancar (1)
    await prisma.debitur.create({
      data: {
        id: 'TEST-REK-001',
        cif: 'CIF-001',
        nama: 'Ahmad Subarjo',
        nik: '3171010101900001',
        tglLahir: new Date('1990-01-01'),
        alamat: 'Jl. Merdeka No. 1',
        kota: 'Yogyakarta',
        telepon: '081234567890',
        pekerjaan: 'Wiraswasta',
        agama: 'Islam',
        resiko: 'Rendah',
        jenisMargin: 'PEMBIAYAAN iB HARMONI MURABAHAH',
        rateMargin: 15.0,
        jw: 24,
        tglAwal: new Date('2025-01-01'),
        tglJt: new Date('2027-01-01'),
        ao: 'Budi Santoso',
        plafon: 50000000,
        bakiDebet: 45000000,
        angsPrincipal: 2000000,
        angsMargin: 500000,
        tPokok: 0,
        frPokok: 0,
        frhPokok: 0,
        tMargin: 0,
        frMargin: 0,
        frhMargin: 0,
        totalTunggakan: 0,
        fr: 0,
        frHari: 0,
        kol: 'Lancar',
        kolMurni: '1',
        restruk: 0,
        statusDebitur: 'Aktif'
      }
    });

    // 2. CSV File 1: TEST-REK-001 degrades to DPK (2), and TEST-REK-002 is a brand new debitur
    const csvContent = `Sampai Tanggal 31 Agustus 2026
RekeningBaru,CIFBaru,Nama,NoIdentitas,TglLahir,Alamat,Kota,Telepon,Pekerjaan,Agama,Resiko,JenisMargin,Rate Margin,JW,TglAwal,JTHTMP,TglAngsuranTerakhir,AO,Plafond/Modal Bank,Bakidebet,AngsPokok,AngsMargin,T.Pokok,FRHPokok,FRPokok,T.Margin,FRHMargin,FRMargin,TotalTunggakan,FR,FRHari,Kol,Kol Murni,Restrukturisasi,RekTabungan,Saldo,JenisAgunan,NilaiJaminan,NoSPk
TEST-REK-001,CIF-001,Ahmad Subarjo,3171010101900001,01/01/1990,Jl. Merdeka No. 1,Yogyakarta,081234567890,Wiraswasta,Islam,Rendah,PEMBIAYAAN iB HARMONI MURABAHAH,15.0,24,01/01/2025,01/01/2027,01/08/2026,Budi Santoso,50.000.000,43.000.000,2.000.000,500.000,2.000.000,10,1,500.000,10,1,2.500.000,1,10,2,2,0,02.11.001,100.000,Tanah,60.000.000,SPK-001
TEST-REK-002,CIF-002,Siti Aminah,3171010101900002,02/02/1992,Jl. Kaliurang No. 5,Sleman,081234567891,PNS,Islam,Rendah,PEMBIAYAAN iB HARMONI MURABAHAH,14.0,12,01/08/2026,01/08/2027,01/08/2026,Budi Santoso,20.000.000,20.000.000,1.500.000,300.000,0,0,0,0,0,0,0,0,0,1,1,0,02.11.002,250.000,BPKB,30.000.000,SPK-002
`;

    const uploadRes = await processCbsUpload(testUser, 'test_cbs_aug18.csv', csvContent);
    expect(uploadRes.totalRowsParsed).toBe(2);
    expect(uploadRes.totalUpdated).toBe(1);
    expect(uploadRes.totalNewDetected).toBe(1);

    // Verify changes breakdown
    const changes = await getCbsBatchChanges(uploadRes.batchId);
    expect(changes.kolChanges.length).toBe(1);
    expect(changes.kolChanges[0].debiturId).toBe('TEST-REK-001');
    expect(changes.kolChanges[0].prevKol).toBe('Lancar');
    expect(changes.kolChanges[0].currentKol).toBe('DPK');

    expect(changes.newDebiturs.length).toBe(1);
    expect(changes.newDebiturs[0].debiturId).toBe('TEST-REK-002');
    expect(changes.newDebiturs[0].nama).toBe('Siti Aminah');

    // Commit batch
    const commitRes = await commitCbsBatch(null, uploadRes.batchId);
    expect(commitRes.message).toContain('berhasil');

    // Verify in database
    const deb1 = await prisma.debitur.findUnique({ where: { id: 'TEST-REK-001' } });
    expect(deb1?.kol).toBe('DPK');

    const deb2 = await prisma.debitur.findUnique({ where: { id: 'TEST-REK-002' } });
    expect(deb2?.kol).toBe('Lancar');
    expect(deb2?.nama).toBe('Siti Aminah');

    // Verify snapshot history
    const history = await prisma.debiturKolHistory.findMany({
      where: { debiturId: { in: ['TEST-REK-001', 'TEST-REK-002'] } }
    });
    expect(history.length).toBe(2);
  });
});
