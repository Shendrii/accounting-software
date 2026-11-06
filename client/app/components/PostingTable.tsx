import type { JournalEntry } from '@/lib/api';
import { decimalUnits, formatUsd } from '@/lib/money';

export type PostingLine = { label: string; debit?: string; credit?: string };

export function PostingTable({ lines }: { lines: PostingLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-slate-600"><tr>
          <th scope="col" className="py-2 pr-2 font-medium">Account</th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">Debit</th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">Credit</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line, index) => (
            <tr key={index}>
              <td className="py-2.5 pr-2">{line.label}</td>
              <td className="whitespace-nowrap py-2.5 pl-2 text-right tabular-nums">{line.debit && decimalUnits(line.debit) ? formatUsd(line.debit) : '—'}</td>
              <td className="whitespace-nowrap py-2.5 pl-2 text-right tabular-nums">{line.credit && decimalUnits(line.credit) ? formatUsd(line.credit) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function postedLines(entry: JournalEntry) {
  return entry.journalLines.map(line => ({ label: line.account?.name ?? 'Account', debit: line.debit, credit: line.credit }));
}
