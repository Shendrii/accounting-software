import type { LucideIcon } from 'lucide-react';
import {
  BellDot,
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
    label: 'Daily workflow',
    items: [
      { name: 'Inbox', href: '/inbox', icon: BellDot, badge: 'inbox' },
      { name: 'Sales (AR)', href: '/sales', icon: ReceiptText },
      { name: 'Purchases (AP)', href: '/purchases', icon: ShoppingCart },
      { name: 'Banking', href: '/banking', icon: Landmark },
    ],
  },
  {
    label: 'Periodic and output',
    items: [
      { name: 'Ledger and close', href: '/ledger', icon: BookOpenCheck },
      { name: 'Reports', href: '/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Admin',
    items: [{ name: 'Settings', href: '/settings', icon: Settings }],
  },
];
