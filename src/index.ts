import { Blob } from 'buffer';
if (typeof globalThis.Blob === 'undefined') {
  (globalThis as any).Blob = Blob;
}

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from './config.js';
import { authRouter } from './controllers/auth.js';
import { debiturRouter } from './controllers/debitur.js';
import { deskcallRouter } from './controllers/deskcall.js';
import { p3Router } from './controllers/p3.js';
import { legalRouter } from './controllers/legal.js';
import { pembayaranRouter } from './controllers/pembayaran.js';
import { kpiRouter } from './controllers/kpi.js';
import { appSettingsRouter } from './controllers/appsettings.js';
import { importRouter } from './controllers/import.js';
import { notificationsRouter } from './controllers/notifications.js';
import { userRouter } from './controllers/user.js';
import { ewsRouter } from './controllers/ews.js';
import { historisRouter } from './controllers/historis.js';
import { qontakRouter } from './controllers/qontak.js';
import { portalRouter } from './controllers/portal.js';

const app = new Hono();

// Middlewares
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));
app.use('*', async (c, next) => {
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  await next();
});
app.use('/public/*', serveStatic({ root: '.' }));
app.use('/icons/*', serveStatic({ root: './public' }));
app.use('/uploads/*', serveStatic({ root: './public' }));
app.get('/manifest.json', serveStatic({ path: './public/manifest.json' }));
app.get('/sw.js', serveStatic({ path: './public/sw.js' }));
app.get('/apple-touch-icon.png', serveStatic({ path: './public/icons/apple-touch-icon.png' }));
app.get('/favicon.ico', serveStatic({ path: './public/icons/pwa-192x192.png' }));

// Default static redirect or index
app.get('/', (c) => c.redirect('/public/index.html'));

// API Routers
app.route('/api/auth', authRouter);
app.route('/api/users', userRouter);
app.route('/api/debitur', debiturRouter);
app.route('/api/deskcall', deskcallRouter);
app.route('/api/p3', p3Router);
app.route('/api/legal', legalRouter);
app.route('/api/pembayaran', pembayaranRouter);
app.route('/api/kpi', kpiRouter);
app.route('/api/app-settings', appSettingsRouter);
app.route('/api/import', importRouter);
app.route('/api/notifications', notificationsRouter);
app.route('/api/ews', ewsRouter);
app.route('/api/historis', historisRouter);
app.route('/api/qontak', qontakRouter);
app.route('/api/portal', portalRouter);

// Global Error Handler
app.onError((err, c) => {
  console.error('Unhandled Server Error:', err);
  return c.json({ error: 'Internal Server Error', message: err.message }, 500);
});

console.log(`BPRS NPF Dashboard server starting on port ${config.port}...`);
serve({
  fetch: app.fetch,
  port: config.port,
  hostname: '0.0.0.0'
}, (info) => {
  console.log(`BPRS NPF Dashboard server listening on http://localhost:${info.port}`);
});
export default app;
