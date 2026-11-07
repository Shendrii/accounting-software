import { useId } from 'react';
import type { Account, AccountRole } from '@/lib/api';
import { accountRoles } from '@/lib/account-roles';

export default function AccountRoleField({ type, value, onChange }: {
  type: Account['type']; value: AccountRole; onChange: (value: AccountRole) => void;
}) {
  const id = useId();
  return <div>
    <label htmlFor={id} className="mb-1 block text-sm font-medium">Account role</label>
    <select id={id} value={value} onChange={event => onChange(event.target.value as AccountRole)} className="workspace-field" aria-describedby={id + '-help'}>
      {accountRoles.filter(role => !role.type || role.type === type).map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
    </select>
    <p id={id + '-help'} className="mt-1 text-xs text-slate-600">Controls where this account can be selected. Bank accounts are also available for reconciliation.</p>
  </div>;
}
