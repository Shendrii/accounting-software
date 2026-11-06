import type { PortfolioProfile } from '@/lib/portfolio-demo-data';
import { WorkspaceBrand, WorkspaceNavigation } from './WorkspaceSidebar';

export function PortfolioAppShell({ children, profile, navPathname, inboxCount = 0, workspaceName }: {
  children: React.ReactNode;
  profile: PortfolioProfile;
  navPathname: string;
  inboxCount?: number;
  workspaceName: string;
}) {
  return (
    <div className="bg-[#f3f6fc]">
      <aside className="workspace-sidebar hidden lg:flex" aria-label="Sample workspace">
        <div className="px-4 pt-5 pb-4"><WorkspaceBrand /></div>
        <div className="mx-3 rounded-xl border border-blue-100/20 bg-white/5 px-3 py-2.5">
          <p className="text-xs text-blue-100/80">Sample workspace</p>
          <p className="mt-1 text-sm font-semibold">{workspaceName}</p>
        </div>
        <WorkspaceNavigation pathname={navPathname} inboxCount={inboxCount} sample />
        <div className="flex items-center gap-2.5 border-t border-blue-100/15 px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-400/20 text-xs font-semibold text-blue-50">{profile.initials}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{profile.name}</p>
            <p className="truncate text-xs text-blue-100/80">{profile.roleLabel}</p>
          </div>
        </div>
      </aside>
      <header className="workspace-topbar">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-800">Sample workspace</p>
          <p className="truncate text-sm font-semibold text-slate-950">{workspaceName}</p>
        </div>
        <span className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-900">Demo</span>
      </header>
      <div className="workspace-page"><div className="workspace-content">{children}</div></div>
    </div>
  );
}
