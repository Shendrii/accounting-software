# US-03 — Invoicing (Accounts Receivable)

## User Story

> As a **business owner**,
> I want to **create invoices for customers, track whether they are draft, sent, or paid, and have payments automatically post journal entries**,
> so that **my accounts receivable balance stays accurate and my books stay up to date without manual journal entries**.

## Acceptance Criteria

### AC-01 — Invoice list
- [ ] The `/invoices` page shows a table of all invoices.
- [ ] Columns: Invoice #, Customer, Date, Due Date, Total, Status.
- [ ] Status is shown as a colour-coded badge: Draft (grey), Sent (blue), Paid (green), Void (red).
- [ ] A search bar filters by invoice number or customer name.
- [ ] A status dropdown filters by Draft / Sent / Paid / Void.

### AC-02 — Create invoice
- [ ] The "New Invoice" button navigates to `/invoices/new`.
- [ ] The form requires: customer (dropdown), invoice date, due date, and at least one line item.
- [ ] Line items have: description (required), quantity, unit price; amount auto-calculates as `qty × price`.
- [ ] Rows can be added and removed.
- [ ] A tax field and subtotal/tax/total summary footer are displayed.
- [ ] A notes field is available.
- [ ] Invoice number is auto-generated in the format `INV-YYYYMM-NNNN`.
- [ ] The invoice is created with status `DRAFT`.

### AC-03 — Invoice detail
- [ ] Clicking "View →" or an invoice number navigates to `/invoices/:id`.
- [ ] The detail page shows all invoice fields and line items in a read-only layout.
- [ ] Action buttons are shown based on status (see AC-04 to AC-06).

### AC-04 — Mark as Sent
- [ ] A "Mark as Sent" button is available on `DRAFT` invoices.
- [ ] Clicking it changes the status to `SENT`.

### AC-05 — Record Payment
- [ ] A "Record Payment" button is available on `SENT` invoices.
- [ ] Clicking it opens a modal to select the payment account (asset accounts only).
- [ ] Confirming creates a `POSTED` journal entry:
  - Debit: selected payment account (invoice total)
  - Credit: Accounts Receivable account (matched by name containing "receivable")
- [ ] The invoice status changes to `PAID`.
- [ ] Account balances are updated immediately.

### AC-06 — Void invoice
- [ ] A "Void Invoice" button is available on `DRAFT` and `SENT` invoices.
- [ ] Voiding a `PAID` invoice is blocked with an error.
- [ ] Confirmed voiding sets status to `VOID`.

### AC-07 — Navigation
- [ ] "Invoices" is accessible from the sidebar under the "Receivables" section.

## Out of Scope

- Sending invoices by email.
- Partial payments or multiple payment installments.
- Invoice templates or branding customisation.
- Tax rate configuration (tax is a manually entered amount).

## Related Files

| Layer | Path |
|---|---|
| Frontend pages | `client/app/invoices/page.tsx`, `client/app/invoices/new/page.tsx`, `client/app/invoices/[id]/page.tsx` |
| API functions | `client/lib/api.ts` → `getInvoices`, `createInvoice`, `sendInvoice`, `recordInvoicePayment`, `voidInvoice` |
| Backend route | `server/src/routes/invoices.js` |
| API endpoints | `GET /api/invoices`, `POST /api/invoices`, `POST /api/invoices/:id/send`, `POST /api/invoices/:id/record-payment`, `POST /api/invoices/:id/void` |
| Schema models | `Invoice`, `InvoiceLine` |
