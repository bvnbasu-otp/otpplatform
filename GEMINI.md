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
- Active migrations live in `supabase/migrations/` (117 applied migrations from `00001` to `00117`).
- Never introduce legacy views (`quotes_blind`, `rfqs_supplier_blind`, `my_quote_outcome`). Use canonical `quotes_identity_protected`, `rfqs_supplier_masked`, `my_quote_outcome`.

## 4. Verification & Testing Standards
- All changes must maintain 100% pass rate in `pnpm test:regression` (375 tests).
- Build check: `pnpm build` in `apps/web` must succeed with zero TypeScript or Vite errors.
