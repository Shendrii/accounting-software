# Prism accounting workbench

This release implements the approved navigation and the first workflow improvements: bounded worklists, source document review, and financial report drill-down. It does not require a database migration.

- Dashboard is the shared cross-workflow summary. Sales opens Invoices; Purchases opens Bills and contains Document inbox, Bills, and Vendors. Recurring templates are a Bills view. Accounting contains the existing journal, account, and close tools. Reports retains the one as-of trial balance. Legacy links redirect and preserve query parameters and fragments.
- Invoice and bill tables search and filter on the server before pagination. They support date ranges, status, open/overdue views, stable sorting, 25/50/100 rows, compact density, and a read-only record preview. The full record remains the place for posting, payment, and correction actions. Return links preserve the list filters and preview.
- Saved views are stored on the current browser, scoped to the signed-in user, workspace, and worklist. They are not shared between team members or devices.
- Document inbox loads a bounded queue and fetches full details and the authenticated source image only for the selected document. Previous/Next follows the current queue page. Successful review advances to the next document on that page. Unsaved edits require a discard choice; navigation is blocked during a save. Amount/date errors are associated with their fields, and line items must reconcile to the total. The server remains authoritative for posting and duplicate checks. Bill search shows up to 50 matches and can be refined.
- Report account names open posted ledger activity for the report's exact date context. Activity includes opening balance, period debits/credits, closing balance, and running balances calculated before pagination. Drafts and other workspaces are excluded. Journal sources link back to invoices, bills, and documents; reversals retain their original source. Opening, period, and closing balances are shown separately so a period P&L is not confused with an all-history balance.
- Money is calculated with PostgreSQL numeric / Decimal on the server and integer minor units for client validation. The new endpoints are read-only and do not alter posting semantics.

## API compatibility

`GET /api/invoices`, `/api/bills`, and `/api/receipts` preserve their array responses unless `page` or `pageSize` is supplied. Paged responses contain `items`, `page`, `pageSize`, `total`, and `totalPages`; page size is capped at 100. Unsupported sort/filter values and invalid dates return 400.

`GET /api/reports/account-activity?accountId=…&startDate=…&endDate=…&page=1&pageSize=25` returns posted activity in chronological order. `startDate` is optional; omitting it includes opening history. The account and its journals must belong to the active workspace. Source metadata is loaded after ledger aggregation, preventing duplicate source links from multiplying amounts.

## Validation

Local disposable PostgreSQL/API tests cover partial payments, exact sorting, pagination, escaped search, date cutoffs, tenant isolation, legacy response compatibility, opening balances, running balances across pages, trial balance ties, source links, and reversals. Existing posting, receipt, reconciliation, and summary regressions remain in the suite. Production verification is read-only; synthetic accounting fixtures are local only.
