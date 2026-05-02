import { PrismaClient } from '@prisma/client';
import { getRequestContext } from '../lib/requestContext.js';

const basePrisma = new PrismaClient();

const SCOPED_MODELS = new Set([
  'Account',
  'JournalEntry',
  'Receipt',
  'Customer',
  'Vendor',
  'Invoice',
  'Bill',
  'BankTransaction',
  'Reconciliation',
]);

function mergeWorkspaceWhere(where, workspaceId) {
  if (!workspaceId) return where ?? {};
  if (!where) return { workspaceId };
  if (where.workspaceId) return where;
  return { AND: [where, { workspaceId }] };
}

function modelDelegateName(model) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!SCOPED_MODELS.has(model)) return query(args);

        const { workspaceId } = getRequestContext();
        if (!workspaceId) return query(args);

        const merge = (where) => mergeWorkspaceWhere(where, workspaceId);

        if (operation === 'findUnique') {
          const key = modelDelegateName(model);
          return basePrisma[key].findFirst({
            ...args,
            where: merge(args.where),
          });
        }

        if (
          operation === 'findMany' ||
          operation === 'findFirst' ||
          operation === 'count' ||
          operation === 'aggregate' ||
          operation === 'groupBy'
        ) {
          return query({
            ...args,
            where: merge(args.where),
          });
        }

        if (operation === 'create') {
          return query({
            ...args,
            data: {
              ...args.data,
              workspaceId: args.data.workspaceId ?? workspaceId,
            },
          });
        }

        if (operation === 'createMany') {
          const rows = Array.isArray(args.data) ? args.data : [args.data];
          return query({
            ...args,
            data: rows.map((row) => ({
              ...row,
              workspaceId: row.workspaceId ?? workspaceId,
            })),
          });
        }

        return query(args);
      },
    },
  },
});

/** Same DB pool as default client; no workspace query extension. Use only where ALS has no workspace (e.g. OAuth callback). */
export const prismaUnscoped = basePrisma;

export default prisma;
