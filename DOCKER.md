# Docker setup – step-by-step

This project runs in Docker with four services: **PostgreSQL**, **OCR (Google Cloud Vision API)**, **Node API (server)**, and **Next.js (client)**.

---

## Step 1: Prerequisites

- **Docker** and **Docker Compose** installed.
- From the project root, all commands below assume you're in the `accounting` directory.

```bash
docker --version
docker compose version
```

---

## Step 2: (Optional) Environment file

Create a `.env` file in the project root if you want to override defaults:

```bash
cp .env.docker.example .env
```

Default values in `docker-compose.yml` are fine for local use:

- DB: `postgres` / `postgres` / `accounting`
- API URL for the browser: `http://localhost:8000`
- **Receipt scanning:** Set `OPENAI_API_KEY` in `.env` for GPT-3.5 parsing of OCR text (optional; OCR still runs without it).
- **OCR (Cloud Vision):** See “Cloud Vision setup” below to provide a GCP service account key for receipt text extraction.

---

### Cloud Vision setup (OCR)

Receipt text extraction uses **Google Cloud Vision API**. You must provide a service account JSON key:

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a project (or select one), enable **Cloud Vision API**.
3. Create a **Service account** → **Keys** → **Add key** → **Create new key** → JSON. Download the file.
4. Save the key in the project root as `gcp-key.json` (or set `GCP_KEY_PATH` in `.env` to your key path).
5. Ensure the key file is mounted: in `docker-compose.yml` the OCR service mounts `${GCP_KEY_PATH:-./gcp-key.json}` as `/app/gcp-key.json` in the container.

Without this key, receipt upload will fail with a clear error asking for credentials.

---

## Step 3: Build and run

From the project root:

```bash
docker compose up --build
```

- First run builds the **ocr**, **server**, and **client** images and starts **db**, **ocr**, **server**, and **client**.
- **Server** runs Prisma migrations on startup (`prisma migrate deploy`).
- **Client** is built with `NEXT_PUBLIC_API_URL` so the browser can call the API.

---

## Step 4: Use the app

- **App (Next.js):** http://localhost:3000  
- **API (Express):** http://localhost:8000  

The client is configured to call `http://localhost:8000` when you open the app in your browser.

---

## Step 5: Stop and clean up

```bash
# Stop containers
docker compose down

# Stop and remove database volume (resets DB data)
docker compose down -v
```

---

## Architecture overview

| Service  | Image / build      | Port | Role                          |
|----------|--------------------|------|-------------------------------|
| **db**   | `postgres:16-alpine` | 5432 | PostgreSQL                    |
| **ocr**  | `./ocr` Dockerfile | 5000 | Google Cloud Vision API (receipt text extraction) |
| **server** | `./server` Dockerfile | 8000 | Express + Prisma, runs migrations on start |
| **client** | `./client` Dockerfile | 3000 | Next.js (standalone build)   |

- **db** has a healthcheck; **server** starts only after DB is healthy.
- **server** calls **ocr** for receipt scanning; **client** depends on **server** (browser uses `NEXT_PUBLIC_API_URL`).

---

## Useful commands

```bash
# Build without cache
docker compose build --no-cache

# Run in background
docker compose up -d --build

# View logs
docker compose logs -f

# Logs for one service
docker compose logs -f server

# Shell into server container
docker compose exec server sh

# Run Prisma Studio (migrations already applied by container)
docker compose exec server npx prisma studio
```

---

## Troubleshooting

1. **Port already in use**  
   Change host ports in `docker-compose.yml` (e.g. `"3001:3000"` for the client).

2. **Client can’t reach API**  
   Ensure `NEXT_PUBLIC_API_URL` is what the browser should use (e.g. `http://localhost:8000` for local Docker). Rebuild after changing:  
   `docker compose up --build`

3. **DB connection errors on server start**  
   Compose waits for the DB healthcheck. If it still fails, check `POSTGRES_*` and `DATABASE_URL` match (user, password, db name, host `db`).

4. **Reset database**  
   `docker compose down -v` then `docker compose up --build`.

5. **Receipt OCR / Cloud Vision**  
   Receipt text extraction uses **Google Cloud Vision API**. Ensure you have a GCP service account JSON key at `./gcp-key.json` (or set `GCP_KEY_PATH` in `.env`) so it is mounted into the OCR container. If OCR fails, check `docker compose logs ocr` for errors. For structured parsing (vendor, amounts, dates), set **OPENAI_API_KEY** in `.env` for GPT-3.5 (optional).
