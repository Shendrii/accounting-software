import crypto from 'node:crypto';
import express from 'express';
import prisma from '../db/prisma.js';
import { isSmtpConfigured, sendInviteEmail } from '../lib/sendEmail.js';

const router = express.Router();

function slugifyWorkspace(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-${crypto.randomBytes(3).toString('hex')}`;
}

router.get('/', async (req, res) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user.id },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        role: m.role,
        ownerUserId: m.workspace.ownerUserId,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to fetch workspaces' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug: slugifyWorkspace(name),
        type: 'TEAM',
        ownerUserId: req.user.id,
        members: { create: [{ userId: req.user.id, role: 'OWNER' }] },
      },
    });
    res.status(201).json(workspace);
  } catch {
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

router.get('/members/:workspaceId', async (req, res) => {
  try {
    const own = await prisma.workspaceMember.findFirst({
      where: { workspaceId: req.params.workspaceId, userId: req.user.id },
    });
    if (!own) return res.status(403).json({ error: 'Forbidden' });
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(members);
  } catch {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

router.get('/:workspaceId/invitations', async (req, res) => {
  try {
    const workspaceId = req.params.workspaceId;
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user.id } },
      select: { role: true },
    });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
      return res.status(403).json({ error: 'Only owners and admins can view invitations' });
    }

    const invitations = await prisma.workspaceInvite.findMany({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invitations);
  } catch {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

router.post('/invite', async (req, res) => {
  try {
    const { workspaceId, email, role } = req.body;
    if (!workspaceId || !email) return res.status(400).json({ error: 'workspaceId and email are required' });

    const me = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: req.user.id },
    });
    if (!me || !['OWNER', 'ADMIN'].includes(me.role)) {
      return res.status(403).json({ error: 'Only owner/admin can invite members' });
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });

    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email,
        role: role ?? 'MEMBER',
        token: crypto.randomBytes(20).toString('hex'),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        invitedById: req.user.id,
      },
    });

    const clientBase = process.env.APP_CLIENT_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    const inviteUrl = `${clientBase}/invite?token=${invite.token}`;

    let emailSent = false;
    if (isSmtpConfigured()) {
      try {
        await sendInviteEmail({
          to: email,
          inviterName: req.user.name || req.user.email,
          workspaceName: workspace?.name || 'the workspace',
          inviteUrl,
        });
        emailSent = true;
      } catch (emailErr) {
        console.error('[invite email]', emailErr.message);
      }
    }

    res.status(201).json({
      ...invite,
      inviteUrl,
      emailSent,
    });
  } catch {
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

router.post('/accept-invite', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.acceptedAt) return res.status(400).json({ error: 'Invite already accepted' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });
    if (invite.email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(403).json({ error: 'Invite email does not match your account email' });
    }

    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: req.user.id,
          role: invite.role,
        },
      }),
      prisma.workspaceInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    res.json({ success: true });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'You are already a member' });
    res.status(500).json({ error: 'Failed to accept invite' });
  }
});

export default router;

