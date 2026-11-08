BEGIN;
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "taxProfile" JSONB;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "taxProfile" JSONB;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "invoiceDetails" JSONB,
ADD COLUMN     "legalSnapshot" JSONB,
ADD COLUMN     "taxCodeId" TEXT;

-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxCodeId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "invoiceSettings" JSONB;

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "accountId" TEXT,
    "rate" DECIMAL(9,6),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "registration" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "postingEntryId" TEXT NOT NULL,
    "codeId" TEXT,
    "codeSnapshot" JSONB NOT NULL,
    "date" DATE NOT NULL,
    "baseAmount" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "evidenceStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "evidenceReference" TEXT,

    CONSTRAINT "TaxRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxCode_workspaceId_code_key" ON "TaxCode"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "TaxRecord_workspaceId_date_idx" ON "TaxRecord"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRecord_workspaceId_source_sourceId_key" ON "TaxRecord"("workspaceId", "source", "sourceId");

-- AddForeignKey
ALTER TABLE "TaxCode" ADD CONSTRAINT "TaxCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRecord" ADD CONSTRAINT "TaxRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CreditBalance" DROP CONSTRAINT credit_positive;
ALTER TABLE "CreditBalance" ADD CONSTRAINT credit_positive CHECK ("amount">0 AND "kind" IN ('AR','AP') AND "source" IN ('CREDIT_NOTE','DEPOSIT','WRITE_OFF','WITHHOLDING'));
ALTER TABLE "TaxCode" ADD CONSTRAINT tax_code_purpose CHECK (purpose IN ('OUTPUT','INPUT','WITHHOLDING_RECEIVABLE','WITHHOLDING_PAYABLE','EXEMPT'));
ALTER TABLE "TaxCode" ADD CONSTRAINT tax_code_dates CHECK ("effectiveTo" IS NULL OR "effectiveTo">="effectiveFrom");
ALTER TABLE "Bill" ADD CONSTRAINT bill_tax_nonnegative CHECK(tax>=0);
COMMIT;
