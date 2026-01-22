# Complete Guide: Changing Your Prisma Schema

This guide explains how to properly modify your database schema, when to use migrations, and when you can reset.

---

## ⚠️ Important: Migration vs Reset

### **Use Migrations** (Recommended - Production Safe)
- ✅ When you have **existing data** you want to keep
- ✅ When working in a **team** (others have the same database)
- ✅ When in **production** or **staging**
- ✅ When you want a **history** of changes

### **Use Reset** (Development Only)
- ✅ When you're in **early development** (no important data)
- ✅ When you want to **start fresh**
- ✅ When you're **testing** schema changes
- ⚠️ **WARNING**: Deletes ALL data!

---

## 📋 Step-by-Step: Changing Schema with Migrations

### Step 1: Edit Your Schema File

Open `prisma/schema.prisma` and make your changes.

**Example - Adding a new field:**
```prisma
model Account {
  id          String        @id @default(cuid())
  code        String        @unique
  name        String
  type        AccountType
  balance     Decimal       @default(0) @db.Decimal(15, 2)
  description String?
  isActive    Boolean       @default(true)
  // NEW FIELD:
  parentAccountId String?  // Adding this
  parentAccount   Account?  @relation("AccountHierarchy", fields: [parentAccountId], references: [id])
  childAccounts    Account[] @relation("AccountHierarchy")
  journalLines     JournalLine[]
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}
```

**Example - Removing a field:**
```prisma
model Account {
  // Remove this line:
  // description String?  ← Delete this
}
```

**Example - Changing a field type:**
```prisma
model Account {
  // Change from String to Int:
  code Int @unique  // Was: code String @unique
}
```

---

### Step 2: Generate Prisma Client

**Command:**
```bash
npm run db:generate
```

**Why:**
- Updates the generated Prisma Client code
- Makes new fields/methods available in your code
- **Note:** This doesn't change your database yet!

**What happens:**
- Prisma reads your updated `schema.prisma`
- Regenerates code in `node_modules/.prisma/client/`
- Your code can now use the new fields

**Expected output:**
```
✔ Generated Prisma Client (v6.0.0) to ./node_modules/.prisma/client in 123ms
```

---

### Step 3: Create and Apply Migration

**Command:**
```bash
npm run db:migrate
```

**What happens:**
1. Prisma compares your schema to the current database
2. Detects what changed
3. Asks you to name the migration:
   ```
   ✔ Enter a name for the new migration: add_parent_account_field
   ```
4. Creates a migration file in `prisma/migrations/YYYYMMDDHHMMSS_migration_name/`
5. Applies the migration to your database

**Example migration file created:**
```sql
-- Migration: 20251203120000_add_parent_account_field

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "parentAccountId" TEXT;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentAccountId_fkey" 
  FOREIGN KEY ("parentAccountId") REFERENCES "Account"("id") 
  ON DELETE SET NULL ON UPDATE CASCADE;
```

**Expected output:**
```
✔ Created migration `20251203120000_add_parent_account_field`
✔ Applying migration `20251203120000_add_parent_account_field`
✔ Migration applied successfully
```

---

### Step 4: Verify the Changes

**Option A: Check with Prisma Studio**
```bash
npm run db:studio
```
- Open `http://localhost:5555`
- Check if your new fields appear
- Verify data looks correct

**Option B: Check migration status**
```bash
npx prisma migrate status
```
Should show:
```
✔ Database schema is up to date!
```

**Option C: Test in code**
```javascript
// Try using the new field
const account = await prisma.account.create({
  data: {
    code: '1000',
    name: 'Cash',
    type: 'ASSET',
    parentAccountId: null, // New field!
  }
});
```

---

## 🔄 Complete Workflow Example

Let's say you want to add a `notes` field to `JournalEntry`:

```bash
# 1. Edit schema.prisma - add the field
# (Edit the file manually)

# 2. Generate Prisma Client
npm run db:generate

# 3. Create and apply migration
npm run db:migrate
# Enter name: add_notes_to_journal_entry

# 4. Verify
npm run db:studio
# Or test in your code
```

---

## 🗑️ Should You Delete Old Migrations?

### **NO - Keep Them!** (In Most Cases)

**Why keep migrations:**
- ✅ **History**: Shows how your database evolved
- ✅ **Team sync**: Others can apply the same changes
- ✅ **Rollback**: Can undo specific changes if needed
- ✅ **Production**: Need them to update production database
- ✅ **Debugging**: Understand what changed and when

**Migration files are like Git commits** - they're a history of changes.

---

### **YES - Delete Them** (Only in These Cases)

**When it's safe to delete migrations:**

1. **Very early development** (before any real data)
2. **Starting completely fresh** (wiping everything)
3. **Local development only** (not shared with team)

**How to reset everything:**

```bash
# ⚠️ WARNING: This deletes ALL data and migrations!

# 1. Delete all migration files
rm -rf prisma/migrations/*

# 2. Reset the database (drops all tables)
npx prisma migrate reset

# 3. Create a fresh migration
npm run db:migrate
# Name it: init

# 4. Generate client
npm run db:generate
```

**⚠️ Never do this if:**
- You have important data
- Others are using the same database
- You're in production/staging
- You've deployed to any environment

---

## 🔧 Common Schema Change Scenarios

### Scenario 1: Adding a New Field

```prisma
// Before
model Account {
  name String
}

// After
model Account {
  name String
  email String?  // New optional field
}
```

**Steps:**
1. Edit schema
2. `npm run db:generate`
3. `npm run db:migrate` (name: `add_email_to_account`)

**Result:** New column added, existing rows have `NULL` for email.

---

### Scenario 2: Removing a Field

```prisma
// Before
model Account {
  name String
  oldField String?  // Remove this
}

// After
model Account {
  name String
}
```

**Steps:**
1. Edit schema (remove the field)
2. `npm run db:generate`
3. `npm run db:migrate` (name: `remove_old_field_from_account`)

**⚠️ Warning:** Data in `oldField` will be lost!

**Result:** Column removed from database.

---

### Scenario 3: Changing Field Type

```prisma
// Before
model Account {
  code String @unique
}

// After
model Account {
  code Int @unique
}
```

**Steps:**
1. Edit schema
2. `npm run db:generate`
3. `npm run db:migrate` (name: `change_account_code_to_int`)

**⚠️ Warning:** 
- Existing string values might fail
- You may need to migrate data first
- Consider: `code String` → `code Int` might need data transformation

**Better approach for production:**
```prisma
// Add new field, migrate data, then remove old
code String @unique
codeInt Int? @unique  // Add this first
// Migrate data from code to codeInt
// Then remove code, rename codeInt to code
```

---

### Scenario 4: Adding a Relationship

```prisma
// Before
model Account {
  id String @id
}

// After
model Account {
  id String @id
  parentAccountId String?
  parentAccount Account? @relation("Hierarchy", fields: [parentAccountId], references: [id])
  childAccounts Account[] @relation("Hierarchy")
}
```

**Steps:**
1. Edit schema
2. `npm run db:generate`
3. `npm run db:migrate` (name: `add_account_hierarchy`)

**Result:** 
- New column `parentAccountId` added
- Foreign key constraint created
- Can now link accounts in a hierarchy

---

### Scenario 5: Making Field Required (Adding NOT NULL)

```prisma
// Before
model Account {
  description String?  // Optional
}

// After
model Account {
  description String  // Required
}
```

**⚠️ Critical Steps:**

1. **First, ensure all existing rows have values:**
   ```sql
   -- Run this SQL first if you have NULL values
   UPDATE "Account" SET "description" = '' WHERE "description" IS NULL;
   ```

2. Then edit schema
3. `npm run db:generate`
4. `npm run db:migrate` (name: `make_description_required`)

**Result:** Column becomes NOT NULL, database enforces it.

---

## 📝 Migration Naming Best Practices

Use descriptive names that explain what changed:

✅ **Good names:**
- `add_email_to_account`
- `remove_old_field_from_journal_entry`
- `make_description_required`
- `add_account_hierarchy_relationship`

❌ **Bad names:**
- `migration1`
- `update`
- `fix`
- `changes`

**Why:** Good names help you understand the database history later.

---

## 🔍 Troubleshooting

### Error: "Migration failed"

**Check:**
1. Is your database running?
2. Is `DATABASE_URL` correct in `.env`?
3. Do you have conflicting changes?

**Fix:**
```bash
# Check migration status
npx prisma migrate status

# If stuck, you can mark migration as applied (if SQL ran manually)
npx prisma migrate resolve --applied 20251203120000_migration_name
```

---

### Error: "Schema and database are out of sync"

**This means:** Your database doesn't match your schema.

**Fix:**
```bash
# Option 1: Create migration to sync
npm run db:migrate

# Option 2: Reset (if no important data)
npx prisma migrate reset
```

---

### Error: "Field already exists" or "Column doesn't exist"

**This means:** Migration was partially applied or rolled back.

**Fix:**
```bash
# Check what migrations are applied
npx prisma migrate status

# If needed, resolve manually
npx prisma migrate resolve --applied <migration_name>
# Or
npx prisma migrate resolve --rolled-back <migration_name>
```

---

## 📚 Quick Reference

| Action | Command | When to Use |
|--------|---------|-------------|
| **Change schema** | Edit `schema.prisma` | Anytime |
| **Update client** | `npm run db:generate` | After schema changes |
| **Create migration** | `npm run db:migrate` | When you want to update database |
| **Reset everything** | `npx prisma migrate reset` | Early dev, no important data |
| **Check status** | `npx prisma migrate status` | Verify migrations applied |
| **View database** | `npm run db:studio` | Visual inspection |

---

## 🎯 Summary: The Golden Rule

**Every time you change `schema.prisma`:**

1. ✅ Edit `schema.prisma`
2. ✅ Run `npm run db:generate` (updates client code)
3. ✅ Run `npm run db:migrate` (updates database)
4. ✅ Test your changes

**Keep migrations** unless you're starting completely fresh with no important data.

**Never delete migrations** if:
- You have real data
- Others are using the database
- You're in production
- You want to keep history

---

## 💡 Pro Tips

1. **Test migrations locally first** before applying to production
2. **Review migration SQL** before applying (Prisma shows it)
3. **Backup database** before major schema changes
4. **Use descriptive migration names** for future reference
5. **Commit migrations to Git** so team stays in sync

