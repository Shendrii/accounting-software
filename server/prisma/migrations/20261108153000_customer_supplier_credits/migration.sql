BEGIN;
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
COMMIT;
