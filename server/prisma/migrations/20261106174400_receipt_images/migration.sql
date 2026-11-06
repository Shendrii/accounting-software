BEGIN;

CREATE TABLE "ReceiptImage" (
    "receiptId" TEXT NOT NULL,
    "jpeg" BYTEA NOT NULL,
    CONSTRAINT "ReceiptImage_pkey" PRIMARY KEY ("receiptId"),
    CONSTRAINT "ReceiptImage_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Receipt_workspaceId_status_idx" ON "Receipt"("workspaceId", "status");

COMMIT;
