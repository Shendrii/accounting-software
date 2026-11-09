-- Accountrix pgvector release for the Neon SQL Editor.
-- Target: the existing Accountrix database with migrations through
-- 20261108173000_collections_and_schedules applied.
-- Paste the entire file. It can resume after either pgvector migration.
-- The statements commit together. Reruns preserve indexed documents.
-- The backend builds the embeddings after deployment.
-- This manual bundle leaves Prisma migration history for separate reconciliation.

BEGIN;

-- 01/02 20261109100000_ai_document_embeddings
-- Source SHA-256: 67e7da6c45d2c87a429f91e1b0ad5a2a949bdcb193e7e8e39b88b3755037ed84
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "AiDocumentEmbedding" (
    "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "sourceType" TEXT NOT NULL CHECK ("sourceType" IN ('invoice', 'bill', 'receipt')),
    "sourceId" TEXT NOT NULL,
    revision BIGSERIAL NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
    passage TEXT,
    embedding vector(384),
    PRIMARY KEY ("workspaceId", "sourceType", "sourceId")
);

CREATE INDEX IF NOT EXISTS "AiDocumentEmbedding_pending_idx" ON "AiDocumentEmbedding" ("nextAttemptAt", revision)
    WHERE "nextAttemptAt" IS NOT NULL;

-- Enqueue in the source transaction and invalidate stale passages immediately.
CREATE OR REPLACE FUNCTION queue_ai_document(workspace_id text, source_type text, source_id text)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO "AiDocumentEmbedding" ("workspaceId", "sourceType", "sourceId")
    VALUES (workspace_id, source_type, source_id)
    ON CONFLICT ("workspaceId", "sourceType", "sourceId") DO UPDATE
    SET revision = EXCLUDED.revision, "nextAttemptAt" = EXCLUDED."nextAttemptAt",
        passage = NULL, embedding = NULL;
$$;

CREATE OR REPLACE FUNCTION sync_ai_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM "AiDocumentEmbedding"
        WHERE "workspaceId" = OLD."workspaceId" AND "sourceType" = TG_ARGV[0] AND "sourceId" = OLD.id;
    ELSE
        PERFORM queue_ai_document(NEW."workspaceId", TG_ARGV[0], NEW.id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER ai_invoice_document
AFTER INSERT OR UPDATE OF "invoiceNo", "customerId", date OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document('invoice');

CREATE OR REPLACE TRIGGER ai_bill_document
AFTER INSERT OR UPDATE OF "billNo", "vendorInvoiceNo", "vendorId", date OR DELETE ON "Bill"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document('bill');

CREATE OR REPLACE TRIGGER ai_receipt_document
AFTER INSERT OR UPDATE OF "extractedData", "vendorId", category OR DELETE ON "Receipt"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document('receipt');

CREATE OR REPLACE FUNCTION sync_ai_document_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    previous_id text;
    current_id text;
BEGIN
    IF TG_OP <> 'INSERT' THEN previous_id := to_jsonb(OLD)->>TG_ARGV[2]; END IF;
    IF TG_OP <> 'DELETE' THEN current_id := to_jsonb(NEW)->>TG_ARGV[2]; END IF;
    EXECUTE format('SELECT queue_ai_document("workspaceId", $1, id) FROM %I WHERE id IN ($2, $3)', TG_ARGV[1])
        USING TG_ARGV[0], previous_id, current_id;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER ai_invoice_line
AFTER INSERT OR UPDATE OF "invoiceId", description OR DELETE ON "InvoiceLine"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document_line('invoice', 'Invoice', 'invoiceId');

CREATE OR REPLACE TRIGGER ai_bill_line
AFTER INSERT OR UPDATE OF "billId", description OR DELETE ON "BillLine"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document_line('bill', 'Bill', 'billId');

CREATE OR REPLACE FUNCTION sync_ai_document_party() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME = 'Customer' THEN
        PERFORM queue_ai_document("workspaceId", 'invoice', id) FROM "Invoice"
        WHERE "workspaceId" = NEW."workspaceId" AND "customerId" = NEW.id;
    ELSE
        PERFORM queue_ai_document("workspaceId", 'bill', id) FROM "Bill"
        WHERE "workspaceId" = NEW."workspaceId" AND "vendorId" = NEW.id;
        PERFORM queue_ai_document("workspaceId", 'receipt', id) FROM "Receipt"
        WHERE "workspaceId" = NEW."workspaceId" AND "vendorId" = NEW.id;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER ai_customer_name AFTER UPDATE OF name ON "Customer"
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION sync_ai_document_party();

CREATE OR REPLACE TRIGGER ai_vendor_name AFTER UPDATE OF name ON "Vendor"
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION sync_ai_document_party();

-- The worker fills these rows after the migration, including historical documents.
INSERT INTO "AiDocumentEmbedding" ("workspaceId", "sourceType", "sourceId")
SELECT "workspaceId", 'invoice', id FROM "Invoice"
UNION ALL SELECT "workspaceId", 'bill', id FROM "Bill"
UNION ALL SELECT "workspaceId", 'receipt', id FROM "Receipt"
ON CONFLICT DO NOTHING;

-- 02/02 20261109103000_local_embedding_model
-- Source SHA-256: 3e96eb0998752db01e55ddc0d6e6fdde7d7d59031bfa723e520d8707df012d0d
DO $upgrade$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_attribute
        WHERE attrelid = '"AiDocumentEmbedding"'::regclass AND attname = 'embedding'
          AND NOT attisdropped AND format_type(atttypid, atttypmod) = 'vector(384)'
    ) THEN
        RAISE EXCEPTION 'AiDocumentEmbedding.embedding must be vector(384)';
    END IF;

    IF NOT EXISTS (
        SELECT FROM pg_attribute
        WHERE attrelid = '"AiDocumentEmbedding"'::regclass AND attname = 'embeddingModel'
          AND NOT attisdropped
    ) THEN
        ALTER TABLE "AiDocumentEmbedding" ADD COLUMN "embeddingModel" TEXT;

        -- Supersede old vectors and leases only when switching to the local model.
        UPDATE "AiDocumentEmbedding"
        SET embedding = NULL, passage = NULL, revision = DEFAULT, "nextAttemptAt" = CURRENT_TIMESTAMP
        WHERE embedding IS NOT NULL OR "nextAttemptAt" IS NULL OR "nextAttemptAt" > CURRENT_TIMESTAMP;
    END IF;
END;
$upgrade$;

SELECT 'Accountrix pgvector migrations completed; commit follows' AS migration_result;
COMMIT;
