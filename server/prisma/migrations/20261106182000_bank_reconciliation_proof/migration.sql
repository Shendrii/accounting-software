BEGIN;

ALTER TABLE "Account" ADD COLUMN "isBankAccount" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Account" a SET "isBankAccount" = true
WHERE a."type" = 'ASSET' AND (
  a."name" ~* '\m(bank|checking|savings)\M'
  OR EXISTS (SELECT 1 FROM "BankTransaction" b WHERE b."accountId" = a."id" AND b."workspaceId" = a."workspaceId")
  OR EXISTS (SELECT 1 FROM "Reconciliation" r WHERE r."accountId" = a."id" AND r."workspaceId" = a."workspaceId")
);

ALTER TABLE "Reconciliation" ADD COLUMN "proof" JSONB;
ALTER TABLE "BankTransaction" ADD COLUMN "reconciliationId" TEXT;
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_reconciliationId_fkey"
  FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "BankTransaction_workspaceId_accountId_date_idx" ON "BankTransaction"("workspaceId", "accountId", "date");
CREATE INDEX "BankTransaction_reconciliationId_idx" ON "BankTransaction"("reconciliationId");
CREATE INDEX "Reconciliation_workspaceId_accountId_statementDate_idx" ON "Reconciliation"("workspaceId", "accountId", "statementDate");
CREATE UNIQUE INDEX "Reconciliation_verified_statement_key" ON "Reconciliation"("workspaceId", "accountId", "statementDate") WHERE "proof" IS NOT NULL;

COMMIT;
