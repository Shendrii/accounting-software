import { LedgerError } from './ledger.js';

export const roleTypes = {
  GENERAL: null, CASH: 'ASSET', BANK: 'ASSET', ACCOUNTS_RECEIVABLE: 'ASSET',
  ACCOUNTS_PAYABLE: 'LIABILITY', CREDIT_CARD: 'LIABILITY', SALES_TAX: 'LIABILITY',
};

export function accountRole(role, type, isBankAccount) {
  if (!['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(type)) throw new LedgerError('Choose a valid account type.');
  const value = role ?? (isBankAccount ? 'BANK' : 'GENERAL');
  if (!Object.hasOwn(roleTypes, value) || roleTypes[value] && roleTypes[value] !== type) {
    throw new LedgerError('Choose an account role that matches its account type.');
  }
  if (isBankAccount !== undefined && (typeof isBankAccount !== 'boolean' || isBankAccount !== (value === 'BANK'))) {
    throw new LedgerError('Only accounts with the Bank role can be used for reconciliation.');
  }
  return value;
}

export function requireAccountRole(account, roles, label) {
  if (!account || !account.isActive || !roles.includes(account.role) || roleTypes[account.role] !== account.type) {
    throw new LedgerError(label + ' is not configured for this action. Review its role in Chart of accounts.');
  }
}

export function purchaseAccount(account) {
  return account.type === 'EXPENSE' || account.type === 'ASSET' && account.role === 'GENERAL';
}
