import dotenv from 'dotenv';
dotenv.config();

// Explicitly set the timezone for the entire Node process
process.env.TZ = 'Asia/Jakarta';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'bprs-super-secret-key-npf-dashboard',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  timezone: 'Asia/Jakarta',
  // Resend Email API
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'BPRS Mitra Harmoni <onboarding@resend.dev>',
  // Security: Allowed CORS origins (comma-separated in .env)
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Security: Set true in production for Secure cookie flag
  cookieSecure: process.env.COOKIE_SECURE === 'true'
};

