BEGIN;

CREATE INDEX "Invoice_workspaceId_date_id_idx" ON "Invoice"("workspaceId", "date", "id");
CREATE INDEX "Invoice_workspaceId_status_dueDate_idx" ON "Invoice"("workspaceId", "status", "dueDate");
CREATE INDEX "Bill_workspaceId_date_id_idx" ON "Bill"("workspaceId", "date", "id");
CREATE INDEX "Bill_workspaceId_status_dueDate_idx" ON "Bill"("workspaceId", "status", "dueDate");
CREATE INDEX "Receipt_workspaceId_status_createdAt_idx" ON "Receipt"("workspaceId", "status", "createdAt");
CREATE INDEX "Receipt_workspaceId_createdAt_idx" ON "Receipt"("workspaceId", "createdAt");
DROP INDEX "Receipt_workspaceId_status_idx";
CREATE INDEX "JournalLine_accountId_journalEntryId_idx" ON "JournalLine"("accountId", "journalEntryId");
CREATE INDEX "WorkspaceMember_userId_createdAt_idx" ON "WorkspaceMember"("userId", "createdAt");

COMMIT;
