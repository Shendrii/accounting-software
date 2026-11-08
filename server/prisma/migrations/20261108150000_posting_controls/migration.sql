ALTER TYPE "WorkspaceRole" ADD VALUE 'APPROVER';
ALTER TYPE "WorkspaceRole" ADD VALUE 'VIEWER';
BEGIN;
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
COMMIT;
