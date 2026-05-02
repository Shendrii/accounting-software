import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function slugifyWorkspace(name) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * One-time style backfill helper for multitenant rollout.
 *
 * Scenario A: freshly installed DB (no users yet) → no-op unless you uncomment demo user creation below.
 *
 * Scenario B: legacy single-tenant rows without workspace linkage (this schema requires workspaceIds).
 *   If legacy columns exist outside Prisma-managed schema, migrate manually instead.
 */

async function main() {
  const counts = await prisma.user.count();

  const envEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const envPass = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  // Optional bootstrap user for local/demo environments
  if (counts === 0 && envEmail && envPass) {
    const passwordHash = await bcrypt.hash(envPass, 10);
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email: envEmail, name: 'Admin', passwordHash },
      });
      const ws = await tx.workspace.create({
        data: { name: 'Default Workspace', slug: slugifyWorkspace('default-workspace'), type: 'TEAM', ownerUserId: u.id },
      });
      await tx.workspaceMember.create({ data: { workspaceId: ws.id, userId: u.id, role: 'OWNER' } });
      await tx.authProvider.create({ data: { userId: u.id, provider: 'LOCAL', providerAccountId: u.id } });
    });
    console.log('Created bootstrap Admin user/workspace from BOOTSTRAP_* env vars.');
  } else {
    console.log('Seed complete (no automatic data changes).');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
