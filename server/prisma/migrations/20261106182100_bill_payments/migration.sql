BEGIN;

ALTER TABLE "Bill" ADD COLUMN "postingEntryId" TEXT;
UPDATE "Bill" b SET "postingEntryId" = b."journalEntryId"
FROM "JournalEntry" j
WHERE b."journalEntryId" = j."id" AND j."workspaceId" = b."workspaceId"
  AND j."status" = 'POSTED' AND b."status" = 'RECEIVED'
  AND EXISTS (
    SELECT 1 FROM "JournalLine" l JOIN "Account" a ON a."id" = l."accountId"
    WHERE l."journalEntryId" = j."id" AND l."credit" = b."total"
      AND a."type" = 'LIABILITY' AND a."workspaceId" = b."workspaceId"
      AND NOT EXISTS (
        SELECT 1 FROM "JournalLine" d WHERE d."journalEntryId" = j."id" AND d."accountId" = a."id" AND d."debit" > 0
      )
  );
CREATE UNIQUE INDEX "Bill_postingEntryId_key" ON "Bill"("postingEntryId");
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_postingEntryId_fkey"
  FOREIGN KEY ("postingEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BillPayment" (
  "id" TEXT PRIMARY KEY,
  "billId" TEXT NOT NULL REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "journalEntryId" TEXT NOT NULL REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL,
  "amount" DECIMAL(15,2) NOT NULL CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "BillPayment_journalEntryId_key" ON "BillPayment"("journalEntryId");
CREATE UNIQUE INDEX "BillPayment_billId_requestId_key" ON "BillPayment"("billId", "requestId");

DROP INDEX "Receipt_billId_key";
CREATE INDEX "Receipt_billId_idx" ON "Receipt"("billId");

COMMIT;
