/** Keeps portfolio app-shell shots to one viewport — no extra scroll beneath the sidebar. */
export default function ReportsPreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-svh overflow-hidden bg-zinc-50" style={{ colorScheme: 'light' }}>
      {children}
    </div>
  );
}
