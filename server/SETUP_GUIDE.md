# Bookkeeping System Setup Guide

This guide explains each command you'll run and why it's necessary for your accounting software.

## Step 1: Install Dependencies

### Command:
```bash
cd server
npm install
```

### Why you need this:
When you add packages to `package.json` (like `@prisma/client`, `express`, etc.), they're just listed in the file. The actual code files aren't stored in your project - they need to be downloaded from the npm registry (Node Package Manager).

**What happens:**
- npm reads your `package.json` file
- Downloads all packages listed in `dependencies` and `devDependencies`
- Stores them in the `node_modules` folder
- Creates a `package-lock.json` file that locks exact versions

**Example:**
- Before: `package.json` says "I need express version ^5.1.0"
- After: `node_modules/express/` folder exists with all Express code

**Think of it like:** Installing apps on your phone - the app store listing isn't the app itself, you need to download it.

---

## Step 2: Generate Prisma Client

### Command:
```bash
npm run db:generate
```

### Why you need this:
Prisma Client is a **type-safe database query builder** that's automatically generated from your Prisma schema. It's like having a translator between your JavaScript code and your PostgreSQL database.

**What happens:**
- Prisma reads your `schema.prisma` file
- Generates JavaScript/TypeScript code in `node_modules/.prisma/client/`
- This code knows about your models (Account, JournalEntry, JournalLine)
- Gives you methods like `prisma.account.findMany()`, `prisma.journalEntry.create()`, etc.

**Example:**
```javascript
// Without Prisma Client, you'd write raw SQL:
const result = await db.query('SELECT * FROM "Account" WHERE code = $1', ['1000']);

// With Prisma Client (type-safe and easier):
const account = await prisma.account.findUnique({
  where: { code: '1000' }
});
```

**Why regenerate?**
- Every time you change your `schema.prisma` file, you need to regenerate
- The generated code must match your current schema
- If you don't regenerate, you might try to use fields that don't exist yet

**Think of it like:** Compiling code - your schema is the source code, Prisma Client is the compiled program.

---

## Step 3: Run Database Migrations

### Command:
```bash
npm run db:migrate
```

### Why you need this:
A **migration** is a script that changes your database structure. Your `schema.prisma` file describes what your database SHOULD look like, but your actual PostgreSQL database might not match yet.

**What happens:**
1. Prisma compares your schema to the current database state
2. Creates a new migration file (if changes detected)
3. Applies the migration to your database
4. Updates the `_prisma_migrations` table to track what's been applied

**Example:**
- Your schema says: "Account table should have a `description` field"
- Your database might not have that column yet
- Migration creates: `ALTER TABLE "Account" ADD COLUMN "description" TEXT;`
- Runs that SQL against your database

**What you'll see:**
```
✔ Enter a name for the new migration: add_description_to_account
✔ Applying migration `20251203100529_add_description_to_account`
```

**Why migrations matter:**
- They're version control for your database
- You can roll back changes if needed
- Team members can apply the same changes to their databases
- Production deployments use migrations to update live databases safely

**Think of it like:** Git commits for your database structure - each migration is a snapshot of changes.

---

## Step 4: Start the Development Server

### Command:
```bash
npm run dev
```

### Why you need this:
This starts your Express server so it can receive HTTP requests from your frontend or API clients.

**What happens:**
- Runs `nodemon src/server.js` (from your package.json scripts)
- `nodemon` watches for file changes and automatically restarts the server
- Server starts on the port specified in your `.env` file (default: 8000)
- Your API endpoints become available at `http://localhost:8000`

**What you'll see:**
```
Server running on http://localhost:8000
```

**Example API calls you can make:**
```bash
# Get all accounts
curl http://localhost:8000/api/accounts

# Create an account
curl -X POST http://localhost:8000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"code":"1000","name":"Cash","type":"ASSET"}'

# Get all journal entries
curl http://localhost:8000/api/journal-entries
```

**Why `nodemon`?**
- Without it: You'd manually restart the server after every code change
- With it: Save a file → server automatically restarts → see changes immediately
- Saves tons of time during development!

**Think of it like:** Starting a web server - your code is ready, but nothing happens until you start the server process.

---

## Additional Useful Commands

### View Your Database with Prisma Studio
```bash
npm run db:studio
```

**Why:** Opens a visual database browser at `http://localhost:5555`. You can:
- View all your tables and data
- Edit records directly
- See relationships between tables
- Great for debugging and testing

**Example use:** Create test accounts and journal entries without writing API calls.

---

### Deploy Migrations (Production)
```bash
npm run db:migrate:deploy
```

**Why:** In production, you don't want Prisma to create new migrations - you just want to apply existing ones. This command:
- Applies all pending migrations
- Doesn't create new migration files
- Safe for production deployments

**When to use:**
- Deploying to production/staging
- CI/CD pipelines
- When migrations are already created and tested

---

## Common Workflow Example

Here's a typical development workflow:

```bash
# 1. First time setup
npm install                    # Download all packages
npm run db:generate           # Generate Prisma Client
npm run db:migrate            # Create database tables

# 2. Daily development
npm run dev                   # Start server (leave this running)

# 3. When you change the schema
# Edit schema.prisma, then:
npm run db:generate           # Regenerate client
npm run db:migrate            # Update database structure

# 4. Testing/debugging
npm run db:studio             # Open database browser in another terminal
```

---

## Troubleshooting

### "Cannot find module '@prisma/client'"
**Solution:** Run `npm install` - the package isn't installed yet.

### "Schema has changed, please run prisma generate"
**Solution:** Run `npm run db:generate` - your schema changed but client wasn't regenerated.

### "Migration failed"
**Solution:** Check your database connection in `.env`. Make sure PostgreSQL is running and the database exists.

### "Port already in use"
**Solution:** Change `PORT` in `.env` or stop the other process using that port.

---

## Key Concepts Summary

1. **npm install** = Download packages
2. **prisma generate** = Create database query code from schema
3. **prisma migrate** = Update database structure to match schema
4. **npm run dev** = Start your server

Remember: Schema changes → Generate → Migrate → Restart server

