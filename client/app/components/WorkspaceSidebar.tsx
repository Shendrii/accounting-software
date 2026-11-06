import Link from 'next/link';
import { BookOpenCheck, LayoutDashboard } from 'lucide-react';
import { PRODUCT_NAME } from '@/lib/brand';
import { navigationClusters, workspaceSection } from '@/lib/navigation';

export function WorkspaceBrand({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="workspace-brand">
      <span className="workspace-brand-mark"><BookOpenCheck className="size-5" aria-hidden="true" /></span>
      {PRODUCT_NAME}
    </Link>
  );
}

export function WorkspaceNavigation({ pathname, inboxCount, onNavigate, sample = false }: {
  pathname: string;
  inboxCount: number;
  onNavigate?: () => void;
  sample?: boolean;
}) {
  const section = workspaceSection(pathname);
  return (
    <nav aria-label="Workspace" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
      <Link href="/" onClick={onNavigate} aria-current={pathname === '/' ? 'page' : undefined} className="workspace-nav-link">
        <LayoutDashboard className="size-4 shrink-0" aria-hidden="true" />Overview
      </Link>
      {navigationClusters.map(cluster => (
        <div key={cluster.label} className="space-y-0.5">
          <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.12em] text-blue-100/80 uppercase">{cluster.label}</p>
          {cluster.items.map(item => {
            const active = section === item.href;
            const label = <>
              <item.icon className="size-4 shrink-0" aria-hidden="true" />{item.name}
              {item.badge === 'inbox' && inboxCount > 0 && (
                <span className="ml-auto min-w-5 rounded-full bg-blue-100 px-1.5 text-center text-xs font-semibold text-blue-950" aria-label={`${inboxCount} pending receipts`}>
                  {inboxCount > 99 ? '99+' : inboxCount}
                </span>
              )}
            </>;
            return sample
              ? <span key={item.href} data-active={active} className="workspace-nav-link">{label}</span>
              : <Link key={item.href} href={item.href} onClick={onNavigate} data-active={active}
                  aria-current={pathname === item.href ? 'page' : undefined} className="workspace-nav-link">{label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
