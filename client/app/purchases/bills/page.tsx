'use client';

import { Suspense } from 'react';
import { BillsPage } from '@/app/bills/page';

export default function PurchasesBillsPage() {
  return <Suspense fallback={<p className="p-5" role="status">Loading bills…</p>}><BillsPage /></Suspense>;
}
