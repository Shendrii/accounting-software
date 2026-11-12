import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import prisma from '../db/prisma.js';
import { Decimal, LedgerError, decimalSum, ledgerDate, nextDay, sendLedgerError } from './ledger.js';
import { profitLoss, balanceSheet, trialBalance } from './financialReports.js';
import { agingReport } from './aging.js';
import { cashFlow, comparative } from './reportAnalysis.js';
import { partyStatement } from './partyStatement.js';
import { taxRegister } from './taxRegister.js';
import { contractorReport } from './contractors.js';

const section = (title, columns, rows, numeric = []) => ({ title, columns, rows, numeric });
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').slice(0, 10);
const money = value => new Decimal(value ?? 0).toFixed(2);

export function reportCsv(reports, workspace, generatedAt) {
  const cell = value => {
    const text = String(value ?? '');
    // Keep exact signed decimal values numeric, but neutralize spreadsheet formulas.
    return '"' + (/^\s*[=+@\-\t\r]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
  };
  const rows = [['Accountrix', workspace.legalName ?? workspace.name], ['Workspace ID', workspace.id], ['Currency', workspace.currency], ['Generated at (UTC)', generatedAt]];
  for (const report of reports) {
    rows.push([], [report.title], [report.period], ['Basis', report.basis ?? 'Accrual']);
    for (const note of report.notes ?? []) rows.push(['Review note', note]);
    for (const part of report.sections) rows.push([], [part.title], part.columns, ...part.rows);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

export function reportPdf(reports, workspace, generatedAt) {
  const rows = reports.flatMap(report => report.sections.flatMap(part => part.rows));
  if (rows.length > 10000 || rows.reduce((count,row)=>count+row.reduce((n,value)=>n+String(value??'').length,0),0)>2000000) throw new LedgerError('This complete PDF is too large for one download. Narrow the dates or export CSV; no partial PDF was produced.',409);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true,
      info: { Title: reports.map(r => r.title).join(' / '), Author: workspace.legalName ?? workspace.name, Subject: workspace.currency + ' bookkeeping reports' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const width = doc.page.width - 72;
    const bottom = doc.page.height - 46;
    let report, pageBodyTop;
    function heading() {
      doc.fillColor('#1546ce').font('Helvetica-Bold').fontSize(10).text('Accountrix', 36, 28);
      doc.fillColor('#181b25').fontSize(16).text(report.title, 36, 48, { width });
      doc.font('Helvetica').fontSize(9).text(workspace.legalName ?? workspace.name, { width });
      doc.text(report.period + '  |  ' + workspace.currency + '  |  ' + (report.basis ?? 'Accrual'), { width });
      doc.moveDown(0.7); doc.moveTo(36, doc.y).lineTo(36 + width, doc.y).strokeColor('#343942').stroke(); doc.y += 12; pageBodyTop=doc.y;
    }
    function newPage() { doc.addPage(); heading(); }
    // Wrap explicitly so even a long description continues on the next page.
    function lines(text, available) {
      const result = [];
      for (const paragraph of String(text ?? '').split(/\r?\n/)) {
        let current = '';
        for (const word of paragraph.split(/\s+/)) {
          if (current && doc.widthOfString(current + ' ' + word) > available) { result.push(current); current = ''; }
          for (const char of word) {
            if (current && doc.widthOfString(current + char) > available) { result.push(current); current = ''; }
            current += char;
          }
          current += ' ';
        }
        result.push(current.trimEnd());
      }
      return result;
    }
    reports.forEach((item, index) => {
      report = item;
      if (index) doc.addPage();
      heading();
      for (const note of report.notes ?? []) {
        doc.fontSize(9).font('Helvetica');
        for (const line of lines(note, width)) { if (doc.y + 14 > bottom) newPage(); const y = doc.y; doc.text(line, 36, y, { width, lineBreak: false }); doc.y = y + 13; }
      }
      for (const part of report.sections) {
        const count = part.columns.length;
        const numericWidth = count > 7 ? 63 : 80;
        const textWidth = (width - numericWidth * part.numeric.length) / (count - part.numeric.length || 1);
        const widths = part.columns.map((_, i) => part.numeric.includes(i) ? numericWidth : textWidth);
        let atTableTop=false;
        function tableHeader() {
          if (doc.y + 62 > bottom) newPage();
          atTableTop=doc.y===pageBodyTop;
          doc.fillColor('#181b25').font('Helvetica-Bold').fontSize(10).text(part.title, 36, doc.y + 9, { width }); doc.y += 8;
          doc.fontSize(8);
          const top = doc.y, height = Math.max(...part.columns.map((v, i) => doc.heightOfString(v, { width: widths[i] - 10 }))) + 12;
          doc.rect(36, top, width, height).fill('#e7edfc');
          let x = 36;
          part.columns.forEach((label, i) => { doc.fillColor('#181b25').text(label, x + 5, top + 6, { width: widths[i] - 10, align: part.numeric.includes(i) ? 'right' : 'left' }); x += widths[i]; });
          doc.y = top + height;
        }
        tableHeader();
        for (const row of part.rows.length ? part.rows : [Array(count).fill('')]) {
          doc.font('Helvetica').fontSize(8);
          const wrapped = row.map((value, i) => {
            const text=String(value??''); const formatted=part.numeric.includes(i)&&/^-?\d+\.\d+$/.test(text)?text.replace(/\d+(?=\.)/,integer=>integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')):text;
            return lines(formatted, widths[i] - 10);
          });
          let offset = 0; const total = Math.max(...wrapped.map(l => l.length));
          if (doc.y+total*11+8>bottom&&!atTableTop) {newPage();tableHeader();doc.font('Helvetica').fontSize(8);}
          while (offset < total) {
            if (doc.y + 23 > bottom) { newPage(); tableHeader(); doc.font('Helvetica').fontSize(8); }
            const take = Math.min(total - offset, Math.max(1, Math.floor((bottom - doc.y - 8) / 11)));
            const top = doc.y; let x = 36;
            wrapped.forEach((value, i) => { doc.fillColor('#181b25').text(value.slice(offset, offset + take).join('\n'), x + 5, top + 4, { width: widths[i] - 10, align: part.numeric.includes(i) ? 'right' : 'left', lineGap: 1 }); x += widths[i]; });
            doc.y = top + take * 11 + 8;
            doc.moveTo(36, doc.y).lineTo(36 + width, doc.y).strokeColor('#d7dbe2').stroke();
            offset += take;
          }
          atTableTop=false;
        }
        doc.y += 10;
      }
    });
    const pages = doc.bufferedPageRange();
    for (let page = 0; page < pages.count; page++) {
      doc.switchToPage(page);
      const bottomMargin=doc.page.margins.bottom; doc.page.margins.bottom=0;
      doc.font('Helvetica').fontSize(7).fillColor('#565d69').text('Workspace ' + workspace.id + ' | Generated ' + generatedAt, 36, doc.page.height - 27, { width: width - 95, lineBreak: false });
      doc.text('Page ' + (page + 1) + ' of ' + pages.count, doc.page.width - 125, doc.page.height - 27, { width: 89, align: 'right', lineBreak: false });
      doc.page.margins.bottom=bottomMargin;
    }
    doc.end();
  });
}

async function generalLedger(tx, workspace, query) {
  const start = ledgerDate(query.startDate), until = nextDay(query.endDate);
  const rows = await tx.$queryRaw`
    WITH opening AS (SELECT l."accountId", SUM(l.debit-l.credit) AS amount FROM "JournalLine" l JOIN "JournalEntry" j ON j.id=l."journalEntryId"
      WHERE j."workspaceId"=${workspace.id} AND j.status='POSTED' AND j.date < ${start.toISOString()}::timestamp GROUP BY l."accountId"),
    activity AS (SELECT l.*,j.date,j.description AS memo,j."referenceNo" FROM "JournalLine" l JOIN "JournalEntry" j ON j.id=l."journalEntryId"
      WHERE j."workspaceId"=${workspace.id} AND j.status='POSTED' AND j.date >= ${start.toISOString()}::timestamp AND j.date < ${until.toISOString()}::timestamp)
    SELECT a.code,a.name,l.date,l."referenceNo",COALESCE(l.description,l.memo,'Opening balance; no period activity') AS description,
      COALESCE(o.amount,0)::text AS opening,COALESCE(l.debit,0)::text AS debit,COALESCE(l.credit,0)::text AS credit,
      (COALESCE(o.amount,0)+COALESCE(SUM(l.debit-l.credit) OVER(PARTITION BY a.id ORDER BY l.date,l."journalEntryId",l.id ROWS UNBOUNDED PRECEDING),0))::text AS balance
    FROM "Account" a LEFT JOIN opening o ON o."accountId"=a.id LEFT JOIN activity l ON l."accountId"=a.id
    WHERE a."workspaceId"=${workspace.id} AND (l.id IS NOT NULL OR COALESCE(o.amount,0)<>0)
    ORDER BY a.code,l.date,l."journalEntryId",l.id LIMIT 10001`;
  if (rows.length > 10000) throw new LedgerError('This complete general ledger exceeds 10,000 rows. Narrow the dates; no partial export was produced.', 409);
  return [section('Posted account activity', ['Account', 'Date', 'Reference', 'Description', 'Opening net', 'Debit', 'Credit', 'Running net'], rows.map(r => [r.code + ' ' + r.name, day(r.date), r.referenceNo ?? '', r.description, money(r.opening), money(r.debit), money(r.credit), money(r.balance)]), [4, 5, 6, 7]),
    section('Period movement', ['Total debits', 'Total credits'], [[decimalSum(rows.map(r => r.debit)).toFixed(2), decimalSum(rows.map(r => r.credit)).toFixed(2)]], [0, 1])];
}

export async function buildReport(tx, workspace, kind, input) {
  for (const [key,value] of Object.entries(input)) if (typeof value !== 'string' || value.length > 200) throw new LedgerError('Use one valid value for each report option.');
  const today = new Date().toISOString().slice(0, 10);
  const q = { ...input, startDate: input.startDate || (input.endDate || input.asOf || today).slice(0, 7) + '-01', endDate: input.endDate || input.asOf || today, asOf: input.asOf || input.endDate || today };
  ledgerDate(q.asOf); if (!['balance-sheet','trial-balance','aging','statement','contractors'].includes(kind) && ledgerDate(q.startDate) > ledgerDate(q.endDate)) throw new LedgerError('The end date cannot precede the start date.');
  const period = q.startDate + ' through ' + q.endDate, point = 'As of ' + q.asOf;
  const result = { title: '', period, basis: 'Accrual', notes: [], sections: [] };
  if (kind === 'profit-loss') {
    const r = await profitLoss(tx, workspace, q); result.title = 'Profit and loss';
    result.sections = [section('Revenue', ['Code', 'Account', 'Amount'], [...r.revenue.map(a => [a.accountCode, a.accountName, a.balance]), ['', 'Total revenue', r.totalRevenue]], [2]), section('Expenses', ['Code', 'Account', 'Amount'], [...r.expenses.map(a => [a.accountCode, a.accountName, a.balance]), ['', 'Total expenses', r.totalExpenses], ['', 'Net income', r.netIncome]], [2])];
  } else if (kind === 'balance-sheet') {
    const r = await balanceSheet(tx, workspace, q); result.title = 'Balance sheet'; result.period = point;
    result.sections = ['assets', 'liabilities', 'equity'].map(key => section(key[0].toUpperCase() + key.slice(1), ['Code', 'Account', 'Amount'], [...r[key].map(a => [a.accountCode, a.accountName, a.balance]), ['', 'Total ' + key, r['total' + key[0].toUpperCase() + key.slice(1)]]], [2]));
    result.notes.push('Accounting equation difference: ' + r.difference + '. Unclosed earnings are derived from cumulative revenue less expenses.');
  } else if (kind === 'trial-balance') {
    const r = await trialBalance(tx, workspace, q); result.title = 'Trial balance'; result.period = point;
    result.sections = [section('Closing account balances', ['Code', 'Account', 'Type', 'Debit', 'Credit'], [...r.rows.map(a => [a.accountCode, a.accountName, a.accountType, a.debitTotal, a.creditTotal]), ['', 'Totals', '', r.totals.debitTotal, r.totals.creditTotal]], [3, 4])]; result.notes.push('Debit less credit: ' + r.difference);
  } else if (kind === 'aging') {
    const r = await agingReport(tx, workspace, q, true); result.title = r.kind === 'receivables' ? 'Accounts receivable aging' : 'Accounts payable aging'; result.period = 'As of ' + r.asOf;
    result.notes.push('Aging from ' + (r.agingBy === 'dueDate' ? 'due date' : 'document date') + '. Complete population: ' + r.total + ' open items.');
    result.notes.push('Ledger reconciliation: ' + (r.reconciliation.balanced ? 'reconciled' : 'REVIEW REQUIRED') + '; difference ' + r.reconciliation.difference + '; unverified documents ' + r.reconciliation.unverifiedDocuments + '; unmapped documents ' + r.reconciliation.unmappedDocuments + '.');
    result.sections = [section('Control account reconciliation', ['Account', 'Ledger', 'Subledger', 'Difference'], r.reconciliation.controls.map(a => [a.code + ' ' + a.name, a.ledgerBalance, a.subledgerBalance, a.difference]), [1, 2, 3]),
      section('Aging distribution', ['Current', '1-30', '31-60', '61-90', '91+', 'Credits', 'Net balance'], [[...['current', 'days1to30', 'days31to60', 'days61to90', 'days91plus'].map(k => r.buckets[k]), r.totals.credits, r.totals.net]], [0, 1, 2, 3, 4, 5, 6]),
      section('Complete open document detail', ['Party', 'Reference', 'Date', 'Due date', 'Bucket', 'Original', 'Settled', 'Open'], r.items.map(a => [a.partyName, a.reference, a.date, a.dueDate, ({current:'Current',days1to30:'1-30 days',days31to60:'31-60 days',days61to90:'61-90 days',days91plus:'91+ days',credit:'Credit'})[a.bucket], a.originalAmount, a.paidAsOf, a.balance]), [5, 6, 7])];
  } else if (kind === 'general-ledger') {
    result.title = 'General ledger'; result.notes.push('Posted entries only. Opening and running balances are debit-positive, credit-negative. Opening-only accounts are retained.'); result.sections = await generalLedger(tx, workspace, q);
  } else if (kind === 'cash-flow') {
    const r = await cashFlow(tx, workspace, q); result.title = 'Cash-flow workpaper'; result.basis = r.basis;
    result.notes.push('Unclassified movements: ' + r.unclassified + '; roll-forward difference: ' + r.difference + '. Review unclassified and noncash items before issuing financial statements.');
    result.sections = [section('Cash roll-forward', ['Opening cash', 'Net movement', 'Closing cash', 'Difference'], [[r.opening, r.movement, r.ending, r.difference]], [0, 1, 2, 3]), section('Classification', ['Category', 'Amount'], Object.entries(r.totals), [1]),
      section('Cash movements', ['Date', 'Reference', 'Description', 'Classification', 'Amount'], r.activity.flatMap(a => a.allocations.map(v => [day(a.date), a.referenceNo ?? '', a.description, v.category, v.amount])), [4]),
      section('Noncash investing / financing review', ['Date', 'Reference', 'Description', 'Amount'], r.noncash.map(a => [day(a.date), a.referenceNo ?? '', a.description, money(a.amount)]), [3])];
  } else if (kind === 'comparative') {
    const r = await comparative(tx, workspace, { ...q, report: input.comparisonReport ?? 'profit-loss' }); result.title = 'Comparative ' + r.report; result.notes.push('Comparison: ' + input.comparisonStart + ' through ' + input.comparisonEnd + '; unmapped accounts: ' + r.unmapped);
    result.sections = [section('Account comparison', ['Code', 'Account', 'Group', 'Current', 'Prior', 'Change', 'Change %'], r.items.map(a => [a.code, a.name, a.reportingGroup ?? 'Unmapped', a.current, a.prior, a.change, a.percent ?? 'No prior balance']), [3, 4, 5, 6])];
    if(r.report==='profit-loss') result.sections.push(section('Net income', ['Current','Prior','Change'], [[r.currentNetIncome,r.priorNetIncome,new Decimal(r.currentNetIncome).minus(r.priorNetIncome).toFixed(2)]], [0,1,2]));
  } else if (kind === 'statement') {
    const r = await partyStatement(tx, workspace, input.kind, input.partyId, { ...input, asOf: q.asOf }); result.title = (input.kind === 'AR' ? 'Customer' : 'Supplier') + ' statement - ' + r.party.name; result.period = r.startDate + ' through ' + r.asOf;
    result.notes.push('Statement-to-aging difference: ' + r.difference + '; control ledger reconciled: ' + r.ledgerReconciled + '. Unapplied deposits / prepayments held separately: ' + r.availableDeposits);
    result.sections = [section('Statement of account', ['Date', 'Reference', 'Description', 'Movement', 'Running balance'], [[r.startDate, '', 'Opening balance', '', r.opening], ...r.items.map(a => [day(a.date), a.reference, a.description, a.amount, a.runningBalance]), [r.asOf, '', 'Closing AR/AP balance', '', r.closing]], [3, 4])];
  } else if (kind === 'tax') {
    const r = await taxRegister(tx, workspace, q, true); result.title = 'Tax review workpaper'; result.notes.push('Review workpaper. Not a filed return or statutory certification. Pending certificates: '+r.summary.pendingEvidence+'.');
    result.sections = [section('Complete tax register', ['Date', 'Reference', 'Code', 'Purpose', 'Evidence', 'Base', 'Tax', 'Net movement'], r.items.map(a => [day(a.date), a.referenceNo ?? a.source, a.codeSnapshot.code, a.codeSnapshot.purpose, a.evidenceStatus + ' ' + (a.evidenceReference ?? ''), money(a.baseAmount), money(a.amount), money(a.netAmount)]), [5, 6, 7]), section('Tax movement totals', ['Purpose','Net movement'],Object.entries(r.summary.purposeTotals).map(([key,value])=>[key,money(value)]),[1])];
  } else if (kind === 'contractors') {
    const r = await contractorReport(tx, workspace, { ...input, page: '1', exportAll: true }); if (r.total > 10000) throw new LedgerError('This complete workpaper exceeds 10,000 suppliers; no partial export was produced.', 409);
    result.title = 'Contractor payment review'; result.period = 'Calendar year ' + r.year; result.basis = r.basis;
    result.notes.push('Manual journals without a supplier are outside this workpaper. Review reporting categories, exemptions and card reporting separately.');
    result.sections = [section('Complete supplier workpaper', ['Supplier', 'W-9 status', 'Reporting review', 'Support', 'Bank / cash net', 'Card net'], r.items.map(a => [a.name, a.taxProfile?.w9Status ?? 'NOT_REVIEWED', a.taxProfile?.reportingCategory ?? 'NOT_REVIEWED', a.taxProfile?.support ?? '', a.bankCashPaid, a.cardPaid]), [4, 5])];
  } else throw new LedgerError('Choose an available report.');
  return result;
}

export async function exportReport(req, res) {
  try {
    const kind = req.query.report ?? 'profit-loss', format = req.query.format ?? 'pdf';
    if (!['csv', 'pdf'].includes(format)) throw new LedgerError('Choose CSV or PDF.');
    const reports = await prisma.$transaction(async tx => {
      if (kind !== 'pack') return [await buildReport(tx, req.workspace, kind, req.query)];
      const result = [];
      for (const report of ['profit-loss', 'balance-sheet', 'trial-balance', 'cash-flow']) result.push(await buildReport(tx, req.workspace, report, req.query));
      for (const type of ['receivables', 'payables']) result.push(await buildReport(tx, req.workspace, 'aging', { ...req.query, kind: type }));
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
    const generatedAt = new Date().toISOString();
    const buffer = format === 'pdf' ? await reportPdf(reports, req.workspace, generatedAt) : reportCsv(reports, req.workspace, generatedAt);
    res.set('Cache-Control', 'private, no-store').type(format === 'pdf' ? 'application/pdf' : 'text/csv').attachment('accountrix-' + kind + '-' + generatedAt.slice(0, 10) + '.' + format).send(buffer);
  } catch (error) { sendLedgerError(res, error, 'The complete report could not export. Try a shorter reporting period.'); }
}
