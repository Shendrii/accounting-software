import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CircleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function WorkspaceHeading({ title, description, actions }: {
  section: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-heading">
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function WorkspacePanel({ title, description, action, children }: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="workspace-panel">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="font-semibold tracking-tight text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function WorkspaceMetric({ label, value, detail, icon: Icon, href }: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <span className="workspace-icon"><Icon className="size-4" aria-hidden="true" /></span>
        {label}
      </div>
      <p className="mt-2.5 text-xl font-semibold tracking-tight break-words text-slate-950 tabular-nums sm:text-[1.65rem]">{value}</p>
      <p className="mt-0.5 text-xs text-slate-600">{detail}</p>
    </>
  );
  const className = 'workspace-panel min-w-0 p-3.5 sm:p-4';
  return href
    ? <Link href={href} className={cn(className, 'transition-colors hover:border-blue-400 hover:bg-blue-50/40')}>{content}</Link>
    : <div className={className}>{content}</div>;
}

export function WorkspaceNotice({ title, children, onRetry }: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-rose-700" aria-hidden="true" />
      <div className="min-w-32 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5">{children}</p>}
      </div>
      {onRetry && <button type="button" onClick={onRetry} className="workspace-button">Retry</button>}
    </div>
  );
}

export function WorkspaceRow({ icon: Icon, title, detail, href, action }: {
  icon: LucideIcon;
  title: string;
  detail: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3 sm:px-5">
      <span className="workspace-icon"><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold break-words text-slate-900">{title}</p>
        <p className="mt-0.5 text-xs text-slate-600">{detail}</p>
      </div>
      {href && <Link href={href} className="workspace-text-action" aria-label={action ? `${action}: ${title}` : title}>
        <ArrowUpRight className="size-4" aria-hidden="true" />{action ?? 'View'}
      </Link>}
    </div>
  );
}

export function WorkflowTabs({ area, active }: {
  area: 'sales' | 'purchases';
  active: 'summary' | 'invoices' | 'customers' | 'bills' | 'vendors' | 'documents' | 'credits' | 'collections';
}) {
  const tabs = area === 'sales'
    ? [['invoices', 'Invoices', '/sales/invoices'], ['credits','Credits & deposits','/sales/credits'], ['collections','Collections','/sales/collections'], ['customers', 'Customers', '/sales/customers']]
    : [['documents', 'Document inbox', '/purchases/documents'], ['bills', 'Bills', '/purchases/bills'], ['credits','Credits & prepayments','/purchases/credits'], ['collections','Supplier follow-up','/purchases/follow-up'], ['vendors', 'Vendors', '/purchases/vendors']];
  return (
    <nav aria-label={area === 'sales' ? 'Sales views' : 'Purchases views'} className="workspace-tabs">
      {tabs.map(([key, label, href]) => <Link key={key} href={href} aria-current={active === key ? 'page' : undefined} className="workspace-tab">{label}</Link>)}
    </nav>
  );
}
