# US-07 — Expense Tracking Enhancement

## User Story

> As a **business owner**,
> I want **approved receipts to optionally link to a vendor bill or be categorized directly as an expense with a vendor name**,
> so that **I have a complete record of every business expense without manual data entry**.

## Acceptance Criteria

### AC-01 — Vendor assignment on a receipt
- [ ] Each receipt card on `/receipts` has an "Expense Details" section with a Vendor dropdown.
- [ ] The dropdown lists all active vendors.
- [ ] Selecting a vendor and clicking "Save details" persists the `vendorId` on the receipt.

### AC-02 — Category assignment on a receipt
- [ ] The "Expense Details" section includes a Category text input.
- [ ] The input offers autocomplete suggestions: Office Supplies, Travel, Meals, Utilities, Software, Other.
- [ ] Saving persists the `category` on the receipt.

### AC-03 — Link receipt to an existing bill
- [ ] The "Expense Details" section includes a "Link to Bill" dropdown.
- [ ] The dropdown shows only bills with status `RECEIVED` from the selected vendor (or all received bills if no vendor is selected).
- [ ] Saving persists the `billId` on the receipt.
- [ ] Selecting a different vendor clears the bill selection.

### AC-04 — Approve receipt linked to a bill
- [ ] When a receipt linked to a `RECEIVED` bill is approved:
  - The linked bill is marked as `PAID`.
  - A `POSTED` journal entry is created (debit Accounts Payable, credit selected payment account).
  - No separate expense journal entry is created (the bill's receive entry already recorded the expense).
- [ ] When no bill is linked, the existing approve flow applies (debit expense, credit payment).

### AC-05 — Vendor name visible in the receipts list
- [ ] The receipt card body shows the vendor name if one is assigned.
- [ ] The category is shown alongside the vendor name.

## Out of Scope

- Automatic vendor detection from OCR text (vendor is selected manually).
- Splitting a single receipt across multiple expense categories.
- Mileage or per-diem expense types.

## Related Files

| Layer | Path |
|---|---|
| Frontend page | `client/app/receipts/page.tsx` |
| API functions | `client/lib/api.ts` → `updateReceipt` (extended with `vendorId`, `category`, `billId`), `getVendors`, `getBills` |
| Backend route | `server/src/routes/receipts.js` |
| API endpoints | `PUT /api/receipts/:id`, `POST /api/receipts/:id/approve` (updated) |
| Schema model | `Receipt` (added `vendorId`, `category`, `billId`) |
