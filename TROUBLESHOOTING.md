# Troubleshooting: "Failed to fetch" Error

## Quick Fix Checklist

### 1. ✅ Is Your Backend Server Running?

**Check:**
```bash
cd server
npm run dev
```

**Expected output:**
```
Server running on http://localhost:8000
```

**If not running:**
- Start it in a terminal
- Make sure it's on port 8000 (or update your API URL)

---

### 2. ✅ Is Your Frontend Server Running?

**Check:**
```bash
cd client
npm run dev
```

**Expected output:**
```
- ready started server on 0.0.0.0:3000
- Local:        http://localhost:3000
```

**If not running:**
- Start it in a separate terminal

---

### 3. ✅ Check Backend is Accessible

**Test in browser or terminal:**
```bash
curl http://localhost:8000/api/health
```

**Expected response:**
```json
{"message":"Server is running"}
```

**If this fails:**
- Backend is not running or wrong port
- Check server terminal for errors

---

### 4. ✅ Check Environment Variable

**Create `client/.env.local`:**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Important:**
- Must be in `client/` folder (not `server/`)
- Must start with `NEXT_PUBLIC_` for Next.js
- Restart frontend server after creating/editing

**Verify it's loaded:**
- Check browser console for the API URL being used
- Or add `console.log(API_URL)` in `client/lib/api.ts`

---

### 5. ✅ Check CORS Configuration

**Your backend has CORS enabled:**
```javascript
app.use(cors());
```

**If you still get CORS errors:**
- Make sure backend is running
- Check browser console for specific CORS error messages

---

### 6. ✅ Check Browser Console

**Open browser DevTools (F12):**
- Go to Console tab
- Look for specific error messages
- Check Network tab to see if requests are being made

**Common errors:**
- `Failed to fetch` → Backend not running or wrong URL
- `CORS error` → CORS configuration issue
- `404 Not Found` → Wrong API endpoint
- `500 Internal Server Error` → Backend error

---

## Step-by-Step Fix

### Step 1: Start Backend
```bash
cd server
npm run dev
```

**Wait for:** `Server running on http://localhost:8000`

### Step 2: Test Backend
```bash
# In another terminal
curl http://localhost:8000/api/health
```

**Should return:** `{"message":"Server is running"}`

### Step 3: Create Environment File
```bash
cd client
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

### Step 4: Restart Frontend
```bash
# Stop frontend (Ctrl+C)
# Then restart
npm run dev
```

### Step 5: Test Frontend
- Open `http://localhost:3000/bookkeeping`
- Check browser console (F12) for errors
- Check Network tab to see API calls

---

## Common Issues

### Issue: Backend on Different Port

**If your backend runs on port 3001:**
```bash
# client/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Issue: Backend Not Starting

**Check for errors:**
```bash
cd server
npm run dev
```

**Common errors:**
- `Port already in use` → Change PORT in server/.env
- `Cannot find module` → Run `npm install`
- `Database connection failed` → Check DATABASE_URL in server/.env

### Issue: Environment Variable Not Loading

**Next.js requires:**
1. File named `.env.local` (not `.env`)
2. Variable starts with `NEXT_PUBLIC_`
3. Restart dev server after changes

**Verify:**
```typescript
// Add this temporarily to client/lib/api.ts
console.log('API_URL:', API_URL);
```

### Issue: Database Connection

**If backend starts but API calls fail:**
```bash
cd server
npm run db:generate
npm run db:migrate
```

---

## Quick Test Script

Create `test-connection.js` in server folder:

```javascript
import prisma from './src/db/prisma.js';

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
    
    const count = await prisma.account.count();
    console.log(`✅ Found ${count} accounts`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
```

Run: `node test-connection.js`

---

## Still Not Working?

1. **Check both terminals:**
   - Backend terminal: Any errors?
   - Frontend terminal: Any errors?

2. **Check browser console:**
   - F12 → Console tab
   - Look for red error messages

3. **Check Network tab:**
   - F12 → Network tab
   - Try loading page
   - See if requests to `localhost:8000` are being made
   - Check response status codes

4. **Verify URLs:**
   - Backend: `http://localhost:8000`
   - Frontend: `http://localhost:3000`
   - API calls should go to: `http://localhost:8000/api/*`

---

## Summary

**Most common cause:** Backend server not running

**Quick fix:**
1. Start backend: `cd server && npm run dev`
2. Start frontend: `cd client && npm run dev`
3. Create `.env.local` if missing
4. Restart frontend after creating `.env.local`
