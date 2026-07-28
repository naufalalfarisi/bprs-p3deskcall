import { Context, Next } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config.js';
import { prisma } from '../db.js';

const encoder = new TextEncoder();
const secretKey = encoder.encode(config.jwtSecret);

export interface TokenPayload {
  userId: string;
  username: string;
  posisi: string;
}

export async function createAccessToken(payload: TokenPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secretKey);
}

export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as TokenPayload;
  } catch (err) {
    return null;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized: Missing or invalid token format' }, 401);
  }

  const token = authHeader.substring(7);
  const payload = await verifyAccessToken(token);
  if (!payload) {
    return c.json({ error: 'Unauthorized: Token is expired or invalid' }, 401);
  }

  // Fetch the user to ensure status is active and verify role
  const user = await prisma.user.findUnique({
    where: { id: payload.userId }
  });

  if (!user || user.status !== 'active') {
    return c.json({ error: 'Unauthorized: User is inactive or does not exist' }, 401);
  }

  // Attach user to context
  c.set('user', user);
  await next();
}

export function roleMiddleware(allowedRoles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!allowedRoles.includes(user.posisi)) {
      return c.json({ error: 'Forbidden: Insufficient permissions for role ' + user.posisi }, 403);
    }

    await next();
  };
}
