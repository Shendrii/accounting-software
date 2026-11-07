# Accountrix

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Accountants and bookkeepers managing client workspaces. Confirmed by the user on November 7, 2026.

## Product Purpose

Support standard bookkeeping work within separate workspaces: receipt review, customer invoices, vendor bills, payments, bank reconciliation, ledger review, period close, and financial reports.

## Operating Context

A signed-in user selects an active workspace and works on that workspace's books. Workspace creation, membership invitations, and roles support collaboration. Workspace identity must stay visible while reviewing financial information.

## Capabilities and Constraints

- Current navigation: Dashboard; Sales (Invoices, Customers); Purchases (Document inbox, Bills, Vendors); Bank reconciliation; Accounting (journal, chart of accounts, period close); Reports; Settings. Dashboard is the shared summary and recurring bills are a filtered Bills view.
- Invoice and bill posting use a double-entry ledger. Partial payments and correction by reversal are supported.
- Receipt review confirms extracted details before posting or attaching evidence to bills.
- Reconciliation includes statement controls, transaction matching, outstanding items, and a saved proof.
- Financial reports derive from posted journal lines.
- Client workspace setup supports Philippine and US business profiles, PHP or USD books, entity type, fiscal year, and confirmed registration preferences. Tax calculation and filing are not yet provided. Each workspace uses one accrual ledger and one base currency.
- Reviewed opening balances include a trial balance and individual unpaid customer/supplier documents. The import posts atomically once, proves AR/AP support, and avoids duplicating revenue or expenses. A new business can confirm zero balances.
- Owner/admin payment corrections preserve the original recorded payment and create a dated reversal with a reason. Historical AR/AP aging reconstructs open balances at a cutoff, shows party and document aging, and compares each control account with the ledger.
- Keep the existing Vercel, Render, and Neon free plans. Lightweight pages and restrained asset sizes matter; idle backend cold starts remain possible.
- The user selected Prism and authorized workspace implementation. Bounded searchable worklists, saved views, read-only record previews, protected document review, and report drill-down remain available. Larger approvals, general period locks, credit notes, refunds and tax filing remain outside this batch. Marketing and authentication retain their existing surfaces.
- Cross-client financial rollups, bank connections, subscription pricing, and a claimed unique market position are not established product facts.

## Brand Commitments

Keep the name Accountrix. The user has rejected the current generic appearance and the landing page's close visual resemblance to the dashboard. The approved Prism workspace uses Manrope, pale paper, ink rules, cobalt selection, and square primary controls. Preserve appropriate differences between marketing and operational surfaces.

## Evidence on Hand

The existing application, route implementations, and locally verified bookkeeping workflows establish capabilities. Preview data must be labeled as sample data. No customer endorsements, customer logos, adoption numbers, pricing, or performance promises have been supplied for marketing use.

## Product Principles

- Preserve accounting meaning, exact money values, and clear posting and payment states.
- Make client/workspace context explicit.
- Surface review work before optional decoration.
- Let the user compare concrete previews before adopting a replacement identity.

## Open Decisions

Prism is selected for the workspace. Any marketing differentiation claim remains unestablished. No cross-client financial rollup, bank feed integration, or new pricing has been approved.
