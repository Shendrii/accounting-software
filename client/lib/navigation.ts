import type { LucideIcon } from 'lucide-react';
import {
  BookOpenCheck,
  Landmark,
  ReceiptText,
  Settings,
  ShoppingCart,
  BarChart3,
} from 'lucide-react';

export type NavigationItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: 'inbox';
};

export const navigationClusters: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: 'Daily work',
    items: [
      { name: 'Sales', href: '/sales', icon: ReceiptText },
      { name: 'Purchases', href: '/purchases', icon: ShoppingCart, badge: 'inbox' },
      { name: 'Bank reconciliation', href: '/banking', icon: Landmark },
    ],
  },
  {
    label: 'Books and reporting',
    items: [
      { name: 'Accounting', href: '/ledger', icon: BookOpenCheck },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Admin',
    items: [{ name: 'Settings', href: '/settings', icon: Settings }],
  },
];

const legacySections: Record<string, string> = {
  inbox: '/purchases', receipts: '/purchases', invoices: '/sales', customers: '/sales',
  bills: '/purchases', vendors: '/purchases', reconciliation: '/banking', bookkeeping: '/ledger',
};

export function workspaceSection(pathname: string) {
  const section = pathname.split('/')[1];
  return section ? legacySections[section] ?? '/' + section : '/';
}
