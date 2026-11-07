BEGIN;

CREATE TYPE "AccountRole" AS ENUM ('GENERAL', 'CASH', 'BANK', 'ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'CREDIT_CARD', 'SALES_TAX');
ALTER TABLE "Account" ADD COLUMN "role" "AccountRole" NOT NULL DEFAULT 'GENERAL';

-- Classify only explicit bank flags and conventional names. Other accounts need review.
UPDATE "Account" SET "role" = 'BANK' WHERE "isBankAccount" = true AND "type" = 'ASSET';
UPDATE "Account" SET "role" = 'CASH' WHERE "role" = 'GENERAL' AND "type" = 'ASSET'
  AND lower(trim("name")) IN ('cash', 'petty cash', 'cash on hand');
UPDATE "Account" SET "role" = 'ACCOUNTS_RECEIVABLE' WHERE "role" = 'GENERAL' AND "type" = 'ASSET'
  AND lower(trim("name")) IN ('accounts receivable', 'trade receivables', 'trade debtors', 'receivables');
UPDATE "Account" SET "role" = 'ACCOUNTS_PAYABLE' WHERE "type" = 'LIABILITY'
  AND lower(trim("name")) IN ('accounts payable', 'trade payables');
UPDATE "Account" SET "role" = 'CREDIT_CARD' WHERE "type" = 'LIABILITY'
  AND lower(trim("name")) IN ('credit card', 'credit card payable');
UPDATE "Account" SET "role" = 'SALES_TAX' WHERE "type" = 'LIABILITY'
  AND lower(trim("name")) IN ('sales tax payable', 'sales tax liability');

ALTER TABLE "Account" ADD CONSTRAINT "Account_role_type_check" CHECK (
  "role" = 'GENERAL' OR
  ("role" IN ('CASH', 'BANK', 'ACCOUNTS_RECEIVABLE') AND "type" = 'ASSET') OR
  ("role" IN ('ACCOUNTS_PAYABLE', 'CREDIT_CARD', 'SALES_TAX') AND "type" = 'LIABILITY')
);
ALTER TABLE "Account" ADD CONSTRAINT "Account_bank_role_check" CHECK ("isBankAccount" = ("role" = 'BANK'));

ALTER TABLE "Receipt" ADD COLUMN "imageHash" TEXT;
-- Preserve old duplicates, but reserve their image identity against future re-uploads.
WITH images AS (
  SELECT r."id", encode(sha256(i."jpeg"), 'hex') AS hash,
    row_number() OVER (PARTITION BY r."workspaceId", encode(sha256(i."jpeg"), 'hex') ORDER BY r."createdAt", r."id") AS position
  FROM "Receipt" r JOIN "ReceiptImage" i ON i."receiptId" = r."id"
)
UPDATE "Receipt" r SET "imageHash" = images.hash FROM images WHERE r."id" = images."id" AND images.position = 1;
CREATE UNIQUE INDEX "Receipt_workspaceId_imageHash_key" ON "Receipt" ("workspaceId", "imageHash");
UPDATE "Receipt" SET "extractedData" = jsonb_set("extractedData", '{invoiceNumber}', to_jsonb(upper(trim("extractedData" ->> 'invoiceNumber'))))
  WHERE jsonb_typeof("extractedData" -> 'invoiceNumber') = 'string';
ALTER TABLE "Bill" ADD COLUMN "vendorInvoiceNo" TEXT;
CREATE UNIQUE INDEX "Bill_workspaceId_vendorId_vendorInvoiceNo_key" ON "Bill" ("workspaceId", "vendorId", "vendorInvoiceNo");

COMMIT;
