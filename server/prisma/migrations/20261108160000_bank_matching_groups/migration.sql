BEGIN;
-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "importId" TEXT,
ADD COLUMN     "sourceRow" INTEGER;

-- CreateTable
CREATE TABLE "BankMatchGroup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMatchGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatchLine" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "journalLineId" TEXT NOT NULL,

    CONSTRAINT "BankMatchLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatchRow" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,

    CONSTRAINT "BankMatchRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "dateFormat" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "imported" INTEGER NOT NULL,
    "duplicateChoice" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankMatchGroup_workspaceId_accountId_idx" ON "BankMatchGroup"("workspaceId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatchLine_journalLineId_key" ON "BankMatchLine"("journalLineId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatchRow_bankTransactionId_key" ON "BankMatchRow"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BankImport_workspaceId_accountId_identity_key" ON "BankImport"("workspaceId", "accountId", "identity");

-- CreateIndex
CREATE INDEX "BankTransaction_importId_idx" ON "BankTransaction"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_accountId_externalId_key" ON "BankTransaction"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "BankMatchGroup" ADD CONSTRAINT "BankMatchGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchLine" ADD CONSTRAINT "BankMatchLine_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BankMatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchLine" ADD CONSTRAINT "BankMatchLine_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchRow" ADD CONSTRAINT "BankMatchRow_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BankMatchGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchRow" ADD CONSTRAINT "BankMatchRow_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImport" ADD CONSTRAINT "BankImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
