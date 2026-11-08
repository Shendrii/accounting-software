import crypto from 'node:crypto';
import express from 'express';
import prisma from '../db/prisma.js';
import { emailAddress } from '../lib/authSession.js';
import { withRequestContext, getRequestContext } from '../lib/requestContext.js';
import { LedgerError, ledgerTransaction, sendLedgerError } from '../lib/ledger.js';
import { audit } from '../lib/audit.js';
import { isSmtpConfigured, sendInviteEmail } from '../lib/sendEmail.js';

const router = express.Router();
const teamTransaction = (req,workspaceId,callback) => withRequestContext({workspaceId,userId:req.user.id,sessionId:req.sessionId,sessionVersion:req.sessionVersion,method:req.method,requiredPermission:'manageTeam'},()=>ledgerTransaction(callback));
const teamRoles=['ADMIN','APPROVER','MEMBER','VIEWER'];

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
        currency: m.workspace.currency, country: m.workspace.country, setupCompletedAt: m.workspace.setupCompletedAt,
        role: m.role,
        memberCanPost: m.workspace.memberCanPost, requireJournalApproval: m.workspace.requireJournalApproval,
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
    const { workspaceId } = req.body; const email=emailAddress(req.body.email);const role=req.body.role??'MEMBER';
    if (typeof workspaceId !== 'string' || !workspaceId || workspaceId.length > 120 || !email) return res.status(400).json({ error: 'workspaceId and email are required' });
    if(!req.user.emailVerifiedAt)return res.status(403).json({error:'Verify your email before inviting team members.'});
    if(!teamRoles.includes(role))return res.status(400).json({error:'Choose admin, reviewer, bookkeeper or read-only access. Ownership cannot be granted by invitation.'});

    const me = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: req.user.id },
    });
    if (!me || !['OWNER', 'ADMIN'].includes(me.role)) {
      return res.status(403).json({ error: 'Only owner/admin can invite members' });
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });

    const invite = await teamTransaction(req,workspaceId,async tx=>{
      if(role==='ADMIN'&&getRequestContext().authorization.role!=='OWNER')throw new LedgerError('Only the owner can grant admin access.',403);
      const created=await tx.workspaceInvite.create({
      data: {
        workspaceId,
        email,
        role: role ?? 'MEMBER',
        token: crypto.randomBytes(20).toString('hex'),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        invitedById: req.user.id,
      },
      });
      await audit(tx,workspaceId,'WORKSPACE_INVITED',created.id,{email,role});return created;
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
  } catch (error) {
    sendLedgerError(res,error,'Failed to create invite.');
  }
});

router.put('/:workspaceId/members/:memberId', async (req,res) => {
  try {
    const {workspaceId,memberId}=req.params;const {role}=req.body;
    if(!teamRoles.includes(role))throw new LedgerError('Choose admin, reviewer, bookkeeper or read-only access.',400);
    const result=await teamTransaction(req,workspaceId,async tx=>{
      const actor=getRequestContext().authorization.role;
      const member=await tx.workspaceMember.findFirst({where:{id:memberId,workspaceId}});
      if(!member)throw new LedgerError('Workspace member not found.',404);
      if(member.role==='OWNER')throw new LedgerError('Workspace ownership cannot be changed here.',403);
      if(actor!=='OWNER'&&(role==='ADMIN'||member.role==='ADMIN'))throw new LedgerError('Only the owner can change admin access.',403);
      const updated=await tx.workspaceMember.update({where:{id:member.id},data:{role}});
      await audit(tx,workspaceId,'MEMBER_ROLE_CHANGED',member.id,{userId:member.userId,before:member.role,after:role});return updated;
    });res.json(result);
  }catch(error){sendLedgerError(res,error,'Workspace role could not save.');}
});

router.post('/accept-invite', async (req, res) => {
  try {
    if (!req.user.emailVerifiedAt) return res.status(403).json({ error: 'Verify your email before accepting a workspace invitation.' });
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token is required' });

    const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.acceptedAt) return res.status(400).json({ error: 'Invite already accepted' });
    if (!teamRoles.includes(invite.role)) return res.status(400).json({ error: 'Ask the owner to reissue this invitation with a supported team role.' });
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

