'use client';

import { PortfolioAppShell } from '@/app/components/PortfolioAppShell';
import { PortfolioInvoiceDetail } from '@/app/components/portfolio/PortfolioInvoiceDetail';
import { OWNER_PROFILE, PORTFOLIO_INVOICE, portfolioOwnerContext } from '@/lib/portfolio-demo-data';

export default function PortfolioInvoicePreviewPage() {
  const ctx = portfolioOwnerContext();
  return (
    <PortfolioAppShell
      profile={OWNER_PROFILE}
      navPathname="/sales"
      inboxCount={ctx.inboxCount}
      workspaceName={ctx.workspaceName}
    >
      <PortfolioInvoiceDetail invoice={PORTFOLIO_INVOICE} />
    </PortfolioAppShell>
  );
}
