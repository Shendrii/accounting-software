import { Prisma } from '@prisma/client';
import prisma from '../db/prisma.js';

export const Decimal = Prisma.Decimal;

export class LedgerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function decimalInput(value, label, scale = 2, integerDigits = 15 - scale) {
  const text = typeof value === 'number' || typeof value === 'string' || Decimal.isDecimal(value)
    ? String(value)
    : '';
  const pattern = new RegExp('^(?:[0-9]{1,' + integerDigits + '}(?:\\.[0-9]{1,' + scale + '})?|\\.[0-9]{1,' + scale + '})$');
  if (!pattern.test(text)) throw new LedgerError(label + ' must be a nonnegative number with at most ' + scale + ' decimal places.');
  return new Decimal(text);
}

export function ledgerDate(value, label = 'Posting date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) ||
      (value.length > 10 && Number.isNaN(new Date(value).valueOf()))) {
    throw new LedgerError(label + ' is required.');
  }
  const day = value.slice(0, 10);
  const date = new Date(day + 'T00:00:00Z');
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== day) {
    throw new LedgerError(label + ' must be a valid date.');
  }
  return date;
}

export function nextDay(value) {
  const date = ledgerDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

export function decimalSum(values) {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

export function normalBalance(type, debit, credit) {
  return type === 'ASSET' || type === 'EXPENSE'
    ? new Decimal(debit ?? 0).minus(credit ?? 0)
    : new Decimal(credit ?? 0).minus(debit ?? 0);
}

export async function ledgerBalances(client, workspaceId, date) {
  const sums = await client.journalLine.groupBy({
    by: ['accountId'],
    where: {
      account: { workspaceId },
      journalEntry: { workspaceId, status: 'POSTED', ...(date && { date }) },
    },
    _sum: { debit: true, credit: true },
  });
  return new Map(sums.map(line => [line.accountId, line._sum]));
}

export function accountBalance(account, balances) {
  const sums = balances.get(account.id);
  return normalBalance(account.type, sums?.debit, sums?.credit);
}

export async function cashLedgerAccounts(client, workspaceId, balances) {
  const [accounts, sums] = await Promise.all([
    client.account.findMany({
      where: {
        workspaceId,
        type: 'ASSET',
        OR: [
          ...['cash', 'bank', 'checking'].map(name => ({ name: { contains: name, mode: 'insensitive' } })),
          { journalLines: { some: { debit: { gt: 0 }, journalEntry: { workspaceId, status: 'POSTED', invoicePayment: { isNot: null } } } } },
        ],
      },
      select: { id: true, name: true, type: true },
    }),
    balances ?? ledgerBalances(client, workspaceId),
  ]);
  return accounts.map(account => ({ ...account, balance: accountBalance(account, sums) }));
}

export function journalLines(input) {
  if (!Array.isArray(input) || input.length < 2) throw new LedgerError('Enter at least two journal lines.');
  const lines = input.map(line => {
    if (typeof line?.accountId !== 'string' || !line.accountId) throw new LedgerError('Select an account for each journal line.');
    const debit = decimalInput(line.debit === '' ? 0 : line.debit ?? 0, 'Debit');
    const credit = decimalInput(line.credit === '' ? 0 : line.credit ?? 0, 'Credit');
    if (debit.isZero() === credit.isZero()) throw new LedgerError('Each line needs one positive debit or credit.');
    return { accountId: line.accountId, debit, credit, description: line.description };
  });
  if (!decimalSum(lines.map(line => line.debit)).eq(decimalSum(lines.map(line => line.credit)))) {
    throw new LedgerError('Total debits must equal total credits.');
  }
  return lines;
}

export async function ledgerAccounts(tx, workspaceId, ids, allowInactive = false) {
  if (ids.some(id => typeof id !== 'string' || !id)) throw new LedgerError('Select a valid account.');
  const unique = [...new Set(ids)];
  const accounts = await tx.account.findMany({
    where: { workspaceId, id: { in: unique }, ...(allowInactive ? {} : { isActive: true }) },
    select: { id: true, name: true, code: true, type: true },
  });
  if (accounts.length !== unique.length) throw new LedgerError('Choose valid accounts from this workspace.');
  return new Map(accounts.map(account => [account.id, account]));
}

// Keep the existing balance cache available to older callers. Posted lines are authoritative.
export async function updateBalanceCache(tx, workspaceId, lines, accounts) {
  const changes = new Map();
  for (const line of lines) {
    const delta = normalBalance(accounts.get(line.accountId).type, line.debit, line.credit);
    changes.set(line.accountId, (changes.get(line.accountId) ?? new Decimal(0)).plus(delta));
  }
  for (const accountId of [...changes.keys()].sort()) {
    await tx.account.update({ where: { id: accountId, workspaceId }, data: { balance: { increment: changes.get(accountId) } } });
  }
}

export async function createPosting(tx, workspaceId, { lines: input, ...data }, allowInactive = false) {
  const lines = journalLines(input);
  const accounts = await ledgerAccounts(tx, workspaceId, lines.map(line => line.accountId), allowInactive);
  const entry = await tx.journalEntry.create({
    data: { ...data, workspaceId, status: 'POSTED', journalLines: { create: lines } },
    include: { journalLines: { include: { account: true } } },
  });
  await updateBalanceCache(tx, workspaceId, lines, accounts);
  return entry;
}

export function reversePosting(tx, workspaceId, entry, date, reason) {
  return createPosting(tx, workspaceId, {
    date,
    description: reason,
    referenceNo: entry.referenceNo,
    reversalOfId: entry.id,
    lines: entry.journalLines.map(line => ({
      accountId: line.accountId, debit: line.credit, credit: line.debit, description: line.description,
    })),
  }, true);
}

export async function ledgerTransaction(callback) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error.code !== 'P2034') throw error;
      if (attempt === 3) throw new LedgerError('The ledger changed while saving. Try again.', 409);
    }
  }
}

export function sendLedgerError(res, error, fallback) {
  if (error instanceof LedgerError) return res.status(error.status).json({ error: error.message });
  if (error.code === 'P2003') return res.status(400).json({ error: 'A selected record no longer exists.' });
  if (error.code === 'P2025') return res.status(409).json({ error: 'The record changed while saving. Refresh and try again.' });
  if (error.code === 'P2002') return res.status(409).json({ error: 'Another request saved this record. Refresh and try again.' });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}
