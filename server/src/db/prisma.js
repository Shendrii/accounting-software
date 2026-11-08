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
  return { AND: [where, { workspaceId }] };
}

const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!SCOPED_MODELS.has(model)) return query(args);

        const { workspaceId } = getRequestContext();
        if (!workspaceId) return query(args);

        const merge = (where) => mergeWorkspaceWhere(where, workspaceId);

        if (['findUnique','findUniqueOrThrow','update','delete','upsert'].includes(operation)) {
          // Keep the operation on its transaction client. Calling basePrisma here
          // escapes the transaction and cannot see its uncommitted corrections.
          return query({
            ...args,
            where: { ...args.where, workspaceId },
          });
        }

        if (
          operation === 'findMany' ||
          operation === 'findFirst' ||
          operation === 'count' ||
          operation === 'aggregate' ||
          operation === 'groupBy' || operation === 'updateMany' || operation === 'deleteMany'
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
