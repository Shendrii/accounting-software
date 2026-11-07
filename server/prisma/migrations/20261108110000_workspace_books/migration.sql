BEGIN;

-- AlterTable
ALTER TABLE "JournalEntry" ADD COLUMN     "openingBatchId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "isOpeningBalance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "InvoicePayment" ADD COLUMN     "reversalEntryId" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversalRequestId" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT;

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "isOpeningBalance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BillPayment" ADD COLUMN     "reversalEntryId" TEXT,
ADD COLUMN     "reversalReason" TEXT,
ADD COLUMN     "reversalRequestId" TEXT,
ADD COLUMN     "reversedAt" TIMESTAMP(3),
ADD COLUMN     "reversedById" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "accountingBasis" TEXT NOT NULL DEFAULT 'ACCRUAL',
ADD COLUMN     "booksStartDate" DATE,
ADD COLUMN     "country" VARCHAR(2),
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
ADD COLUMN     "entityType" TEXT,
ADD COLUMN     "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "setupCompletedAt" TIMESTAMP(3),
ADD COLUMN     "taxSettings" JSONB;

-- CreateTable
CREATE TABLE "OpeningBalanceBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "asOfDate" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpeningBalanceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpeningBalanceBatch_workspaceId_key" ON "OpeningBalanceBatch"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_reversalEntryId_key" ON "InvoicePayment"("reversalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "BillPayment_reversalEntryId_key" ON "BillPayment"("reversalEntryId");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_openingBatchId_fkey" FOREIGN KEY ("openingBatchId") REFERENCES "OpeningBalanceBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_reversalEntryId_fkey" FOREIGN KEY ("reversalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_reversalEntryId_fkey" FOREIGN KEY ("reversalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningBalanceBatch" ADD CONSTRAINT "OpeningBalanceBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_currency_check" CHECK ("currency" IN ('PHP', 'USD'));
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_country_check" CHECK ("country" IS NULL OR "country" IN ('PH', 'US'));
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_fiscal_year_check" CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12);
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_basis_check" CHECK ("accountingBasis" = 'ACCRUAL');
COMMIT;
