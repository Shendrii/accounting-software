'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ReceiptsPage } from '../receipts/page';

export default function InboxPage() {
  return (
    <ReceiptsPage
      title="Inbox"
      subtitle="Review uploaded receipts and confirm how each one should be recorded."
      headerAction={
        <Link
          href="/ledger?tab=journal&new=1"
          className="workspace-button"
        >
          <Plus className="h-4 w-4" />
          Manual journal entry
        </Link>
      }
    />
  );
}
