import { Context, Next } from 'hono';

export interface RateLimitOptions {
  windowMs: number;       // Time window in milliseconds (e.g. 60_000 for 1 min)
  max: number;            // Maximum number of connections during windowMs
  message?: string;       // Custom error message
  keyGenerator?: (c: Context) => string; // Function to generate a unique key
  skip?: (c: Context) => boolean;        // Optional condition to skip rate limiting
}

interface ClientRecord {
  hits: number;
  resetTime: number; // Unix timestamp in ms
}

/**
 * In-Memory Sliding Window Rate Limiter for Hono Framework.
 * Uses a token/counter map with automatic cleanup to prevent memory leaks.
 */
export function rateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    message = 'Terlalu banyak permintaan. Silakan tunggu beberapa saat sebelum mencoba kembali.',
    keyGenerator = defaultKeyGenerator,
    skip = () => false
  } = options;

  const store = new Map<string, ClientRecord>();

  // Cleanup expired entries periodically (every 2 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, Math.max(windowMs * 2, 60_000));

  // Allow Node to exit cleanly without keeping interval alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return async function rateLimitMiddleware(c: Context, next: Next) {
    // Check if skipped (e.g. in specific test environments if configured)
    if (skip(c)) {
      return await next();
    }

    const key = keyGenerator(c);
    const now = Date.now();

    let record = store.get(key);

    if (!record || now > record.resetTime) {
      record = {
        hits: 1,
        resetTime: now + windowMs
      };
      store.set(key, record);
    } else {
      record.hits += 1;
    }

    const remaining = Math.max(0, max - record.hits);
    const resetSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));

    // Standard RFC RateLimit headers
    c.header('RateLimit-Limit', String(max));
    c.header('RateLimit-Remaining', String(remaining));
    c.header('RateLimit-Reset', String(resetSeconds));

    if (record.hits > max) {
      c.header('Retry-After', String(resetSeconds));
      return c.json(
        {
          error: 'Too Many Requests',
          message: `${message} (Tunggu ${resetSeconds} detik)`,
          retryAfter: resetSeconds
        },
        429
      );
    }

    await next();
  };
}

/**
 * Extracts client IP address safely from standard headers
 */
export function getClientIp(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    '127.0.0.1'
  );
}

function defaultKeyGenerator(c: Context): string {
  const ip = getClientIp(c);
  return `${ip}:${c.req.path}`;
}

// --- Specific Preconfigured Rate Limiters ---

/**
 * Strict Rate Limiter for Login Attempts (10 requests per 1 minute per IP)
 */
export const authLoginRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Terlalu banyak percobaan login yang gagal.',
  keyGenerator: (c) => `auth_login:${getClientIp(c)}`
});

/**
 * Rate Limiter for Account Registration & Forgot Password (5 requests per 1 minute per IP)
 */
export const authRegisterRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Terlalu banyak permintaan pendaftaran / reset password.',
  keyGenerator: (c) => `auth_register:${getClientIp(c)}`
});

/**
 * Rate Limiter for CBS & Payment Bulk Import Operations (15 requests per 1 minute)
 */
export const importRateLimiter = rateLimiter({
  windowMs: 60 * 1000,
  max: 15,
  message: 'Terlalu banyak permintaan impor data.',
  keyGenerator: (c) => {
    const user = c.get('user' as any) as any;
    const identifier = user ? user.id : getClientIp(c);
    return `import_ops:${identifier}`;
  }
});
