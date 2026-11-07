# Workspace books release

This batch adds PH/US workspace setup, supported opening balances, recorded-payment corrections, and receivables/payables aging with ledger reconciliation. It extends the existing Prism workspace without changing the design system. It does not move money or file tax returns.

## Where to use it

- New signup and workspace creation lead to **Settings → Business profile** (`/settings/setup`). Existing owners see a setup reminder. Google signup routing is wired but was not exercised with a real Google account.
- Confirm country, legal name, entity type, PHP/USD base currency, fiscal year, books start date and registration preferences. A basic service-business chart is optional for an empty workspace.
- **Settings → Opening balances** (`/settings/opening-balances`) accepts a closing trial balance and unpaid AR/AP schedules, or an explicit zero opening. Review the amounts, dates and control-account support before finalizing.
- Open an invoice or bill to use **Payment history → Correct payment**. An owner/admin supplies a correction date and reason. The original posting remains; a linked reversing journal reopens the balance. Record a replacement payment separately.
- **Reports → Receivables and payables aging** (`/reports/aging`) supports an as-of date, due-date or invoice-date aging, customer/supplier buckets, paginated documents, source links, current-page CSV export and control-account ledger drill-down.

## Opening CSV format

Money uses decimal major units without currency symbols or grouping separators. Dates use `YYYY-MM-DD`. Each schedule allows at most 1,000 rows and a file smaller than 1 MB.

Trial balance:

```csv
accountCode,debit,credit
1010,1000.00,0
1100,300.00,0
2000,0,200.00
3000,0,1100.00
```

Unpaid invoices:

```csv
partyName,reference,date,dueDate,amount,accountCode
Sample customer,OLD-001,2026-01-10,2026-02-15,300.00,1100
```

Unpaid bills:

```csv
partyName,reference,date,dueDate,amount,accountCode
Sample supplier,SUP-001,2026-01-15,2026-02-05,200.00,2000
```

These examples assume a February 1, 2026 books start. The opening posting date is January 31. Original document dates must precede the start; due dates cannot precede document dates. Amount is the **remaining unpaid balance**, not the original gross amount. Active contacts match names without case sensitivity; ambiguous names need an optional `partyId` column. New names create contacts. Account codes must exist and AR/AP accounts must have the appropriate control role.

Debits must equal credits exactly; every AR/AP control balance must equal its schedule. The system uses an opening clearing account and proves it returns to zero. It does not add a balancing plug. Opening credits/prepayments need a separate reviewed adjustment and are not accepted in these schedules. Finalized opening documents cannot be voided or reissued as new invoices. Existing posted books cannot accept another opening batch.

## Controls and limitations

Existing workspaces retain **USD**, with country unconfirmed. The migration does not convert or repost their history. Currency and books start date lock after financial records or a finalized opening batch exist, including a zero opening. Confirm legacy currency before entering new records.

PH VAT/withholding-agent and US sales-tax-jurisdiction/contractor preferences are stored metadata. No rates, filing obligations or country-specific tax computations are inferred. Accrual is the supported basis; there is no FX ledger or cash-basis statement conversion in this release.

Payment corrections cover recorded invoice collections and bill payments. They are not refunds, credit notes or paid-receipt corrections. A bank-matched payment must be unmatched first; completed bank reconciliation proofs and their posting cutoff remain protected. Correction retries use stable request IDs; a different correction for the same original payment is rejected.

Aging uses posting dates, payment dates and dated reversals through the selected cutoff. It presents credits separately and flags unverified legacy postings, missing control mappings and ledger differences. A zero trial balance does not hide a document-to-control discrepancy. This batch does not add a general period-lock workflow.

## Database upgrade and release order

1. Preserve a restorable database branch/backup and confirm the intended Neon branch/database.
2. Apply **once**: `server/prisma/migrations/20261108110000_workspace_books/migration.sql`. The SQL is transactional. It adds fields/tables and retains existing records.
3. Regenerate the backend client with `npm run db:generate` from `server`, then deploy the backend and frontend from this same release. The new Prisma client and routes require the migration first.
4. Verify setup, an existing workspace's unchanged currency, invoice/bill details and aging in the intended environment before entering new books.

The incremental upgrade was tested against a disposable database created from the pre-batch schema, including an existing posted ledger. The repository's older migration chain is incomplete; this release does not claim a fresh database can be rebuilt with all historical migrations. If SQL is applied manually in Neon, keep that fact in deployment records; do not blindly rerun it through Prisma migration deployment or reset the database.

On November 8, 2026, the user confirmed that this migration was applied in Neon and authorized publishing the backend and frontend. Deployment verification must distinguish that confirmation from read-only checks of the live application; the release does not create opening journals or correct real payments.

## Verification evidence

- Full disposable PostgreSQL/API regression suite: **14 passed, zero skipped**. Includes PH/US setup, tenant isolation, zero-opening lock, exact-cent opening imports, concurrent idempotent posting, historical payment/reversal/void cutoffs, restricted corrections and manual control-account discrepancies.
- Maximum opening import: 1,000 receivables plus 1,000 payables in one transaction, exact cent totals and paginated aging checked.
- Upgrade fixture: existing USD history and journal lines preserved by the incremental migration.
- Frontend: **6 tests passed**, ESLint passed, production build passed (37 routes).
- Finance skill ledger harness: synthetic PHP fixture with 10 posted entries/23 lines, no errors or warnings. Sequence, external-event and export idempotency checks were skipped because those columns were absent; API idempotency was tested separately. This is not certification of the production ledger.
- Browser: local signup, PH/US setup, workspace creation/switching, opening review/finalization, recorded-payment correction and AR/AP reporting. Desktop 1280px and mobile 390px Prism captures are in `.impeccable/review/workspace-books/`.
- Independent Prism finish review: three display findings were corrected and all three scored resolved (`ship` at the scope of those fixes). Receipt currency, preview reversal evidence and mobile debit/credit totals were recaptured at both widths. Existing `DESIGN.md` and `.impeccable/design.json` are unchanged.

Previously identified production-readiness items outside this batch, including OAuth/account-linking and token revocation, still need a separate release. This batch is not a claim of whole-app production readiness.
