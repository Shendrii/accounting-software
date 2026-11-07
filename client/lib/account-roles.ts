import type { Account, AccountRole } from './api';

export const accountRoles: { value: AccountRole; label: string; type?: Account['type'] }[] = [
  { value: 'GENERAL', label: 'General account' },
  { value: 'CASH', label: 'Cash on hand', type: 'ASSET' },
  { value: 'BANK', label: 'Bank account', type: 'ASSET' },
  { value: 'ACCOUNTS_RECEIVABLE', label: 'Accounts receivable', type: 'ASSET' },
  { value: 'ACCOUNTS_PAYABLE', label: 'Accounts payable', type: 'LIABILITY' },
  { value: 'CREDIT_CARD', label: 'Credit card', type: 'LIABILITY' },
  { value: 'SALES_TAX', label: 'Sales tax payable', type: 'LIABILITY' },
];

export function isPaymentAccount(account: Account, allowCredit = false) {
  return account.isActive && (account.type === 'ASSET' && ['CASH', 'BANK'].includes(account.role) ||
    allowCredit && account.type === 'LIABILITY' && account.role === 'CREDIT_CARD');
}

export function isPurchaseAccount(account: Account) {
  return account.isActive && (account.type === 'EXPENSE' || account.type === 'ASSET' && account.role === 'GENERAL');
}
