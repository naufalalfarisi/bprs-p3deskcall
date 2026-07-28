import dotenv from 'dotenv';
dotenv.config();

// Explicitly set the timezone for the entire Node process
process.env.TZ = 'Asia/Jakarta';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'bprs-super-secret-key-npf-dashboard',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  timezone: 'Asia/Jakarta'
};
