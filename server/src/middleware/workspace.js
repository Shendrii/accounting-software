import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { accessIdentity } from '../lib/authSession.js';
import { withRequestContext } from '../lib/requestContext.js';

export async function requireWorkspace(req, res, next) {
  let identity;
  try {
    identity = accessIdentity(req);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const requested = req.headers['x-workspace-id'];
    const workspaceFilter = requested ? Prisma.sql`AND m."workspaceId" = ${String(requested)}` : Prisma.empty;
    // Check the current user and membership together without caching authorization.
    const [session] = await prisma.$queryRaw`
      SELECT u."id", u."email", u."name",
        membership."workspaceId", membership."workspaceName", membership."type", membership."role", membership."currency", membership."country", membership."setupCompletedAt", membership."legalName", membership."memberCanPost", membership."requireJournalApproval"
      FROM "User" u
      JOIN "AuthSession" s ON s."userId" = u."id" AND s."id" = ${identity.sessionId}
        AND s."version" = u."sessionVersion" AND s."version" = ${identity.version}
        AND s."revokedAt" IS NULL AND s."expiresAt" > CURRENT_TIMESTAMP
      LEFT JOIN LATERAL (
        SELECT m."workspaceId", w."name" AS "workspaceName", w."type", m."role", w."currency", w."country", w."setupCompletedAt", w."legalName", w."memberCanPost", w."requireJournalApproval"
        FROM "WorkspaceMember" m JOIN "Workspace" w ON w."id" = m."workspaceId"
        WHERE m."userId" = u."id" ${workspaceFilter}
        ORDER BY m."createdAt" ASC, m."id" ASC LIMIT 1
      ) membership ON true
      WHERE u."id" = ${identity.userId}
    `;
    if (!session) return res.status(401).json({ error: 'Invalid token user' });
    if (!session.workspaceId) return res.status(403).json({ error: 'No accessible workspace' });
    if (session.role === 'VIEWER' && !['GET','HEAD','OPTIONS'].includes(req.method)) return res.status(403).json({ error: 'This workspace role is read-only.' });

    req.user = { id: session.id, email: session.email, name: session.name };
    req.workspace = { id: session.workspaceId, name: session.workspaceName, type: session.type, role: session.role, currency: session.currency, country: session.country, setupCompletedAt: session.setupCompletedAt, memberCanPost: session.memberCanPost, requireJournalApproval: session.requireJournalApproval };
    req.accountingContext={ userId: session.id, sessionId: identity.sessionId, sessionVersion: identity.version, method: req.method, workspaceId: session.workspaceId, currency: session.currency, legalName: session.legalName ?? session.workspaceName };
    withRequestContext(req.accountingContext, () => next());
  } catch (error) {
    console.error('Workspace authentication failed:', error);
    res.status(503).json({ error: 'The workspace could not load. Try again shortly.' });
  }
}

// Multipart parsers finish through request-stream callbacks created before this
// middleware. Re-enter the authenticated scope after parsing and before writes.
export function restoreWorkspaceContext(req,res,next){
  if(!req.accountingContext)return res.status(401).json({error:'Authenticated workspace context is required.'});
  return withRequestContext(req.accountingContext,()=>next());
}
