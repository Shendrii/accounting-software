# Workspace books, opening balances, payment corrections and aging

Accountrix records bookkeeping events; it does not hold funds, initiate payments, refund a bank transaction or file taxes. Each workspace owns one accrual ledger, in one confirmed base currency (PHP or USD). Existing workspaces retain USD; country remains unconfirmed until an owner/admin completes setup. No FX conversion or tax liability is inferred from country. Owners configure effective-dated tax codes and explicit tax amounts; country and registration preferences do not determine rates, nexus or filing obligations automatically.

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

A correction requires reviewer/owner/admin authority, date, reason and a stable request ID; opening-book increases remain owner/admin actions. Original entries and payment rows remain intact. The linked reversal is unique per payment; retries with different content fail. Payment balances, document states, summaries and worklists exclude reversed payments consistently. A new correct payment is recorded through the existing payment form. In-progress bank matches require unmatching first. Completed reconciliation evidence is never rewritten; corrections use a later open date. Corrections cannot precede the original event or the workspace start date. Every new batch and correction records its actor and currency. Existing source payments without verifiable postings are flagged rather than reconstructed by guesswork.

Credit notes, write-offs and withholding settle AR/AP through retained source credits and explicit allocations. Customer deposits initially credit a separate liability; supplier prepayments initially debit a separate asset. Unapplied deposits stay outside AR/AP until allocated. Allocations and refunds cannot exceed available amounts and retain dated reversal history. A new opening adjustment is a separate supported source document; the original opening import is never edited.

## Reporting contract

Aging is as of a calendar date, with explicitly labeled invoice-date or due-date aging. Original postings, void reversals, payments and payment reversals are included only through that date. Current, 1–30, 31–60, 61–90 and 91+ buckets are recomputed from dates. Debit balances and credits are presented separately. AR/AP control balances are recomputed from posted journals and compared per account with the document subledger. Manual control-account journals and unverified legacy documents are visible exceptions, never silently forced to agree. Reports identify currency, accrual basis, cutoff and source documents.

## Controls and compatibility

All new reads and writes require live workspace membership; setup and opening posting require owner/admin. Reviewers can post and correct; bookkeepers prepare drafts and post only when owners enable it; read-only members cannot mutate books. Membership, revocable session identity and posting policy are checked again inside financial transactions. Money uses PostgreSQL numeric and Prisma Decimal. Accounting transactions acquire a transaction-scoped PostgreSQL advisory lock keyed by workspace before reading or writing books state, then use Read Committed isolation. Every accounting writer must use `ledgerTransaction`; the lock orders close, posting, matching, correction and opening operations within that workspace. This avoids cross-workspace Serializable predicate-lock conflicts while preserving atomic ordered accounting operations. Auth transactions without a workspace remain Serializable with bounded retries. Workspace currency and books start date cannot be changed after financial records exist. Opening CSVs are bounded and parsed on the server, previewed, then validated again in the posting transaction. No tax rates, filing deadlines, credit-loss policy or materiality thresholds are invented.

Posted journals have at least two exactly balanced lines, immutable financial fields/lines and retained preparation/posting actors. Source workflows own their corrections. Manual control-account postings require an explicit owner/admin exception with evidence. Optional separate-person review checks the last preparer, including owners. Audit events are append-only.

Saved period close derives account coverage from ledger balances/activity, includes active bank/card accounts, and requires evidence or explicit waivers with owners and due dates. Changed ledger or supporting proof invalidates reviews. AR/AP ties, trial balance, unposted source work, pending certificate support, due recognition and accrual reversals are close gates. Database controls reject backdated writes into closed periods. Reopening requires a documented authorized action and invalidates later close evidence.

Prepaid, accrual and straight-line book depreciation schedules distribute exact cents, preserve residual value and reserve reviewed asset basis. Generation creates unique review drafts, never unattended postings. Corrections, pause/resume, cancellations and explicit waivers preserve history. Book depreciation is not a tax-depreciation determination.

Cash analysis rolls opening cash/bank through posted movements to closing cash, excludes internal cash transfers, and leaves ambiguous classifications visible until reviewed. Comparative statements retain explicit periods, account mappings and zero-prior handling. Customer/supplier statements retain dated movements and tie to aging; collection notes and promises never invent payments. PH/US tax and contractor exports are review workpapers, not filed returns or statutory certification.

The existing Prism components, paper/ink/cobalt palette, table layout, focus states and responsive behavior are preserved. Onboarding follows signup, Google sign-in and workspace creation; existing owners see a setup reminder. Existing records are not relabeled or reposted by the migration.

## Verification

Use disposable PostgreSQL only: upgrade migration, repeatable schema baseline, PHP and USD setup, legacy currency protection, opening TB and document ties, no duplicate revenue, idempotent retries and concurrent posting, access isolation, payment reversal/reapplication, historical cutoffs before/after corrections and voids, AR/AP differences from manual journals, all existing financial regressions, client lint/build and desktop/mobile UI review.
