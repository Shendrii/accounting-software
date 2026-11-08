import express from 'express';
import prisma from '../db/prisma.js';
import { demand } from '../lib/permissions.js';
import { audit } from '../lib/audit.js';
import {checkCorrectionMatch} from '../lib/paymentCorrection.js';
import { getRequestContext } from '../lib/requestContext.js';
import {isPaged,pageOptions} from '../lib/workbenchQueries.js';
import {
  LedgerError, checkBankPostingDate, journalLines, ledgerAccounts, ledgerDate, ledgerTransaction, nextDay,
  reversePosting, sendLedgerError, updateBalanceCache,
} from '../lib/ledger.js';

const router = express.Router();
const withLines = { journalLines: { include: { account: true } } };
const withSources = {
  ...withLines,
  receipt: { include: { vendor: { select: { name: true } } } },
  invoices: { include: { customer: { select: { name: true } } } },
  bills: { include: { vendor: { select: { name: true } } } },
  billPosting: { select: { id: true, billNo: true } },
  billPayment: { select: { bill: { select: { id: true, billNo: true } } } },
  invoicePosting: { select: { id: true, invoiceNo: true } },
  invoicePayment: { select: { invoice: { select: { id: true, invoiceNo: true } } } },
  reversal: { select: { id: true,status:true,date:true } },
  scheduleOccurrence:{include:{schedule:true}},scheduleReversalOccurrence:{include:{schedule:true}},
};
const listDetails = {
  ...withSources,
  journalLines: { include: { account: { select: { id: true, name: true, code: true, type: true } } } },
  receipt: { select: { id: true, vendor: { select: { name: true } } } },
  invoices: { select: { id: true, invoiceNo: true, customer: { select: { name: true } } } },
  bills: { select: { id: true, billNo: true, vendor: { select: { name: true } } } },
};

function scopedEntry(req) {
  return { id: req.params.id, workspaceId: req.workspace.id };
}

async function requireEntry(tx, where, include = withLines) {
  const entry = await tx.journalEntry.findFirst({ where, include });
  if (!entry) throw new LedgerError('Journal entry not found.', 404);
  return entry;
}

router.get('/', async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    const where = { workspaceId: req.workspace.id };
    if(status&&!['DRAFT','POSTED','ARCHIVED'].includes(status))throw new LedgerError('Choose a valid journal status.');
    if (status) where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = ledgerDate(startDate);
      if (endDate) where.date.lt = nextDay(endDate);
    }
    if(isPaged(req.query)){const p=pageOptions(req.query);if(p.q)where.OR=[{description:{contains:p.q,mode:'insensitive'}},{referenceNo:{contains:p.q,mode:'insensitive'}}];const [items,total]=await prisma.$transaction([prisma.journalEntry.findMany({where,include:listDetails,orderBy:[{date:'desc'},{id:'desc'}],take:p.pageSize,skip:p.offset}),prisma.journalEntry.count({where})]);return res.json({items,total,page:p.page,pageSize:p.pageSize,totalPages:Math.max(1,Math.ceil(total/p.pageSize))});}
    const entries=await prisma.journalEntry.findMany({ where, include: listDetails, orderBy:[{date:'desc'},{id:'desc'}],take:1001 });
    if(entries.length>1000)throw new LedgerError('Use the paginated journal worklist for more than 1,000 entries.',409);
    res.json(entries);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load journal entries.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const entry=await requireEntry(prisma,scopedEntry(req),withSources),origin=entry.reversalOfId?await requireEntry(prisma,{id:entry.reversalOfId,workspaceId:req.workspace.id},withSources):entry;
    const [credits,allocations,refunds,taxes]=await Promise.all([prisma.creditBalance.findMany({where:{workspaceId:req.workspace.id,OR:[{postingEntryId:origin.id},{reversalEntryId:entry.id}]}}),prisma.creditAllocation.findMany({where:{OR:[{postingEntryId:origin.id},{reversalEntryId:entry.id}],credit:{workspaceId:req.workspace.id}},include:{credit:true}}),prisma.creditRefund.findMany({where:{OR:[{postingEntryId:origin.id},{reversalEntryId:entry.id}],credit:{workspaceId:req.workspace.id}},include:{credit:true}}),prisma.taxRecord.findMany({where:{workspaceId:req.workspace.id,postingEntryId:origin.id}})]);
    const links=[];for(const invoice of [...origin.invoices,origin.invoicePosting,origin.invoicePayment?.invoice].filter(Boolean))links.push({href:'/sales/invoices/'+invoice.id,label:invoice.invoiceNo});for(const bill of [...origin.bills,origin.billPosting,origin.billPayment?.bill].filter(Boolean))links.push({href:'/purchases/bills/'+bill.id,label:bill.billNo});if(origin.receipt)links.push({href:'/purchases/documents?receipt='+origin.receipt.id,label:'Purchase source document'});
    for(const c of [...credits,...allocations.map(a=>a.credit),...refunds.map(a=>a.credit)])links.push({href:(c.kind==='AR'?'/sales/credits':'/purchases/credits')+'?record='+c.id,label:c.reference});
    const schedule=origin.scheduleOccurrence?.schedule??origin.scheduleReversalOccurrence?.schedule;if(schedule)links.push({href:'/ledger/schedules?record='+schedule.id,label:'Schedule · '+schedule.reference});
    const ids=[entry.createdById,entry.lastPreparedById,entry.postedById].filter(Boolean),users=await prisma.user.findMany({where:{id:{in:ids}},select:{id:true,name:true}});
    res.json({...entry,actorNames:Object.fromEntries(users.map(u=>[u.id,u.name])),sourceLinks:[...new Map(links.map(l=>[l.href,l])).values()],sourceControlled:Boolean(entry.openingBatchId||links.length),taxRecords:taxes});
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load the journal entry.');
  }
});

router.post('/', async (req, res) => {
  try {
    const { date, description, referenceNo } = req.body;
    if (typeof description !== 'string' || !description.trim()) throw new LedgerError('Enter a description.');
    const workspaceId = req.workspace.id;
    const lines = journalLines(req.body.journalLines);
    const postingDate = ledgerDate(date);
    const entry = await ledgerTransaction(async tx => {
      await ledgerAccounts(tx, workspaceId, lines.map(line => line.accountId));
      return tx.journalEntry.create({
        data: {
          workspaceId, date: postingDate, description: description.trim(), referenceNo,
          status: 'DRAFT', createdById: req.user.id, lastPreparedById: req.user.id, lastPreparedAt: new Date(), journalLines: { create: lines },
        },
        include: withLines,
      });
    });
    res.status(201).json(entry);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to create the journal entry.');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const where = scopedEntry(req);
    const { date, description, referenceNo, status, journalLines: input } = req.body;
    if (status === 'POSTED') throw new LedgerError('Save the draft, then use Post entry so posting permissions and reviewer checks are applied.',403);
    if (status !== undefined && !['DRAFT', 'ARCHIVED'].includes(status)) throw new LedgerError('Invalid journal status.');
    if (description !== undefined && (typeof description !== 'string' || !description.trim())) {
      throw new LedgerError('Enter a description.');
    }
    const postingDate = date === undefined ? undefined : ledgerDate(date);
    const replacement = input === undefined ? undefined : journalLines(input);
    const entry = await ledgerTransaction(async tx => {
      const existing = await requireEntry(tx, where);
      if(await tx.scheduleOccurrence.findFirst({where:{OR:[{journalEntryId:existing.id},{reversalEntryId:existing.id}],schedule:{workspaceId:where.workspaceId}}}))throw new LedgerError('Generated schedule drafts keep their calculation and accounts. Cancel or correct the occurrence in Accounting schedules.',409);
      if (existing.status === 'POSTED') throw new LedgerError('Posted entries are read-only. Record a reversal to correct them.', 409);
      if (replacement) await ledgerAccounts(tx, where.workspaceId, replacement.map(line => line.accountId));
      const updated = await tx.journalEntry.update({
        where,
        data: {
          date: postingDate,
          description: description?.trim(),
          referenceNo,
          status,
          lastPreparedById: req.user.id, lastPreparedAt: new Date(),
          ...(replacement && { journalLines: { deleteMany: {}, create: replacement } }),
        },
        include: withLines,
      });
      await audit(tx, where.workspaceId, 'DRAFT_JOURNAL_UPDATED', updated.id, { currency: req.workspace.currency, before: existing, after: updated });
      return updated;
    });
    res.json(entry);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to update the journal entry.');
  }
});

router.post('/:id/post', async (req, res) => {
  try {
    demand(req, 'post');
    const where = scopedEntry(req);
    const entry = await ledgerTransaction(async tx => {
      const existing = await requireEntry(tx, where);
      if (existing.status === 'POSTED') return existing;
      if (existing.status !== 'DRAFT') throw new LedgerError('Only drafts can be posted.', 409);
      const linkedSource=await tx.invoice.findFirst({where:{workspaceId:where.workspaceId,OR:[{journalEntryId:existing.id},{postingEntryId:existing.id}]},select:{id:true}})||await tx.bill.findFirst({where:{workspaceId:where.workspaceId,OR:[{journalEntryId:existing.id},{postingEntryId:existing.id}]},select:{id:true}})||await tx.receipt.findFirst({where:{workspaceId:where.workspaceId,journalEntryId:existing.id},select:{id:true}});
      if(linkedSource)throw new LedgerError('Post this transaction from its invoice, bill or receipt so source balances and ledger records stay aligned.',409);
      if(existing.reversalOfId){const original=await tx.journalEntry.findFirst({where:{id:existing.reversalOfId,workspaceId:where.workspaceId,status:'POSTED'}});if(!original||existing.date<original.date)throw new LedgerError('Post the original entry before its correctly dated reversal.',409);}
      const scheduled=await tx.scheduleOccurrence.findFirst({where:{OR:[{journalEntryId:existing.id},{reversalEntryId:existing.id}],schedule:{workspaceId:where.workspaceId}},include:{schedule:true}});
      if(scheduled&&(scheduled.schedule.status==='CANCELLED'||scheduled.journalEntryId===existing.id&&scheduled.schedule.status==='PAUSED'&&existing.date>=scheduled.schedule.pausedFrom))throw new LedgerError('This schedule is cancelled or paused for the posting date.',409);
      const lines = journalLines(existing.journalLines);
      const accounts = await ledgerAccounts(tx, where.workspaceId, lines.map(line => line.accountId));
      const authorization = getRequestContext().authorization;
      const preparer = existing.lastPreparedById || existing.createdById;
      if (authorization.requireJournalApproval && (!preparer || preparer === req.user.id)) throw new LedgerError('A different preparer and poster are required for this manual journal. Ask another authorized reviewer.',403);
      const controls = [...accounts.values()].filter(account => ['ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE'].includes(account.role));
      const override = typeof req.body?.controlOverrideReason === 'string' ? req.body.controlOverrideReason.trim() : '';
      if (controls.length && (authorization.role !== 'OWNER' || override.length < 5 || override.length > 1000)) throw new LedgerError('Use a customer/supplier adjustment to keep the subledger aligned. An owner-only manual control-account override needs a documented reason.',403);
      await checkBankPostingDate(tx, where.workspaceId, existing.date, accounts);
      const posted = await tx.journalEntry.update({ where, data: { status: 'POSTED', postedById: req.user.id, postedAt: new Date(), controlOverrideReason: controls.length ? override : null }, include: withLines });
      await updateBalanceCache(tx, where.workspaceId, lines, accounts);
      await audit(tx, where.workspaceId, 'MANUAL_JOURNAL_POSTED', posted.id, { currency: req.workspace.currency, date: posted.date, createdById: posted.createdById, postedById: posted.postedById, lines }, controls.length ? override : undefined);
      return posted;
    });
    res.json(entry);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to post the journal entry.');
  }
});

router.post('/:id/reverse', async (req, res) => {
  try {
    demand(req, 'correct');
    const where = scopedEntry(req);
    const date = ledgerDate(req.body.date, 'Reversal date');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if(reason.length<5||reason.length>1000)throw new LedgerError('Enter a reversal reason of 5–1,000 characters.');
    const reversal = await ledgerTransaction(async tx => {
      const entry = await requireEntry(tx, where, withSources);
      if (entry.status !== 'POSTED' || entry.reversalOfId) throw new LedgerError('Choose an original posted entry.', 409);
      const settlementSource = await tx.creditBalance.findFirst({where:{workspaceId:where.workspaceId,postingEntryId:entry.id}}) || await tx.creditAllocation.findFirst({where:{postingEntryId:entry.id,credit:{workspaceId:where.workspaceId}}}) || await tx.creditRefund.findFirst({where:{postingEntryId:entry.id,credit:{workspaceId:where.workspaceId}}});
      const scheduleSource=await tx.scheduleOccurrence.findFirst({where:{OR:[{journalEntryId:entry.id},{reversalEntryId:entry.id}],schedule:{workspaceId:where.workspaceId}}});
      if (scheduleSource || settlementSource || entry.openingBatchId || entry.invoicePosting || entry.invoicePayment || entry.billPosting || entry.billPayment || entry.invoices.length || entry.bills.length || entry.receipt) {
        throw new LedgerError('Correct this entry from its source transaction.', 409);
      }
      if (entry.reversal) return requireEntry(tx, { id: entry.reversal.id, workspaceId: where.workspaceId });
      if (date < ledgerDate(entry.date.toISOString())) throw new LedgerError('The reversal date cannot precede the posting date.');
      await checkCorrectionMatch(tx,where.workspaceId,entry,date);
      return reversePosting(tx, where.workspaceId, entry, date, reason);
    });
    res.json(reversal);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to reverse the journal entry.');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const where = scopedEntry(req);
    await ledgerTransaction(async tx => {
      const entry = await requireEntry(tx, where);
      if (entry.status === 'POSTED') throw new LedgerError('Posted entries are read-only.', 409);
      if(await tx.scheduleOccurrence.findFirst({where:{OR:[{journalEntryId:entry.id},{reversalEntryId:entry.id}],schedule:{workspaceId:where.workspaceId}}}))throw new LedgerError('Cancel this generated occurrence from Accounting schedules so its evidence is retained.',409);
      await tx.journalEntry.delete({ where });
    });
    res.status(204).send();
  } catch (error) {
    sendLedgerError(res, error, 'Failed to delete the journal entry.');
  }
});

export default router;
