import { LedgerError, ledgerDate } from './ledger.js';
export const intervals = ['weekly', 'monthly', 'quarterly', 'yearly'];
export function scheduleInput(input, originalDate) {
  const interval = input.recurrenceInterval ?? 'monthly';
  if (!intervals.includes(interval)) throw new LedgerError('Choose weekly, monthly, quarterly, or yearly.');
  const date = ledgerDate(input.nextDueDate, 'Next draft date');
  if (originalDate && date <= originalDate) throw new LedgerError('The next draft date must follow the original document date.');
  const anchorDay = input.recurrenceAnchorDay == null ? date.getUTCDate() : Number(input.recurrenceAnchorDay);
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) throw new LedgerError('Choose a repeat day from 1 to 31.');
  return { recurrenceInterval: interval, nextDueDate: date, recurrenceAnchorDay: anchorDay };
}
export function advance(date, interval, anchorDay = date.getUTCDate()) {
  if (!intervals.includes(interval)) throw new LedgerError('Review this template’s repeat interval.');
  if (interval === 'weekly') { const result = new Date(date); result.setUTCDate(result.getUTCDate() + 7); return result; }
  const months = interval === 'monthly' ? 1 : interval === 'quarterly' ? 3 : 12;
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(anchorDay, last)); return result;
}
export function occurrences(next, interval, anchorDay, count = 3) {
  if (!next) return [];
  let date = ledgerDate(next instanceof Date ? next.toISOString() : next, 'Next draft date'); const anchor = anchorDay ?? date.getUTCDate();
  const result = [];
  for (let i = 0; i < count; i++) { result.push(date.toISOString().slice(0,10)); date = advance(date, interval, anchor); }
  return result;
}
