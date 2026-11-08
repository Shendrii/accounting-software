BEGIN;
-- CreateTable
CREATE TABLE "CollectionActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "promiseDate" DATE,
    "promiseAmount" DECIMAL(15,2),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CollectionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "support" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "periods" INTEGER NOT NULL,
    "anchorDay" INTEGER,
    "amount" DECIMAL(15,2) NOT NULL,
    "residual" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "sourceEntryId" TEXT,
    "sourceAssetId" TEXT,
    "reversalPolicy" TEXT NOT NULL DEFAULT 'NONE',
    "noReversalReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "pausedFrom" DATE,
    "stateReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleOccurrence" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "waivedReason" TEXT,
    "archivedForPause" BOOLEAN NOT NULL DEFAULT false,
    "journalEntryId" TEXT NOT NULL,
    "reversalEntryId" TEXT,

    CONSTRAINT "ScheduleOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionActivity_workspaceId_kind_partyId_createdAt_idx" ON "CollectionActivity"("workspaceId", "kind", "partyId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionActivity_workspaceId_status_promiseDate_idx" ON "CollectionActivity"("workspaceId", "status", "promiseDate");

-- CreateIndex
CREATE INDEX "AccountingSchedule_workspaceId_sourceEntryId_sourceAssetId_idx" ON "AccountingSchedule"("workspaceId", "sourceEntryId", "sourceAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingSchedule_workspaceId_reference_key" ON "AccountingSchedule"("workspaceId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOccurrence_journalEntryId_key" ON "ScheduleOccurrence"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOccurrence_reversalEntryId_key" ON "ScheduleOccurrence"("reversalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleOccurrence_scheduleId_index_key" ON "ScheduleOccurrence"("scheduleId", "index");

-- AddForeignKey
ALTER TABLE "CollectionActivity" ADD CONSTRAINT "CollectionActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingSchedule" ADD CONSTRAINT "AccountingSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AccountingSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleOccurrence" ADD CONSTRAINT "ScheduleOccurrence_reversalEntryId_fkey" FOREIGN KEY ("reversalEntryId") REFERENCES "JournalEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
