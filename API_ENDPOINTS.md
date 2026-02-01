# API Endpoints Reference

Complete guide to all available API endpoints for your bookkeeping system.

## Base URL

- **Development**: `http://localhost:8000`
- **Production**: (Set in your environment variables)

---

## 📊 Accounts Endpoints

### GET `/api/accounts`
Get all accounts.

**Response:**
```json
[
  {
    "id": "clx123...",
    "code": "1000",
    "name": "Cash",
    "type": "ASSET",
    "balance": "0.00",
    "description": null,
    "isActive": true,
    "createdAt": "2024-12-03T10:00:00.000Z",
    "updatedAt": "2024-12-03T10:00:00.000Z"
  }
]
```

---

### GET `/api/accounts/:id`
Get a specific account with transaction history.

**Response:**
```json
{
  "id": "clx123...",
  "code": "1000",
  "name": "Cash",
  "type": "ASSET",
  "balance": "5000.00",
  "journalLines": [
    {
      "id": "clx456...",
      "debit": "5000.00",
      "credit": "0.00",
      "journalEntry": {
        "id": "clx789...",
        "date": "2024-12-03T10:00:00.000Z",
        "description": "Initial capital"
      }
    }
  ]
}
```

---

### POST `/api/accounts`
Create a new account.

**Request Body:**
```json
{
  "code": "1000",
  "name": "Cash",
  "type": "ASSET",
  "description": "Cash in hand and bank accounts",
  "isActive": true
}
```

**Required Fields:**
- `code` (string, unique)
- `name` (string)
- `type` (enum: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)

**Optional Fields:**
- `description` (string)
- `isActive` (boolean, default: true)

**Response (201 Created):**
```json
{
  "id": "clx123...",
  "code": "1000",
  "name": "Cash",
  "type": "ASSET",
  "balance": "0.00",
  "description": "Cash in hand and bank accounts",
  "isActive": true,
  "createdAt": "2024-12-03T10:00:00.000Z",
  "updatedAt": "2024-12-03T10:00:00.000Z"
}
```

**Error Responses:**
- `400` - Missing required fields
- `409` - Account code already exists

**Example (curl):**
```bash
curl -X POST http://localhost:8000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "code": "1000",
    "name": "Cash",
    "type": "ASSET",
    "description": "Cash in hand"
  }'
```

---

### PUT `/api/accounts/:id`
Update an existing account.

**Request Body:**
```json
{
  "name": "Cash and Bank",
  "description": "Updated description",
  "isActive": false
}
```

**Response:**
```json
{
  "id": "clx123...",
  "code": "1000",
  "name": "Cash and Bank",
  "type": "ASSET",
  "balance": "5000.00",
  "description": "Updated description",
  "isActive": false,
  "updatedAt": "2024-12-03T11:00:00.000Z"
}
```

---

### DELETE `/api/accounts/:id`
Delete an account.

**Response:**
- `204 No Content` - Successfully deleted

**Note:** Cannot delete if account has journal lines.

---

## 📝 Journal Entries Endpoints

### GET `/api/journal-entries`
Get all journal entries with optional filters.

**Query Parameters:**
- `status` (optional) - Filter by status: DRAFT, POSTED, ARCHIVED
- `startDate` (optional) - Filter entries from this date (ISO format)
- `endDate` (optional) - Filter entries until this date (ISO format)

**Example:**
```
GET /api/journal-entries?status=POSTED&startDate=2024-12-01&endDate=2024-12-31
```

**Response:**
```json
[
  {
    "id": "clx789...",
    "date": "2024-12-03T10:00:00.000Z",
    "description": "Initial capital investment",
    "referenceNo": "JE-001",
    "status": "POSTED",
    "journalLines": [
      {
        "id": "clx456...",
        "debit": "10000.00",
        "credit": "0.00",
        "account": {
          "id": "clx123...",
          "code": "1000",
          "name": "Cash",
          "type": "ASSET"
        }
      },
      {
        "id": "clx457...",
        "debit": "0.00",
        "credit": "10000.00",
        "account": {
          "id": "clx124...",
          "code": "3000",
          "name": "Capital",
          "type": "EQUITY"
        }
      }
    ],
    "createdAt": "2024-12-03T10:00:00.000Z",
    "updatedAt": "2024-12-03T10:00:00.000Z"
  }
]
```

---

### GET `/api/journal-entries/:id`
Get a specific journal entry.

**Response:** Same format as GET all, but single object.

---

### POST `/api/journal-entries`
Create a new journal entry.

**Request Body:**
```json
{
  "date": "2024-12-03",
  "description": "Initial capital investment",
  "referenceNo": "JE-001",
  "journalLines": [
    {
      "accountId": "clx123...",
      "debit": "10000.00",
      "credit": "0.00",
      "description": "Cash received"
    },
    {
      "accountId": "clx124...",
      "debit": "0.00",
      "credit": "10000.00",
      "description": "Capital contribution"
    }
  ]
}
```

**Required Fields:**
- `date` (string, ISO date format)
- `description` (string)
- `journalLines` (array of objects)

**Journal Line Required Fields:**
- `accountId` (string) - ID of the account
- Either `debit` OR `credit` (decimal) - Must have one, not both, not neither

**Validation Rules:**
- ✅ Total debits MUST equal total credits (double-entry bookkeeping)
- ✅ Each line must have either debit OR credit (not both, not neither)
- ✅ Each line must have an accountId

**Response (201 Created):**
```json
{
  "id": "clx789...",
  "date": "2024-12-03T00:00:00.000Z",
  "description": "Initial capital investment",
  "referenceNo": "JE-001",
  "status": "DRAFT",
  "journalLines": [
    {
      "id": "clx456...",
      "accountId": "clx123...",
      "debit": "10000.00",
      "credit": "0.00",
      "description": "Cash received",
      "account": {
        "id": "clx123...",
        "code": "1000",
        "name": "Cash",
        "type": "ASSET"
      }
    },
    {
      "id": "clx457...",
      "accountId": "clx124...",
      "debit": "0.00",
      "credit": "10000.00",
      "description": "Capital contribution",
      "account": {
        "id": "clx124...",
        "code": "3000",
        "name": "Capital",
        "type": "EQUITY"
      }
    }
  ],
  "createdAt": "2024-12-03T10:00:00.000Z",
  "updatedAt": "2024-12-03T10:00:00.000Z"
}
```

**Error Responses:**
- `400` - Validation errors:
  - "Total debits must equal total credits"
  - "Each journal line must have either a debit or credit amount"
  - "Each journal line cannot have both debit and credit amounts"
  - "Each journal line must have an accountId"

**Example (curl):**
```bash
curl -X POST http://localhost:8000/api/journal-entries \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-12-03",
    "description": "Initial capital",
    "journalLines": [
      {
        "accountId": "clx123...",
        "debit": "10000.00",
        "credit": "0.00"
      },
      {
        "accountId": "clx124...",
        "debit": "0.00",
        "credit": "10000.00"
      }
    ]
  }'
```

---

### POST `/api/journal-entries/:id/post`
Post a journal entry (change status from DRAFT to POSTED).

**What it does:**
- Changes status from DRAFT to POSTED
- Updates account balances based on the journal lines

**Response:**
```json
{
  "id": "clx789...",
  "status": "POSTED",
  ...
}
```

**Note:** Once posted, journal lines cannot be modified.

---

### PUT `/api/journal-entries/:id`
Update a journal entry.

**Request Body:**
```json
{
  "date": "2024-12-04",
  "description": "Updated description",
  "status": "DRAFT",
  "journalLines": [
    {
      "accountId": "clx123...",
      "debit": "5000.00",
      "credit": "0.00"
    },
    {
      "accountId": "clx124...",
      "debit": "0.00",
      "credit": "5000.00"
    }
  ]
}
```

**Restrictions:**
- Cannot modify journal lines if status is POSTED
- Must still maintain double-entry (debits = credits)

---

### DELETE `/api/journal-entries/:id`
Delete a journal entry.

**Response:**
- `204 No Content` - Successfully deleted

**Restrictions:**
- Cannot delete if status is POSTED

---

## 📷 Receipts Endpoints

Receipt scanning: upload image → PaddleOCR extracts text → GPT-3.5 parses to JSON (vendor, date, amount, category, confidence). Review, edit, then approve to create a journal entry (debit expense, credit payment).

### POST `/api/receipts/upload`
Upload a receipt image. Server runs OCR and optional GPT parsing, then creates a receipt with status `PENDING`.

**Request:** `multipart/form-data` with field `image` (file).

**Response:**
```json
{
  "id": "clx...",
  "imageUrl": "/uploads/receipt-xxx.jpg",
  "extractedData": {
    "vendor": "Store Name",
    "date": "2024-12-03",
    "amount": 42.50,
    "category": "Office Supplies",
    "confidence": 0.9,
    "rawText": "..."
  },
  "status": "PENDING",
  "journalEntryId": null,
  "createdAt": "...",
  "updatedAt": "..."
}
```

### GET `/api/receipts`
List receipts. Optional query: `?status=PENDING` or `APPROVED` or `REJECTED`.

### GET `/api/receipts/:id`
Get one receipt (includes linked journal entry if any).

### PUT `/api/receipts/:id`
Update extracted data and/or status. Body: `{ "extractedData": { ... }, "status": "PENDING" }`.

### POST `/api/receipts/:id/approve`
Create journal entry from receipt (debit expense, credit payment) and link receipt.

**Request Body:**
```json
{
  "expenseAccountId": "account-id",
  "paymentAccountId": "account-id"
}
```

**Response:** `{ "receipt": { ... }, "journalEntry": { ... } }`

### POST `/api/receipts/:id/reject`
Set receipt status to `REJECTED`.

---

## 🔍 Testing Your Endpoints

### Using curl

**Create an account:**
```bash
curl -X POST http://localhost:8000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "code": "1000",
    "name": "Cash",
    "type": "ASSET"
  }'
```

**Get all accounts:**
```bash
curl http://localhost:8000/api/accounts
```

**Create a journal entry:**
```bash
# First, get account IDs
curl http://localhost:8000/api/accounts

# Then create journal entry (replace account IDs)
curl -X POST http://localhost:8000/api/journal-entries \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-12-03",
    "description": "Test entry",
    "journalLines": [
      {
        "accountId": "YOUR_ACCOUNT_ID_1",
        "debit": "100.00",
        "credit": "0.00"
      },
      {
        "accountId": "YOUR_ACCOUNT_ID_2",
        "debit": "0.00",
        "credit": "100.00"
      }
    ]
  }'
```

### Using Postman or Insomnia

1. Set method to POST
2. URL: `http://localhost:8000/api/accounts` or `/api/journal-entries`
3. Headers: `Content-Type: application/json`
4. Body: Raw JSON with the request body format above

### Using JavaScript/Fetch

See the frontend API client examples in the next section.

---

## 📱 Frontend Integration

See `client/lib/api.ts` for a ready-to-use API client.

