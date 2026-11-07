import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { withRequestContext } from '../lib/requestContext.js';

export async function requireWorkspace(req, res, next) {
  let userId;
  try {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    const payload = verifyAccessToken(authorization.slice(7));
    if (typeof payload.userId !== 'string' || !payload.userId) throw new Error('Invalid token user');
    userId = payload.userId;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const requested = req.headers['x-workspace-id'];
    const workspaceFilter = requested ? Prisma.sql`AND m."workspaceId" = ${String(requested)}` : Prisma.empty;
    // Check the current user and membership together without caching authorization.
    const [session] = await prisma.$queryRaw`
      SELECT u."id", u."email", u."name",
        membership."workspaceId", membership."workspaceName", membership."type", membership."role"
      FROM "User" u
      LEFT JOIN LATERAL (
        SELECT m."workspaceId", w."name" AS "workspaceName", w."type", m."role"
        FROM "WorkspaceMember" m JOIN "Workspace" w ON w."id" = m."workspaceId"
        WHERE m."userId" = u."id" ${workspaceFilter}
        ORDER BY m."createdAt" ASC, m."id" ASC LIMIT 1
      ) membership ON true
      WHERE u."id" = ${userId}
    `;
    if (!session) return res.status(401).json({ error: 'Invalid token user' });
    if (!session.workspaceId) return res.status(403).json({ error: 'No accessible workspace' });

    req.user = { id: session.id, email: session.email, name: session.name };
    req.workspace = { id: session.workspaceId, name: session.workspaceName, type: session.type, role: session.role };
    withRequestContext({ userId: session.id, workspaceId: session.workspaceId }, () => next());
  } catch (error) {
    console.error('Workspace authentication failed:', error);
    res.status(503).json({ error: 'The workspace could not load. Try again shortly.' });
  }
}
