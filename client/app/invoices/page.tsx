'use client';
import DocumentList from '@/app/components/DocumentList';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
export function InvoicesPage() { return <DocumentList kind="invoice" />; }
export default function LegacyPage() { return <LegacyRedirect to="/sales/invoices" />; }
