import prisma from '../db/prisma.js';
import { withRequestContext } from '../lib/requestContext.js';

export async function requireWorkspace(req, res, next) {
  try {
    const requestedWorkspaceId = req.headers['x-workspace-id'];
    let membership;

    if (requestedWorkspaceId) {
      membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: String(requestedWorkspaceId), userId: req.user.id },
        include: { workspace: true },
      });
    } else {
      membership = await prisma.workspaceMember.findFirst({
        where: { userId: req.user.id },
        include: { workspace: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!membership) {
      return res.status(403).json({ error: 'No accessible workspace' });
    }

    req.workspace = {
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      type: membership.workspace.type,
    };

    withRequestContext({ userId: req.user.id, workspaceId: membership.workspace.id }, () => next());
  } catch (error) {
    res.status(500).json({ error: 'Failed to resolve workspace' });
  }
}

