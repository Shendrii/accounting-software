# US-01 — Dashboard with Live KPIs

## User Story

> As a **business owner**,
> I want a **home dashboard that shows my current cash balance, total income, total expenses, and outstanding invoices at a glance**,
> so that **I can assess my financial health without having to run separate reports**.

## Acceptance Criteria

### AC-01 — KPI Cards are displayed on load
- [ ] The home page (`/`) shows four KPI cards: Cash Balance, Total Income, Total Expenses, Net Income.
- [ ] All values are formatted as currency (`$X,XXX.XX`).
- [ ] A loading skeleton is shown while data is being fetched.

### AC-02 — Cash Balance is accurate
- [ ] Cash Balance equals the sum of current balances for all active `ASSET` accounts whose name contains "cash" or "bank" (case-insensitive).

### AC-03 — Income and Expenses are accurate
- [ ] Total Income equals the sum of current balances for all active `REVENUE` accounts.
- [ ] Total Expenses equals the sum of current balances for all active `EXPENSE` accounts.
- [ ] Net Income equals Total Income minus Total Expenses.
- [ ] Net Income card is highlighted green when positive, red when negative.

### AC-04 — Outstanding Invoices banner
- [ ] A banner is shown when there is at least one invoice with status `SENT`.
- [ ] The banner displays the count and total value of outstanding invoices.
- [ ] The banner links to the filtered invoices list (`/invoices?status=SENT`).

### AC-05 — Error handling
- [ ] If the API is unavailable, an error message is shown instead of crashing.

### AC-06 — Quick Access links
- [ ] The dashboard includes links to Bookkeeping, Invoices, Bills, Customers, Vendors, and Reports.

## Out of Scope

- Graphs or charts (not included in this version).
- Date-range filtering on the dashboard KPIs.
- Per-user or multi-company data isolation.

## Related Files

| Layer | Path |
|---|---|
| Frontend page | `client/app/page.tsx` |
| API function | `client/lib/api.ts` → `fetchDashboard()` |
| Backend route | `server/src/routes/dashboard.js` |
| API endpoint | `GET /api/dashboard` |
| Schema models | `Account` |
