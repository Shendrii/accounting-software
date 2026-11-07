'use client';
import { useMoney } from '@/lib/use-money';
import { Plus, Trash2 } from 'lucide-react';
import type { Account } from '@/lib/api';

import { WorkspacePanel } from './WorkspaceUI';

export type DocumentLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  accountId: string;
};

export function DocumentLines({ lines, accounts, onChange, onAdd, onRemove }: {
  lines: DocumentLine[];
  accounts: Account[];
  onChange: (index: number, key: keyof DocumentLine, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const money = useMoney();
  return (
    <WorkspacePanel title="Line items" description="Enter the details for each item."
      action={<button type="button" onClick={onAdd} className="workspace-button"><Plus className="size-4" aria-hidden="true" />Add line item</button>}>
      <div className="divide-y divide-slate-200">
        {lines.map((line, index) => (
          <fieldset key={index} className="min-w-0 p-4 sm:p-5">
            <legend className="sr-only">Line {index + 1}</legend>
            <div className="grid grid-cols-2 items-end gap-3 xl:grid-cols-[2fr_0.7fr_1fr_1.5fr_auto_auto]">
              <label className="col-span-2 grid min-w-0 gap-1 text-sm font-medium xl:col-span-1">Description
                <input value={line.description} placeholder="Item description" onChange={event => onChange(index, 'description', event.target.value)} className="workspace-field" />
              </label>
              <label className="grid min-w-0 gap-1 text-sm font-medium">Quantity
                <input type="number" min="0" step="0.0001" value={line.quantity} onChange={event => onChange(index, 'quantity', event.target.value)} className="workspace-field" />
              </label>
              <label className="grid min-w-0 gap-1 text-sm font-medium">Unit price
                <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={event => onChange(index, 'unitPrice', event.target.value)} className="workspace-field" />
              </label>
              <label className="col-span-2 grid min-w-0 gap-1 text-sm font-medium xl:col-span-1">Account
                <select value={line.accountId} onChange={event => onChange(index, 'accountId', event.target.value)} className="workspace-field">
                  <option value="">None</option>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <div className="min-w-0 text-sm"><p className="text-slate-600">Amount</p><p className="font-semibold break-words tabular-nums">{money.format(line.amount)}</p></div>
              {lines.length > 1 && <button type="button" onClick={() => onRemove(index)} className="workspace-button justify-self-end px-2" aria-label={'Remove line ' + (index + 1)}>
                <Trash2 className="size-4 text-rose-700" aria-hidden="true" />
              </button>}
            </div>
          </fieldset>
        ))}
      </div>
    </WorkspacePanel>
  );
}
