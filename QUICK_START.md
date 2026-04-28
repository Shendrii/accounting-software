# Quick Start

## Prerequisites

- Node.js 18+
- PostgreSQL running locally

## 1. Set up the database

Create a `.env` file in the `server/` directory (already exists):

```
PORT=8000
NODE_ENV=development
DATABASE_URL="postgresql://<user>@localhost:5432/accounting_system_db?schema=public"
```

Push the schema to the database:

```bash
cd server
npx prisma db push
```

## 2. Start the backend

```bash
cd server
npm run dev
```

API available at **http://localhost:8000**

## 3. Start the frontend

```bash
cd client
npm run dev
```

App available at **http://localhost:3000**

---

## Features

| Page | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| Bookkeeping (accounts + journal entries) | http://localhost:3000/bookkeeping |
| Receipts (OCR upload + expense tracking) | http://localhost:3000/receipts |
| Customers | http://localhost:3000/customers |
| Invoices | http://localhost:3000/invoices |
| Vendors | http://localhost:3000/vendors |
| Bills | http://localhost:3000/bills |
| Reports (P&L, Balance Sheet, Trial Balance) | http://localhost:3000/reports |
| Bank Reconciliation | http://localhost:3000/reconciliation |

## OCR service (optional)

Receipt OCR uses Google Cloud Vision via a local Flask server.

```bash
cd ocr
pip install -r requirements.txt
# Set GCP_API_KEY or GOOGLE_APPLICATION_CREDENTIALS in environment
python app.py
```

OCR runs on **http://localhost:5000**. Set `OCR_SERVICE_URL=http://localhost:5000` in `server/.env` to connect it.
