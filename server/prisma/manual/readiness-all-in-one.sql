-- Accountrix readiness release: all ten migrations in one paste.
-- Target: an existing database with migrations through
-- 20261108110000_workspace_books applied, and NONE of these ten applied yet.
-- Run this ENTIRE file once in the intended Neon branch/database SQL Editor.
-- This replaces running the ten individual files; do not run both.
-- Keep a backup and follow docs/READINESS-RELEASE.md before releasing the app.
-- Auth cutover: everyone signs in again; historical Google-linked local
-- passwords are disabled and require email recovery. Configure email delivery.
-- All changes, including enum additions, commit together at the end.
-- New enum values are deliberately not used until after this transaction.
-- Original migration files remain unchanged; checksums below identify sources.

BEGIN;

-- 01/10 20261108130000_auth_security
-- Source SHA-256: f9325cf8be54693f012cd115659a6f7ca70bf5a96e9fb585263faa16633a464f
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

-- 02/10 20261108133000_period_close
-- Source SHA-256: 4714d366db785e625483712f2d2ac9028697009d249bd12ffeac164e105c8c9d
ALTER TABLE "Workspace" ADD COLUMN "separateCloseReviewer" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "AccountingPeriod" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "startDate" DATE NOT NULL, "endDate" DATE NOT NULL, "targetDate" DATE NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','CLOSED')),
 "createdById" TEXT NOT NULL, "closedById" TEXT, "closedAt" TIMESTAMP(3), "proof" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("endDate" >= "startDate"), UNIQUE ("workspaceId","startDate","endDate")
);
CREATE INDEX "AccountingPeriod_workspaceId_status_endDate_idx" ON "AccountingPeriod"("workspaceId","status","endDate");
CREATE TABLE "PeriodAccountReview" (
 "id" TEXT PRIMARY KEY, "periodId" TEXT NOT NULL REFERENCES "AccountingPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "accountId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','BLOCKED','RECONCILED','WAIVED')),
 "ownerId" TEXT NOT NULL, "dueDate" DATE NOT NULL, "support" TEXT NOT NULL, "reason" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "reviewedById" TEXT NOT NULL, "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("periodId","accountId")
);
CREATE TABLE "AuditEvent" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL, "action" TEXT NOT NULL, "entityId" TEXT NOT NULL, "reason" TEXT, "data" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "AuditEvent"("workspaceId","createdAt");
CREATE INDEX "AuditEvent_workspaceId_entityId_idx" ON "AuditEvent"("workspaceId","entityId");
CREATE FUNCTION accounting_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Accounting audit events are append-only'; END $$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION accounting_audit_append_only();
CREATE FUNCTION accounting_period_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ws TEXT; posting_date TIMESTAMP; cutoff DATE; parent_status TEXT;
BEGIN
 IF TG_TABLE_NAME = 'JournalEntry' THEN
  ws := COALESCE(NEW."workspaceId", OLD."workspaceId"); posting_date := COALESCE(NEW."date", OLD."date");
  IF TG_OP = 'UPDATE' AND OLD."status" = 'POSTED' AND ROW(NEW."workspaceId",NEW."date",NEW."description",NEW."referenceNo",NEW."status",NEW."reversalOfId",NEW."openingBatchId") IS DISTINCT FROM ROW(OLD."workspaceId",OLD."date",OLD."description",OLD."referenceNo",OLD."status",OLD."reversalOfId",OLD."openingBatchId") THEN RAISE EXCEPTION 'Posted entries are immutable; record a reversal'; END IF;
  IF TG_OP = 'DELETE' AND OLD."status" = 'POSTED' THEN RAISE EXCEPTION 'Posted entries are immutable; record a reversal'; END IF;
  IF TG_OP <> 'DELETE' AND NEW."status" <> 'POSTED' AND (TG_OP = 'INSERT' OR OLD."status" <> 'POSTED') THEN RETURN NEW; END IF;
 ELSE
  SELECT "workspaceId", "date", "status"::text INTO ws, posting_date, parent_status FROM "JournalEntry" WHERE "id" = COALESCE(NEW."journalEntryId",OLD."journalEntryId");
  IF parent_status <> 'POSTED' THEN IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 END IF;
 SELECT MAX("endDate") INTO cutoff FROM "AccountingPeriod" WHERE "workspaceId" = ws AND "status" = 'CLOSED';
 IF cutoff IS NOT NULL AND posting_date::date <= cutoff THEN RAISE EXCEPTION 'The posting date belongs to closed books. Reopen the period with a documented reason.'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER journal_period_lock BEFORE INSERT OR UPDATE OR DELETE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION accounting_period_lock();
CREATE TRIGGER line_period_lock BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION accounting_period_lock();

-- 03/10 20261108140000_receipt_corrections
-- Source SHA-256: ce93547ba578557879ed7e3d56097616d9ab3232e783605cd518ffe13ad7b98d
ALTER TYPE "ReceiptStatus" ADD VALUE 'REVERSED';
ALTER TABLE "Receipt" ADD COLUMN "replacesReceiptId" TEXT UNIQUE REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receipt" ADD COLUMN "postingDate" DATE;
CREATE TABLE "ReceiptCorrection" (
 "receiptId" TEXT PRIMARY KEY REFERENCES "Receipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "requestId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "date" DATE NOT NULL, "reason" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createReplacement" BOOLEAN NOT NULL,
 "reversalEntryId" TEXT UNIQUE REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 04/10 20261108143000_recurring_occurrences
-- Source SHA-256: 40262f5db3fffe71a57aac83c842af4785e34a131d8cf1203a3f78331034c2e8
ALTER TABLE "Bill" ADD COLUMN "recurrenceAnchorDay" INTEGER CHECK ("recurrenceAnchorDay" BETWEEN 1 AND 31);
ALTER TABLE "JournalEntry" ADD COLUMN "recurrenceAnchorDay" INTEGER CHECK ("recurrenceAnchorDay" BETWEEN 1 AND 31);
CREATE TABLE "RecurringRun" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestId" TEXT NOT NULL, "kind" TEXT NOT NULL, "cutoffDate" DATE NOT NULL, "createdById" TEXT NOT NULL,
 "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("workspaceId","requestId")
);
CREATE TABLE "RecurringOccurrence" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "runId" TEXT NOT NULL REFERENCES "RecurringRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "sourceType" TEXT NOT NULL,
 "sourceId" TEXT NOT NULL, "scheduledDate" DATE NOT NULL, "instanceId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("workspaceId","sourceType","sourceId","scheduledDate")
);
CREATE INDEX "RecurringOccurrence_workspaceId_instanceId_idx" ON "RecurringOccurrence"("workspaceId","instanceId");

-- 05/10 20261108150000_posting_controls
-- Source SHA-256: d5e6c22d7be0f6570118ffa791455bc51f53a7a929e9bf0b7916591cfbf294c2
ALTER TYPE "WorkspaceRole" ADD VALUE 'APPROVER';
ALTER TYPE "WorkspaceRole" ADD VALUE 'VIEWER';
ALTER TABLE "Workspace" ADD COLUMN "memberCanPost" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "requireJournalApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JournalEntry" ADD COLUMN "createdById" TEXT, ADD COLUMN "postedById" TEXT, ADD COLUMN "postedAt" TIMESTAMP(3), ADD COLUMN "controlOverrideReason" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "lastPreparedById" TEXT, ADD COLUMN "lastPreparedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_valid_sides" CHECK ("debit" >= 0 AND "credit" >= 0 AND (("debit" > 0 AND "credit" = 0) OR ("credit" > 0 AND "debit" = 0))) NOT VALID;
CREATE FUNCTION accounting_posted_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD."status" = 'POSTED' AND ROW(NEW."createdAt",NEW."createdById",NEW."lastPreparedById",NEW."lastPreparedAt",NEW."postedById",NEW."postedAt",NEW."controlOverrideReason") IS DISTINCT FROM ROW(OLD."createdAt",OLD."createdById",OLD."lastPreparedById",OLD."lastPreparedAt",OLD."postedById",OLD."postedAt",OLD."controlOverrideReason") THEN RAISE EXCEPTION 'Posted entry identities and timestamps are immutable'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER posted_entry_identity BEFORE UPDATE ON "JournalEntry" FOR EACH ROW EXECUTE FUNCTION accounting_posted_identity();
CREATE FUNCTION accounting_posted_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status TEXT; parent_created TIMESTAMP;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  SELECT "status"::text INTO parent_status FROM "JournalEntry" WHERE "id" = OLD."journalEntryId";
  IF parent_status = 'POSTED' THEN RAISE EXCEPTION 'Posted journal lines are immutable; record a reversal'; END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  SELECT "status"::text,"createdAt" INTO parent_status,parent_created FROM "JournalEntry" WHERE "id" = NEW."journalEntryId";
  IF parent_status = 'POSTED' THEN RAISE EXCEPTION 'Lines cannot be appended to a posted journal'; END IF;
  RETURN NEW;
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER posted_lines_immutable BEFORE INSERT OR UPDATE OR DELETE ON "JournalLine" FOR EACH ROW EXECUTE FUNCTION accounting_posted_lines();
CREATE FUNCTION accounting_balanced_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_id TEXT; entry_status TEXT; difference NUMERIC; population INTEGER;
BEGIN
 IF TG_TABLE_NAME = 'JournalEntry' THEN entry_id := COALESCE(NEW."id",OLD."id");
 ELSE entry_id := COALESCE(NEW."journalEntryId",OLD."journalEntryId"); END IF;
 SELECT "status"::text INTO entry_status FROM "JournalEntry" WHERE "id" = entry_id;
 IF entry_status = 'POSTED' THEN
  SELECT COUNT(*)::integer,COALESCE(SUM("debit"-"credit"),0) INTO population,difference FROM "JournalLine" WHERE "journalEntryId" = entry_id;
  IF population < 2 OR difference <> 0 THEN RAISE EXCEPTION 'Every posted journal must have at least two balanced lines'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_posted_entry AFTER INSERT OR UPDATE ON "JournalEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_balanced_entry();
CREATE CONSTRAINT TRIGGER balanced_posted_lines AFTER INSERT OR UPDATE OR DELETE ON "JournalLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting_balanced_entry();

-- 06/10 20261108153000_customer_supplier_credits
-- Source SHA-256: dec3cb4496ed0c9727b7d03ab1e3faf0c8efcbd52b7cea9f627db6971365cafe
-- CreateTable
CREATE TABLE "CreditBalance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "partyId" TEXT,
    "partyName" TEXT,
    "reference" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "accountId" TEXT NOT NULL,
    "postingEntryId" TEXT NOT NULL,
    "reversalEntryId" TEXT,
    "reason" TEXT NOT NULL,
    "support" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAllocation" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "billId" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "postingEntryId" TEXT,
    "reversalEntryId" TEXT,
    "reversedDate" DATE,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditRefund" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "postingEntryId" TEXT NOT NULL,
    "reversalEntryId" TEXT,
    "reversedDate" DATE,
    "reason" TEXT NOT NULL,

    CONSTRAINT "CreditRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceAction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditBalance_postingEntryId_key" ON "CreditBalance"("postingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditBalance_reversalEntryId_key" ON "CreditBalance"("reversalEntryId");

-- CreateIndex
CREATE INDEX "CreditBalance_workspaceId_kind_date_idx" ON "CreditBalance"("workspaceId", "kind", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CreditBalance_workspaceId_kind_reference_key" ON "CreditBalance"("workspaceId", "kind", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAllocation_postingEntryId_key" ON "CreditAllocation"("postingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAllocation_reversalEntryId_key" ON "CreditAllocation"("reversalEntryId");

-- CreateIndex
CREATE INDEX "CreditAllocation_creditId_date_idx" ON "CreditAllocation"("creditId", "date");

-- CreateIndex
CREATE INDEX "CreditAllocation_invoiceId_idx" ON "CreditAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditAllocation_billId_idx" ON "CreditAllocation"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditRefund_postingEntryId_key" ON "CreditRefund"("postingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditRefund_reversalEntryId_key" ON "CreditRefund"("reversalEntryId");

-- CreateIndex
CREATE INDEX "CreditRefund_creditId_date_idx" ON "CreditRefund"("creditId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceAction_workspaceId_requestId_key" ON "FinanceAction"("workspaceId", "requestId");

-- AddForeignKey
ALTER TABLE "CreditBalance" ADD CONSTRAINT "CreditBalance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "CreditBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAllocation" ADD CONSTRAINT "CreditAllocation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRefund" ADD CONSTRAINT "CreditRefund_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "CreditBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceAction" ADD CONSTRAINT "FinanceAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditBalance" ADD CONSTRAINT credit_positive CHECK ("amount">0 AND "kind" IN ('AR','AP') AND "source" IN ('CREDIT_NOTE','DEPOSIT','WRITE_OFF'));
ALTER TABLE "CreditAllocation" ADD CONSTRAINT allocation_document CHECK ("amount">0 AND (("invoiceId" IS NOT NULL)::integer+("billId" IS NOT NULL)::integer)=1);
ALTER TABLE "CreditRefund" ADD CONSTRAINT refund_positive CHECK ("amount">0);
CREATE VIEW "SettlementApplication" AS
SELECT 'AR'::text AS kind,p."invoiceId",NULL::text AS "billId",p."invoiceId" AS "documentId",p."amount",j."date",r."date" AS "reversedDate"
FROM "InvoicePayment" p JOIN "JournalEntry" j ON j.id=p."journalEntryId" AND j.status='POSTED' LEFT JOIN "JournalEntry" r ON r.id=p."reversalEntryId"
UNION ALL SELECT 'AP',NULL,p."billId",p."billId",p.amount,j.date,r.date FROM "BillPayment" p JOIN "JournalEntry" j ON j.id=p."journalEntryId" AND j.status='POSTED' LEFT JOIN "JournalEntry" r ON r.id=p."reversalEntryId"
UNION ALL SELECT CASE WHEN a."invoiceId" IS NOT NULL THEN 'AR' ELSE 'AP' END,a."invoiceId",a."billId",COALESCE(a."invoiceId",a."billId"),a.amount,a.date,a."reversedDate" FROM "CreditAllocation" a;

-- 07/10 20261108160000_bank_matching_groups
-- Source SHA-256: 7cf664c896c0064c277c3c01874624921e94994c3f32db3d4d272df457ec7ef0
-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "importId" TEXT,
ADD COLUMN     "sourceRow" INTEGER;

-- CreateTable
CREATE TABLE "BankMatchGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMatchGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatchLine" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,

    CONSTRAINT "BankMatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatchRow" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,

    CONSTRAINT "BankMatchRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "dateFormat" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "imported" INTEGER NOT NULL,
    "duplicateChoice" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankMatchGroup_workspaceId_accountId_idx" ON "BankMatchGroup"("workspaceId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatchLine_journalLineId_key" ON "BankMatchLine"("journalLineId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatchRow_bankTransactionId_key" ON "BankMatchRow"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BankImport_workspaceId_accountId_identity_key" ON "BankImport"("workspaceId", "accountId", "identity");

-- CreateIndex
CREATE INDEX "BankTransaction_importId_idx" ON "BankTransaction"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_accountId_externalId_key" ON "BankTransaction"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "BankMatchGroup" ADD CONSTRAINT "BankMatchGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchLine" ADD CONSTRAINT "BankMatchLine_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BankMatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchLine" ADD CONSTRAINT "BankMatchLine_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchRow" ADD CONSTRAINT "BankMatchRow_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BankMatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchRow" ADD CONSTRAINT "BankMatchRow_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImport" ADD CONSTRAINT "BankImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 08/10 20261108163000_tax_registers
-- Source SHA-256: 6f8b2a69e34e65d8f6ff729ee4c04c6bff10ae32689c7dec28d2b6fc60cab090
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "taxProfile" JSONB;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "taxProfile" JSONB;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceDetails" JSONB,
ADD COLUMN     "legalSnapshot" JSONB,
ADD COLUMN     "taxCodeId" TEXT;

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxCodeId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "invoiceSettings" JSONB;

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "accountId" TEXT,
    "rate" DECIMAL(9,6),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "registration" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "postingEntryId" TEXT NOT NULL,
    "codeId" TEXT,
    "codeSnapshot" JSONB NOT NULL,
    "date" DATE NOT NULL,
    "baseAmount" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "evidenceStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "evidenceReference" TEXT,

    CONSTRAINT "TaxRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxCode_workspaceId_code_key" ON "TaxCode"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "TaxRecord_workspaceId_date_idx" ON "TaxRecord"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRecord_workspaceId_source_sourceId_key" ON "TaxRecord"("workspaceId", "source", "sourceId");

-- AddForeignKey
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRecord" ADD CONSTRAINT "TaxRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditBalance" DROP CONSTRAINT credit_positive;
ALTER TABLE "CreditBalance" ADD CONSTRAINT credit_positive CHECK ("amount">0 AND "kind" IN ('AR','AP') AND "source" IN ('CREDIT_NOTE','DEPOSIT','WRITE_OFF','WITHHOLDING'));
ALTER TABLE "TaxCode" ADD CONSTRAINT tax_code_purpose CHECK (purpose IN ('OUTPUT','INPUT','WITHHOLDING_RECEIVABLE','WITHHOLDING_PAYABLE','EXEMPT'));
ALTER TABLE "TaxCode" ADD CONSTRAINT tax_code_dates CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom");
ALTER TABLE "Bill" ADD CONSTRAINT bill_tax_nonnegative CHECK(tax>=0);

-- 09/10 20261108170000_reporting_classification
-- Source SHA-256: 73e8b33fc3b7ed116a878236e43d9e4e26dd1dfc957ea54251b004930f925e66
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cashFlowCategory" TEXT,
ADD COLUMN     "reportingGroup" TEXT;

-- CreateTable
CREATE TABLE "CashFlowReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFlowReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowReview_workspaceId_journalEntryId_key" ON "CashFlowReview"("workspaceId", "journalEntryId");

-- AddForeignKey
ALTER TABLE "CashFlowReview" ADD CONSTRAINT "CashFlowReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 10/10 20261108173000_collections_and_schedules
-- Source SHA-256: f498b98d148813fc3a6bb7bcd3895dcb419c4b36c4bb74f444a1fc0bcd463447
-- CreateTable
CREATE TABLE "CollectionActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "promiseDate" DATE,
    "promiseAmount" DECIMAL(15,2),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CollectionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "support" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "periods" INTEGER NOT NULL,
    "anchorDay" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "residual" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "sourceEntryId" TEXT,
    "sourceAssetId" TEXT,
    "reversalPolicy" TEXT NOT NULL DEFAULT 'NONE',
    "noReversalReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "pausedFrom" DATE,
    "stateReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleOccurrence" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "waivedReason" TEXT,
    "archivedForPause" BOOLEAN NOT NULL DEFAULT false,
    "journalEntryId" TEXT NOT NULL,
    "reversalEntryId" TEXT,

    CONSTRAINT "ScheduleOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionActivity_workspaceId_kind_partyId_createdAt_idx" ON "CollectionActivity"("workspaceId", "kind", "partyId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionActivity_workspaceId_status_promiseDate_idx" ON "CollectionActivity"("workspaceId", "status", "promiseDate");

-- CreateIndex
CREATE INDEX "AccountingSchedule_workspaceId_sourceEntryId_sourceAssetId_idx" ON "AccountingSchedule"("workspaceId", "sourceEntryId", "sourceAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSchedule_workspaceId_reference_key" ON "AccountingSchedule"("workspaceId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOccurrence_journalEntryId_key" ON "ScheduleOccurrence"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOccurrence_reversalEntryId_key" ON "ScheduleOccurrence"("reversalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOccurrence_scheduleId_index_key" ON "ScheduleOccurrence"("scheduleId", "index");

-- AddForeignKey
ALTER TABLE "CollectionActivity" ADD CONSTRAINT "CollectionActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSchedule" ADD CONSTRAINT "AccountingSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AccountingSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_reversalEntryId_fkey" FOREIGN KEY ("reversalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT 'Accountrix readiness migrations completed; commit follows' AS migration_result;
COMMIT;
