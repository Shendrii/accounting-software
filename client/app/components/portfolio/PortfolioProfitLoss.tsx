import type { ProfitLossReport } from '@/lib/api';

function formatCurrency(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

export function PortfolioProfitLoss({ report }: { report: ProfitLossReport }) {
  return (
    <div>
      <div className="mb-5 flex items-end justify-between border-b border-zinc-100 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-zinc-500">Periodic and output</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Profit &amp; Loss</h1>
          <p className="mt-1 text-sm text-zinc-500">Last 30 days · Northline Studio · read-only</p>
        </div>
        <div className="flex gap-2">
          {['Last 30 days', 'Last 90 days', 'This year'].map((label, i) => (
            <span
              key={label}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${i === 0 ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600'}`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 p-4">
          <h3 className="mb-3 font-semibold">Revenue</h3>
          {report.revenue.map((row) => (
            <div key={row.accountId} className="flex justify-between py-1.5 text-sm">
              <span className="text-zinc-700">{row.accountName}</span>
              <span className="font-medium">{formatCurrency(row.balance)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-zinc-100 py-2 text-sm font-semibold">
            <span>Total Revenue</span>
            <span className="text-emerald-600">{formatCurrency(report.totalRevenue)}</span>
          </div>
        </div>
        <div className="border-b border-zinc-100 p-4">
          <h3 className="mb-3 font-semibold">Expenses</h3>
          {report.expenses.map((row) => (
            <div key={row.accountId} className="flex justify-between py-1.5 text-sm">
              <span className="text-zinc-700">{row.accountName}</span>
              <span className="font-medium">{formatCurrency(row.balance)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-zinc-100 py-2 text-sm font-semibold">
            <span>Total Expenses</span>
            <span className="text-red-600">{formatCurrency(report.totalExpenses)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="font-bold">Net Income</span>
          <span className="text-xl font-bold text-emerald-600">{formatCurrency(report.netIncome)}</span>
        </div>
      </div>
    </div>
  );
}
