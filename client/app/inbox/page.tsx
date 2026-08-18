'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ReceiptsPage } from '../receipts/page';

export default function InboxPage() {
  return (
    <ReceiptsPage
      title="Inbox"
      subtitle="Review OCR'd receipts and post journal entries"
      headerAction={
        <Link
          href="/ledger?tab=journal&new=1"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50"
        >
          <Plus className="h-4 w-4" />
          Manual journal entry
        </Link>
      }
    />
  );
}
