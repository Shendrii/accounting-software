BEGIN;

ALTER TABLE "AiDocumentEmbedding" ADD COLUMN "embeddingModel" TEXT;

-- Queue existing vectors and supersede any in-flight jobs from the previous model.
UPDATE "AiDocumentEmbedding"
SET embedding = NULL, passage = NULL, revision = DEFAULT, "nextAttemptAt" = CURRENT_TIMESTAMP
WHERE embedding IS NOT NULL OR "nextAttemptAt" IS NULL OR "nextAttemptAt" > CURRENT_TIMESTAMP;

COMMIT;
