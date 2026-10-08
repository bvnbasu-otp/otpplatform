# OTP Production Release Gate — `10a4a129` — 2026-09-29

**Gate engineer pass:** Controlled production release for OTP Golden Reconstruction supplier network + wallet baseline.

**Verdict:** **RELEASE BLOCKED**

**Path:** **PATH A** — five-file UI/copy deltas excluded; no release dependency.

**Certified SHA (baseline):** `10a4a1291ee3ed2db7200e7c2badcec3e5a01114`  
**SHA deployed:** *(none — deploy not attempted)*  
**00220 applied to production:** **NO**  
**Production migration (verified this pass):** **NOT VERIFIED** — hosted preflight stopped at `AccessTokenRequiredError`  
**Production migration (expected baseline):** **00219** with **00220 absent** (operator expectation; not re-confirmed on remote)

---

## Phase 0 — Read-only baseline

| Check | Result |
| --- | --- |
| `git rev-parse HEAD` | `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` |
| Branch | `main` |
| Parent of `10a4a129` | `7b1afc12ac7761efc206c70db80486612a34d146` |
| `git cat-file -t 10a4a129` | `commit` |
| Worktree | Dirty — **5** modified tracked UI/copy files only (see §2); untracked Golden Reconstruction / scripts artifacts — **not staged, not committed** |

**In-commit verification (`git ls-tree` / `git grep` on `10a4a129`, not worktree):**

| Artifact | Present |
| --- | --- |
| Migrations `00216`–`00220` | **YES** — all five SQL files in tree |
| `signInWithOtp` (signup/auth) | **YES** — `signup.ts`, `AuthProvider.tsx`, tests |
| `reconcilePortalSide` | **YES** — `roles.ts`, `ProtectedRoute.tsx`, `portal-side-reconciliation.test.ts` |
| `PermissionChips` null guard | **YES** — `permissions ?? []` in committed `PermissionChips.tsx` |
| Supplier network engine / providers | **YES** — `packages/services/src/discovery/**` |
| Google discovery provenance | **YES** — `google-discovery-provider.ts`, `google-places-discovery-adapter.ts` |
| ONDC `NOT_CONFIGURED` | **YES** — `ondc-network-adapter.ts`, `ondc-supplier-provider.ts`, domain enums + tests |

Phase 0 **PASS** — certified commit contains required migrations and application scope.

---

## Phase 1–3 — Five-file decision matrix (read-only vs `10a4a129`)

**Rule applied:** If unsure → not required. **PATH A** — leave files untouched; release identity remains `10a4a129`.

| File | Diff type | Functional / security impact | Required for certified release? |
| --- | --- | --- | --- |
| `apps/web/src/features/award/pages/AwardPage.tsx` | Copy label: committee vs buyer justification when `rfqOrgId` absent | UX wording only; no auth/RLS/wallet/network | **NO** |
| `apps/web/src/features/governance/lib/organization-charter.ts` | Charter clause text; drops “(rule PA-09)” reference | Documentation copy in UI | **NO** |
| `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx` | MSME governance heading de-capitalized; PA-09 label removed | Display copy only | **NO** |
| `apps/web/src/features/site/components/SiteLayout.tsx` | Removes `MobileSimulatorFrame` wrapper | Marketing shell layout; unrelated to persona crash or certified fixes | **NO** |
| `apps/web/src/features/site/pages/PricingPage.tsx` | Quorum / anti-self-approval marketing copy | **No supplier cashback** in worktree or at `10a4a129` (`git grep cashback` on PricingPage → none) | **NO** |

**FIVE-FILE UI/COPY CHANGES EXCLUDED — NO RELEASE DEPENDENCY FOUND**

No PATH B commit created. `10a4a129` remains the release SHA.

---

## Phase 4–10 — Local certification (`10a4a129` + worktree test run)

Worktree retains the five cosmetic deltas above; certified security/network/wallet code matches `10a4a129` at HEAD (no staged changes to those paths).

### Four-bug register (committed at `10a4a129`)

| ID | Fix | Commit evidence | Test coverage |
| --- | --- | --- | --- |
| F-1 | EMAIL signup uses `signInWithOtp`; dispatch honest (SUBMITTED, not “delivered”) | `portal/api/signup.ts`, `registration-outcome.test.tsx` | **PASS** (bundle) |
| F-2 | Notification / edge dispatch status scale | `edge-dispatch.ts`, `edge-dispatch.test.ts` | **PASS** |
| F-3 | `PermissionChips` null-safe `permissions ?? []` | `PermissionChips.tsx` | **PASS** (`protected-route`, persona tests) |
| F-4 | `reconcilePortalSide` supplier vs buyer portal routing | `roles.ts`, `ProtectedRoute.tsx` | **PASS** (`portal-side-reconciliation.test.ts`) |

### Wallet (`00220` in commit; local DB assumed per prior gates)

| Rule | Status |
| --- | --- |
| Referral **₹100** after referred supplier OTP-verified | Domain + SQL at commit |
| One-time success **₹100** (settled platform fee) | Domain + SQL at commit |
| **No supplier cashback** | SQL raises; domain `isRemovedSupplierCashbackPath` / tests |
| Server-side amounts; client cannot set wallet amount | `assertClientCannotSetSupplierWalletAmount` tests |

### ONDC

| State | Evidence |
| --- | --- |
| **NOT_CONFIGURED** without keys | `ondc-supplier-provider.ts`, `ondc-network-adapter.test.ts`, `supplier-network-providers.test.ts` |
| No fabricated sellers when unconfigured | Redteam + provider tests in bundle |

### Google discovery

| Rule | Evidence |
| --- | --- |
| Google provenance not labeled OTP-verified registry | `GOOGLE_DISCOVERY` / buyer-facing labels in domain + discovery tests |

### Commands & results

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
| Tests | **110 passed**, **0 failed** |
| Duration | ~41s |

```text
node node_modules/vite/bin/vite.js build apps/web
```

| Result |
| --- |
| **PASS** (~41s, production build) |

Local gates **PASS**.

---

## Phase 11 — Production preflight

**Command:**

```text
supabase migration list --project-ref qsuvtcezffomtwzwyrso
```

**Result:** `AccessTokenRequiredError` — access token not provided.

**Protocol:** STOP all production phases. No token hunt. No `supabase login`. No migration push. No catalog query.

| Required check | Status |
| --- | --- |
| Remote at **00219**, **00220 missing** | **NOT VERIFIED** |
| Read-only production catalog | **NOT RUN** |

---

## Phase 12 — Apply `00220`

**NOT EXECUTED** (blocked at Phase 11).

---

## Phase 13 — Deploy certified SHA

**NOT EXECUTED** (blocked at Phase 11).

**DEPLOYMENT IDENTITY:** **INSUFFICIENT EVIDENCE** — no Vercel/gh deploy attempted this pass.

---

## Phase 14–15 — Production smoke

**NOT RUN** — no verified deploy.

| Area | Status |
| --- | --- |
| QA persona logins | **NOT RUN** |
| Email / WhatsApp delivery | **NOT OBSERVED** |
| Wallet credit / payments | **NOT RUN** (mandate) |

---

## Production change summary

| Item | Before (expected) | After this pass |
| --- | --- | --- |
| Hosted migration ceiling | **00219** (expected) | **Unchanged** (no push; remote not listed) |
| Migration `00220` | Absent on production (expected) | **Still not applied** |
| Application SHA on production | Prior production state | **Unchanged** (no deploy) |

---

## Release decision criteria

| Criterion | Met? |
| --- | --- |
| Local tests + build | **YES** |
| Production at 00219 / 00220 absent verified | **NO** |
| 00220 applied cleanly + postflight grants | **NO** |
| Exact SHA deployed and proven | **NO** |
| Critical smokes | **NO** |

---

## Final status

**RELEASE BLOCKED**

**Reason:** Supabase CLI `AccessTokenRequiredError` on production migration preflight (Phase 11). Production must remain unchanged until operator provides hosted CLI auth and the gate is re-run through Phases 11–15.

**Path:** **PATH A**  
**SHA used for certification:** `10a4a1291ee3ed2db7200e7c2badcec3e5a01114`  
**00220 applied:** **NO**  
**Deployed:** **NO**  
**Production migration before/after:** expected **00219** / **unchanged (unverified remote)**
