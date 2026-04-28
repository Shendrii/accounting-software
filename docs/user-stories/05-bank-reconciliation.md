# US-05 — Bank Reconciliation

## User Story

> As an **accountant**,
> I want to **import my bank statement transactions and match them against journal entries**,
> so that **I can confirm my books match my bank and identify missing or duplicate transactions**.

## Acceptance Criteria

### AC-01 — Set up reconciliation
- [ ] The `/reconciliation` page starts with Step 1: a setup form.
- [ ] The user selects a bank account (asset accounts only), enters a statement ending date and ending balance.
- [ ] Clicking "Start Reconciliation" loads Step 2.

### AC-02 — Summary bar
- [ ] Step 2 shows three values at the top: Book Balance, Statement Balance, Difference.
- [ ] Difference is highlighted green when zero (balanced), red otherwise.

### AC-03 — Import bank transactions
- [ ] An "Import Transactions" button opens a modal with a data entry table.
- [ ] Each row has: date, description, amount (positive = deposit, negative = withdrawal).
- [ ] Rows can be added and removed.
- [ ] Clicking "Import" inserts the transactions as `BankTransaction` records for the selected account.

### AC-04 — Match transactions
- [ ] The two-column layout shows unmatched bank transactions on the left and unmatched journal lines on the right.
- [ ] Clicking a bank transaction selects it (highlighted in blue).
- [ ] Clicking a journal line immediately matches the pair and removes both from the unmatched lists.
- [ ] Clicking a selected bank transaction deselects it.

### AC-05 — Complete reconciliation
- [ ] The "Complete Reconciliation" button is only enabled when the Difference equals zero (within $0.01).
- [ ] Clicking it creates a `Reconciliation` record with status `COMPLETE`.
- [ ] A success message is shown and the page resets to Step 1.

### AC-06 — Navigation
- [ ] "Reconciliation" is accessible from the sidebar under the "Tools" section.

## Out of Scope

- CSV file upload for bank statement import (manual entry only in this version).
- Auto-matching algorithm (click-to-match only).
- Reconciliation history view per account.

## Related Files

| Layer | Path |
|---|---|
| Frontend page | `client/app/reconciliation/page.tsx` |
| API functions | `client/lib/api.ts` → `importBankTransactions`, `getReconciliationData`, `matchTransaction`, `unmatchTransaction`, `completeReconciliation` |
| Backend route | `server/src/routes/reconciliation.js` |
| API endpoints | `POST /api/reconciliation/import`, `GET /api/reconciliation/:accountId`, `POST /api/reconciliation/match`, `POST /api/reconciliation/unmatch`, `POST /api/reconciliation/complete` |
| Schema models | `BankTransaction`, `Reconciliation` |
