BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "AiDocumentEmbedding" (
    "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE ON UPDATE CASCADE,
    "sourceType" TEXT NOT NULL CHECK ("sourceType" IN ('invoice', 'bill', 'receipt')),
    "sourceId" TEXT NOT NULL,
    revision BIGSERIAL NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP,
    passage TEXT,
    embedding vector(384),
    PRIMARY KEY ("workspaceId", "sourceType", "sourceId")
);

CREATE INDEX "AiDocumentEmbedding_pending_idx" ON "AiDocumentEmbedding" ("nextAttemptAt", revision)
    WHERE "nextAttemptAt" IS NOT NULL;

-- Enqueue in the source transaction and invalidate stale passages immediately.
CREATE FUNCTION queue_ai_document(workspace_id text, source_type text, source_id text)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO "AiDocumentEmbedding" ("workspaceId", "sourceType", "sourceId")
    VALUES (workspace_id, source_type, source_id)
    ON CONFLICT ("workspaceId", "sourceType", "sourceId") DO UPDATE
    SET revision = EXCLUDED.revision, "nextAttemptAt" = EXCLUDED."nextAttemptAt",
        passage = NULL, embedding = NULL;
$$;

CREATE FUNCTION sync_ai_document() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE TRIGGER ai_invoice_document
AFTER INSERT OR UPDATE OF "invoiceNo", "customerId", date OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document('invoice');

CREATE TRIGGER ai_bill_document
AFTER INSERT OR UPDATE OF "billNo", "vendorInvoiceNo", "vendorId", date OR DELETE ON "Bill"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document('bill');

CREATE TRIGGER ai_receipt_document
AFTER INSERT OR UPDATE OF "extractedData", "vendorId", category OR DELETE ON "Receipt"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document('receipt');

CREATE FUNCTION sync_ai_document_line() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE TRIGGER ai_invoice_line
AFTER INSERT OR UPDATE OF "invoiceId", description OR DELETE ON "InvoiceLine"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document_line('invoice', 'Invoice', 'invoiceId');

CREATE TRIGGER ai_bill_line
AFTER INSERT OR UPDATE OF "billId", description OR DELETE ON "BillLine"
FOR EACH ROW EXECUTE FUNCTION sync_ai_document_line('bill', 'Bill', 'billId');

CREATE FUNCTION sync_ai_document_party() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE TRIGGER ai_customer_name AFTER UPDATE OF name ON "Customer"
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION sync_ai_document_party();

CREATE TRIGGER ai_vendor_name AFTER UPDATE OF name ON "Vendor"
FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION sync_ai_document_party();

-- The worker fills these rows after the migration, including historical documents.
INSERT INTO "AiDocumentEmbedding" ("workspaceId", "sourceType", "sourceId")
SELECT "workspaceId", 'invoice', id FROM "Invoice"
UNION ALL SELECT "workspaceId", 'bill', id FROM "Bill"
UNION ALL SELECT "workspaceId", 'receipt', id FROM "Receipt"
ON CONFLICT DO NOTHING;

COMMIT;
