import { Hono } from 'hono';
import { prisma } from '../db.js';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';
import { promises as fs } from 'fs';
import path from 'path';

export const appSettingsRouter = new Hono();

// GET / - Read settings (public, for branding on login & app shell)
appSettingsRouter.get('/', async (c) => {
  try {
    const settings = await prisma.appSetting.findMany();
    // Convert array to key-value map
    const configMap: { [key: string]: string } = {
      pt_name: 'PT BPRS Mitra Harmoni Yogyakarta',
      logo_url: '',
      favicon_url: '',
      accent_light: '#0F766E', // Default teal
      accent_dark: '#3FAEA5'
    };

    settings.forEach((s) => {
      configMap[s.key] = s.value;
    });

    return c.json(configMap);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST / - Save settings (admin only)
appSettingsRouter.post('/', authMiddleware, roleMiddleware(['admin']), async (c) => {
  try {
    const body = await c.req.json();
    const user = (c as any).get('user');

    const keys = ['pt_name', 'accent_light', 'accent_dark'];
    const updatedSettings: any = {};

    for (const key of keys) {
      if (body[key] !== undefined) {
        const setting = await prisma.appSetting.upsert({
          where: { key },
          create: {
            key,
            value: body[key],
            updatedBy: user.nama
          },
          update: {
            value: body[key],
            updatedBy: user.nama
          }
        });
        updatedSettings[key] = setting.value;
      }
    }

    await logAudit(c, 'update_app_settings', 'app_settings', 'config', null, updatedSettings);

    return c.json(updatedSettings);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /logo - Upload company logo (admin only)
appSettingsRouter.post('/logo', authMiddleware, roleMiddleware(['admin']), async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    const file: any = body.file;

    if (!file || typeof file === 'string') {
      return c.json({ error: 'File logo wajib diunggah' }, 400);
    }

    const fileSize = file.size || 0;
    if (fileSize > 2 * 1024 * 1024) {
      return c.json({ error: 'Ukuran file logo melebihi 2MB' }, 400);
    }

    const originalName = file.name || 'logo.png';
    const ext = path.extname(originalName).toLowerCase() || '.png';
    if (!['.png', '.jpg', '.jpeg', '.svg'].includes(ext)) {
      return c.json({ error: 'Format logo harus PNG, JPG, atau SVG' }, 400);
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'logo');
    await fs.mkdir(uploadDir, { recursive: true });

    // Clean old logos to prevent junk buildup
    try {
      const files = await fs.readdir(uploadDir);
      for (const f of files) {
        await fs.unlink(path.join(uploadDir, f));
      }
    } catch (e) {
      // ignore folder read errors if empty
    }

    const fileName = `logo_${Date.now()}${ext}`;
    const destPath = path.join(uploadDir, fileName);
    const logoUrl = `/public/uploads/logo/${fileName}`;

    let buffer: Buffer;
    if (typeof file.arrayBuffer === 'function') {
      const fileBytes = await file.arrayBuffer();
      buffer = Buffer.from(fileBytes);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else {
      return c.json({ error: 'Format data file tidak valid' }, 400);
    }

    await fs.writeFile(destPath, buffer);

    const user = (c as any).get('user');

    // Save to settings db
    await prisma.appSetting.upsert({
      where: { key: 'logo_url' },
      create: {
        key: 'logo_url',
        value: logoUrl,
        updatedBy: user.nama
      },
      update: {
        value: logoUrl,
        updatedBy: user.nama
      }
    });

    await logAudit(c, 'upload_logo', 'app_settings', 'logo_url', null, { logo_url: logoUrl });

    return c.json({ logo_url: logoUrl });
  } catch (err: any) {
    console.error('Logo upload error:', err);
    return c.json({ error: err.message || 'Gagal mengunggah logo' }, 500);
  }
});

// POST /favicon - Upload website favicon (admin only)
appSettingsRouter.post('/favicon', authMiddleware, roleMiddleware(['admin']), async (c) => {
  try {
    const body = await c.req.parseBody({ all: true });
    const file: any = body.file;

    if (!file || typeof file === 'string') {
      return c.json({ error: 'File favicon wajib diunggah' }, 400);
    }

    const fileSize = file.size || 0;
    if (fileSize > 2 * 1024 * 1024) {
      return c.json({ error: 'Ukuran file favicon melebihi 2MB' }, 400);
    }

    const originalName = file.name || 'favicon.png';
    const ext = path.extname(originalName).toLowerCase() || '.png';
    if (!['.ico', '.png', '.svg', '.jpg', '.jpeg'].includes(ext)) {
      return c.json({ error: 'Format favicon harus ICO, PNG, SVG, atau JPG' }, 400);
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'favicon');
    await fs.mkdir(uploadDir, { recursive: true });

    // Clean old favicons to prevent junk buildup
    try {
      const files = await fs.readdir(uploadDir);
      for (const f of files) {
        await fs.unlink(path.join(uploadDir, f));
      }
    } catch (e) {
      // ignore folder read errors
    }

    const fileName = `favicon_${Date.now()}${ext}`;
    const destPath = path.join(uploadDir, fileName);
    const faviconUrl = `/public/uploads/favicon/${fileName}`;

    let buffer: Buffer;
    if (typeof file.arrayBuffer === 'function') {
      const fileBytes = await file.arrayBuffer();
      buffer = Buffer.from(fileBytes);
    } else if (Buffer.isBuffer(file)) {
      buffer = file;
    } else {
      return c.json({ error: 'Format data file tidak valid' }, 400);
    }

    await fs.writeFile(destPath, buffer);

    const user = (c as any).get('user');

    // Save to settings db
    await prisma.appSetting.upsert({
      where: { key: 'favicon_url' },
      create: {
        key: 'favicon_url',
        value: faviconUrl,
        updatedBy: user.nama
      },
      update: {
        value: faviconUrl,
        updatedBy: user.nama
      }
    });

    await logAudit(c, 'upload_favicon', 'app_settings', 'favicon_url', null, { favicon_url: faviconUrl });

    return c.json({ favicon_url: faviconUrl });
  } catch (err: any) {
    console.error('Favicon upload error:', err);
    return c.json({ error: err.message || 'Gagal mengunggah favicon' }, 500);
  }
});
