BEGIN;
ALTER TABLE "Bill" ADD COLUMN "recurrenceAnchorDay" INTEGER CHECK ("recurrenceAnchorDay" BETWEEN 1 AND 31);
ALTER TABLE "JournalEntry" ADD COLUMN "recurrenceAnchorDay" INTEGER CHECK ("recurrenceAnchorDay" BETWEEN 1 AND 31);
CREATE TABLE "RecurringRun" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "requestId" TEXT NOT NULL, "kind" TEXT NOT NULL, "cutoffDate" DATE NOT NULL, "createdById" TEXT NOT NULL,
 "result" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("workspaceId","requestId")
);
CREATE TABLE "RecurringOccurrence" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "runId" TEXT NOT NULL REFERENCES "RecurringRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE, "sourceType" TEXT NOT NULL,
 "sourceId" TEXT NOT NULL, "scheduledDate" DATE NOT NULL, "instanceId" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("workspaceId","sourceType","sourceId","scheduledDate")
);
CREATE INDEX "RecurringOccurrence_workspaceId_instanceId_idx" ON "RecurringOccurrence"("workspaceId","instanceId");
COMMIT;
