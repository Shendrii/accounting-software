import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import prisma, { prismaUnscoped } from '../db/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signAccessToken, verifyAccessToken } from '../lib/jwt.js';

const router = express.Router();

const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 25),
  standardHeaders: true,
  legacyHeaders: false,
});

function slugifyWorkspace(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-${crypto.randomBytes(3).toString('hex')}`;
}

router.post('/signup', authWriteLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name, email, passwordHash },
      });

      const workspace = await tx.workspace.create({
        data: {
          name: `${name}'s Workspace`,
          slug: slugifyWorkspace(name),
          type: 'PERSONAL',
          ownerUserId: createdUser.id,
        },
      });

      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: createdUser.id, role: 'OWNER' },
      });

      await tx.authProvider.create({
        data: { userId: createdUser.id, provider: 'LOCAL', providerAccountId: createdUser.id },
      });

      return { createdUser, workspace };
    });

    const token = signAccessToken({ userId: user.createdUser.id });
    res.status(201).json({
      token,
      user: { id: user.createdUser.id, email: user.createdUser.email, name: user.createdUser.name },
      workspace: user.workspace,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Signup failed' });
  }
});

router.post('/login', authWriteLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { workspaceMembers: { include: { workspace: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signAccessToken({ userId: user.id });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      workspaces: user.workspaceMembers.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        currency: m.workspace.currency, country: m.workspace.country, setupCompletedAt: m.workspace.setupCompletedAt,
        role: m.role,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { workspaceMembers: { include: { workspace: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl },
      workspaces: user.workspaceMembers.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        currency: m.workspace.currency, country: m.workspace.country, setupCompletedAt: m.workspace.setupCompletedAt,
        role: m.role,
      })),
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/logout', async (req, res) => {
  res.json({ success: true });
});

// Minimal OAuth start/callback stubs (can be wired with full consent flow later)
router.get('/google/start', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = process.env.GOOGLE_CALLBACK_URL?.trim();
  if (!clientId || !redirectUri) {
    return res.status(503).json({ error: 'Google OAuth is not configured' });
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing OAuth code' });
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.GOOGLE_CALLBACK_URL?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(503).json({ error: 'Google OAuth is not configured' });
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      const hint =
        tokenJson.error_description ||
        tokenJson.error ||
        `Token HTTP ${tokenRes.status}`;
      return res.status(400).json({ error: `Failed to exchange Google code: ${hint}` });
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.sub || !profile.email) {
      return res.status(400).json({ error: 'Failed to fetch Google profile' });
    }

    // Interactive $transaction + $extends can fail in some Prisma versions; OAuth has no workspace ALS context.
    const result = await prismaUnscoped.$transaction(async (tx) => {
      const existingProvider = await tx.authProvider.findFirst({
        where: { provider: 'GOOGLE', providerAccountId: profile.sub },
      });

      if (existingProvider) {
        const user = await tx.user.findUnique({ where: { id: existingProvider.userId } });
        if (!user) throw new Error('Google login linked to a deleted user; contact support.');
        const memberships = await tx.workspaceMember.findMany({
          where: { userId: user.id },
          include: { workspace: true },
          orderBy: { createdAt: 'asc' },
        });
        return { user, memberships };
      }

      let user = await tx.user.findUnique({ where: { email: profile.email } });
      if (!user) {
        user = await tx.user.create({
          data: {
            email: profile.email,
            name: profile.name || profile.email.split('@')[0],
            avatarUrl: profile.picture || null,
          },
        });

        const workspace = await tx.workspace.create({
          data: {
            name: `${user.name}'s Workspace`,
            slug: slugifyWorkspace(user.name),
            type: 'PERSONAL',
            ownerUserId: user.id,
          },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: user.id, role: 'OWNER' },
        });
      }

      try {
        await tx.authProvider.create({
          data: {
            userId: user.id,
            provider: 'GOOGLE',
            providerAccountId: profile.sub,
          },
        });
      } catch (e) {
        if (e?.code === 'P2002') {
          const row = await tx.authProvider.findFirst({
            where: { provider: 'GOOGLE', providerAccountId: profile.sub },
          });
          if (row) user = await tx.user.findUnique({ where: { id: row.userId } });
        } else {
          throw e;
        }
      }

      if (!user) throw new Error('Could not resolve user after Google link');

      const memberships = await tx.workspaceMember.findMany({
        where: { userId: user.id },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
      });
      return { user, memberships };
    });

    const accessToken = signAccessToken({ userId: result.user.id });
    const payload = {
      token: accessToken,
      user: { id: result.user.id, email: result.user.email, name: result.user.name, avatarUrl: result.user.avatarUrl },
      workspaces: result.memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        currency: m.workspace.currency, country: m.workspace.country, setupCompletedAt: m.workspace.setupCompletedAt,
        role: m.role,
      })),
    };

    const clientBase = process.env.APP_CLIENT_URL?.trim().replace(/\/$/, '');
    const wantsJson = req.query.format === 'json';
    if (clientBase && !wantsJson) {
      const sessionB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
      return res.redirect(302, `${clientBase}/auth/callback#session=${sessionB64}`);
    }

    res.json(payload);
  } catch (error) {
    console.error('[google/callback]', error);
    const detail =
      process.env.NODE_ENV === 'development' ? error?.message || String(error) : undefined;
    res.status(500).json({
      error: 'Google OAuth callback failed',
      ...(detail && { detail }),
    });
  }
});

export default router;

