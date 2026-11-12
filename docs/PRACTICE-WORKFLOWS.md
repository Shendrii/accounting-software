# Report delivery, recurring sales and practice work

This release extends the existing Prism workspace. It records bookkeeping events and sends only reminders a bookkeeper explicitly reviews and approves. It adds no paid service, external scheduler or automatic ledger posting.

## Complete reports and PDFs

- **Reports** exports the selected profit and loss, balance sheet or trial balance as CSV/PDF. Complete general-ledger exports and a month-end PDF pack are alongside these actions.
- The pack contains profit and loss for the selected dates, balance sheet and trial balance at the ending date, the cash-flow review workpaper, and complete receivables/payables aging at that cutoff. All sections come from one repeatable-read database snapshot.
- **Reports → Aging** exports every open document at the cutoff, independently of the screen's current page. Control-account differences, unverified documents, credits, aging basis and totals remain visible in the file.
- **Sales → Collections** and **Purchases → Supplier follow-up** export complete customer/supplier statements as CSV/PDF, including opening balances, movements, closing balances, unapplied deposits and reconciliation notes.
- Cash-flow, comparative, tax and contractor workpapers also have PDF exports. Cash-flow classifications and missing tax support remain review matters; exporting does not certify or file a statement or return.
- Headers retain workspace identity, currency, reporting basis, period/cutoff and generation time. Financial statements use the same calculations as their screen endpoints. CSV values retain exact decimal amounts and guard against spreadsheet formulas in descriptions.

Exports fail explicitly rather than silently dropping records: aging and general-ledger detail allow 10,000 rows; statements retain their existing 5,000-event limit with brought-forward balances. PDFs allow 10,000 rows and two million text characters across their sections. Use a shorter period or CSV when a PDF exceeds that size. Reconciliation exceptions remain visible even when there is no detail.

## Recurring invoices

1. Create a sales invoice or open an existing one. Under **Recurring invoices**, enable its schedule, choose the interval and next draft date, then save. **Sales → Recurring → Add invoice schedule** can select an older invoice by search.
2. **Generate due drafts** creates up to 20 due occurrences per run in the active workspace. Missed periods advance in order. Each template generates its next occurrence once per run; repeat the run when templates remain due.
3. Review and post the generated invoices through the normal invoice workflow. Emailing and recording payment remain separate actions.

Weekly, monthly, quarterly and yearly schedules reuse the existing recurrence rules, including month-end and leap-year anchoring. Drafts retain the customer, line descriptions/accounts, quantities, prices, explicit tax, invoice details, reminder preference and original payment interval. Tax code effectiveness and account/customer validity are revalidated. Invalid templates roll the run back. Opening documents and void invoices cannot become templates. Generated invoices are not themselves recurring templates.

Occurrence identities and run request IDs prevent duplicate drafts from concurrent clicks, retries or a schedule rewound to an already generated date. Stopping a schedule preserves existing drafts and occurrence history. No timer or sleeping-instance workaround generates invoices unattended.

## Reviewed reminders

- Enable **Payment reminders** on an invoice. This preference alone sends nothing.
- **Sales → Reminders** lists posted open invoices whose due date has passed, whose customer has an email address, and which have no reminder attempt within seven days. Dates use the UTC calendar date; an invoice due today is not overdue.
- Open **Review reminder** to see the workspace, recipient, subject, exact message and balance net of dated payments/credits/corrections. **Send reviewed reminder** sends that message through the existing Brevo/SMTP configuration.
- The server rebuilds the preview before claiming delivery. Changed balances, recipients, dates or attempt history require a fresh review. A reminder never changes the invoice balance or posts money.
- Each attempt retains its actor, recipient, text, currency, balance snapshot and delivery status. Stable request IDs and one attempt per invoice/day prevent retries from sending duplicates. All attempts, including unconfirmed delivery, count toward the seven-day interval.
- A provider timeout or interrupted confirmation remains **Delivery unconfirmed** or **Delivery in progress or interrupted**. Check the mailbox before further contact. Replaying that request reads its saved status; it never resends. There is no automatic retry or unattended customer email.

The invoice displays the most recent 20 attempts. Earlier attempts stay in the database, and preparation/sending events are available in its audit history. Actual mail delivery and provider limits need a live configured-provider check before client use.

## Practice work queue

**Client work queue** in the Practice navigation combines task counts across the signed-in user's current workspace memberships. It includes receipt review, invoice/bill/journal drafts, unmatched bank lines, in-progress bank reconciliations, due recurring templates, eligible invoice reminders, overdue sales/purchases, open period closes, overdue payment promises and unfinished setup/opening books.

Filter by client, task type or text. The queue is paginated and groups related records rather than downloading every client ledger. Dates identify due dates, close targets or the oldest source; receipt reference dates are not invented contractual deadlines. Empty work does not establish that books are reconciled. Financial amounts are not added across currencies.

Opening a task switches to its workspace before navigating to the worklist. The destination rechecks current membership and role. Read-only members can inspect accessible work but cannot generate drafts, change reminders or send mail. Removed memberships disappear on the next read. No active workspace header can grant access to another client.

## Migration and release

Apply once to the intended Neon branch, before deploying either app:

`server/prisma/migrations/20261112100000_practice_workflows/migration.sql`

This single transactional SQL file adds invoice scheduling/reminder fields and retained reminder attempts, constraints and indexes. Existing invoices default to no recurrence and no reminders. It does not post entries, generate drafts or email customers. Historical migrations are unchanged.

Regenerate the backend Prisma client, deploy the backend, then deploy the frontend from this release. When applying SQL manually, record that fact and follow the existing manual migration process; do not reset Neon or blindly replay old migrations.

## Verification

Local verification uses disposable PostgreSQL with pgvector and synthetic client books. Email, Google, OCR and chat providers are stubbed; the local semantic embedding model remains real. Coverage includes full exports beyond the visible page, exact balances, calendar cutoffs in a non-UTC database timezone, recurring month-end terms/idempotency/rollback, stale reminder review, duplicate delivery prevention, ambiguous attempts and live membership/read-only boundaries.

Rendered QA covers desktop and 390px mobile, workspace switching from the practice queue, reminder review/send against the email stub, browser PDF download, and multipage PDF pagination. This record does not assert a Neon migration, push, hosted deployment or live email delivery.

Final local validation on November 12, 2026: **51 backend tests passed, zero skipped; six client tests passed; ESLint had zero warnings; TypeScript/Next production build passed.** A fresh baseline plus all migrations succeeded, and database-to-Prisma comparison returned an empty migration. Desktop/mobile browser checks passed without page errors or horizontal overflow, including switching between PHP and USD client work, reviewed reminder delivery through the stub, and a PDF download.
