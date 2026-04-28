# US-06 — Financial Reports

## User Story

> As a **business owner**,
> I want to **generate a Profit & Loss statement, a Balance Sheet, and a Trial Balance for any date range**,
> so that **I can understand my business performance and share financials with my accountant**.

## Acceptance Criteria

### AC-01 — Report navigation
- [ ] The `/reports` page has three tabs: "Profit & Loss", "Balance Sheet", "Trial Balance".
- [ ] Switching tabs does not lose the date inputs already set in other tabs.

### AC-02 — Profit & Loss report
- [ ] Inputs: start date and end date; a "Run Report" button.
- [ ] Revenue section lists each revenue account with its net credit balance for the period.
- [ ] Expenses section lists each expense account with its net debit balance for the period.
- [ ] Totals row for Revenue, Expenses, and Net Income are shown.
- [ ] Net Income is highlighted green when positive, red when negative.
- [ ] Only accounts with activity in the period are included.
- [ ] An "Export CSV" button downloads the report as a `.csv` file.

### AC-03 — Balance Sheet report
- [ ] Input: "As of date"; a "Run Report" button.
- [ ] Three sections: Assets, Liabilities, Equity — each with account-level rows and a subtotal.
- [ ] A "Liabilities + Equity" total is shown at the bottom for verification.
- [ ] Balances are computed from all posted journal lines up to the selected date.

### AC-04 — Trial Balance report
- [ ] Inputs: start date and end date; a "Run Report" button.
- [ ] Table columns: Code, Account, Type, Debit, Credit.
- [ ] Accounts are sorted by account code.
- [ ] A totals row shows the sum of all debits and credits.
- [ ] An "Export CSV" button downloads the report.

### AC-05 — Currency formatting
- [ ] All monetary values are displayed as `$X,XXX.XX`.

### AC-06 — Error handling
- [ ] If no data is available for the selected period, an empty state is shown (not an error crash).

### AC-07 — Navigation
- [ ] "Reports" is accessible from the sidebar under the "Tools" section.

## Out of Scope

- Cash Flow Statement.
- Saved or scheduled reports.
- PDF export.
- Comparative period columns (e.g. this year vs last year).

## Related Files

| Layer | Path |
|---|---|
| Frontend page | `client/app/reports/page.tsx` |
| API functions | `client/lib/api.ts` → `getProfitLoss`, `getBalanceSheet`, `getTrialBalance` |
| Backend route | `server/src/routes/reports.js` |
| API endpoints | `GET /api/reports/profit-loss`, `GET /api/reports/balance-sheet`, `GET /api/reports/trial-balance` |
| Schema models | `Account`, `JournalEntry`, `JournalLine` |
