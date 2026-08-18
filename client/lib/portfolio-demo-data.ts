import type { Invoice, ProfitLossReport, Receipt } from '@/lib/api';

export type PortfolioProfile = {
  id: string;
  name: string;
  email: string;
  role: 'bookkeeper' | 'controller' | 'owner';
  roleLabel: string;
  workspace: string;
  initials: string;
};

export const BOOKKEEPER_PROFILE: PortfolioProfile = {
  id: 'portfolio-bookkeeper',
  name: 'Priya Raman',
  email: 'priya@northline.studio',
  role: 'bookkeeper',
  roleLabel: 'Bookkeeper',
  workspace: 'Northline Studio',
  initials: 'PR',
};

export const CONTROLLER_PROFILE: PortfolioProfile = {
  id: 'portfolio-controller',
  name: 'Elena Vasquez',
  email: 'elena@northline.studio',
  role: 'controller',
  roleLabel: 'Controller',
  workspace: 'Northline Studio',
  initials: 'EV',
};

export const OWNER_PROFILE: PortfolioProfile = {
  id: 'portfolio-owner',
  name: 'Marcus Chen',
  email: 'marcus@northline.studio',
  role: 'owner',
  roleLabel: 'Owner',
  workspace: 'Northline Studio',
  initials: 'MC',
};

export function portfolioBookkeeperContext() {
  return { profile: BOOKKEEPER_PROFILE, inboxCount: 3, workspaceName: BOOKKEEPER_PROFILE.workspace };
}

export function portfolioControllerContext() {
  return { profile: CONTROLLER_PROFILE, inboxCount: 3, workspaceName: CONTROLLER_PROFILE.workspace };
}

export function portfolioOwnerContext() {
  return { profile: OWNER_PROFILE, inboxCount: 3, workspaceName: OWNER_PROFILE.workspace };
}

export const PORTFOLIO_PL_REPORT: ProfitLossReport = {
  revenue: [
    { accountId: 'rev-retainers', accountName: 'Design retainers', accountCode: '4000', balance: '48200.00' },
    { accountId: 'rev-projects', accountName: 'Project fees', accountCode: '4100', balance: '31650.00' },
    { accountId: 'rev-licensing', accountName: 'Licensing', accountCode: '4200', balance: '8400.00' },
  ],
  expenses: [
    { accountId: 'exp-contractors', accountName: 'Contractors', accountCode: '5000', balance: '18420.00' },
    { accountId: 'exp-software', accountName: 'Software & tools', accountCode: '5100', balance: '4280.00' },
    { accountId: 'exp-office', accountName: 'Office & coworking', accountCode: '5200', balance: '3600.00' },
    { accountId: 'exp-travel', accountName: 'Travel & client meals', accountCode: '5300', balance: '2145.00' },
  ],
  totalRevenue: '88250.00',
  totalExpenses: '28445.00',
  netIncome: '59805.00',
};

export const PORTFOLIO_RECEIPTS: Receipt[] = [
  {
    id: 'rcpt-wework',
    imageUrl: '',
    extractedData: {
      vendor: 'WeWork SoHo',
      invoiceNumber: 'WW-88421',
      invoiceDate: '2026-07-28',
      dueDate: '2026-08-12',
      total: 1200,
      amount: 1200,
      amountPaid: 0,
      balanceDue: 1200,
      category: 'Office',
      confidence: 0.96,
      items: [{ description: 'Dedicated desk — August', amount: 1200 }],
    },
    status: 'PENDING',
    journalEntryId: null,
    createdAt: '2026-07-28T14:12:00.000Z',
    updatedAt: '2026-07-28T14:12:00.000Z',
  },
  {
    id: 'rcpt-figma',
    imageUrl: '',
    extractedData: {
      vendor: 'Figma',
      invoiceNumber: 'FIG-22901',
      invoiceDate: '2026-07-26',
      dueDate: '2026-07-26',
      total: 180,
      amount: 180,
      amountPaid: 180,
      balanceDue: 0,
      category: 'Software',
      confidence: 0.99,
      items: [{ description: 'Organization plan', amount: 180 }],
    },
    status: 'PENDING',
    journalEntryId: null,
    createdAt: '2026-07-26T09:40:00.000Z',
    updatedAt: '2026-07-26T09:40:00.000Z',
  },
  {
    id: 'rcpt-delta',
    imageUrl: '',
    extractedData: {
      vendor: 'Delta Air Lines',
      invoiceNumber: 'DL-551903',
      invoiceDate: '2026-07-22',
      dueDate: '2026-07-22',
      total: 486.4,
      amount: 486.4,
      amountPaid: 486.4,
      balanceDue: 0,
      category: 'Travel',
      confidence: 0.91,
      items: [{ description: 'JFK → SFO · client workshop', amount: 486.4 }],
    },
    status: 'PENDING',
    journalEntryId: null,
    createdAt: '2026-07-22T18:05:00.000Z',
    updatedAt: '2026-07-22T18:05:00.000Z',
  },
];

export const PORTFOLIO_INVOICE: Invoice = {
  id: 'inv-1048',
  invoiceNo: 'INV-1048',
  customerId: 'cust-harbor',
  customer: {
    id: 'cust-harbor',
    name: 'Harbor & Pine Co.',
    email: 'ap@harborandpine.com',
    phone: '+1 415 555 0148',
    address: '88 Market Street',
    city: 'San Francisco',
    country: 'United States',
    isActive: true,
    createdAt: '2025-11-04T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  },
  date: '2026-07-15T00:00:00.000Z',
  dueDate: '2026-08-14T00:00:00.000Z',
  status: 'SENT',
  subtotal: '12800.00',
  tax: '1024.00',
  total: '13824.00',
  notes: 'Brand system refresh — phase 2. Net 30. Wire to Northline Studio operating account.',
  journalEntryId: null,
  lines: [
    {
      id: 'line-1',
      invoiceId: 'inv-1048',
      description: 'Brand system refresh — discovery & audit',
      quantity: '1',
      unitPrice: '4200.00',
      amount: '4200.00',
    },
    {
      id: 'line-2',
      invoiceId: 'inv-1048',
      description: 'Visual identity (logo, type, color)',
      quantity: '1',
      unitPrice: '5600.00',
      amount: '5600.00',
    },
    {
      id: 'line-3',
      invoiceId: 'inv-1048',
      description: 'Launch collateral (web + print kit)',
      quantity: '1',
      unitPrice: '3000.00',
      amount: '3000.00',
    },
  ],
  createdAt: '2026-07-15T16:20:00.000Z',
  updatedAt: '2026-07-16T09:00:00.000Z',
};
