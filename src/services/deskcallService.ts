import { prisma } from '../db.js';

export interface CreateDeskCallParams {
  debiturId: string;
  tanggal: string;
  waktu: string;
  jenisKontak: string;
  statusKontak: string;
  hasilKomunikasi?: string;
  tindakLanjut?: string;
  prioritas: string;
  nominalJanji?: string | number | null;
  tanggalJanjiBayar?: string | Date | null;
  durasiPanggilan?: string | null;
}

export async function createDeskCall(user: any, params: CreateDeskCallParams) {
  const {
    debiturId,
    tanggal,
    waktu,
    jenisKontak,
    statusKontak,
    hasilKomunikasi,
    tindakLanjut,
    prioritas,
    nominalJanji,
    tanggalJanjiBayar,
    durasiPanggilan
  } = params;

  if (!debiturId || !tanggal || !waktu || !jenisKontak || !statusKontak || !prioritas) {
    throw new Error('Field wajib tidak boleh kosong');
  }

  const debitur = await prisma.debitur.findUnique({ where: { id: debiturId } });
  if (!debitur) {
    throw new Error('Debitur tidak ditemukan');
  }

  const parsedNominalJanji = nominalJanji ? parseFloat(String(nominalJanji)) : null;

  const newCall = await prisma.deskCall.create({
    data: {
      debiturId,
      namaDebitur: debitur.nama,
      tanggal: new Date(tanggal),
      waktu,
      petugasId: user.id,
      kol: debitur.kol,
      jenisKontak,
      statusKontak,
      hasilKomunikasi,
      tindakLanjut: tindakLanjut || 'Tidak Ada',
      prioritas,
      nominalJanji: parsedNominalJanji,
      tanggalJanjiBayar: tanggalJanjiBayar ? new Date(tanggalJanjiBayar) : null,
      bakiDebet: debitur.bakiDebet,
      durasiPanggilan: durasiPanggilan || null
    }
  });

  if (tindakLanjut && (tindakLanjut === 'Sudah Bayar' || tindakLanjut.includes('Sudah Bayar') || tindakLanjut.includes('Lunas'))) {
    const paymentNominal = parsedNominalJanji ? parsedNominalJanji : (debitur.totalTunggakan || 0);
    await prisma.pembayaran.create({
      data: {
        debiturId,
        nama: debitur.nama,
        tanggal: new Date(tanggal),
        nominal: paymentNominal,
        kol: debitur.kol,
        metode: jenisKontak === 'WhatsApp' ? 'Transfer' : 'Tunai',
        petugas: user.nama || user.username || 'Desk Call',
        keterangan: hasilKomunikasi || 'Pembayaran dicatat via Desk Call (Sudah Bayar)'
      }
    });

    await prisma.deskCall.updateMany({
      where: {
        debiturId,
        tindakLanjut: 'Janji Bayar',
        id: { not: newCall.id }
      },
      data: {
        tanggalJanjiBayar: null
      }
    });
  }

  return newCall;
}

export interface GetDeskCallHarianParams {
  tanggalStr: string;
  q?: string;
  statusKontak?: string;
  tindakLanjut?: string;
  janjiDue?: string;
}

export async function getDeskCallHarian(params: GetDeskCallHarianParams) {
  const { tanggalStr, q, statusKontak, tindakLanjut, janjiDue } = params;
  const filterDate = new Date(tanggalStr);
  const startOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(filterDate.getFullYear(), filterDate.getMonth(), filterDate.getDate(), 23, 59, 59, 999);

  const whereClause: any = {};

  if (janjiDue === 'true' || janjiDue === 'today') {
    whereClause.tindakLanjut = 'Janji Bayar';
    whereClause.tanggalJanjiBayar = {
      gte: startOfDay,
      lte: endOfDay
    };
  } else {
    whereClause.tanggal = {
      gte: startOfDay,
      lte: endOfDay
    };
  }

  if (q) {
    whereClause.OR = [
      { namaDebitur: { contains: q } },
      { debiturId: { contains: q } }
    ];
  }

  if (statusKontak) {
    whereClause.statusKontak = statusKontak;
  }

  if (tindakLanjut && !whereClause.tindakLanjut) {
    whereClause.tindakLanjut = tindakLanjut;
  }

  const calls = await prisma.deskCall.findMany({
    where: whereClause,
    include: {
      debitur: {
        select: {
          telepon: true,
          tglJt: true,
          totalTunggakan: true,
          ao: true
        }
      },
      petugas: {
        select: {
          nama: true,
          username: true
        }
      }
    },
    orderBy: { waktu: 'desc' }
  });

  const totalCalls = calls.length;
  const terhubung = calls.filter((c) => c.statusKontak === 'Terhubung').length;
  const janjiBayar = calls.filter((c) => c.tindakLanjut === 'Janji Bayar').length;
  const nominalJanji = calls.reduce((sum, c) => sum + (c.nominalJanji || 0), 0);

  return {
    calls,
    stats: {
      totalCalls,
      terhubung,
      janjiBayar,
      nominalJanji,
      targetCalls: 30
    }
  };
}

export async function getDeskCallBulanan(yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);

  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
  const maxDays = endOfMonth.getDate();

  const calls = await prisma.deskCall.findMany({
    where: {
      tanggal: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    },
    include: {
      petugas: { select: { nama: true } }
    },
    orderBy: { tanggal: 'asc' }
  });

  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const monthLabel = monthNames[month - 1] || '';

  const weeklyMap: { [weekNum: number]: any } = {
    1: { weekNum: 1, label: `Minggu 1 (Tgl 01 - 07 ${monthLabel} ${year})`, startDay: 1, endDay: 7, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
    2: { weekNum: 2, label: `Minggu 2 (Tgl 08 - 14 ${monthLabel} ${year})`, startDay: 8, endDay: 14, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
    3: { weekNum: 3, label: `Minggu 3 (Tgl 15 - 21 ${monthLabel} ${year})`, startDay: 15, endDay: 21, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
    4: { weekNum: 4, label: `Minggu 4 (Tgl 22 - 28 ${monthLabel} ${year})`, startDay: 22, endDay: 28, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} },
    5: { weekNum: 5, label: `Minggu 5 (Tgl 29 - ${maxDays} ${monthLabel} ${year})`, startDay: 29, endDay: maxDays, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [], daysMap: {} }
  };

  calls.forEach((call) => {
    const callDate = new Date(call.tanggal);
    const day = callDate.getDate();
    let weekNum = 1;
    if (day >= 29) weekNum = 5;
    else if (day >= 22) weekNum = 4;
    else if (day >= 15) weekNum = 3;
    else if (day >= 8) weekNum = 2;

    const targetWeek = weeklyMap[weekNum];
    targetWeek.totalCall++;
    if (call.statusKontak === 'Terhubung') targetWeek.terhubung++;
    if (call.tindakLanjut === 'Janji Bayar') targetWeek.ptp++;
    targetWeek.nominalJanji += call.nominalJanji || 0;
    targetWeek.calls.push(call);

    const dateStr = callDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    if (!targetWeek.daysMap[dateStr]) {
      targetWeek.daysMap[dateStr] = { tanggal: dateStr, totalCall: 0, terhubung: 0, ptp: 0, nominalJanji: 0, calls: [] };
    }
    targetWeek.daysMap[dateStr].totalCall++;
    if (call.statusKontak === 'Terhubung') targetWeek.daysMap[dateStr].terhubung++;
    if (call.tindakLanjut === 'Janji Bayar') targetWeek.daysMap[dateStr].ptp++;
    targetWeek.daysMap[dateStr].nominalJanji += call.nominalJanji || 0;
    targetWeek.daysMap[dateStr].calls.push(call);
  });

  const weeklyRekap = Object.values(weeklyMap).map((w: any) => {
    const connectionRate = w.totalCall > 0 ? (w.terhubung / w.totalCall) * 100 : 0;
    const ptpRate = w.terhubung > 0 ? (w.ptp / w.terhubung) * 100 : 0;
    const dailyBreakdown = Object.values(w.daysMap).sort((a: any, b: any) => a.tanggal.localeCompare(b.tanggal));
    return {
      ...w,
      connectionRate: parseFloat(connectionRate.toFixed(1)),
      ptpRate: parseFloat(ptpRate.toFixed(1)),
      dailyBreakdown
    };
  });

  const totalCalls = calls.length;
  const terhubung = calls.filter((c) => c.statusKontak === 'Terhubung').length;
  const ptp = calls.filter((c) => c.tindakLanjut === 'Janji Bayar').length;
  const totalNominalJanji = calls.reduce((sum, c) => sum + (c.nominalJanji || 0), 0);

  const connectionRate = totalCalls > 0 ? (terhubung / totalCalls) * 100 : 0;
  const ptpRate = terhubung > 0 ? (ptp / terhubung) * 100 : 0;

  // Rekap Janji Bayar
  const janjiBayarCalls = await prisma.deskCall.findMany({
    where: {
      tindakLanjut: 'Janji Bayar',
      tanggal: { gte: startOfMonth, lte: endOfMonth }
    },
    include: {
      debitur: { select: { nama: true, telepon: true, ao: true, kol: true, totalTunggakan: true } },
      petugas: { select: { nama: true } }
    },
    orderBy: { tanggalJanjiBayar: 'asc' }
  });

  const now = new Date();
  const jbDebtorMap: { [debiturId: string]: any } = {};

  for (const jb of janjiBayarCalls) {
    const existing = jbDebtorMap[jb.debiturId];
    if (!existing || (jb.tanggalJanjiBayar && existing.tanggalJanjiBayar && new Date(jb.tanggalJanjiBayar) > new Date(existing.tanggalJanjiBayar))) {
      jbDebtorMap[jb.debiturId] = jb;
    } else if (!existing) {
      jbDebtorMap[jb.debiturId] = jb;
    }
  }

  const rekapJanjiBayarList: any[] = [];

  for (const debiturId of Object.keys(jbDebtorMap)) {
    const jb = jbDebtorMap[debiturId];

    const sudahBayarCall = await prisma.deskCall.findFirst({
      where: {
        debiturId,
        tanggal: { gte: startOfMonth, lte: endOfMonth },
        OR: [
          { tindakLanjut: 'Sudah Bayar' },
          { tindakLanjut: { contains: 'Sudah Bayar' } },
          { tindakLanjut: { contains: 'Lunas' } }
        ]
      }
    });

    const pembayaran = await prisma.pembayaran.findFirst({
      where: {
        debiturId,
        tanggal: { gte: startOfMonth, lte: endOfMonth }
      },
      orderBy: { tanggal: 'desc' }
    });

    let statusJanji = 'Menunggu';
    let statusColor = 'yellow';
    if (sudahBayarCall || pembayaran) {
      statusJanji = 'Sudah Bayar';
      statusColor = 'green';
    } else if (jb.tanggalJanjiBayar && new Date(jb.tanggalJanjiBayar) < now) {
      statusJanji = 'Ingkar Janji';
      statusColor = 'red';
    }

    rekapJanjiBayarList.push({
      debiturId,
      namaDebitur: jb.namaDebitur || jb.debitur?.nama || '-',
      telepon: jb.debitur?.telepon || '-',
      ao: jb.debitur?.ao || '-',
      kol: jb.kol || jb.debitur?.kol || '-',
      tanggalJanjiBayar: jb.tanggalJanjiBayar,
      nominalJanji: jb.nominalJanji || 0,
      tanggalCall: jb.tanggal,
      petugas: jb.petugas?.nama || '-',
      statusJanji,
      statusColor,
      nominalBayar: pembayaran?.nominal || null,
      tanggalBayar: pembayaran?.tanggal || null
    });
  }

  const statusOrder: { [key: string]: number } = { 'Ingkar Janji': 0, 'Menunggu': 1, 'Sudah Bayar': 2 };
  rekapJanjiBayarList.sort((a, b) => (statusOrder[a.statusJanji] ?? 9) - (statusOrder[b.statusJanji] ?? 9));

  const totalJanjiDebitur = rekapJanjiBayarList.length;
  const sudahBayarCount = rekapJanjiBayarList.filter(r => r.statusJanji === 'Sudah Bayar').length;
  const ingkarJanjiCount = rekapJanjiBayarList.filter(r => r.statusJanji === 'Ingkar Janji').length;
  const menungguCount = rekapJanjiBayarList.filter(r => r.statusJanji === 'Menunggu').length;
  const totalNominalJanjiBayar = rekapJanjiBayarList.reduce((sum, r) => sum + (r.nominalJanji || 0), 0);
  const totalNominalTerbayar = rekapJanjiBayarList.filter(r => r.statusJanji === 'Sudah Bayar').reduce((sum, r) => sum + (r.nominalBayar || r.nominalJanji || 0), 0);
  const successRate = totalJanjiDebitur > 0 ? parseFloat(((sudahBayarCount / totalJanjiDebitur) * 100).toFixed(1)) : 0;

  const rekapJanjiBayar = {
    totalJanjiDebitur,
    sudahBayarCount,
    ingkarJanjiCount,
    menungguCount,
    totalNominalJanjiBayar,
    totalNominalTerbayar,
    successRate,
    list: rekapJanjiBayarList
  };

  return {
    weeklyRekap,
    periode: yearMonth,
    rekapJanjiBayar,
    stats: {
      totalCalls,
      terhubung,
      connectionRate: parseFloat(connectionRate.toFixed(1)),
      ptp,
      ptpRate: parseFloat(ptpRate.toFixed(1)),
      totalNominalJanji
    }
  };
}

export interface GetDeskCallRedAlertParams {
  q?: string;
  ao?: string;
  hariIni?: string;
  filterStatus?: string;
}

export async function getDeskCallRedAlert(params: GetDeskCallRedAlertParams) {
  const { q, ao, hariIni, filterStatus = 'all' } = params;

  const whereClause: any = {
    statusDebitur: 'Aktif',
    OR: [
      { kol: { in: ['DPK', '2', 'KOL 2'] } },
      { kolMurni: '2' },
      { frhPokok: { gte: 1, lte: 30 } }
    ]
  };

  if (q) {
    whereClause.AND = [
      {
        OR: [
          { nama: { contains: q } },
          { id: { contains: q } },
          { ao: { contains: q } }
        ]
      }
    ];
  }

  if (ao) {
    whereClause.ao = ao;
  }

  const debiturs = await prisma.debitur.findMany({
    where: whereClause,
    include: {
      kolHistory: {
        orderBy: { tanggalSnapshot: 'desc' },
        take: 3
      },
      deskCalls: {
        orderBy: { tanggal: 'desc' },
        take: 1
      }
    },
    orderBy: [
      { frhPokok: 'asc' },
      { bakiDebet: 'desc' }
    ]
  });

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

  let totalBaki = 0;
  let totalTunggakan = 0;
  let belumDihubungiCount = 0;
  let ptpCount = 0;
  let bergeserHariIniCount = 0;

  let list = debiturs.map(d => {
    totalBaki += d.bakiDebet || 0;
    totalTunggakan += d.totalTunggakan || 0;

    const lastCall = d.deskCalls && d.deskCalls.length > 0 ? d.deskCalls[0] : null;
    let lastCallDateStr = '-';
    if (lastCall && lastCall.tanggal) {
      lastCallDateStr = new Date(lastCall.tanggal).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    }

    const isCalledToday = lastCallDateStr === todayStr;
    if (!isCalledToday) {
      belumDihubungiCount++;
    }

    if (lastCall && lastCall.tindakLanjut === 'Janji Bayar') {
      ptpCount++;
    }

    let prevKol = 'Lancar (KOL 1)';
    let tanggalShiftStr = '-';
    if (d.kolHistory && d.kolHistory.length > 0) {
      const latestHist = d.kolHistory[0];
      const prevHist = d.kolHistory.length > 1 ? d.kolHistory[1] : null;
      if (prevHist) {
        prevKol = prevHist.kol || 'Lancar (KOL 1)';
      }
      if (latestHist && latestHist.tanggalSnapshot) {
        tanggalShiftStr = new Date(latestHist.tanggalSnapshot).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    }
    if (tanggalShiftStr === '-' && d.lastSyncedAt) {
      tanggalShiftStr = new Date(d.lastSyncedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    const isBergeserHariIni = d.frhPokok <= 1 || (d.updatedAt && new Date(d.updatedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === todayStr) || (d.lastSyncedAt && new Date(d.lastSyncedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === todayStr);
    if (isBergeserHariIni) {
      bergeserHariIniCount++;
    }

    return {
      id: d.id,
      cif: d.cif,
      nama: d.nama,
      telepon: d.telepon,
      ao: d.ao,
      plafon: d.plafon,
      bakiDebet: d.bakiDebet,
      totalTunggakan: d.totalTunggakan,
      frhPokok: d.frhPokok,
      kol: d.kol,
      kolMurni: d.kolMurni,
      prevKol: prevKol,
      currentKol: d.kol,
      tglJt: d.tglJt,
      tanggalShift: tanggalShiftStr,
      lastCallDate: lastCallDateStr,
      lastCallStatus: lastCall ? lastCall.statusKontak : 'Belum Di-Call',
      lastCallOutcome: lastCall ? (lastCall.tindakLanjut || lastCall.hasilKomunikasi || '-') : '-',
      isCalledToday,
      isBergeserHariIni
    };
  });

  if (hariIni === 'true' || filterStatus === 'hari_ini') {
    list = list.filter(item => item.isBergeserHariIni || item.frhPokok <= 1);
  } else if (filterStatus === 'belum_call') {
    list = list.filter(item => !item.isCalledToday);
  } else if (filterStatus === 'sudah_call') {
    list = list.filter(item => item.isCalledToday);
  } else if (filterStatus === 'ptp') {
    list = list.filter(item => item.lastCallOutcome === 'Janji Bayar');
  }

  return {
    stats: {
      totalNoa: debiturs.length,
      totalBakiDebet: totalBaki,
      totalTunggakan,
      belumDihubungiToday: belumDihubungiCount,
      janjiBayarCount: ptpCount,
      bergeserHariIniCount
    },
    list
  };
}

export async function getDeskCallInsight(user: any, yearMonth: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  const calls = await prisma.deskCall.findMany({
    where: {
      tanggal: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    },
    include: {
      petugas: { select: { nama: true } }
    }
  });

  const totalCall = calls.length;
  const terhubung = calls.filter((c) => c.statusKontak === 'Terhubung').length;
  const ptp = calls.filter((c) => c.tindakLanjut === 'Janji Bayar').length;
  const totalNominalJanji = calls.reduce((sum, c) => sum + (c.nominalJanji || 0), 0);

  const connectionRate = totalCall > 0 ? (terhubung / totalCall) * 100 : 0;
  const ptpRate = terhubung > 0 ? (ptp / terhubung) * 100 : 0;

  const statusBreakdown = {
    Terhubung: 0,
    'Tersambung Tidak Diangkat': 0,
    'Tidak Diangkat': 0,
    'Nomor Ditolak': 0,
    Sibuk: 0,
    'Tidak Aktif': 0,
    'Salah Nomor': 0
  };
  calls.forEach((c) => {
    const s = c.statusKontak as keyof typeof statusBreakdown;
    if (s in statusBreakdown) {
      statusBreakdown[s]++;
    }
  });

  const jenisBreakdown = {
    Telepon: calls.filter((c) => c.jenisKontak === 'Telepon').length,
    WhatsApp: calls.filter((c) => c.jenisKontak === 'WhatsApp').length
  };

  const kolDistribution: { [kol: string]: number } = {};
  calls.forEach((c) => {
    kolDistribution[c.kol] = (kolDistribution[c.kol] || 0) + 1;
  });

  const hourlyDistribution: { [hour: string]: number } = {};
  for (let i = 8; i <= 17; i++) {
    const hStr = i.toString().padStart(2, '0') + ':00';
    hourlyDistribution[hStr] = 0;
  }

  calls.forEach((c) => {
    if (c.statusKontak === 'Terhubung') {
      const hour = c.waktu.split(':')[0];
      const hourKey = hour + ':00';
      if (hourKey in hourlyDistribution) {
        hourlyDistribution[hourKey]++;
      } else {
        hourlyDistribution[hourKey] = 1;
      }
    }
  });

  const trenMap: { [dateStr: string]: { date: string; total: number; connected: number } } = {};
  calls.forEach((c) => {
    const dateStr = c.tanggal.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    if (!trenMap[dateStr]) {
      trenMap[dateStr] = { date: dateStr, total: 0, connected: 0 };
    }
    trenMap[dateStr].total++;
    if (c.statusKontak === 'Terhubung') {
      trenMap[dateStr].connected++;
    }
  });
  const trenCall = Object.values(trenMap).sort((a, b) => a.date.localeCompare(b.date));

  let officerPerformance: any[] = [];
  if (user && (user.posisi === 'admin' || user.posisi === 'kabid_p3')) {
    const officerMap: { [userId: string]: any } = {};

    calls.forEach((c) => {
      const oId = c.petugasId;
      if (!officerMap[oId]) {
        officerMap[oId] = {
          nama: c.petugas?.nama || 'Petugas Lain',
          totalCall: 0,
          terhubung: 0,
          ptp: 0,
          nominalJanji: 0
        };
      }
      officerMap[oId].totalCall++;
      if (c.statusKontak === 'Terhubung') {
        officerMap[oId].terhubung++;
      }
      if (c.tindakLanjut === 'Janji Bayar') {
        officerMap[oId].ptp++;
      }
      officerMap[oId].nominalJanji += c.nominalJanji || 0;
    });

    officerPerformance = Object.values(officerMap).map((o: any) => ({
      ...o,
      connectionRate: o.totalCall > 0 ? (o.terhubung / o.totalCall) * 100 : 0,
      ptpRate: o.terhubung > 0 ? (o.ptp / o.terhubung) * 100 : 0
    }));
  }

  const promiseCalls = await prisma.deskCall.findMany({
    where: {
      tanggal: { gte: startOfMonth, lte: endOfMonth },
      OR: [
        { tindakLanjut: 'Janji Bayar' },
        { tindakLanjut: 'Sudah Bayar' },
        { tindakLanjut: { contains: 'Sudah Bayar' } },
        { tanggalJanjiBayar: { not: null } }
      ]
    },
    include: { debitur: true },
    orderBy: { tanggalJanjiBayar: 'asc' }
  });

  const promiseDebtorMap: { [debiturId: string]: any } = {};

  for (const pCall of promiseCalls) {
    if (!promiseDebtorMap[pCall.debiturId]) {
      const hasPayment = await prisma.pembayaran.count({
        where: { debiturId: pCall.debiturId }
      }) > 0;

      const hasSudahBayarCall = await prisma.deskCall.count({
        where: {
          debiturId: pCall.debiturId,
          OR: [
            { tindakLanjut: 'Sudah Bayar' },
            { tindakLanjut: { contains: 'Sudah Bayar' } },
            { tindakLanjut: { contains: 'Lunas' } }
          ]
        }
      }) > 0;

      const isResolved = hasPayment || hasSudahBayarCall || (pCall.tindakLanjut && (pCall.tindakLanjut.includes('Sudah Bayar') || pCall.tindakLanjut.includes('Lunas')));

      let statusCategory = 'Dalam Follow-Up';
      if (isResolved) {
        statusCategory = 'Selesai (Sudah Bayar)';
      } else if (pCall.tanggalJanjiBayar && new Date(pCall.tanggalJanjiBayar) < new Date()) {
        statusCategory = 'Ingkar Janji (Overdue)';
      }

      promiseDebtorMap[pCall.debiturId] = {
        debiturId: pCall.debiturId,
        namaDebitur: pCall.namaDebitur,
        tanggalJanjiBayar: pCall.tanggalJanjiBayar,
        nominalJanji: pCall.nominalJanji || 0,
        isResolved,
        statusCategory
      };
    }
  }

  const debtorList = Object.values(promiseDebtorMap);
  const totalPromiseDebtors = debtorList.length;
  const resolvedCount = debtorList.filter(d => d.isResolved).length;
  const pendingCount = debtorList.filter(d => d.statusCategory === 'Dalam Follow-Up').length;
  const brokenCount = debtorList.filter(d => d.statusCategory === 'Ingkar Janji (Overdue)').length;

  const promiseSuccessRate = totalPromiseDebtors > 0 ? parseFloat(((resolvedCount / totalPromiseDebtors) * 100).toFixed(1)) : 0;
  
  let promisePerformanceCategory = 'Perlu Perhatian';
  if (promiseSuccessRate >= 70) promisePerformanceCategory = 'Sangat Baik';
  else if (promiseSuccessRate >= 40) promisePerformanceCategory = 'Sedang';

  const ptpSuccessMetrics = {
    totalPromiseDebtors,
    resolvedCount,
    pendingCount,
    brokenCount,
    promiseSuccessRate,
    promisePerformanceCategory,
    debtorList
  };

  return {
    stats: {
      totalCall,
      terhubung,
      connectionRate,
      ptp,
      ptpRate,
      totalNominalJanji
    },
    statusBreakdown,
    jenisBreakdown,
    kolDistribution,
    hourlyDistribution,
    trenCall,
    officerPerformance,
    ptpSuccessMetrics
  };
}

export async function getDeskCallById(id: string) {
  const call = await prisma.deskCall.findUnique({
    where: { id },
    include: {
      debitur: true,
      petugas: { select: { nama: true, username: true } }
    }
  });
  if (!call) {
    throw new Error('Data Desk Call tidak ditemukan');
  }
  return call;
}

export async function updateDeskCall(id: string, user: any, body: any) {
  const existing = await prisma.deskCall.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('Entri call tidak ditemukan');
  }

  const {
    tanggal,
    waktu,
    jenisKontak,
    statusKontak,
    hasilKomunikasi,
    tindakLanjut,
    prioritas,
    nominalJanji,
    tanggalJanjiBayar
  } = body;

  const updated = await prisma.deskCall.update({
    where: { id },
    data: {
      tanggal: tanggal ? new Date(tanggal) : existing.tanggal,
      waktu: waktu || existing.waktu,
      jenisKontak: jenisKontak || existing.jenisKontak,
      statusKontak: statusKontak || existing.statusKontak,
      hasilKomunikasi: hasilKomunikasi !== undefined ? hasilKomunikasi : existing.hasilKomunikasi,
      tindakLanjut: tindakLanjut !== undefined ? tindakLanjut : existing.tindakLanjut,
      prioritas: prioritas || existing.prioritas,
      nominalJanji: nominalJanji !== undefined ? (nominalJanji !== null && nominalJanji !== '' ? parseFloat(nominalJanji) : null) : existing.nominalJanji,
      tanggalJanjiBayar: tanggalJanjiBayar !== undefined ? (tanggalJanjiBayar ? new Date(tanggalJanjiBayar) : null) : existing.tanggalJanjiBayar
    }
  });

  if (tindakLanjut && (tindakLanjut === 'Sudah Bayar' || tindakLanjut.includes('Sudah Bayar') || tindakLanjut.includes('Lunas'))) {
    const paymentNominal = nominalJanji !== undefined && nominalJanji !== null && nominalJanji !== '' 
      ? parseFloat(nominalJanji) 
      : (existing.nominalJanji || 0);
    const debitur = await prisma.debitur.findUnique({ where: { id: existing.debiturId } });
    if (debitur) {
      await prisma.pembayaran.create({
        data: {
          debiturId: existing.debiturId,
          nama: debitur.nama,
          tanggal: tanggal ? new Date(tanggal) : new Date(),
          nominal: paymentNominal > 0 ? paymentNominal : (debitur.totalTunggakan || 0),
          kol: debitur.kol,
          metode: 'Transfer',
          petugas: user?.nama || 'Desk Call',
          keterangan: hasilKomunikasi || 'Pembayaran dicatat via Desk Call (Sudah Bayar)'
        }
      });
    }

    await prisma.deskCall.updateMany({
      where: {
        debiturId: existing.debiturId,
        tindakLanjut: 'Janji Bayar',
        id: { not: id }
      },
      data: {
        tanggalJanjiBayar: null
      }
    });
  }

  return { existing, updated };
}

export async function deleteDeskCall(id: string) {
  const call = await prisma.deskCall.findUnique({ where: { id } });
  if (!call) {
    throw new Error('Entri call tidak ditemukan');
  }

  await prisma.deskCall.delete({ where: { id } });
  return call;
}
