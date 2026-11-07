# Page loading and database reads

Accountrix stays on the existing Vercel, Render, and Neon free plans. These changes reduce work while the backend is running; Render can still take time to wake after inactivity.

## Changes

- Overview loads its metrics, close checklist, and recent invoices in one content request. Sales and Purchases use dedicated summary endpoints. Totals include all workspace documents, but recent activity contains at most six records.
- PostgreSQL aggregates invoice and bill payments instead of sending every document to the browser for summary calculations. Exact decimal arithmetic, posting requirements, and legacy payment handling remain in effect.
- Workspace authentication checks the user and current membership in one parameterized query on every request. Authorization is not cached. A transient database failure returns 503 rather than signing the user out.
- Financial reports aggregate posted journal lines and account metadata in one query. Date filters compare calendar dates independently of the database session timezone.
- Ledger loads the close checklist, accounts, or journals for the selected tab. Recurring bills load when that tab opens. Receipt accounts, vendors, and bills load when a receipt is opened.
- Concurrent identical GETs share a request within the same token and workspace. Completed responses are not cached; writes invalidate pending sharing. Switching workspaces and signing in with another token cannot reuse another session's request.
- Journal lists include the account names, codes, lines, and source references needed by the UI without duplicating full account and source documents. Detail endpoints retain their complete response.

## Local comparison

Measured against the same disposable PostgreSQL database with 2,000 invoices and 2,000 bills, including drafts, posted documents, legacy states, and payment histories. Payload sizes below are uncompressed JSON. Query counts include current authorization checks and exclude connection health probes. Shared sidebar/workspace requests are excluded from both sides of the content comparison.

| Content | Before | After |
| --- | --- | --- |
| Overview | 5 requests, 34 queries, 2,012,593 bytes | 1 request, 7 queries, 4,224 bytes |
| Sales summary | 6 queries, 1,420,015 bytes | 2 queries, 1,927 bytes |
| Purchases summary | 6 queries, 1,475,147 bytes | 2 queries, 1,921 bytes |
| Close checklist | 10 queries | 2 queries |
| Each financial report | 5 queries | 2 queries |
| Journal list | 16 queries, 6,467,236 bytes | 14 queries, 4,939,236 bytes |

These measurements are local evidence, not production latency estimates. Full invoice, bill, receipt, and journal lists still return complete matching histories. Pagination is a separate next step if those lists become large.

## Database rollout

Apply `server/prisma/migrations/20261107090000_page_query_indexes/migration.sql` once to the existing Neon database before deployment, using the same migration process as the earlier SQL migrations. It adds indexes for workspace document dates, due dates/statuses, receipt queues, journal account lookups, and user memberships. It replaces the earlier receipt workspace/status index and does not change accounting data.

Deploy the backend before the frontend, since the frontend uses the new summary responses. No new environment variables, services, or paid resources are required. The SQL was applied to the disposable database and the resulting schema matched Prisma with an empty migration diff.

## Validation

Use a disposable local API and database, including the local OCR stub for receipt tests:

```sh
PERFORMANCE_TEST_API=http://127.0.0.1:3173 \
LEDGER_TEST_API=http://127.0.0.1:3173 \
WORKFLOWS_TEST_API=http://127.0.0.1:3173 \
node --test --test-concurrency=1 server/tests/invoice-ledger.test.mjs server/tests/page-loading.test.mjs server/tests/workflow-accounting.test.mjs
```

Run the client request-sharing tests from `client` after installing its dependencies:

```sh
node --test lib/api-reads.test.mjs
npm run build
```

Validated exact totals against the previous full-list/report responses; partial payments; due-today and seven-day boundaries under the Manila database timezone; invalid dates; workspace isolation and immediate revocation; deleted-user tokens; selective tab requests; retry after a temporary failure; receipt review; bank reconciliation proof; and mobile layout. An `EXPLAIN ANALYZE` of the recent-invoice lookup used the new workspace/date/id index.
