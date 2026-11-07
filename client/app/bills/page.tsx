'use client';
import DocumentList from '@/app/components/DocumentList';
import { LegacyRedirect } from '@/app/components/LegacyRedirect';
export function BillsPage() { return <DocumentList kind="bill" />; }
export default function LegacyPage() { return <LegacyRedirect to="/purchases/bills" />; }
