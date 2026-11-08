# Releasing the readiness fixes

This release changes authentication and accounting controls. The source is implemented and tested locally. On November 8, the owner reported applying the combined SQL in Neon and authorized deployment. Confirm the hosted backend/frontend release separately; the migration report is user-supplied rather than an independent database inspection.

## Before migration

1. Take and retain a protected database backup and confirm a restore destination/procedure. See [RECOVERY.md](RECOVERY.md). The successful local drill does not establish a current Neon backup or off-host production recovery.
2. Confirm historical migrations through `20261108110000_workspace_books` are already applied. Existing manually migrated Neon databases must continue the known incremental process; do not run the empty-database bootstrap or reset them. Do not use `migrate deploy` blindly if migration history has not been reconciled with manually applied SQL.
3. Check for case-colliding existing email identities using a read-only query. Resolve ownership deliberately before the normalized unique index; do not merge users automatically.
4. Configure the backend `APP_CLIENT_URL`, exact allowed frontend CORS origins, production Google callback/client settings and a working configured email transport. Confirm provider sender configuration. Preserve JWT secrets securely. Do not commit environment values.
5. Plan a short write-maintenance window and a coordinated backend/frontend release. Old frontends do not support the new auth handoff and new code requires the new tables. All users must sign in again.

## One-paste Neon file

Use [readiness-all-in-one.sql](../server/prisma/manual/readiness-all-in-one.sql) to apply all ten new migrations in one paste. Open the intended Neon branch/database SQL Editor, paste the **entire file**, and run it once. It expects all historical migrations through `20261108110000_workspace_books` and none of these ten new migrations to have been applied. Do not run both the combined file and the individual files.

The combined file preserves the ordered migration contents and source SHA-256 checksums, replacing the ten transaction boundaries with one `BEGIN`/`COMMIT`. Enum additions are in that same transaction; their new values are first used by the application after commit. A failure rolls the whole combined upgrade back. Tested on disposable PostgreSQL with retained sample posted history and receipt bytes, the expected authentication cutover, rejection of reapplication, and a deliberate final-migration failure that rolled back earlier schema, enum and password changes. The resulting schema matches `schema.prisma`.

The file does not write Prisma migration bookkeeping. Keep the original migration files unchanged and reconcile migration history deliberately if adopting Prisma-managed deployments later.

## Included incremental migrations — reference order

Each path below points to `migration.sql` under `server/prisma/migrations/`:

1. `20261108130000_auth_security/migration.sql`
2. `20261108133000_period_close/migration.sql`
3. `20261108140000_receipt_corrections/migration.sql`
4. `20261108143000_recurring_occurrences/migration.sql`
5. `20261108150000_posting_controls/migration.sql`
6. `20261108153000_customer_supplier_credits/migration.sql`
7. `20261108160000_bank_matching_groups/migration.sql`
8. `20261108163000_tax_registers/migration.sql`
9. `20261108170000_reporting_classification/migration.sql`
10. `20261108173000_collections_and_schedules/migration.sql`

These remain the source migrations for the combined file. If using the individual files instead, run their complete contents in this order. Their receipt-status and workspace-role enum additions deliberately precede their individual transaction blocks; if an individual-file run fails, inspect the exact state before retrying. Neither method is a generic rerunnable setup script. Do not run seeds or `db push` against existing books.

The auth migration disables historical local passwords on Google-linked users because the old email-only linkage cannot prove who chose those passwords. Existing Google subject access remains; email recovery restores local password access. Legacy JWTs have no database session identity and are rejected. This is an intentional security cutover, not data loss or an instruction to recreate workspaces.

## Application release

Generate the Prisma client with the matching schema during backend build (`server` postinstall already runs `db:generate`). Build and release the backend and frontend from the same reviewed revision. Keep their existing free-plan hosts. No paid plan or provider migration is required by these changes.

Before reopening writes, verify the live API health endpoint, local/password and Google sign-in, verification and recovery email receipt, logout/revocation, workspace isolation and the production frontend domain/build. Then use a separate demo workspace to verify invoice posting, partial payment/reversal, AR/AP aging ties, receipt correction, bank preview/group matching, schedule draft review and period locks. Confirm real books were not seeded or reposted. This is the required hosted verification; local test success is not equivalent.

Rollback must account for the schema and authentication cutover. Do not drop financial/audit tables or overwrite books to downgrade code. Prefer a forward repair; restore only through a reviewed backup/recovery plan into an isolated destination, with accounting comparisons and session revocation before cutover.

## Repeatable local checks

Use an already-migrated disposable localhost PostgreSQL database named `readiness_*` or `accountrix_test_*`. Never supply a live URL to the integration suites. From `server`, set `ACCOUNTING_TEST_DATABASE_URL` securely to that disposable database and run:

```sh
npm run test:readiness
```

The launcher refuses non-local URLs and database names outside those prefixes. It starts temporary local API/OCR listeners, stubs Google and email, sets all integration-test API variables, runs the complete server suite, and closes its listeners. Its test-only endpoints are never mounted by the production application. Requires Node with `--experimental-test-module-mocks` support (validated on Node 24.21.0).

From the repository root, run `node --test client/lib/*.test.mjs`. From `client`, run `npm run lint -- --max-warnings=0`, `node_modules/.bin/tsc --noEmit`, and `npm run build`. From `server`, run `node_modules/.bin/prisma validate` with the disposable database URL. For a new empty local database, use the bootstrap and restore drill described in RECOVERY.md; compare the migrated schema with `schema.prisma`.
