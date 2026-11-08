BEGIN;
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
COMMIT;
