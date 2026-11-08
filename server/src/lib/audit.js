import { getRequestContext } from './requestContext.js';
export function audit(tx, workspaceId, action, entityId, data, reason, actorId = getRequestContext().userId) {
  if (!actorId) throw new Error('An authenticated actor is required for accounting changes.');
  return tx.auditEvent.create({ data: { workspaceId, actorId, action, entityId, data: JSON.parse(JSON.stringify(data)), reason } });
}
