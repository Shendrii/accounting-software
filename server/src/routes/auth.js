import crypto from 'node:crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import prisma, { prismaUnscoped } from '../db/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { issueSession, publicUser, emailAddress, tokenHash } from '../lib/authSession.js';
import { requireAuth } from '../middleware/auth.js';
import { isEmailConfigured, sendAccountEmail } from '../lib/sendEmail.js';
import { ledgerTransaction } from '../lib/ledger.js';
import jwt from 'jsonwebtoken';

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
    const { name, password } = req.body;
    const email = emailAddress(req.body.email);
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || !email || typeof password !== 'string') {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 8 || password.length > 128) {
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

    const token = await issueSession(user.createdUser);
    res.status(201).json({
      token,
      user: publicUser(user.createdUser),
      workspace: user.workspace,
    });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Email already registered. Sign in or recover your password.' });
    res.status(500).json({ error: 'Signup failed' });
  }
});

router.post('/login', authWriteLimiter, async (req, res) => {
  try {
    const email = emailAddress(req.body.email);
    const { password } = req.body;
    if (!email || typeof password !== 'string' || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { workspaceMembers: { include: { workspace: true }, orderBy: { createdAt: 'asc' } } },
    });
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = await issueSession(user);
    res.json({
      token,
      user: publicUser(user),
      workspaces: user.workspaceMembers.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        currency: m.workspace.currency, country: m.workspace.country, setupCompletedAt: m.workspace.setupCompletedAt,
        role: m.role, memberCanPost: m.workspace.memberCanPost, requireJournalApproval: m.workspace.requireJournalApproval,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try { res.json(await sessionPayload(prisma, req.user)); }
  catch { res.status(503).json({ error: 'Account could not load. Try again.' }); }
});

router.post('/logout', requireAuth, async (req, res) => {
  await prisma.authSession.updateMany({ where: { id: req.sessionId, userId: req.user.id }, data: { revokedAt: new Date() } });
  res.json({ success: true });
});

async function sessionPayload(tx, user) {
  const memberships = await tx.workspaceMember.findMany({ where: { userId: user.id }, include: { workspace: true }, orderBy: { createdAt: 'asc' } });
  return { user: publicUser(user), workspaces: memberships.map(m => ({ id: m.workspace.id, name: m.workspace.name,
    type: m.workspace.type, currency: m.workspace.currency, country: m.workspace.country, setupCompletedAt: m.workspace.setupCompletedAt, role: m.role, memberCanPost: m.workspace.memberCanPost, requireJournalApproval: m.workspace.requireJournalApproval })) };
}
const secret = () => process.env.JWT_ACCESS_SECRET;
const clientBase = () => process.env.APP_CLIENT_URL?.trim().replace(/\/$/, '');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/google', maxAge: 600000 });

async function beginGoogle(req, res, linkUser = null) {
  const challenge = req.method === 'POST' ? req.body.challenge : req.query.challenge;
  if (!validToken(challenge)) return res.status(400).json({ error: 'Start Google sign-in from Accountrix.' });
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim(); const redirectUri = process.env.GOOGLE_CALLBACK_URL?.trim();
  if (!clientId || !redirectUri || !process.env.GOOGLE_CLIENT_SECRET?.trim() || !clientBase()) return res.status(503).json({ error: 'Google OAuth is not configured' });
  const state = randomToken(); const verifier = randomToken();
  await prisma.authAction.create({ data: { purpose: 'OAUTH', tokenHash: tokenHash(state), expiresAt: new Date(Date.now() + 600000),
    payload: { challenge, linkUserId: linkUser?.id ?? null, version: linkUser?.sessionVersion ?? null, sessionId: req.sessionId ?? null } } });
  res.cookie('accountrix_oauth', jwt.sign({ purpose: 'oauth', state, verifier }, secret(), { expiresIn: '10m' }), cookieOptions());
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
    state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account' });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
  return res.redirect(url);
}
router.get('/google/start', async (req, res) => {
  if (!req.query.link) return beginGoogle(req, res);
  if (!validToken(req.query.link)) return res.status(400).json({ error: 'Start account linking from Settings.' });
  const action = await prisma.authAction.findUnique({ where: { tokenHash: tokenHash(req.query.link) }, include: { user: true } });
  if (!action || action.purpose !== 'GOOGLE_LINK' || action.usedAt || action.expiresAt <= new Date() || action.payload.challenge !== req.query.challenge || !action.user?.emailVerifiedAt || action.user.sessionVersion !== action.payload.version) return res.status(400).json({ error: 'Account linking expired. Start again from Settings.' });
  const consumed = await prisma.authAction.updateMany({ where: { id: action.id, usedAt: null }, data: { usedAt: new Date() } });
  if (consumed.count !== 1) return res.status(400).json({ error: 'Account linking was already started.' });
  req.sessionId = action.payload.sessionId;
  return beginGoogle(req, res, action.user);
});
router.post('/google/link', authWriteLimiter, requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user.emailVerifiedAt) return res.status(403).json({ error: 'Verify your email before linking Google.' });
  if (!user.passwordHash || typeof req.body.password !== 'string' || !await verifyPassword(req.body.password, user.passwordHash)) {
    return res.status(403).json({ error: 'Confirm your current password to link Google.' });
  }
  if (!validToken(req.body.challenge)) return res.status(400).json({ error: 'Start account linking from Settings.' });
  const token = randomToken();
  await prisma.authAction.create({ data: { purpose: 'GOOGLE_LINK', userId: user.id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 60000), payload: { challenge: req.body.challenge, version: user.sessionVersion, sessionId: req.sessionId } } });
  const startUrl = new URL('/api/auth/google/start', process.env.GOOGLE_CALLBACK_URL);
  startUrl.searchParams.set('link', token); startUrl.searchParams.set('challenge', req.body.challenge);
  return res.json({ url: startUrl.toString() });
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const cookie = jwt.verify(req.cookies.accountrix_oauth || '', secret());
    res.clearCookie('accountrix_oauth', cookieOptions());
    if (cookie.purpose !== 'oauth' || !validToken(state) || state !== cookie.state || typeof code !== 'string' || !code || code.length > 4096) {
      return res.status(400).json({ error: 'Google sign-in expired or did not start in this browser. Start again.' });
    }
    const flow = await prisma.authAction.findUnique({ where: { tokenHash: tokenHash(state) } });
    if (!flow || flow.purpose !== 'OAUTH' || flow.usedAt || flow.expiresAt <= new Date()) return res.status(400).json({ error: 'Google sign-in expired. Start again.' });
    const consumed = await prisma.authAction.updateMany({ where: { id: flow.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) return res.status(400).json({ error: 'Google sign-in was already completed.' });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
        redirect_uri: process.env.GOOGLE_CALLBACK_URL.trim(), grant_type: 'authorization_code', code_verifier: cookie.verifier }) });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok || !tokens.access_token) throw new Error('Google exchange failed');
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
    const profile = await profileRes.json(); const email = emailAddress(profile.email);
    if (!profileRes.ok || typeof profile.sub !== 'string' || !profile.sub || !email || profile.email_verified !== true) {
      return res.status(400).json({ error: 'Google must provide a verified email address.' });
    }
    const result = await ledgerTransaction(async tx => {
      const provider = await tx.authProvider.findFirst({ where: { provider: 'GOOGLE', providerAccountId: profile.sub } });
      let user = provider ? await tx.user.findUnique({ where: { id: provider.userId } }) : null;
      if (provider && !user) throw new Error('Linked account no longer exists.');
      if (provider && user.email.toLowerCase() !== email && !flow.payload.linkUserId) {
        const conflict = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, id: { not: user.id } } });
        // A stable provider subject remains authoritative; a renamed email never merges accounts.
        user = await tx.user.update({ where: { id: user.id }, data: conflict ? { emailVerifiedAt: null } : { email, emailVerifiedAt: new Date(), sessionVersion: { increment: 1 } } });
      }
      if (flow.payload.linkUserId) {
        const linking = await tx.user.findUnique({ where: { id: flow.payload.linkUserId } });
        const session = await tx.authSession.findFirst({ where: { id: flow.payload.sessionId, userId: linking?.id, revokedAt: null, expiresAt: { gt: new Date() } } });
        if (!linking || !session || !linking.emailVerifiedAt || linking.sessionVersion !== flow.payload.version || linking.email.toLowerCase() !== email || provider && provider.userId !== linking.id) {
          throw new Error('Account linking expired or identities do not match.');
        }
        user = linking;
      } else if (!provider) {
        const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
        if (existing) return { conflict: true };
        user = await tx.user.create({ data: { email, name: profile.name || email.split('@')[0], avatarUrl: profile.picture || null, emailVerifiedAt: new Date() } });
        await tx.workspace.create({ data: { name: user.name + "'s Workspace", slug: slugifyWorkspace(user.name), type: 'PERSONAL', ownerUserId: user.id,
          members: { create: { userId: user.id, role: 'OWNER' } } } });
      }
      if (!provider) await tx.authProvider.create({ data: { userId: user.id, provider: 'GOOGLE', providerAccountId: profile.sub } });
      if (user.email.toLowerCase() === email) user = await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } });
      const ticket = randomToken();
      await tx.authAction.create({ data: { purpose: 'GOOGLE_HANDOFF', tokenHash: tokenHash(ticket), userId: user.id,
        payload: { challenge: flow.payload.challenge, version: user.sessionVersion }, expiresAt: new Date(Date.now() + 60000) } });
      return { ticket };
    });
    if (result.conflict) return res.redirect(clientBase() + '/auth/callback#error=account_exists');
    return res.redirect(clientBase() + '/auth/callback#ticket=' + result.ticket);
  } catch {
    res.status(400).json({ error: 'Google sign-in could not finish. Start again from Accountrix.' });
  }
});

router.post('/google/complete', authWriteLimiter, async (req, res) => {
  try {
    const { ticket, verifier } = req.body;
    if (!validToken(ticket) || !validToken(verifier)) return res.status(400).json({ error: 'Start sign-in again in this browser.' });
    const result = await ledgerTransaction(async tx => {
      const action = await tx.authAction.findUnique({ where: { tokenHash: tokenHash(ticket) } });
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      if (!action || action.purpose !== 'GOOGLE_HANDOFF' || action.usedAt || action.expiresAt <= new Date() || action.payload.challenge !== challenge) return null;
      const user = await tx.user.findUnique({ where: { id: action.userId } });
      if (!user || user.sessionVersion !== action.payload.version) return null;
      const consumed = await tx.authAction.updateMany({ where: { id: action.id, usedAt: null }, data: { usedAt: new Date() } });
      if (consumed.count !== 1) return null;
      return { ...await sessionPayload(tx, user), token: await issueSession(user, tx) };
    });
    if (!result) return res.status(400).json({ error: 'Sign-in expired or belongs to another browser. Start again.' });
    res.set('Cache-Control', 'no-store').json(result);
  } catch { res.status(400).json({ error: 'Sign-in could not finish. Start again.' }); }
});

async function requestEmailAction(user, purpose) {
  user = await prisma.user.findUnique({ where: { id: user.id } });
  const token = randomToken();
  await prisma.authAction.create({ data: { userId: user.id, purpose, tokenHash: tokenHash(token), payload: { email: user.email, version: user.sessionVersion }, expiresAt: new Date(Date.now() + 3600000) } });
  await sendAccountEmail({ to: user.email, purpose, url: clientBase() + (purpose === 'VERIFY_EMAIL' ? '/verify-email' : '/reset-password') + '#token=' + token });
}
router.post('/verification/request', authWriteLimiter, requireAuth, async (req, res) => {
  if (req.user.emailVerifiedAt) return res.json({ verified: true });
  if (!isEmailConfigured() || !clientBase()) return res.status(503).json({ error: 'Email delivery is unavailable. Contact the workspace owner.' });
  try { await requestEmailAction(req.user, 'VERIFY_EMAIL'); res.json({ sent: true }); }
  catch { res.status(503).json({ error: 'Verification email could not send. Try again.' }); }
});
router.post('/password/request', authWriteLimiter, async (req, res) => {
  if (!isEmailConfigured() || !clientBase()) return res.status(503).json({ error: 'Email recovery is unavailable. Try Google sign-in or contact support.' });
  const email = emailAddress(req.body.email);
  if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (user) await requestEmailAction(user, 'RESET_PASSWORD');
    res.json({ sent: true });
  } catch { res.status(503).json({ error: 'Recovery email could not send. Try again.' }); }
});
async function consumeEmailAction(req, res, purpose) {
  const { token, password } = req.body;
  if (!validToken(token) || purpose === 'RESET_PASSWORD' && (typeof password !== 'string' || password.length < 8 || password.length > 128)) {
    return res.status(400).json({ error: 'Use a valid email link and a password of 8–128 characters.' });
  }
  const passwordHash = purpose === 'RESET_PASSWORD' ? await hashPassword(password) : null;
  const result = await ledgerTransaction(async tx => {
    const action = await tx.authAction.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
    if (!action || action.purpose !== purpose || action.usedAt || action.expiresAt <= new Date() || action.user?.email !== action.payload.email || action.user.sessionVersion !== action.payload.version) return false;
    const consumed = await tx.authAction.updateMany({ where: { id: action.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: action.userId }, data: { emailVerifiedAt: new Date(), ...(passwordHash && { passwordHash, sessionVersion: { increment: 1 } }) } });
    if (passwordHash) await tx.authProvider.upsert({ where: { provider_providerAccountId: { provider: 'LOCAL', providerAccountId: action.userId } },
      create: { userId: action.userId, provider: 'LOCAL', providerAccountId: action.userId }, update: {} });
    return true;
  });
  if (!result) return res.status(400).json({ error: 'This email link expired or was already used. Request a new one.' });
  res.json({ success: true });
}
router.post('/verification/confirm', authWriteLimiter, (req, res) => consumeEmailAction(req, res, 'VERIFY_EMAIL'));
router.post('/password/reset', authWriteLimiter, (req, res) => consumeEmailAction(req, res, 'RESET_PASSWORD'));

export default router;
