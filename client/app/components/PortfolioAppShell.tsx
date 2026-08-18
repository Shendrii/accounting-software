'use client';

import Link from 'next/link';
import { Home, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navigationClusters } from '@/lib/navigation';
import type { PortfolioProfile } from '@/lib/portfolio-demo-data';
import { PRODUCT_NAME } from '@/lib/brand';

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== '/' && pathname.startsWith(href));
}

export function PortfolioAppShell({
  children,
  profile,
  navPathname,
  inboxCount = 0,
  workspaceName,
}: {
  children: React.ReactNode;
  profile: PortfolioProfile;
  navPathname: string;
  inboxCount?: number;
  workspaceName: string;
}) {
  return (
    <div className="min-h-svh bg-zinc-50 text-zinc-900" style={{ colorScheme: 'light' }}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-svh w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-16 shrink-0 items-center border-b border-zinc-200 px-6">
            <p className="text-xl font-semibold">{PRODUCT_NAME}</p>
          </div>
          <div className="shrink-0 border-b border-zinc-200 px-4 py-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium">{workspaceName}</div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <Link
              href="/"
              className={cn(
                'mb-4 flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium',
                navPathname === '/' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600'
              )}
            >
              <Home className="h-4 w-4" />
              Overview
            </Link>
            {navigationClusters.map((cluster, index) => (
              <div key={cluster.label} className={index ? 'border-t border-zinc-100 pt-4' : 'mb-4'}>
                <p className="px-4 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">{cluster.label}</p>
                {cluster.items.map((item) => {
                  const active = isActivePath(navPathname, item.href);
                  return (
                    <div
                      key={item.name}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium',
                        active ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.name}</span>
                      {item.badge === 'inbox' && inboxCount > 0 && (
                        <span className="ml-auto min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-xs font-semibold text-white">
                          {inboxCount}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <div className="shrink-0 border-t border-zinc-200 px-4 py-3">
          <div className="flex items-center gap-3 rounded-lg px-1 py-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white">
              {profile.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile.name}</p>
              <p className="truncate text-xs text-zinc-500">{profile.roleLabel} · {profile.workspace}</p>
            </div>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-zinc-200 bg-zinc-50/90 px-8 backdrop-blur lg:ml-64">
        <div>
          <p className="text-xs font-medium text-zinc-500">{profile.roleLabel}</p>
          <p className="font-semibold">Welcome back</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-500">
            <Bell className="h-4 w-4" />
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
            {profile.initials}
          </span>
        </div>
      </header>

      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl px-8 py-6">{children}</div>
      </main>
    </div>
  );
}
