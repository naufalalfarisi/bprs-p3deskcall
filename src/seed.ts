import { prisma } from './db.js';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding default administrator and demo accounts...');

  const demoPasswordHash = await bcrypt.hash('password123', 10);
  const adminPasswordHash = await bcrypt.hash('adminpassword', 10);

  const demoUsers = [
    { username: 'admin', nama: 'Administrator Utama', passwordHash: adminPasswordHash, email: 'admin@bprs.co.id', posisi: 'admin' },
    { username: 'kabid_p3', nama: 'Budi Santoso (Kabid P3)', passwordHash: demoPasswordHash, email: 'kabid@bprs.co.id', posisi: 'kabid_p3' },
    { username: 'staff_p3', nama: 'Agus Setiawan (Staff P3)', passwordHash: demoPasswordHash, email: 'staff_p3@bprs.co.id', posisi: 'staff_p3' },
    { username: 'desk_call', nama: 'Siti Rahma (Desk Call)', passwordHash: demoPasswordHash, email: 'deskcall@bprs.co.id', posisi: 'desk_call' },
    { username: 'legal', nama: 'Bambang Haryanto (Legal)', passwordHash: demoPasswordHash, email: 'legal@bprs.co.id', posisi: 'legal' },
  ];

  for (const u of demoUsers) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        status: 'active',
        passwordHash: u.passwordHash
      },
      create: {
        username: u.username,
        nama: u.nama,
        passwordHash: u.passwordHash,
        email: u.email,
        tglLahir: new Date('1990-01-01'),
        posisi: u.posisi,
        status: 'active',
        registerAttemptCount: 0
      }
    });
  }

  console.log('Successfully seeded all demo accounts (admin, kabid_p3, staff_p3, desk_call, legal).');
}

seed()
  .catch((e) => {
    console.error('Failed to seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
