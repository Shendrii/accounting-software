import express from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { LedgerError, nextDay, sendLedgerError } from '../lib/ledger.js';
import { pageOptions } from '../lib/workbenchQueries.js';
import { reminderCandidates, reminderDay } from '../lib/invoiceReminders.js';

const router = express.Router();
const types = ['documents', 'sales', 'purchases', 'journals', 'banking', 'recurring', 'reminders', 'close', 'follow-up', 'setup'];
router.get('/', async (req, res) => {
  try {
    const p = pageOptions(req.query), type = req.query.type || '', search = req.query.q || '', workspaceId = req.query.workspaceId || '';
    if (type && !types.includes(type) || typeof search !== 'string' || search.length > 100 || typeof workspaceId !== 'string') throw new LedgerError('Choose a valid work type, client and search term.');
    const today = reminderDay(), date = today, until = nextDay(today).toISOString();
    const data = await prisma.$transaction(async tx => {
      if (workspaceId && !await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: req.user.id } } })) throw new LedgerError('This workspace is not accessible.', 403);
      const [result] = await tx.$queryRaw`
        WITH accessible AS (SELECT w.id,w.name,w.currency,m.role FROM "Workspace" w JOIN "WorkspaceMember" m ON m."workspaceId"=w.id WHERE m."userId"=${req.user.id}),
        work AS (
          SELECT r."workspaceId",'documents'::text AS type,'Review receipt documents'::text AS title,'/purchases/documents'::text AS href,count(*)::integer AS count,min(r."createdAt")::date AS due
            FROM "Receipt" r JOIN accessible a ON a.id=r."workspaceId" WHERE r.status='PENDING' GROUP BY r."workspaceId"
          UNION ALL SELECT i."workspaceId",'sales','Review draft invoices','/sales/invoices?status=DRAFT',count(*)::integer,NULL::date FROM "Invoice" i JOIN accessible a ON a.id=i."workspaceId" WHERE i.status='DRAFT' GROUP BY i."workspaceId"
          UNION ALL SELECT b."workspaceId",'purchases','Review draft bills','/purchases/bills?status=DRAFT',count(*)::integer,NULL::date FROM "Bill" b JOIN accessible a ON a.id=b."workspaceId" WHERE b.status='DRAFT' GROUP BY b."workspaceId"
          UNION ALL SELECT j."workspaceId",'journals','Review draft journals','/ledger?tab=journal&status=DRAFT',count(*)::integer,NULL::date FROM "JournalEntry" j JOIN accessible a ON a.id=j."workspaceId" WHERE j.status='DRAFT' GROUP BY j."workspaceId"
          UNION ALL SELECT b."workspaceId",'banking','Match imported bank lines','/banking',count(*)::integer,NULL::date FROM "BankTransaction" b JOIN accessible a ON a.id=b."workspaceId" WHERE b."isMatched"=false GROUP BY b."workspaceId"
          UNION ALL SELECT i."workspaceId",'recurring','Generate recurring invoice drafts','/sales/recurring',count(*)::integer,min(i."nextDueDate")::date FROM "Invoice" i JOIN accessible a ON a.id=i."workspaceId" WHERE i."isRecurring" AND NOT i."isOpeningBalance" AND i.status<>'VOID' AND i."nextDueDate"<${until}::timestamp GROUP BY i."workspaceId"
          UNION ALL SELECT b."workspaceId",'recurring','Generate recurring bill drafts','/purchases/bills?view=recurring',count(*)::integer,min(b."nextDueDate")::date FROM "Bill" b JOIN accessible a ON a.id=b."workspaceId" WHERE b."isRecurring" AND b.status<>'VOID' AND b."nextDueDate"<${until}::timestamp GROUP BY b."workspaceId"
          UNION ALL SELECT j."workspaceId",'recurring','Generate recurring journal drafts','/ledger?tab=journal',count(*)::integer,min(j."nextDueDate")::date FROM "JournalEntry" j JOIN accessible a ON a.id=j."workspaceId" WHERE j."isRecurring" AND j.status<>'ARCHIVED' AND j."nextDueDate"<${until}::timestamp GROUP BY j."workspaceId"
          UNION ALL SELECT r."workspaceId",'reminders','Review overdue invoice reminders','/sales/reminders',count(*)::integer,min(r."dueDate")::date FROM (${reminderCandidates(Prisma.sql`i."workspaceId" IN (SELECT id FROM accessible)`, today)}) r WHERE r.balance::numeric>0 GROUP BY r."workspaceId"
          UNION ALL SELECT i."workspaceId",'follow-up','Follow up overdue invoices','/sales/invoices?view=overdue',count(*)::integer,min(i."dueDate")::date FROM "Invoice" i JOIN accessible a ON a.id=i."workspaceId" WHERE i.status='SENT' AND i."postingEntryId" IS NOT NULL AND i."dueDate"<${date}::date AND i.total>COALESCE((SELECT sum(p.amount) FROM "SettlementApplication" p WHERE p."invoiceId"=i.id AND p.date<${until}::timestamp AND (p."reversedDate" IS NULL OR p."reversedDate">=${until}::timestamp)),0) GROUP BY i."workspaceId"
          UNION ALL SELECT b."workspaceId",'purchases','Review overdue bill payments','/purchases/bills?view=overdue',count(*)::integer,min(b."dueDate")::date FROM "Bill" b JOIN accessible a ON a.id=b."workspaceId" WHERE b.status='RECEIVED' AND b."postingEntryId" IS NOT NULL AND b."dueDate"<${date}::date AND b.total>COALESCE((SELECT sum(p.amount) FROM "SettlementApplication" p WHERE p."billId"=b.id AND p.date<${until}::timestamp AND (p."reversedDate" IS NULL OR p."reversedDate">=${until}::timestamp)),0) GROUP BY b."workspaceId"
          UNION ALL SELECT r."workspaceId",'banking','Finish bank reconciliations','/banking',count(*)::integer,min(r."statementDate")::date FROM "Reconciliation" r JOIN accessible a ON a.id=r."workspaceId" WHERE r.status='IN_PROGRESS' GROUP BY r."workspaceId"
          UNION ALL SELECT c."workspaceId",'close','Finish period close','/ledger?tab=close',count(*)::integer,min(c."targetDate") FROM "AccountingPeriod" c JOIN accessible a ON a.id=c."workspaceId" WHERE c.status='OPEN' GROUP BY c."workspaceId"
          UNION ALL SELECT c."workspaceId",'follow-up',CASE WHEN c.kind='AR' THEN 'Review overdue customer promises' ELSE 'Review overdue supplier promises' END,CASE WHEN c.kind='AR' THEN '/sales/collections' ELSE '/purchases/follow-up' END,count(*)::integer,min(c."promiseDate") FROM "CollectionActivity" c JOIN accessible a ON a.id=c."workspaceId" WHERE c.type='PROMISE' AND c.status='OPEN' AND c."promiseDate"<${date}::date GROUP BY c."workspaceId",c.kind
          UNION ALL SELECT w.id,'setup','Complete business profile','/settings/setup',1,NULL::date FROM "Workspace" w JOIN accessible a ON a.id=w.id WHERE w."setupCompletedAt" IS NULL
          UNION ALL SELECT w.id,'setup','Confirm opening balances','/settings/opening-balances',1,NULL::date FROM "Workspace" w JOIN accessible a ON a.id=w.id WHERE w."setupCompletedAt" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "OpeningBalanceBatch" b WHERE b."workspaceId"=w.id)
        ), filtered AS (SELECT w.*,a.name AS "workspaceName",a.currency,a.role FROM work w JOIN accessible a ON a.id=w."workspaceId"
          WHERE (${type}='' OR w.type=${type}) AND (${workspaceId}='' OR w."workspaceId"=${workspaceId}) AND strpos(lower(a.name||' '||w.title),lower(${search}))>0),
        selected AS (SELECT *,due<${date}::date AS overdue FROM filtered ORDER BY CASE WHEN due<${date}::date THEN 0 WHEN due<=${date}::date THEN 1 ELSE 2 END,due NULLS LAST,"workspaceName","workspaceId",type,title LIMIT ${p.pageSize} OFFSET ${p.offset})
        SELECT (SELECT count(*)::integer FROM filtered) AS total,(SELECT count(DISTINCT "workspaceId")::integer FROM filtered) AS clients,
          (SELECT count(*)::integer FROM filtered WHERE due<${date}::date) AS overdue,
          COALESCE((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('due',s.due::text)) FROM selected s),'[]'::jsonb) AS items`;
      return result;
    }, { isolationLevel: 'RepeatableRead', timeout: 20000 });
    res.set('Cache-Control', 'private, no-store').json({ ...data, asOf: today, page: p.page, totalPages: Math.max(1, Math.ceil(data.total / p.pageSize)) });
  } catch (error) { sendLedgerError(res, error, 'Practice work could not load. Retry your workspace connection.'); }
});
export default router;
