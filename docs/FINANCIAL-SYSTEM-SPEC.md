# Workspace books, opening balances, payment corrections and aging

Accountrix records bookkeeping events; it does not hold funds, initiate payments, refund a bank transaction or file taxes. Each workspace owns one accrual ledger, in one confirmed base currency (PHP or USD). Existing workspaces retain USD; country remains unconfirmed until an owner/admin completes setup. No FX conversion or tax liability is inferred from country. Tax-registration preferences are metadata for the next tax workflow release, not an automated tax determination.

## Posting rules

| Event | Debit | Credit | Date |
| --- | --- | --- | --- |
| Opening trial balance | Imported debit balances, substituting opening clearing for AR/AP | Imported credit balances, substituting opening clearing for AR/AP | Day before books start |
| Opening customer balance | Selected AR control | Opening clearing | Opening as-of date |
| Opening supplier balance | Opening clearing | Selected AP control | Opening as-of date |
| Reverse customer payment | Original payment credit accounts | Original payment debit accounts | Explicit correction date |
| Reverse supplier payment | Original payment credit accounts | Original payment debit accounts | Explicit correction date |

Opening imports must balance exactly, with each AR/AP control balance fully supported by individual unpaid documents. Clearing must net to zero. Imported documents represent remaining balances, not newly earned revenue or new expenses. An opening batch is reviewed, posted atomically once, and protected from ordinary journal reversal. No plug account is offered. New businesses can explicitly confirm zero opening balances. Existing posted books cannot receive a second opening batch.

## Corrections and evidence

A correction requires owner/admin authority, date, reason and a stable request ID. Original entries and payment rows remain intact. The linked reversal is unique per payment; retries with different content fail. Payment balances, document states, summaries and worklists exclude reversed payments consistently. A new correct payment is recorded through the existing payment form. Bank-matched payments require unmatching first; completed reconciliation evidence is never rewritten. Corrections cannot precede the original payment or the workspace start date. Every new batch and correction records its actor and currency. Existing source payments without verifiable postings are flagged rather than reconstructed by guesswork.

## Reporting contract

Aging is as of a calendar date, with explicitly labeled invoice-date or due-date aging. Original postings, void reversals, payments and payment reversals are included only through that date. Current, 1–30, 31–60, 61–90 and 91+ buckets are recomputed from dates. Debit balances and credits are presented separately. AR/AP control balances are recomputed from posted journals and compared per account with the document subledger. Manual control-account journals and unverified legacy documents are visible exceptions, never silently forced to agree. Reports identify currency, accrual basis, cutoff and source documents.

## Controls and compatibility

All new reads and writes require live workspace membership; setup, opening posting and corrections require owner/admin. Money uses PostgreSQL numeric and Prisma Decimal. The existing serializable transaction/retry mechanism remains authoritative. Workspace currency and books start date cannot be changed after financial records exist. Opening CSVs are bounded and parsed on the server, previewed, then validated again in the posting transaction. No tax rates, filing deadlines, credit-loss policy or materiality thresholds are invented.

The existing Prism components, paper/ink/cobalt palette, table layout, focus states and responsive behavior are preserved. Onboarding follows signup, Google sign-in and workspace creation; existing owners see a setup reminder. Existing records are not relabeled or reposted by the migration.

## Verification

Use disposable PostgreSQL only: upgrade migration, repeatable schema baseline, PHP and USD setup, legacy currency protection, opening TB and document ties, no duplicate revenue, idempotent retries and concurrent posting, access isolation, payment reversal/reapplication, historical cutoffs before/after corrections and voids, AR/AP differences from manual journals, all existing financial regressions, client lint/build and desktop/mobile UI review.
