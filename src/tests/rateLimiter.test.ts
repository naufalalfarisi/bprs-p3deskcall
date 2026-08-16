import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimiter } from '../middleware/rateLimiter.js';

describe('Rate Limiter Middleware Tests', () => {
  it('should allow requests within the specified limit', async () => {
    const app = new Hono();
    const limiter = rateLimiter({
      windowMs: 10_000,
      max: 3,
      keyGenerator: () => 'test_ip_1'
    });

    app.get('/test', limiter, (c) => c.text('OK'));

    // Req 1
    const res1 = await app.request('/test');
    expect(res1.status).toBe(200);
    expect(res1.headers.get('RateLimit-Remaining')).toBe('2');

    // Req 2
    const res2 = await app.request('/test');
    expect(res2.status).toBe(200);
    expect(res2.headers.get('RateLimit-Remaining')).toBe('1');

    // Req 3
    const res3 = await app.request('/test');
    expect(res3.status).toBe(200);
    expect(res3.headers.get('RateLimit-Remaining')).toBe('0');
  });

  it('should block requests exceeding the limit with 429 Too Many Requests', async () => {
    const app = new Hono();
    const limiter = rateLimiter({
      windowMs: 5_000,
      max: 2,
      message: 'Limit terlampaui',
      keyGenerator: () => 'test_ip_blocked'
    });

    app.get('/test', limiter, (c) => c.text('OK'));

    // 2 allowed requests
    await app.request('/test');
    await app.request('/test');

    // 3rd request should be blocked
    const resBlocked = await app.request('/test');
    expect(resBlocked.status).toBe(429);

    const body = await resBlocked.json();
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toContain('Limit terlampaui');
    expect(resBlocked.headers.get('Retry-After')).toBeDefined();
    expect(resBlocked.headers.get('RateLimit-Remaining')).toBe('0');
  });

  it('should isolate rate limits across different client IPs', async () => {
    const app = new Hono();
    let currentIp = 'ip_a';

    const limiter = rateLimiter({
      windowMs: 10_000,
      max: 1,
      keyGenerator: () => currentIp
    });

    app.get('/test', limiter, (c) => c.text('OK'));

    currentIp = 'ip_a';
    const resA1 = await app.request('/test');
    expect(resA1.status).toBe(200);

    const resA2 = await app.request('/test');
    expect(resA2.status).toBe(429); // IP A blocked

    // IP B should still be allowed
    currentIp = 'ip_b';
    const resB1 = await app.request('/test');
    expect(resB1.status).toBe(200);
  });
});
