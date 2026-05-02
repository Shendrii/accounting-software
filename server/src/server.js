import app from './app.js';

const PORT = process.env.PORT || 8000;

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Auto-process recurring transactions on startup (acts as an on-login trigger)
  try {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const f = fetch ?? globalThis.fetch;
    if (f) {
      const res = await f(`http://localhost:${PORT}/api/recurring/run`, { method: 'POST' });
      const data = await res.json();
      if (data.created > 0) {
        console.log(`[Recurring] Auto-created ${data.created} transaction(s):`, data.details);
      }
    }
  } catch {
    // Non-fatal — recurring can also be triggered manually
  }
});