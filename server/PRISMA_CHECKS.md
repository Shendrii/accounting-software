# How to Check Your Prisma Setup

This guide shows you different ways to verify and inspect your Prisma database setup.

---

## 1. Prisma Studio - Visual Database Browser (Easiest!)

### Command:
```bash
npm run db:studio
```

### What it does:
Opens a **web-based GUI** to view and edit your database. It's like phpMyAdmin or pgAdmin, but specifically for Prisma.

### Why use it:
- **Visual interface** - See all your tables and data in a browser
- **No SQL knowledge needed** - Click to view, edit, create records
- **Great for testing** - Quickly add test data
- **See relationships** - View how Account relates to JournalLine

### What you'll see:
1. Opens at `http://localhost:5555` in your browser
2. Left sidebar shows all your models:
   - Account
   - JournalEntry
   - JournalLine
3. Click any model to see all records
4. Click "Add record" to create new data
5. Click any record to edit it

### Example workflow:
```bash
# Terminal 1: Start your server
npm run dev

# Terminal 2: Open Prisma Studio
npm run db:studio

# Now you can:
# - View all accounts in the Account table
# - Create a new account by clicking "Add record"
# - See journal entries and their lines
# - Edit any data directly
```

### When to use:
- ✅ Testing your API - Create test data visually
- ✅ Debugging - See what's actually in your database
- ✅ Development - Quick data entry without writing API calls
- ✅ Learning - Understand your data structure visually

---

## 2. Check Prisma Client Generation

### Command:
```bash
npm run db:generate
```

### What to look for:
**Success output:**
```
✔ Generated Prisma Client (v6.0.0) to ./node_modules/.prisma/client in 123ms
```

**If you see errors:**
- `Schema has changed` - Your schema.prisma was modified, regenerate needed
- `Cannot find module` - Run `npm install` first
- `Missing DATABASE_URL` - Check your `.env` file

### Verify it worked:
Check if the generated client exists:
```bash
ls node_modules/.prisma/client
```

You should see files like:
- `index.js`
- `index.d.ts`
- `schema.prisma` (generated copy)

---

## 3. Check Database Connection

### Command:
```bash
npx prisma db pull
```

### What it does:
Connects to your database and shows if the connection works. It also compares your schema to the actual database.

### What you'll see:
**If connected successfully:**
```
✔ Introspected database and found 3 models
```

**If connection fails:**
```
Error: Can't reach database server
```
→ Check your `DATABASE_URL` in `.env`

### Alternative - Test connection with a simple script:

Create a test file: `test-connection.js`
```javascript
import prisma from './src/db/prisma.js';

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful!');
    
    // Try a simple query
    const count = await prisma.account.count();
    console.log(`📊 Total accounts in database: ${count}`);
    
    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
```

Run it:
```bash
node test-connection.js
```

---

## 4. Check Migration Status

### Command:
```bash
npx prisma migrate status
```

### What it does:
Shows which migrations have been applied to your database.

### What you'll see:
**If migrations are up to date:**
```
✔ Database schema is up to date!
```

**If migrations are pending:**
```
The following migrations have not yet been applied:
  20251203100529_init
```

**If there are schema changes:**
```
⚠ Your database schema is not in sync with your Prisma schema
```

### Why check this:
- Before deploying to production
- When working in a team (see if you need to run migrations)
- After pulling code changes

---

## 5. Validate Your Schema

### Command:
```bash
npx prisma validate
```

### What it does:
Checks if your `schema.prisma` file is valid (no syntax errors, correct relationships, etc.).

### What you'll see:
**If valid:**
```
✔ The schema at prisma/schema.prisma is valid
```

**If there are errors:**
```
Error: Field "accountId" in model "JournalLine" references "Account" but the relation field is missing.
```
→ Fix the error in your schema

### When to use:
- After editing `schema.prisma`
- Before running migrations
- When you get confusing errors

---

## 6. View Your Schema in Browser

### Command:
```bash
npx prisma format
```

### What it does:
Formats your `schema.prisma` file (makes it pretty) and validates it.

### Also try:
```bash
npx prisma format --schema=./prisma/schema.prisma
```

This ensures your schema is properly formatted and catches syntax issues early.

---

## 7. Check What Models Exist

### Quick check in code:
Create a file `check-models.js`:
```javascript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List all available models
console.log('Available Prisma models:');
console.log('- Account');
console.log('- JournalEntry');
console.log('- JournalLine');

// Test each model
async function checkModels() {
  try {
    const accountCount = await prisma.account.count();
    const entryCount = await prisma.journalEntry.count();
    const lineCount = await prisma.journalLine.count();
    
    console.log('\n📊 Current database counts:');
    console.log(`Accounts: ${accountCount}`);
    console.log(`Journal Entries: ${entryCount}`);
    console.log(`Journal Lines: ${lineCount}`);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkModels();
```

---

## Quick Reference: Common Checks

| What you want to check | Command |
|------------------------|---------|
| **View database visually** | `npm run db:studio` |
| **Test connection** | `npx prisma db pull` |
| **Check migrations** | `npx prisma migrate status` |
| **Validate schema** | `npx prisma validate` |
| **Format schema** | `npx prisma format` |
| **Regenerate client** | `npm run db:generate` |

---

## Troubleshooting Checklist

If something's not working, check in this order:

1. ✅ **Is Prisma Client generated?**
   ```bash
   npm run db:generate
   ```

2. ✅ **Is database connected?**
   ```bash
   npx prisma db pull
   ```

3. ✅ **Are migrations applied?**
   ```bash
   npx prisma migrate status
   ```

4. ✅ **Is schema valid?**
   ```bash
   npx prisma validate
   ```

5. ✅ **Can I see the data?**
   ```bash
   npm run db:studio
   ```

---

## Recommended Daily Workflow

```bash
# Morning: Check everything is working
npx prisma validate          # Validate schema
npx prisma migrate status     # Check migrations
npm run db:studio            # Open visual browser

# During development: When you change schema
# 1. Edit schema.prisma
# 2. npm run db:generate     # Regenerate client
# 3. npm run db:migrate      # Update database
# 4. npm run db:studio       # Verify changes

# Before committing code
npx prisma validate          # Make sure schema is valid
npx prisma format            # Format schema nicely
```


