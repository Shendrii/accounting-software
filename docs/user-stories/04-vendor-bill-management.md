# US-04 — Vendor & Bill Management (Accounts Payable)

## User Story

> As a **business owner**,
> I want to **record vendor bills, track what I owe, and mark bills as paid**,
> so that **my accounts payable balance stays accurate and I never miss a payment**.

## Acceptance Criteria

### AC-01 — Vendor list
- [ ] The `/vendors` page lists all active vendors in a table.
- [ ] Columns: Name, Email, Phone, Address, Status, Actions.
- [ ] Search bar filters by name or email.
- [ ] "Show inactive" checkbox toggles deactivated vendors.

### AC-02 — Create / edit vendor
- [ ] A "New Vendor" button opens a slide-over panel.
- [ ] Name is required; email, phone, address are optional.
- [ ] Each row has a pencil icon to edit and a toggle to deactivate.
- [ ] Deactivating a vendor with received or paid bills is blocked with an error.

### AC-03 — Bill list
- [ ] The `/bills` page shows a table of all bills.
- [ ] Columns: Bill #, Vendor, Date, Due Date, Total, Status.
- [ ] Status badges: Draft (grey), Received (amber), Paid (green), Void (red).
- [ ] Filters: search by bill number or vendor name; dropdown filter by status.

### AC-04 — Create bill
- [ ] "New Bill" navigates to `/bills/new`.
- [ ] Form requires: vendor (dropdown), bill date, due date, at least one line item.
- [ ] Line items: description (required), quantity, unit price, expense account (optional), auto-calculated amount.
- [ ] Bill number is auto-generated in the format `BILL-YYYYMM-NNNN`.
- [ ] Bill is created with status `DRAFT`.

### AC-05 — Mark as Received
- [ ] "Mark as Received" is available on `DRAFT` bills.
- [ ] Clicking it creates a `POSTED` journal entry:
  - Debit: expense account from bill lines (or Accounts Payable if none assigned)
  - Credit: Accounts Payable account (matched by name containing "payable")
- [ ] Bill status changes to `RECEIVED`.
- [ ] Account balances are updated.

### AC-06 — Pay bill
- [ ] "Pay Bill" is available on `RECEIVED` bills.
- [ ] A modal lets the user select the payment account (asset accounts).
- [ ] Confirming creates a `POSTED` journal entry:
  - Debit: Accounts Payable
  - Credit: selected payment account
- [ ] Bill status changes to `PAID`.
- [ ] Account balances are updated.

### AC-07 — Void bill
- [ ] "Void Bill" is available on `DRAFT` and `RECEIVED` bills.
- [ ] Voiding a `PAID` bill is blocked with an error.

### AC-08 — Navigation
- [ ] "Vendors" and "Bills" are accessible from the sidebar under the "Payables" section.

## Out of Scope

- Purchase orders linked to bills.
- Vendor payment terms or early-payment discounts.
- Recurring bills.

## Related Files

| Layer | Path |
|---|---|
| Frontend pages | `client/app/vendors/page.tsx`, `client/app/bills/page.tsx`, `client/app/bills/new/page.tsx`, `client/app/bills/[id]/page.tsx` |
| API functions | `client/lib/api.ts` → `getVendors`, `createVendor`, `getBills`, `createBill`, `receiveBill`, `payBill`, `voidBill` |
| Backend routes | `server/src/routes/vendors.js`, `server/src/routes/bills.js` |
| API endpoints | `GET/POST /api/vendors`, `GET/POST /api/bills`, `POST /api/bills/:id/receive`, `POST /api/bills/:id/pay`, `POST /api/bills/:id/void` |
| Schema models | `Vendor`, `Bill`, `BillLine` |
