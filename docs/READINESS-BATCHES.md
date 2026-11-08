# Readiness fixes — local implementation

The November 8 readiness findings were addressed in the following order. The application keeps Prism, isolated PHP/USD accrual books, immutable posted history, and the existing free hosting architecture. This is a local implementation and validation record, not production release approval or a guarantee that no further defects exist.

## Completed batches

| Order | Finding / improvement | Result |
| --- | --- | --- |
| 1 | Account security | Database-backed revocable sessions; normalized email identity; one-use Google state, PKCE and browser-bound handoffs; explicit verified account linking; email verification and password recovery. Legacy session injection and automatic email-only Google linking are rejected. |
| 2 | Period close | Saved periods, account owners/due dates, support and explicit waivers, stale-evidence detection, AR/AP and trial-balance gates, optional separate reviewer, hard posting locks and documented reopening. Empty bank queues are no longer represented as verified reconciliation. |
| 3 | Corrections | Receipt reversals and replacement drafts, superseded bill attachments, opening-balance increases/decreases through source adjustments, dated payment/credit/refund corrections, and retained original bank proof. |
| 4 | Recurring transactions | UTC month-end/leap-year anchoring, editable schedules, original payment intervals, next-occurrence preview, bounded atomic runs and unique repeat-safe occurrences. Users generate drafts explicitly. |
| 5 | Posting accountability | Live owner/admin/reviewer/bookkeeper/read-only checks inside the accounting transaction; optional separate manual-journal poster; immutable actors/lines; owner-documented control-account exceptions; append-only audit inspection/export. Status updates cannot bypass posting controls. |
| 6 | Recovery | Empty-database bootstrap, preserved historical migration files, exact typed-value restore drill, foreign-key/hash/ledger/control validation and documented production backup procedure. |
| 7 | Payments and settlements | Customer/supplier credit notes, deposits/prepayments, unidentified-money assignment, multi-document allocations, refunds, reviewed write-offs and source corrections. Historical aging, summaries and document states include applied credits. Unsupported legacy paid bills remain visible for review. |
| 8 | Bank reconciliation | Many-to-many matching, explicit settlement fees, credit-card sign handling, transfers, transaction/file identities and bounded CSV previews with date/sign/overlap decisions. Completed proof is preserved. |
| 9 | PH/US workpapers | Effective-dated tax codes, explicit input/output tax, split tax credits, PH withholding/certificate tracking, retained seller/buyer invoice snapshots, and US W-9/manual-category/payment-channel review exports. |
| 10 | Financial reporting | Cash roll-forward, visible unclassified movements and explicit split review, noncash review notes, comparative periods, current/noncurrent and P&L mappings, and fiscal-year-aware dates. |
| 11 | Collections and recognition | Customer/supplier statements tie to aging, with unapplied deposits separate; notes/promises/disputes do not post money. Exact-cent prepaid/accrual/straight-line book depreciation schedules reserve source basis, generate review drafts, retain correction/waiver history, and gate close for due work and accrual reversals. |
| 12 | UX and bounded queries | Role-aware actions, complete draft editing, dated/documented voids, canonical journal source/history, credit-versus-cash detail, mobile filters, actionable slow/error states, and paginated/searchable worklists. Mobile recovery styling and accessible journal filter names were corrected during rendered QA. |

## Validation completed

All financial and identity fixtures were synthetic. Nothing was posted to Neon or the live workspace; email, Google and OCR providers were stubbed locally.

- Backend regression: **44 passed, 0 failed, 0 skipped**. Covers accounting, tenant access, auth, close, corrections, recurrence, settlements, banking, tax, reports, collections and recognition schedules.
- Client storage/request tests: **6 passed**.
- Client ESLint: **0 warnings**; TypeScript: passed; final Next production build: passed.
- Prisma schema validation and server/script syntax checks: passed.
- Fresh migration plus restore: **43 tables, 79,822 synthetic rows**; all hashes match, all foreign keys valid, posted ledger difference **0.00**, four required control triggers retained. Final database-to-Prisma schema comparison: **no difference**.
- Direct database probes: closed-period posting, posted-line mutation and audit deletion are rejected. An auth upgrade fixture verifies the legacy cutover behavior.
- Rendered desktop and 390px mobile checks: period evidence, recognition schedules, collections/statements, deposits/allocations, grouped bank matching, CSV preview, PH workpapers, cash analysis, settings/audit, document history and account recovery. Normal local sign-in works; a forged `#session` callback is rejected with a recovery path. Invoice PDF rendered and inspected.
- Impeccable detector: no findings across 65 changed UI files at the QA pass; subsequently discovered recovery color inheritance and journal status/label issues were corrected and inspected in the rendered app. Final build/lint/type checks include these fixes.

The full regression exposed and corrected an existing Prisma scoping helper that escaped its transaction, and multipart upload processing that lost request accounting context. Fully settled reversals and receipt/CSV uploads passed after those corrections.

## Security remediation evidence

Outcome: **fixed locally** for the reviewed account-takeover and session-boundary paths.

The previous Google callback could attach a provider by matching an unproven email address; an attacker who pre-registered that email could retain a password into the later Google-linked account. The frontend also trusted a raw session fragment, OAuth state was not bound to a one-use server record/browser cookie, and JWT revocation was not enforced at all authenticated entry points. The shared boundaries are now `authSession.js`, the auth routes, `requireAuth`, `requireWorkspace`, and the frontend account-access handoff. Explicit linking requires verified ownership and password reauthentication. Stored session identity/version is rechecked, including inside financial transactions.

The independent pre-patch investigation and one independent candidate review were completed. The candidate review identified legitimate Google-subject email renames and legacy long passwords as compatibility regressions; both were confirmed, fixed and covered by focused tests. Google subject identity remains stable, email collisions are not merged, ordinary signup/login and explicit linking work, legacy bcrypt authentication remains supported, and new long passwords no longer alias at bcrypt's 72-byte boundary.

Ordered verification gates:

1. Syntax/import/type/build: server `node --check`, `prisma validate`, client `tsc --noEmit`, ESLint and production build passed.
2. Security trigger: six `auth-security.test.mjs` tests passed for pre-registration/linking, unverified identity/state, duplicate/replayed handoffs, browser correlation, revocation at each entry point, email recovery and long-password suffixes. The browser independently rejected a forged raw session fragment.
3. Legitimate controls/regression: verified Google-subject continuity, explicit verified linking, local login/recovery, existing client session tests and the 44-test server suite passed. Browser logout and local sign-in succeeded.

Production Google redirect/cookie behavior and actual email delivery remain release checks: test providers were stubbed, so this work does not assert live provider verification. This was a targeted remediation, not a fresh repository-wide security certification.

## Delivery and remaining operations

This records implementation and local validation; hosted release verification is a separate step. On November 8, the owner reported applying the combined SQL in Neon and authorized pushing and deploying as Shendrii. See [release steps](READINESS-RELEASE.md) and [recovery procedure](RECOVERY.md). Existing users must sign in again after the auth cutover; mail delivery is required for recovery/verification. Production backup scheduling, retention, off-host restore testing and jurisdiction-specific accountant review remain operator/business responsibilities.

Accountrix records transactions; it does not move actual funds, automatically run recognition jobs, determine tax nexus/rates/thresholds, file statutory returns, calculate tax depreciation, or provide FX/consolidation, inventory, payroll or statutory certification. The new reports support review workpapers. These broader capabilities were not represented as completed readiness fixes.
