'use client';

import { PortfolioAppShell } from '@/app/components/PortfolioAppShell';
import { PortfolioInbox } from '@/app/components/portfolio/PortfolioInbox';
import { BOOKKEEPER_PROFILE, PORTFOLIO_RECEIPTS, portfolioBookkeeperContext } from '@/lib/portfolio-demo-data';

export default function PortfolioInboxPreviewPage() {
  const ctx = portfolioBookkeeperContext();
  return (
    <PortfolioAppShell
      profile={BOOKKEEPER_PROFILE}
      navPathname="/inbox"
      inboxCount={ctx.inboxCount}
      workspaceName={ctx.workspaceName}
    >
      <PortfolioInbox receipts={PORTFOLIO_RECEIPTS} />
    </PortfolioAppShell>
  );
}
