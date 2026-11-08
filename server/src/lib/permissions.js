import { LedgerError } from './ledger.js';
import { getRequestContext } from './requestContext.js';
export function permissions(role, policy = {}) {
  const admin = ['OWNER','ADMIN'].includes(role); const reviewer = role === 'APPROVER';
  return { owner: role === 'OWNER', manageBooks: admin, manageTeam: admin, prepare: admin || reviewer || role === 'MEMBER',
    post: admin || reviewer || role === 'MEMBER' && policy.memberCanPost === true, correct: admin || reviewer, close: admin || reviewer };
}
export function demand(req, permission) {
  if (!permissions(req.workspace.role, req.workspace)[permission]) throw new LedgerError('Your workspace role does not allow this accounting action. Ask an owner or reviewer.',403);
  getRequestContext().requiredPermission = permission;
}
export function assertPermission(permission) {
  const context = getRequestContext();
  if (!context.authorization || !permissions(context.authorization.role, context.authorization)[permission]) throw new LedgerError('Your current workspace role does not allow this action.',403);
}
