'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ReceiptsPage } from '../receipts/page';

export default function InboxPage() {
  return (
    <div className="relative">
      <div className="absolute right-4 top-4 z-10 lg:right-8">
        <Link href="/ledger?tab=journal&new=1" className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
          <Plus className="h-4 w-4" />
          Manual journal entry
        </Link>
      </div>
      <ReceiptsPage />
    </div>
  );
}
