import { prisma } from './db.js';

async function cleanOperationalData() {
  console.log('Cleaning all Desk Call, Pembayaran, and Jadwal Penagihan operational history...');

  const deletedCalls = await prisma.deskCall.deleteMany({});
  console.log(`Deleted ${deletedCalls.count} Desk Call records.`);

  const deletedPayments = await prisma.pembayaran.deleteMany({});
  console.log(`Deleted ${deletedPayments.count} Pembayaran records.`);

  const deletedFotos = await prisma.penagihanFoto.deleteMany({});
  console.log(`Deleted ${deletedFotos.count} Penagihan Foto records.`);

  const deletedJadwal = await prisma.jadwalPenagihan.deleteMany({});
  console.log(`Deleted ${deletedJadwal.count} Jadwal Penagihan records.`);

  console.log('Successfully cleaned all operational history records. Database is now clean and ready for real production usage.');
}

cleanOperationalData()
  .catch((e) => {
    console.error('Failed to clean operational data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
