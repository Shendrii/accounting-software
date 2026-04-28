# US-02 — Customer Management

## User Story

> As a **business owner**,
> I want to **create and manage customers with their name, email, phone, and billing address**,
> so that **I can attach them to invoices and track what each customer owes me**.

## Acceptance Criteria

### AC-01 — Customer list
- [ ] The `/customers` page lists all active customers in a table.
- [ ] Columns shown: Name, Email, Phone, City, Status, Actions.
- [ ] A search bar filters customers by name or email in real time.
- [ ] A "Show inactive" checkbox toggles visibility of deactivated customers.

### AC-02 — Create customer
- [ ] A "New Customer" button opens a slide-over panel with a form.
- [ ] Name is required; all other fields (email, phone, address, city, country) are optional.
- [ ] Submitting the form creates the customer and closes the panel.
- [ ] A validation error is shown if Name is left blank.

### AC-03 — Edit customer
- [ ] Each row has a pencil icon that opens the same slide-over panel pre-filled with the customer's data.
- [ ] Saving updates the customer in place without reloading the page.

### AC-04 — Deactivate / reactivate customer
- [ ] Each row has a toggle icon to deactivate an active customer (soft delete — sets `isActive = false`).
- [ ] Deactivating a customer with sent or paid invoices shows an error and prevents the action.
- [ ] An inactive customer can be reactivated by toggling the icon back.

### AC-05 — Navigation
- [ ] "Customers" is accessible from the sidebar under the "Receivables" section.

## Out of Scope

- Customer portal or login.
- Credit limits or payment terms stored per customer.
- Bulk import of customers (e.g. CSV).

## Related Files

| Layer | Path |
|---|---|
| Frontend page | `client/app/customers/page.tsx` |
| API functions | `client/lib/api.ts` → `getCustomers`, `createCustomer`, `updateCustomer`, `deleteCustomer` |
| Backend route | `server/src/routes/customers.js` |
| API endpoints | `GET /api/customers`, `POST /api/customers`, `PUT /api/customers/:id`, `DELETE /api/customers/:id` |
| Schema model | `Customer` |
