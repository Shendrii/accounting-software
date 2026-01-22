# Fix: Database Schema Out of Sync

## The Problem

Your Prisma schema has fields that don't exist in your database:
- `JournalLine.description` - missing in database
- `JournalLine.createdAt` - missing in database  
- `Account.description` - missing in database
- `Account.isActive` - missing in database

## The Solution

Run a migration to add the missing fields:

```bash
npm run db:migrate
```

This will:
1. Detect the differences between your schema and database
2. Create a new migration file
3. Apply the changes to your database

## What Will Happen

When you run `npm run db:migrate`, Prisma will:
1. Ask you to name the migration (e.g., "add_missing_fields")
2. Generate SQL to add the missing columns:
   ```sql
   ALTER TABLE "JournalLine" ADD COLUMN "description" TEXT;
   ALTER TABLE "JournalLine" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
   ALTER TABLE "Account" ADD COLUMN "description" TEXT;
   ALTER TABLE "Account" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
   ```
3. Apply these changes to your database

## After Running the Migration

1. Regenerate Prisma Client:
   ```bash
   npm run db:generate
   ```

2. Restart Prisma Studio:
   ```bash
   npm run db:studio
   ```

Now the error should be gone!


