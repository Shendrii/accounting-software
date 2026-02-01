# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app

# ---- Dependencies + Prisma generate (need full install so prisma CLI is present) ----
FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate

# ---- Runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src

EXPOSE 8000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
