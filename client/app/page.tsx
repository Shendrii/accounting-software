import Link from 'next/link';
import { BookOpen, TrendingUp, FileText, BarChart3 } from 'lucide-react';

export default function Home() {
  return (
    <div className="lg:pl-64 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="mb-16">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            Welcome to Your Accounting System
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl">
            Manage your finances with ease. Track accounts, create journal entries, and maintain accurate records.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Total Accounts</h3>
              <BookOpen className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">-</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Journal Entries</h3>
              <FileText className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">-</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">This Month</h3>
              <TrendingUp className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">-</p>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Reports</h3>
              <BarChart3 className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">-</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/bookkeeping"
            className="group bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-8 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between mb-4">
              <BookOpen className="h-8 w-8 text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 transition-colors" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Bookkeeping
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Manage accounts and create journal entries for your financial transactions.
            </p>
          </Link>

          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-8 opacity-50">
            <div className="flex items-start justify-between mb-4">
              <BarChart3 className="h-8 w-8 text-zinc-400" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Reports
            </h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              View financial reports and analytics. Coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
