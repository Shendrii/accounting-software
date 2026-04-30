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

## OCR service (for receipt scanning)

Receipt OCR runs locally using **Tesseract** — free, no API key, no rate limits.

```bash
# 1. Install the Tesseract engine (one-time)
brew install tesseract        # macOS
# sudo apt install tesseract-ocr    # Ubuntu/Debian

# 2. Install Python dependencies
cd ocr
pip3 install -r requirements.txt

# 3. Run the OCR server
python3 app.py
```

OCR runs on **http://localhost:5001** by default. (Port 5000 is reserved by macOS AirPlay Receiver on recent versions.) The backend defaults to this URL — override with `OCR_SERVICE_URL` in `server/.env` if needed.

Health check: `curl http://localhost:5001/health` should return `{"status":"ok","engine":"tesseract <version>"}`.
