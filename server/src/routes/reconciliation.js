import {restoreWorkspaceContext} from '../middleware/workspace.js';
import express from 'express';
import multer from 'multer';
import {parseStatement,importPreview,commitStatement} from '../lib/statementImport.js';
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';
import { demand } from '../lib/permissions.js';
import {audit} from '../lib/audit.js';
import {once} from '../lib/settlements.js';
import {groupMatch} from '../lib/bankMatches.js';
import {
  Decimal, LedgerError, createPosting, decimalInput, decimalSum, ledgerAccounts, ledgerDate,
  ledgerTransaction, nextDay, sendLedgerError,
} from '../lib/ledger.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const journalDetail = { journalEntry: { select: { date: true, description: true, referenceNo: true } } };

function signedAmount(value, label) {
  const text = String(value ?? '').trim();
  return text.startsWith('-') ? decimalInput(text.slice(1), label).negated() : decimalInput(text, label);
}

function bankAmount(line) {
  return new Decimal(line.debit).minus(line.credit);
}

async function bankAccount(tx, workspaceId, accountId) {
  if (typeof accountId !== 'string' || !accountId) throw new LedgerError('Choose a bank account.');
  const account = await tx.account.findFirst({ where: { id: accountId, workspaceId, role:{in:['BANK','CREDIT_CARD']}, isActive: true } });
  if (!account) throw new LedgerError('Choose an active bank account in this workspace.', 404);
  return account;
}

function lastVerified(tx, workspaceId, accountId) {
  return tx.reconciliation.findFirst({
    where: { workspaceId, accountId, status: 'COMPLETE', proof: { not: Prisma.DbNull } },
    orderBy: { statementDate: 'desc' },
  });
}

function postedLines(workspaceId, accountId) {
  return { accountId, journalEntry: { workspaceId, status: 'POSTED' } };
}

async function statementReview(tx, workspaceId, input) {
  const { accountId } = input;
  await bankAccount(tx, workspaceId, accountId);
  const start = ledgerDate(input.statementStart, 'Statement starting date');
  const end = ledgerDate(input.statementDate, 'Statement ending date');
  if (start > end) throw new LedgerError('The statement ending date must be on or after its starting date.');
  const from = start.toISOString().slice(0, 10);
  const through = end.toISOString().slice(0, 10);
  const cutoff = nextDay(through);
  const opening = signedAmount(input.openingBalance, 'Statement opening balance');
  const ending = signedAmount(input.statementBalance, 'Statement ending balance');
  const countText = String(input.statementLineCount ?? '');
  if (!/^\d{1,7}$/.test(countText)) throw new LedgerError('Enter the number of transaction lines on the bank statement.');
  const statementLineCount = Number(countText);
  if (input.outstandingIds !== undefined && (!Array.isArray(input.outstandingIds) || input.outstandingIds.some(id => typeof id !== 'string'))) {
    throw new LedgerError('Select valid outstanding items.');
  }
  const prior = await lastVerified(tx, workspaceId, accountId);
  if (prior && (start.valueOf() !== nextDay(prior.statementDate.toISOString()).valueOf() || !opening.eq(prior.statementBalance))) {
    throw new LedgerError('Start the day after the last verified statement and use its ending balance as the opening balance.', 409);
  }
  const lines = postedLines(workspaceId, accountId);
  const carriedIds = prior?.proof.outstanding.map(line => line.id) ?? [];
  const [transactions, candidates, earlier] = await Promise.all([
    tx.bankTransaction.findMany({ where: { workspaceId, accountId, date: { gte: start, lt: cutoff } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
    tx.journalLine.findMany({
      where: { ...lines, OR: [
        { journalEntry: { ...lines.journalEntry, date: { gte: start, lt: cutoff } } },
        { id: { in: carriedIds }, journalEntry: { ...lines.journalEntry, date: { lt: cutoff } } },
      ] },
      include: journalDetail,
      orderBy: [{ journalEntry: { date: 'asc' } }, { id: 'asc' }],
    }),
    tx.journalLine.aggregate({
      where: { ...lines, journalEntry: { ...lines.journalEntry, date: { lt: start } } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const openingBook = new Decimal(earlier._sum.debit ?? 0).minus(earlier._sum.credit ?? 0);
  const openingAgrees = openingBook.eq(prior?.proof.adjustedBook ?? opening);
  const byId = new Map(candidates.map(line => [line.id, line]));
  const matched = new Set();
  const groups=await tx.bankMatchGroup.findMany({where:{workspaceId,accountId,rows:{some:{bankTransactionId:{in:transactions.map(r=>r.id)}}}},include:{lines:true,rows:true}});
  const transactionIds=new Set(transactions.map(r=>r.id));
  const groupByRow=new Map(groups.flatMap(g=>g.rows.map(r=>[r.bankTransactionId,g])));
  const bankTransactions = transactions.map(row => {
    const group=groupByRow.get(row.id);
    if(group){const groupLines=group.lines.map(l=>byId.get(l.journalLineId));const valid=group.rows.every(r=>transactionIds.has(r.bankTransactionId))&&groupLines.every(Boolean)&&decimalSum(transactions.filter(r=>group.rows.some(gr=>gr.bankTransactionId===r.id)).map(r=>r.amount)).eq(decimalSum(groupLines.filter(Boolean).map(bankAmount)));if(valid)groupLines.forEach(l=>matched.add(l.id));return{...row,validMatch:valid,matchGroupId:group.id,matchLineIds:group.lines.map(l=>l.journalLineId),matchDescription:valid?groupLines.map(l=>l.journalEntry.description).join(' · '):null};}
    const line = row.isMatched ? byId.get(row.matchedLineId) : null;
    const valid = Boolean(line && bankAmount(line).eq(row.amount));
    if (valid) matched.add(line.id);
    return { ...row, validMatch: valid, matchDescription: valid ? line.journalEntry.description : null };
  });
  const outstanding = candidates.filter(line => !matched.has(line.id)).map(line => ({
    id: line.id,
    date: line.journalEntry.date,
    description: line.description || line.journalEntry.description,
    referenceNo: line.journalEntry.referenceNo,
    amount: bankAmount(line).toFixed(2),
  })).filter(line => !new Decimal(line.amount).isZero());
  const availableIds = new Set(outstanding.map(line => line.id));
  const confirmed = new Set(input.outstandingIds ?? []);
  if (Array.from(confirmed).some(id => !availableIds.has(id))) throw new LedgerError('Outstanding items changed. Refresh the review and confirm them again.', 409);
  const cleared = opening.plus(decimalSum(bankTransactions.filter(row => row.validMatch).map(row => row.amount)));
  const importedEnding = opening.plus(decimalSum(transactions.map(row => row.amount)));
  const adjustedBook = openingBook.plus(decimalSum(candidates.filter(line => line.journalEntry.date >= start).map(bankAmount)));
  const adjustedBank = ending.plus(decimalSum(outstanding.filter(line => confirmed.has(line.id)).map(line => line.amount)));
  const difference = adjustedBank.minus(adjustedBook);
  const unresolved = bankTransactions.filter(row => !row.validMatch).length;
  const canComplete = openingAgrees && transactions.length === statementLineCount && importedEnding.eq(ending) && unresolved === 0 &&
    confirmed.size === outstanding.length && cleared.eq(ending) && difference.isZero();
  const totals = {
    statementStart: from, statementDate: through, openingBalance: opening.toFixed(2),
    statementBalance: ending.toFixed(2), statementLineCount: String(statementLineCount), openingBook: openingBook.toFixed(2),
    deposits: decimalSum(transactions.filter(row => row.amount.gt(0)).map(row => row.amount)).toFixed(2),
    withdrawals: decimalSum(transactions.filter(row => row.amount.lt(0)).map(row => row.amount)).toFixed(2),
    bankFees: decimalSum(candidates.filter(line => line.journalEntry.referenceNo?.startsWith('bank-fee:') &&
      line.journalEntry.date >= start).map(bankAmount)).toFixed(2),
    clearedBalance: cleared.toFixed(2), importedEnding: importedEnding.toFixed(2),
    adjustedBank: adjustedBank.toFixed(2), adjustedBook: adjustedBook.toFixed(2),
    difference: difference.toFixed(2), unresolved, openingAgrees,
  };
  return { ...totals, bankTransactions, outstanding, canComplete };
}

router.get('/history/:accountId', async (req, res) => {
  try {
    res.json(await prisma.reconciliation.findMany({
      where: { workspaceId: req.workspace.id, accountId: req.params.accountId },
      orderBy: [{ statementDate: 'desc' }, { createdAt: 'desc' }],
    }));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load reconciliation history.');
  }
});

router.post('/review', async (req, res) => {
  try {
    res.json(await ledgerTransaction(tx => statementReview(tx, req.workspace.id, req.body)));
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load statement review.');
  }
});

router.post('/complete', async (req, res) => {
  try {
    demand(req, 'post');
    const workspaceId = req.workspace.id;
    const { accountId, outstandingIds } = req.body;
    if (typeof accountId !== 'string' || !accountId) throw new LedgerError('Choose a bank account.');
    if (!Array.isArray(outstandingIds) || outstandingIds.some(id => typeof id !== 'string')) {
      throw new LedgerError('Confirm outstanding items before completing the reconciliation.');
    }
    const result = await ledgerTransaction(async tx => {
      const date = ledgerDate(req.body.statementDate, 'Statement ending date');
      const existing = await tx.reconciliation.findFirst({
        where: { workspaceId, accountId, statementDate: date, proof: { not: Prisma.DbNull } },
      });
      if (existing) {
        const sameOutstanding = existing.proof.outstanding.length === new Set(outstandingIds).size &&
          existing.proof.outstanding.every(line => outstandingIds.includes(line.id));
        if (sameOutstanding && existing.proof.statementStart === ledgerDate(req.body.statementStart).toISOString().slice(0, 10) &&
            existing.proof.statementLineCount === String(Number(req.body.statementLineCount)) &&
            signedAmount(req.body.openingBalance, 'Statement opening balance').eq(existing.proof.openingBalance) &&
            signedAmount(req.body.statementBalance, 'Statement ending balance').eq(existing.statementBalance)) return existing;
        throw new LedgerError('This statement has already been reconciled.', 409);
      }
      const { bankTransactions, ...proof } = await statementReview(tx, workspaceId, req.body);
      if (!proof.canComplete) {
        throw new LedgerError('Completion requires verified opening and ending balances, all statement lines matched, confirmed outstanding items, and a zero unexplained difference.', 409);
      }
      const record = await tx.reconciliation.create({
        data: {
          workspaceId, accountId, statementDate: date, statementBalance: proof.statementBalance, status: 'COMPLETE',
          proof: {
            ...proof, completedById: req.user.id,
            matches: bankTransactions.map(({ id, date, description, amount, matchedLineId, matchDescription,matchGroupId,matchLineIds }) => ({
              id, date: date.toISOString(), description, amount: amount.toFixed(2), matchedLineId, matchDescription,...(matchGroupId&&{matchGroupId,matchLineIds}),
            })),
            outstanding: proof.outstanding.map(line => ({ ...line, date: line.date.toISOString() })),
          },
        },
      });
      await tx.bankTransaction.updateMany({
        where: { workspaceId, accountId, id: { in: bankTransactions.map(row => row.id) } },
        data: { reconciliationId: record.id },
      });
      await audit(tx,workspaceId,'BANK_RECONCILIATION_COMPLETED',record.id,{accountId,proof:record.proof});
      return record;
    });
    res.status(201).json(result);
  } catch (error) {
    sendLedgerError(res, error, 'Failed to complete reconciliation.');
  }
});

async function reviewableTransaction(tx, workspaceId, id) {
  if (typeof id !== 'string' || !id) throw new LedgerError('Select a statement transaction.');
  const row = await tx.bankTransaction.findFirst({ where: { id, workspaceId } });
  if (!row) throw new LedgerError('Statement transaction not found.', 404);
  await bankAccount(tx, workspaceId, row.accountId);
  const prior = await lastVerified(tx, workspaceId, row.accountId);
  if (row.reconciliationId || prior && row.date < nextDay(prior.statementDate.toISOString())) {
    throw new LedgerError('This transaction belongs to a completed reconciliation.', 409);
  }
  return row;
}

router.post('/match', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const { bankTransactionId, journalLineId } = req.body;
    if (typeof journalLineId !== 'string' || !journalLineId) throw new LedgerError('Select a posted ledger line.');
    await ledgerTransaction(async tx => {
      const row = await reviewableTransaction(tx, workspaceId, bankTransactionId);
      if (row.isMatched && row.matchedLineId === journalLineId) return;
      if (row.isMatched) throw new LedgerError('Undo the existing match before choosing another.', 409);
      const line = await tx.journalLine.findFirst({ where: { id: journalLineId, ...postedLines(workspaceId, row.accountId) } });
      if (!line) throw new LedgerError('Posted ledger line not found for this bank account.', 404);
      if(await tx.bankMatchLine.findUnique({where:{journalLineId:line.id}}))throw new LedgerError('This ledger line is already in a grouped match.',409);
      if (!bankAmount(line).eq(row.amount)) throw new LedgerError('The ledger line must have the same amount and direction as the statement transaction.');
      await tx.bankTransaction.update({ where: { id: row.id, workspaceId }, data: { isMatched: true, matchedLineId: line.id } });
      await audit(tx,workspaceId,'BANK_LINE_MATCHED',row.id,{journalLineId:line.id,amount:row.amount});
    });
    res.json({ success: true });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to match the statement transaction.');
  }
});

router.post('/unmatch', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    await ledgerTransaction(async tx => {
      const row = await reviewableTransaction(tx, workspaceId, req.body.bankTransactionId);
      const group=await tx.bankMatchRow.findUnique({where:{bankTransactionId:row.id},include:{group:{include:{rows:{include:{bankTransaction:true}},lines:true}}}});
      if(group){if(group.group.rows.some(r=>r.bankTransaction.reconciliationId))throw new LedgerError('This group belongs to a completed reconciliation.',409);await tx.bankTransaction.updateMany({where:{workspaceId,id:{in:group.group.rows.map(r=>r.bankTransactionId)}},data:{isMatched:false,matchedLineId:null}});await audit(tx,workspaceId,'BANK_GROUP_UNMATCHED',group.groupId,{group:group.group});await tx.bankMatchGroup.delete({where:{id:group.groupId}});return;}
      await tx.bankTransaction.update({ where: { id: row.id, workspaceId }, data: { isMatched: false, matchedLineId: null } });
      await audit(tx,workspaceId,'BANK_LINE_UNMATCHED',row.id,{priorLineId:row.matchedLineId});
    });
    res.json({ success: true });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to undo the match.');
  }
});

router.post('/match-group',async(req,res)=>{try{res.json(await ledgerTransaction(tx=>once(tx,req,'bank-match-group',()=>groupMatch(tx,req,reviewableTransaction))));}catch(e){sendLedgerError(res,e,'Grouped match could not save.');}});

router.post('/transfer',async(req,res)=>{try{demand(req,'post');res.status(201).json(await ledgerTransaction(tx=>once(tx,req,'bank-transfer',async()=>{const {fromAccountId,toAccountId}=req.body;if(fromAccountId===toAccountId)throw new LedgerError('Select different transfer accounts.');const accounts=await ledgerAccounts(tx,req.workspace.id,[fromAccountId,toAccountId]);if([...accounts.values()].some(a=>!['CASH','BANK','CREDIT_CARD'].includes(a.role)))throw new LedgerError('Transfers require cash, bank or card accounts in this workspace.');const amount=decimalInput(req.body.amount,'Transfer amount');if(amount.lte(0)||typeof req.body.reference!=='string'||req.body.reference.trim().length<3)throw new LedgerError('Enter a positive amount and transfer reference.');return createPosting(tx,req.workspace.id,{date:ledgerDate(req.body.date),description:'Transfer · '+req.body.reference.trim(),referenceNo:req.body.reference.trim(),lines:[{accountId:toAccountId,debit:amount},{accountId:fromAccountId,credit:amount}]});})));}catch(e){sendLedgerError(res,e,'Transfer could not save.');}});

router.post('/post-fee', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const { bankTransactionId, expenseAccountId } = req.body;
    await ledgerTransaction(async tx => {
      const row = await reviewableTransaction(tx, workspaceId, bankTransactionId);
      const referenceNo = 'bank-fee:' + row.id;
      const existing = await tx.journalEntry.findFirst({
        where: { workspaceId, referenceNo, status: 'POSTED', reversal: { is: null } },
        include: { journalLines: true },
      });
      if (existing) {
        if (row.matchedLineId && existing.journalLines.some(line => line.id === row.matchedLineId)) return;
        throw new LedgerError('This fee was already posted. Match the existing ledger entry.', 409);
      }
      if (row.isMatched || !row.amount.lt(0)) throw new LedgerError('Select an unmatched withdrawal to record a bank fee.');
      const accounts = await ledgerAccounts(tx, workspaceId, [expenseAccountId]);
      if (accounts.get(expenseAccountId).type !== 'EXPENSE') throw new LedgerError('Select an expense account for bank fees.');
      const amount = row.amount.abs();
      const entry = await createPosting(tx, workspaceId, {
        date: row.date, description: row.description, referenceNo,
        lines: [{ accountId: expenseAccountId, debit: amount }, { accountId: row.accountId, credit: amount }],
      });
      const line = entry.journalLines.find(item => item.accountId === row.accountId);
      await tx.bankTransaction.update({ where: { id: row.id, workspaceId }, data: { isMatched: true, matchedLineId: line.id } });
    });
    res.json({ success: true });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to post the bank fee.');
  }
});

async function importTransactions(workspaceId, accountId, records) {
  if (!Array.isArray(records) || !records.length) throw new LedgerError('Add at least one statement transaction.');
  return ledgerTransaction(async tx => {
    await bankAccount(tx, workspaceId, accountId);
    const prior = await lastVerified(tx, workspaceId, accountId);
    const lockedBefore = prior && nextDay(prior.statementDate.toISOString());
    const existingCounts = new Map();
    const data = [];
    for (const record of records) {
      const date = ledgerDate(record.date, 'Transaction date');
      const description = typeof record.description === 'string' ? record.description.trim() : '';
      const amount = signedAmount(record.amount, 'Transaction amount');
      if (!description || amount.isZero()) throw new LedgerError('Every statement line needs a description and a nonzero amount.');
      const key = JSON.stringify([date.toISOString(), description, amount.toFixed(2)]);
      const identity = { workspaceId, accountId, date, description, amount };
      if (!existingCounts.has(key)) existingCounts.set(key, await tx.bankTransaction.count({ where: { ...identity, date: { gte: date, lt: nextDay(date.toISOString()) } } }));
      if (existingCounts.get(key) > 0) {
        existingCounts.set(key, existingCounts.get(key) - 1);
        continue;
      }
      if (lockedBefore && date < lockedBefore) throw new LedgerError('A new line cannot be imported into a completed statement period.', 409);
      data.push(identity);
    }
    if (data.length) await tx.bankTransaction.createMany({ data });
    return data.length;
  });
}

router.post('/import', async (req, res) => {
  try {
    const imported = await importTransactions(req.workspace.id, req.body.accountId, req.body.transactions);
    res.status(201).json({ imported });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to import statement transactions.');
  }
});

router.post('/import-csv/preview',upload.single('csv'),restoreWorkspaceContext,async(req,res)=>{try{const parsed=parseStatement(req);await bankAccount(prisma,req.workspace.id,req.body.accountId);res.json(await importPreview(prisma,req,parsed));}catch(e){sendLedgerError(res,e,'Statement preview could not load.');}});
router.post('/import-csv',upload.single('csv'),restoreWorkspaceContext,async(req,res)=>{try{const parsed=parseStatement(req);res.status(201).json(await ledgerTransaction(async tx=>{await bankAccount(tx,req.workspace.id,req.body.accountId);return commitStatement(tx,req,parsed);}));}catch(e){sendLedgerError(res,e,'Statement import could not finish.');}});

// Existing readers use these routes to inspect available transactions and matches.
router.get('/:accountId/suggestions', async (req, res) => {
  try {
    const workspaceId = req.workspace.id;
    const { accountId } = req.params;
    await bankAccount(prisma, workspaceId, accountId);
    const { transactions, lines } = await available(prisma, workspaceId, accountId);
    const windowDays = Math.min(31, Math.max(1, Number(req.query.windowDays) || 5));
    const suggestions = transactions.map(row => ({
      bankTransactionId: row.id,
      candidates: lines.filter(line => bankAmount(line).eq(row.amount)).map(line => ({
        journalLineId: line.id, amount: Number(row.amount), date: line.journalEntry.date,
        description: line.description || line.journalEntry.description, exactAmount: true, amountDelta: 0,
        dateDistance: Math.abs(line.journalEntry.date - row.date) / 86400000,
        source: { type: 'journal', id: line.journalEntryId, label: line.journalEntry.description },
      })).filter(line => line.dateDistance <= windowDays).sort((a, b) => a.dateDistance - b.dateDistance).slice(0, 3),
    }));
    res.json({ windowDays, suggestions });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load match suggestions.');
  }
});

async function available(tx, workspaceId, accountId) {
  const rows = await tx.bankTransaction.findMany({ where: { workspaceId, accountId }, orderBy: { date: 'asc' } });
  const grouped=await tx.bankMatchLine.findMany({where:{group:{workspaceId,accountId}},select:{journalLineId:true}});
  const matched = [...rows.filter(row => row.isMatched && row.matchedLineId).map(row => row.matchedLineId),...grouped.map(l=>l.journalLineId)];
  const lines = await tx.journalLine.findMany({
    where: { ...postedLines(workspaceId, accountId), id: { notIn: matched } },
    include: journalDetail,
    orderBy: { journalEntry: { date: 'asc' } },
  });
  return { transactions: rows.filter(row => !row.isMatched), lines };
}

router.get('/:accountId', async (req, res) => {
  try {
    await bankAccount(prisma, req.workspace.id, req.params.accountId);
    const { transactions, lines } = await available(prisma, req.workspace.id, req.params.accountId);
    res.json({ bankTransactions: transactions, journalLines: lines });
  } catch (error) {
    sendLedgerError(res, error, 'Failed to load reconciliation transactions.');
  }
});

export default router;
