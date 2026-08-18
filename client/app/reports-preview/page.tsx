'use client';

import { PortfolioAppShell } from '@/app/components/PortfolioAppShell';
import { PortfolioProfitLoss } from '@/app/components/portfolio/PortfolioProfitLoss';
import { CONTROLLER_PROFILE, PORTFOLIO_PL_REPORT, portfolioControllerContext } from '@/lib/portfolio-demo-data';

/** Public demo view for portfolio screenshots (no login). */
export default function ReportsPreviewPage() {
  const ctx = portfolioControllerContext();
  return (
    <PortfolioAppShell
      profile={CONTROLLER_PROFILE}
      navPathname="/reports"
      inboxCount={ctx.inboxCount}
      workspaceName={ctx.workspaceName}
    >
      <PortfolioProfitLoss report={PORTFOLIO_PL_REPORT} />
    </PortfolioAppShell>
  );
}
