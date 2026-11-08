BEGIN;
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "cashFlowCategory" TEXT,
ADD COLUMN     "reportingGroup" TEXT;

-- CreateTable
CREATE TABLE "CashFlowReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFlowReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowReview_workspaceId_journalEntryId_key" ON "CashFlowReview"("workspaceId", "journalEntryId");

-- AddForeignKey
ALTER TABLE "CashFlowReview" ADD CONSTRAINT "CashFlowReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
