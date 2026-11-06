BEGIN;

ALTER TABLE "JournalEntry" ADD COLUMN "reversalOfId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "postingEntryId" TEXT, ADD COLUMN "emailSentAt" TIMESTAMP(3);

CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL CHECK ("amount" > 0),
    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");
CREATE INDEX "JournalEntry_workspaceId_status_date_idx" ON "JournalEntry"("workspaceId", "status", "date");
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE UNIQUE INDEX "Invoice_postingEntryId_key" ON "Invoice"("postingEntryId");
CREATE UNIQUE INDEX "InvoicePayment_journalEntryId_key" ON "InvoicePayment"("journalEntryId");
CREATE UNIQUE INDEX "InvoicePayment_invoiceId_requestId_key" ON "InvoicePayment"("invoiceId", "requestId");

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey"
    FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_postingEntryId_fkey"
    FOREIGN KEY ("postingEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
