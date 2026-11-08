BEGIN;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3), ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
-- Fail rather than silently merge historical identities with different email casing.
CREATE UNIQUE INDEX "User_email_normalized_key" ON "User" (LOWER("email"));
CREATE TABLE "AuthSession" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "version" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");
CREATE TABLE "AuthAction" (
  "id" TEXT PRIMARY KEY, "purpose" TEXT NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "payload" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuthAction_userId_purpose_idx" ON "AuthAction"("userId", "purpose");
-- Historical email-only links cannot establish who chose the local password.
-- Keep Google subject access; restore local access only through email ownership recovery.
UPDATE "User" u SET "passwordHash" = NULL, "sessionVersion" = "sessionVersion" + 1
WHERE u."passwordHash" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "AuthProvider" p WHERE p."userId" = u."id" AND p."provider" = 'GOOGLE'
);
COMMIT;
