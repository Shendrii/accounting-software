#!/usr/bin/env node
/**
 * Capture portfolio screenshots (requires `npm run dev` on port 3000).
 * Usage: node scripts/capture-portfolio-screenshots.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "docs", "portfolio");
const base = process.env.PORTFOLIO_BASE_URL ?? "http://localhost:3000";

const shots = [
  { file: "01-landing.png", url: "/", wait: 800, fullPage: true },
  { file: "02-reports.png", url: "/reports-preview", wait: 800, fullPage: false },
  { file: "03-inbox.png", url: "/portfolio-preview/inbox", wait: 1200, fullPage: false },
  { file: "04-invoice-detail.png", url: "/portfolio-preview/invoice", wait: 1200, fullPage: false },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
await page.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = "nextjs-portal { display: none !important; }";
  document.documentElement.appendChild(style);
});

for (const shot of shots) {
  const target = `${base}${shot.url}`;
  await page.goto(target, { waitUntil: "load", timeout: 60_000 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  await page.waitForTimeout(shot.wait);
  const path = join(outDir, shot.file);
  await page.screenshot({ path, fullPage: shot.fullPage ?? false });
  console.log(`Wrote ${path}`);
}

await browser.close();
