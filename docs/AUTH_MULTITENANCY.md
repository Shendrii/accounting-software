# Authentication and workspace isolation

## Model

- Each **User** can belong to multiple **Workspaces** via **WorkspaceMember** (roles: OWNER, ADMIN, MEMBER).
- New signups get a **PERSONAL** workspace by default; **TEAM** workspaces can be created and shared via invites.
- Accounting rows (`Account`, `Invoice`, etc.) are scoped by `workspaceId`. The API sets the active workspace from the `x-workspace-id` header (or the user’s first workspace if omitted). Prisma middleware injects `workspaceId` on reads/writes for scoped models.

## Environment variables

### Backend (`server/.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_ACCESS_SECRET` | Yes | Secret for signing access JWTs |
| `JWT_ACCESS_EXPIRES_IN` | No | JWT lifetime (default `15m`) |
| `CORS_ORIGINS` | Prod: yes | Comma-separated allowed front-end origins |
| `APP_CLIENT_URL` | For Google sign-in | Next.js URL; OAuth callback redirects here with `#session=...` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Optional | Google OAuth |
| `AUTH_RATE_LIMIT_MAX` | No | Login/signup attempts per IP per 15 min (default `25`) |

Invoice email uses **Nodemailer + SMTP** (e.g. Gmail with an app password): `SMTP_USER` / `SMTP_PASS`, or `GMAIL_USER` / `GMAIL_APP_PASSWORD`. See `server/.env.example` for the full list (AI, OCR, optional bootstrap).

### Frontend (`client/.env.local` / Vercel)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | Backend base URL (e.g. `https://your-api.onrender.com`) |

## Database setup

From `server/`:

```bash
npx prisma generate
npx prisma db push
# or: npx prisma migrate dev
npm run db:seed
```

`db:seed` only creates a user/workspace when the database has **zero users** and both `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are set.

## Deploy notes (Render + Vercel)

1. Set **the same** `JWT_ACCESS_SECRET` on the Render web service; rotate if leaked.
2. Set `CORS_ORIGINS` to your Vercel production URL(s), comma-separated.
3. Set `APP_CLIENT_URL` to your Vercel URL so Google OAuth can redirect back with a one-use ticket bound to the browser's sign-in verifier. Raw session fragments are rejected; authenticated requests require a live database-backed session.
4. **Google OAuth:** Authorized redirect URI = `{API}/api/auth/google/callback` (your Render URL).
5. Enable **trust proxy** is handled in Express for correct rate-limit behavior behind Render’s proxy.

**Google callback:** With `APP_CLIENT_URL` set, the API redirects the browser to `{APP_CLIENT_URL}/auth/callback#session=…` (session payload is base64url JSON). For a raw JSON response (e.g. API testing), call the callback with `?format=json`.

**Rate limits:** `/api/auth/signup` and `/api/auth/login` are limited per IP (see `AUTH_RATE_LIMIT_MAX`, default 25 per 15 minutes) in addition to a looser limit on all `/api/auth` routes.

## Legacy data

This schema expects every accounting row to have `workspaceId`. If you ever had rows without workspaces, migrate manually into a workspace or start from a fresh database; do **not** run production without completing `db push`/migrations first.
