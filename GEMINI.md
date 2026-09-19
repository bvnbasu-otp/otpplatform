# OTP Platform — Canonical Workspace Rules

## 1. Single Authoritative Codebase Policy
- **Sole Workspace Path:** `G:\My Drive\otp` is the ONLY valid, authoritative production codebase directory.
- **Strict Junction Prohibition:** `C:\otp` or any secondary directory junction, symlink, or alternate drive alias is strictly eliminated and prohibited.
- **Execution Target:** All terminal commands, build pipelines, package installs, and tests must be executed with working directory `G:\My Drive\otp`.

## 2. Canonical Procurement Vocabulary Standard (Strict Zero Tolerance)
All code, comments, user interface text, schemas, migrations, test suites, and documentation must strictly adhere to the Canonical Procurement Vocabulary:
- ❌ **Strictly Prohibited:** `blind`, `bid`, `bidder`, `bidding`
- ✅ **Canonical Equivalents:**
  - Instead of `blind` ➔ Use **`identity-protected`**, **`masked`**, **`anonymized`**
  - Instead of `bid` / `bids` ➔ Use **`quote`**, **`quotation`**, **`commercial proposal`**
  - Instead of `bidder` / `bidders` ➔ Use **`supplier`**, **`qualified vendor`**, **`candidate`**
  - Instead of `bidding` ➔ Use **`quoting`**, **`sourcing window`**, **`evaluation`**

## 3. Database Architecture & Migrations
- Active migrations live in `supabase/migrations/` (185 applied migrations from `00001` to `00185`).
- Never introduce legacy views (`quotes_blind`, `rfqs_supplier_blind`, `my_quote_outcome`). Use canonical `quotes_identity_protected`, `rfqs_supplier_masked`, `my_quote_outcome`.

## 4. Verification & Testing Standards
- All changes must maintain 100% pass rate across the 12-layer verification gate (`pnpm gate:verify` — 1,514+ automated verifications across 184 active test files).
- Failure Paths Regression Suite: `failure-paths-regression.test.ts` (32/32 tests passing).
- UX Telemetry Abstraction: `ux-telemetry-abstraction.test.ts` (6-stage commercial lifecycle on all user views).
- Deno Edge Functions compatibility check: `pnpm test:functions` (38/38 unit tests passing across `_shared/` and `payment-webhook/`).
- TypeScript check: `pnpm typecheck` must pass with zero errors across all workspaces (`@otp/domain`, `@otp/database`, `@otp/services`, `@otp/web`).
- Build check: `pnpm build` must succeed with zero TypeScript or Vite bundle errors.

## 5. Security & Route Protection Standards
- Client routing must enforce centralized `<ProtectedRoute>` evaluating session validity, blocked status, onboarding gates, and strict RBAC (`allowedRoles`, `requireAdmin`).
- Unauthorized route navigations must sanitize diagnostic client storage via `clearSensitiveClientState()`.
- Deep links must be preserved through `/login?redirect=<target>` and honored after authentication.
