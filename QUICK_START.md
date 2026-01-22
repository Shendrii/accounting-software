# Quick Start Guide

## ✅ Your Setup Status

### Backend: **COMPLETE** ✅
- POST endpoints are ready and working
- All CRUD operations available
- Double-entry validation in place

### Frontend: **READY TO USE** ✅
- API client created (`client/lib/api.ts`)
- Example form component created
- Just need to connect them!

---

## 🚀 How to Use Your POST Endpoints

### Option 1: Test with curl (Right Now!)

**1. Make sure your server is running:**
```bash
cd server
npm run dev
```

**2. Create an account:**
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

**3. Get all accounts:**
```bash
curl http://localhost:8000/api/accounts
```

**4. Create a journal entry:**
```bash
# Replace ACCOUNT_ID_1 and ACCOUNT_ID_2 with actual IDs from step 3
curl -X POST http://localhost:8000/api/journal-entries \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2024-12-03",
    "description": "Initial capital",
    "journalLines": [
      {
        "accountId": "ACCOUNT_ID_1",
        "debit": "10000.00",
        "credit": "0.00"
      },
      {
        "accountId": "ACCOUNT_ID_2",
        "debit": "0.00",
        "credit": "10000.00"
      }
    ]
  }'
```

---

### Option 2: Use from React/Next.js

**1. Set up environment variable:**

Create `client/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**2. Use the API client in your components:**

```typescript
'use client';

import { createAccount, getAccounts } from '@/lib/api';
import { useState } from 'react';

export default function MyComponent() {
  const [accounts, setAccounts] = useState([]);

  // Create an account
  const handleCreate = async () => {
    try {
      const newAccount = await createAccount({
        code: '1000',
        name: 'Cash',
        type: 'ASSET',
        description: 'Cash in hand'
      });
      console.log('Created:', newAccount);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // Get all accounts
  const handleFetch = async () => {
    try {
      const allAccounts = await getAccounts();
      setAccounts(allAccounts);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <button onClick={handleCreate}>Create Account</button>
      <button onClick={handleFetch}>Get Accounts</button>
    </div>
  );
}
```

**3. Use the example form component:**

Import and use `CreateAccountForm` from `app/components/CreateAccountForm.tsx`:

```typescript
import CreateAccountForm from '@/app/components/CreateAccountForm';

export default function Page() {
  return <CreateAccountForm />;
}
```

---

## 📁 What Was Created

### Backend Files (Already Done)
- ✅ `server/src/routes/accounts.js` - Account endpoints
- ✅ `server/src/routes/journalEntries.js` - Journal entry endpoints
- ✅ `server/src/app.js` - Server setup with routes

### Frontend Files (Just Created)
- ✅ `client/lib/api.ts` - API client with all functions
- ✅ `client/app/components/CreateAccountForm.tsx` - Example form component

### Documentation
- ✅ `API_ENDPOINTS.md` - Complete API reference
- ✅ `SETUP_STATUS.md` - What's done and what's missing
- ✅ `QUICK_START.md` - This file!

---

## 🎯 Next Steps

1. **Test the endpoints** using curl (see Option 1 above)

2. **Set up frontend environment:**
   ```bash
   cd client
   # Create .env.local file with NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. **Start both servers:**
   ```bash
   # Terminal 1: Backend
   cd server
   npm run dev

   # Terminal 2: Frontend
   cd client
   npm run dev
   ```

4. **Use the API client** in your React components (see Option 2 above)

5. **Build your UI** - Create forms, tables, etc. using the API client functions

---

## 📚 Available API Functions

All functions are in `client/lib/api.ts`:

### Accounts
- `getAccounts()` - Get all accounts
- `getAccount(id)` - Get one account
- `createAccount(data)` - **POST endpoint** ✅
- `updateAccount(id, data)` - Update account
- `deleteAccount(id)` - Delete account

### Journal Entries
- `getJournalEntries(filters?)` - Get all entries
- `getJournalEntry(id)` - Get one entry
- `createJournalEntry(data)` - **POST endpoint** ✅
- `updateJournalEntry(id, data)` - Update entry
- `postJournalEntry(id)` - Post entry (update balances)
- `deleteJournalEntry(id)` - Delete entry

---

## 💡 Example: Creating a Journal Entry

```typescript
import { createJournalEntry } from '@/lib/api';

// First, get account IDs
const accounts = await getAccounts();
const cashAccount = accounts.find(a => a.code === '1000');
const capitalAccount = accounts.find(a => a.code === '3000');

// Create journal entry
const entry = await createJournalEntry({
  date: '2024-12-03',
  description: 'Initial capital investment',
  referenceNo: 'JE-001',
  journalLines: [
    {
      accountId: cashAccount.id,
      debit: 10000,
      credit: 0,
      description: 'Cash received'
    },
    {
      accountId: capitalAccount.id,
      debit: 0,
      credit: 10000,
      description: 'Capital contribution'
    }
  ]
});
```

---

## ✅ Summary

**You're ready to go!** Your POST endpoints are:
- ✅ Created and working
- ✅ Documented
- ✅ Accessible via API client
- ✅ Ready to use in React components

Just:
1. Test with curl to verify
2. Set up `.env.local` in client
3. Start building your UI components!

