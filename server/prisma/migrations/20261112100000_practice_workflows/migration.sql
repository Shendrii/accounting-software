BEGIN;
ALTER TABLE "Invoice"
  ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recurrenceInterval" TEXT,
  ADD COLUMN "recurrenceAnchorDay" INTEGER,
  ADD COLUMN "nextDueDate" TIMESTAMP(3),
  ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurrence_valid" CHECK (
  NOT "isRecurring" OR ("nextDueDate" IS NOT NULL AND "recurrenceInterval" IS NOT NULL AND "recurrenceAnchorDay" IS NOT NULL AND "recurrenceInterval" IN ('weekly','monthly','quarterly','yearly') AND "recurrenceAnchorDay" BETWEEN 1 AND 31)
);
CREATE INDEX "Invoice_workspaceId_isRecurring_nextDueDate_idx" ON "Invoice"("workspaceId","isRecurring","nextDueDate");
CREATE TABLE "InvoiceReminder" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceId" TEXT NOT NULL REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL,
  "reminderDate" DATE NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "balance" DECIMAL(15,2) NOT NULL CHECK ("balance" > 0),
  "currency" VARCHAR(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SENDING' CHECK ("status" IN ('SENDING','SENT','UNCONFIRMED')),
  "providerMessageId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "InvoiceReminder_workspaceId_requestId_key" ON "InvoiceReminder"("workspaceId","requestId");
CREATE UNIQUE INDEX "InvoiceReminder_invoiceId_reminderDate_key" ON "InvoiceReminder"("invoiceId","reminderDate");
CREATE INDEX "InvoiceReminder_workspaceId_invoiceId_createdAt_idx" ON "InvoiceReminder"("workspaceId","invoiceId","createdAt");
COMMIT;
