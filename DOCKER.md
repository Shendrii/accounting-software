# Docker setup – step-by-step

This project runs in Docker with three services: **PostgreSQL**, **Node API (server)**, and **Next.js (client)**.

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

---

## Step 3: Build and run

From the project root:

```bash
docker compose up --build
```

- First run builds the **server** and **client** images and starts **db**, **server**, and **client**.
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
| **server** | `./server` Dockerfile | 8000 | Express + Prisma, runs migrations on start |
| **client** | `./client` Dockerfile | 3000 | Next.js (standalone build)   |

- **db** has a healthcheck; **server** starts only after DB is healthy.
- **client** depends on **server** (start order only; the browser talks to the API via `NEXT_PUBLIC_API_URL`).

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
