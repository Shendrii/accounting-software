'use client';
import { useMoney } from '@/lib/use-money';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { getAccountActivity, getJournalEntry } from '@/lib/api';
import { useWorkspaceData } from '@/lib/use-workspace-data';
import { decimalUnits, decimalText } from '@/lib/money';
import WorkbenchDrawer from './WorkbenchDrawer';
import { WorkspaceNotice } from './WorkspaceUI';
import { WorklistPagination } from './WorklistControls';
import { PostingTable, postedLines } from './PostingTable';
function balance(value: string, format: (value: string) => string) { const units = decimalUnits(value); return format(decimalText(units < BigInt(0) ? -units : units)) + (units < BigInt(0) ? ' Cr' : units > BigInt(0) ? ' Dr' : ''); }
function Journal({ id }: { id: string }) {
  const load = useCallback(() => getJournalEntry(id), [id]); const entry = useWorkspaceData(load);
  return <section className="border-t border-slate-300 pt-4"><h3 className="font-semibold">Journal entry</h3>{entry.loading && <p role="status">Loading journal…</p>}{entry.error && <WorkspaceNotice title="Journal could not load" onRetry={entry.retry} />}{entry.data && <><p className="my-2 text-sm">{entry.data.date.slice(0, 10)} · {entry.data.description} · {entry.data.status}</p><p className="text-xs text-slate-600">{entry.data.referenceNo}</p><PostingTable lines={postedLines(entry.data)} /></>}</section>;
}
export default function AccountActivityDrawer({ accountId, startDate, endDate, returnTo, onClose }: { accountId: string; startDate?: string; endDate: string; returnTo: string; onClose: () => void }) {
  const money = useMoney();
  const [page, setPage] = useState(1); const [entry, setEntry] = useState('');
  const load = useCallback(() => getAccountActivity({ accountId, startDate, endDate, page, pageSize: 25 }), [accountId, startDate, endDate, page]);
  const activity = useWorkspaceData(load); const data = activity.data;
  return <WorkbenchDrawer title="Account activity" onClose={onClose}>
    {activity.loading && <p role="status">Loading posted activity…</p>}{activity.error && <WorkspaceNotice title="Account activity could not load" onRetry={activity.retry} />}
    {data && <><div><p className="text-sm text-slate-600">{data.account.code} · {data.account.type}</p><h3 className="mt-1 text-xl font-semibold">{data.account.name}</h3><p className="mt-2 text-sm">{data.startDate ? data.startDate + ' through ' : 'All posted entries through '}{data.endDate} · {data.currency} · {data.basis}</p></div>
      <dl className="workbench-balances"><div><dt>Opening balance</dt><dd>{balance(data.opening, money.format)}</dd></div><div><dt>Period debits</dt><dd>{money.format(data.debit)}</dd></div><div><dt>Period credits</dt><dd>{money.format(data.credit)}</dd></div><div><dt>Closing balance</dt><dd>{balance(data.closing, money.format)}</dd></div></dl>
      <p className="text-xs text-slate-600">Running balances include the opening balance and all earlier rows, including rows on previous pages. Dr / Cr indicates the balance direction.</p>
      <div className="workspace-table-wrap"><table className="workspace-table workbench-table"><caption className="sr-only">Posted ledger activity, oldest first</caption><thead><tr><th>Date / entry</th><th>Debit</th><th>Credit</th><th>Running balance</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td data-label="Entry"><button type="button" className="workspace-text-action text-left" onClick={() => setEntry(row.entryId)}>{row.date.slice(0, 10)} · {row.description}</button><p className="text-xs text-slate-600">{row.referenceNo}{row.reversalOfId && ' · Reversal'}</p><div className="flex flex-wrap gap-2">{row.sources.map(source => <Link key={source.href} className="workspace-text-action" href={source.href + (source.href.includes('?') ? '&' : '?') + 'returnTo=' + encodeURIComponent(returnTo)}>{source.label} →</Link>)}</div></td><td data-label="Debit" className="workspace-number">{money.format(row.debit)}</td><td data-label="Credit" className="workspace-number">{money.format(row.credit)}</td><td data-label="Running balance" className="workspace-number">{balance(row.balance, money.format)}</td></tr>)}</tbody></table></div>
      {!data.items.length && <p className="text-sm text-slate-600">No posted activity in this period.</p>}
      <WorklistPagination data={data} loading={activity.loading} onPage={value => { setPage(value); setEntry(''); }} />
    </>}{entry && <Journal key={entry} id={entry} />}
  </WorkbenchDrawer>;
}
