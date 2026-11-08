import crypto from 'node:crypto';
import prisma from '../db/prisma.js';
import { signAccessToken, verifyAccessToken } from './jwt.js';

export function accessIdentity(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Missing session');
  const payload = verifyAccessToken(authorization.slice(7));
  if (typeof payload.userId !== 'string' || !payload.userId || typeof payload.sessionId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(payload.sessionId) || !Number.isInteger(payload.version)) throw new Error('Sign in again');
  return payload;
}

export async function issueSession(user, tx = prisma) {
  const sessionId = crypto.randomUUID();
  const token = signAccessToken({ userId: user.id, sessionId, version: user.sessionVersion });
  const payload = verifyAccessToken(token);
  await tx.authSession.create({ data: { id: sessionId, userId: user.id, version: user.sessionVersion, expiresAt: new Date(payload.exp * 1000) } });
  return token;
}

export async function authenticatedUser(identity) {
  const session = await prisma.authSession.findFirst({ where: {
    id: identity.sessionId, userId: identity.userId, version: identity.version, revokedAt: null, expiresAt: { gt: new Date() },
    user: { sessionVersion: identity.version },
  }, include: { user: true } });
  return session?.user ?? null;
}

export const publicUser = user => ({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, emailVerifiedAt: user.emailVerifiedAt });
export const emailAddress = value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254 ? value.trim().toLowerCase() : null;
export const tokenHash = value => crypto.createHash('sha256').update(value).digest('hex');
