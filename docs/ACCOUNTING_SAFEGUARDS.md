# Accounting safeguards release

This release changes account selection, receipt review, and trial balance calculations. Navigation and tab names are unchanged.

## Database migration and release order

Apply `server/prisma/migrations/20261108090000_accounting_safeguards/migration.sql` to the same Neon database used by the backend **before deploying this backend and frontend together**. The receipt posting API now requires explicit paid-in-full confirmation; the previous frontend cannot provide it.

The migration adds account roles, receipt image identities, and supplier invoice references. It preserves journal entries, payment history, and old receipt images. Conventional account names and existing bank flags are classified; other accounts remain General and need review in **Ledger and close → Chart of accounts**. This does not correct historical mispostings.

| Role | Account type | Used for |
| --- | --- | --- |
| Cash / Bank | Asset | Customer deposits and purchase payments; Bank also supports reconciliation |
| Accounts receivable | Asset | Invoice posting |
| Accounts payable | Liability | Bill posting; designate one active account |
| Credit card | Liability | Purchase payments |
| Sales tax payable | Liability | Invoice sales tax |
| General | Any | Other ledger accounts; general assets and expenses can categorize purchases |

Roles and types with posted activity cannot be repurposed. An existing General account may be classified explicitly. Backend guards apply even when clients bypass the forms.

## Receipt review

- **Paid expense or asset:** confirm the purchase was paid in full and select a cash, bank, or credit-card account. A documented outstanding balance blocks this path.
- **Unpaid or partly paid bill:** create a draft for the full document amount and attach the image. Review/post the bill, then record the actual partial payment from its detail page. Extracted payment amounts never create payments automatically.
- **Attach to an existing bill:** evidence only, including draft bills; no expense or payment is posted.

Amounts remain decimal strings. Item amounts plus separately stated tax and tip must tie to the total. Exact image re-uploads and repeated supplier invoice references are checked. Image checks do not identify every crop or alternate photo; select the vendor record and supplier reference for reference checks. Old duplicate images are retained rather than deleted.

## Trial balance

Trial Balance uses an **as-of date** and includes opening history. Each account appears with its net debit or net credit balance, including inactive and unused accounts. Only posted entries through the date are counted. CSV exports include the date, USD currency, and accrual basis. Legacy `endDate` API callers still work; `startDate` no longer limits the opening history.

## Local verification

The migration is tested against disposable PostgreSQL, with legacy bank/cash/receivable roles and duplicate image fixtures. Financial tests run against a localhost API with stub OCR, never the Neon database:

```sh
ACCOUNTING_TEST_API=http://127.0.0.1:43187 LEDGER_TEST_API=http://127.0.0.1:43187 WORKFLOWS_TEST_API=http://127.0.0.1:43187 PERFORMANCE_TEST_API=http://127.0.0.1:43187 node --test --test-concurrency=1 server/tests/*.test.mjs
```

`workflow-accounting.test.mjs` expects an OCR fixture containing an invalid date, so date confirmation can be tested explicitly.
