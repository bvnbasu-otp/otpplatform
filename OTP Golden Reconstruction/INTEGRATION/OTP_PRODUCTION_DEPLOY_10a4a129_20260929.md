# OTP Production Deploy — `10a4a129` — 2026-09-29

## Final status

**PRODUCTION DEPLOY BLOCKED**

---

## Release identity

| Field | Value |
| --- | --- |
| **Target SHA** | `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` |
| **HEAD (`git rev-parse HEAD`)** | `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` — **PASS** |
| **Production URL** | https://otpplatform-theta.vercel.app |
| **00220 already applied by operator** | **YES** (per operator confirmation; not re-verified via Supabase CLI this pass) |
| **`supabase db push` this pass** | **NO** |
| **Five excluded UI files not in deploy artifact** | **YES** (deploy used clean worktree at detached `10a4a129`, not dirty `main` worktree) |

---

## Pre-deploy gate 1 — HEAD

- `git rev-parse HEAD` = `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` — **PASS**

---

## Pre-deploy gate 2 — Commit tree (not worktree)

**Migrations on commit (`git ls-tree`):**

- `00216_verified_remediation_p0_p1_security_integrity.sql`
- `00217_revoke_public_execute_default_privileges.sql`
- `00218_rfq_status_transition_whitelist.sql`
- `00219_guard_rfq_approval_stage_direct_write.sql`
- `00220_supplier_wallet_ledger_events.sql`

**Symbols on commit (`git grep` at `10a4a129`):**

| Check | Result |
| --- | --- |
| `signInWithOtp` | **Present** (auth, portal, notifications, tests, docs) |
| `reconcilePortalSide` | **Present** (roles API, reconciliation test, related UI) |
| `PermissionChips` | **Present** (roles components) |
| Supplier cashback / credit path in `apps/` | **No matches** (case-insensitive grep) |

**Five UI files — committed blobs vs dirty worktree:**

| File | Commit blob = HEAD | Worktree dirty |
| --- | --- | --- |
| `AwardPage.tsx` | Yes (`78b34dc…`) | Yes |
| `organization-charter.ts` | Yes (`0e4adbf…`) | Yes |
| `DecisionReceiptCard.tsx` | Yes (`cf7f1f6…`) | Yes |
| `SiteLayout.tsx` | Yes (`746d37f…`) | Yes |
| `PricingPage.tsx` | Yes (`9ada287…`) | Yes |

Dirty worktree diffs were **not** built or uploaded. Clean worktree at `10a4a129` matched commit blobs for `AwardPage.tsx` (verified before worktree teardown).

---

## Pre-deploy gate 3 — Vitest RC bundle

**Command:**

```text
node node_modules/vitest/vitest.mjs run \
  tests/security/verified-remediation-00216-database.test.ts \
  tests/security/verified-remediation-00216-redteam.test.ts \
  tests/security/supplier-wallet-00220-database.test.ts \
  packages/domain/src/types/supplier-wallet.test.ts \
  packages/services/src/discovery/networks/ondc-network-adapter.test.ts \
  packages/services/src/discovery/supplier-network-providers/supplier-network-providers.test.ts \
  packages/services/src/discovery/supplier-network-engine.test.ts \
  apps/web/src/features/roles/portal-side-reconciliation.test.ts \
  apps/web/src/features/portal/registration-outcome.test.tsx \
  apps/web/src/features/portal/api/signup.test.ts \
  apps/web/src/features/notifications/lib/edge-dispatch.test.ts \
  apps/web/src/features/auth/protected-route.test.ts \
  apps/web/src/features/profile/address-book-and-persona.test.ts
```

| Metric | Result |
| --- | --- |
| Test files | **13 passed** |
| Tests | **110 passed**, **0 failed** — **PASS** |

---

## Pre-deploy gate 4 — Production build (clean worktree)

| Step | Result |
| --- | --- |
| `git worktree add C:\Users\bloganat\AppData\Local\Temp\otp-wt-10a4a129 10a4a129…` | **PASS** |
| Junction `node_modules` from main repo (no `npm install`) | **PASS** |
| `node node_modules/vite/bin/vite.js build apps/web` | **PASS** (~51s) |
| Worktree cleanup | **DONE** (pruned; temp directory removed) |

---

## Deploy

| Attempt | Outcome |
| --- | --- |
| `where.exe vercel` | **Not found** on PATH |
| `npx` / global `vercel` | **Not available** in shell |
| `gh` CLI | **Not found** |
| `VERCEL_TOKEN` / `GH_TOKEN` / `GITHUB_TOKEN` | **Absent** (presence only; values not read) |
| `git push origin main` (fast-forward `7b1afc1` → `10a4a129` only) | **FAILED** — `HTTP 403`; `origin/main` unchanged at `7b1afc12ac7761efc206c70db80486612a34d146` |

**No Vercel CLI deploy** was executed. **No certified upload** of the clean `apps/web/dist` artifact.

### Deployed SHA / deployment identity

**DEPLOYMENT IDENTITY = INSUFFICIENT EVIDENCE**

- `origin/main` after fetch: `7b1afc1` (not `10a4a129`).
- Production `curl.exe -sI https://otpplatform-theta.vercel.app`: `Server: Vercel`, `Last-Modified: Mon, 28 Sep 2026 08:42:38 GMT` — **no** `x-git-sha`, commit meta, or deployment ID tying live HTML to `10a4a129`.
- **Cannot certify** that https://otpplatform-theta.vercel.app serves `10a4a129`.

---

## Smoke (post-deploy)

**NOT RUN** — deploy SHA was not verified; per release policy, smokes that assert production behavior for this release were not executed.

**PRODUCTION REWARD CREDIT = NOT EXECUTED**

---

## Operator DB posture (acknowledged, not re-audited this pass)

Per operator: `00220` applied; `credit_supplier_wallet_event_atomic` EXECUTE false for PUBLIC/anon/authenticated and true for `service_role`; triggers `trg_guard_rfq_status` and `trg_guard_rfq_approval_stage_write` present.

---

## Hygiene

| Item | Status |
| --- | --- |
| Code modified | **NO** |
| `git add` / commit / amend | **NO** |
| Migrations applied / `db push` | **NO** |
| Dirty tree deployed | **NO** |

---

## Summary for release owner

Pre-deploy **HEAD**, **commit contract**, **110/110 tests**, and **clean-tree Vite build** all **passed**. **Deploy blocked**: no Vercel CLI auth/tooling, GitHub push denied (403), live site SHA **unproven**. Next step: deploy `10a4a129` with authenticated Vercel CLI (`vercel deploy --prebuilt` from clean worktree) or successful fast-forward push to the Git-connected project, then verify deployment metadata for `10a4a129` before smoke and reward-path checks.

*Deploy engineer pass — 2026-09-29.*
