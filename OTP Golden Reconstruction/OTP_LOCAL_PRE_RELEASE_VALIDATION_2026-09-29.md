# OTP local pre-release validation — 2026-09-29

**Scope:** Persona/wallet/referral matrix (migration **00221** on local Docker only). **Not** production-certified. **No** hosted DB mutation, commit, push, or deploy.

**Verdict:** **BLOCKED** — full `pnpm test` did not pass (23 failures in stage 1; later script stages not executed). Do **not** use **LOCAL PRE-RELEASE VALIDATED**.

---

## Executive summary

- **00221** migration SQL is **server-authoritative** for referred profile kind and referral amounts; 5-arg `credit_supplier_wallet_event_atomic` is dropped; 6-arg path uses `private.otp_referral_bonus_inr` for `SUPPLIER_REFERRAL_BONUS`.
- **Build:** `pnpm run build` **passed** (621 modules, ~1m 11s).
- **Tests:** Root `vitest run` finished with **23 failed / 4095 passed** across **5 failed / 342 passed** files (~22.1 min). Failures are award quorum, demo-mode, role-access, requirement-engine, and direct-invite integration — **not** persona/wallet/00221 security tests. Because of `&&`, **domain/services/database vitest configs and `tsx scripts/test-functions.ts` did not run**.
- **Persona:** Buyer wallet path is isolated. Supplier path prefers non-personal/non-INDIVIDUAL orgs but **`resolveWalletOrganizationId` still falls back to `input.organizationId`** when no supplier org candidate exists (edge case).
- **Browser:** Not run (no safe QA login path without hunting secrets).
- **Code changes this pass:** **None**.

---

## 1. Full test suite (`pnpm test`)

**Script (from `package.json`):**

```text
vitest run && vitest run --config packages/domain/vitest.config.ts && vitest run --config packages/services/vitest.config.ts && vitest run --config packages/database/vitest.config.ts && tsx scripts/test-functions.ts
```

| Item | Value |
|------|--------|
| **Command** | `pnpm test` (repo root) |
| **Completed** | Stage 1 (`vitest run` at repo root) only |
| **Exit** | `1` (`ELIFECYCLE`) — pipeline stopped before stage 2 |
| **Test files (stage 1)** | **347** total — **342 passed**, **5 failed** |
| **Tests (stage 1)** | **4118** total — **4095 passed**, **23 failed**, **0 skipped** (per Vitest summary) |
| **Duration (stage 1)** | **1326.16s** (~22m 6s) |
| **Wall duration (command)** | ~22m 26s |

**Failed files (stage 1):**

1. `tests/integration/requirement-engine.test.ts` (2)
2. `tests/security/award-closeout.test.ts` (13) — `Committee quorum not met` on award RPC
3. `tests/integration/role-access.test.ts` (2)
4. `tests/integration/demo-mode.test.ts` (3)
5. `tests/integration/direct-invite-existing-supplier.test.ts` (3)

**Not executed (blocked by `&&`):** `packages/domain`, `packages/services`, `packages/database` vitest configs; `scripts/test-functions.ts`.

**Persona/wallet/00221-related DB tests** (`tests/security/otp-referral-00221-database.test.ts`, `tests/security/supplier-wallet-00220-database.test.ts`) are in stage 1’s include set and are **assumed executed** as part of the 342 passing files (no failures reported for those paths).

---

## 2. Migration 00221 — database contract trace

**File:** `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql`

### Call graph (`credit_otp_referral_bonus_atomic`)

1. **Auth:** `private.get_profile_id()`; requires `service_role` or `private.is_platform_admin()`.
2. **Self-referral:** rejects `p_referrer_org_id = p_referred_org_id`.
3. **Supplier referrer gate (SUPPLIER persona only):** `private.supplier_referrer_has_settled_otp_tx(p_referrer_supplier_id)` on `platform_fee_transactions` with `status = 'SETTLED'`.
4. **Authoritative referred profile:** `v_referred_kind := private.otp_referred_profile_kind_authoritative(p_referred_org_id, p_source_entity_id)` — reads `signup_requests`, `suppliers`, `organizations`; **not** client-trusted for amount.
5. **Profile mismatch:** rejects if `p_referred_profile_kind` ≠ authoritative kind.
6. **Amount:** `v_amount := private.otp_referral_bonus_inr(v_referred_kind)` — rejects `p_client_amount` ≠ `v_amount`.
7. **Idempotency:** `wallet_transactions.idempotency_key`; duplicate `(organization_id, OTP_REFERRAL_BONUS, source_entity_id)` via index `uq_wallet_otp_referral_source`.
8. **Credit target:** `p_beneficiary_org_id` only (`organization_wallets` / `wallet_transactions` for beneficiary org).
9. **Audit:** `audit_events` `referral_wallet.credited`.

### Matrix (`private.otp_referral_bonus_inr`)

| Profile | INR |
|---------|-----|
| INDIVIDUAL (default) | 10 |
| RWA | 25 |
| MSME | 50 |
| SUPPLIER / VENDOR | 100 |

### Supplier ledger path (`credit_supplier_wallet_event_atomic`)

- **00220 5-arg overload:** `DROP FUNCTION IF EXISTS public.credit_supplier_wallet_event_atomic(uuid, text, uuid, text, numeric);` (line 281).
- **Active 6-arg** signature: referral branch uses `otp_referred_profile_kind_authoritative(NULL, p_source_entity_id)` + `otp_referral_bonus_inr`; **not** flat ₹100 for referral.
- **Success reward:** fixed **₹100** with SETTLED `platform_fee_transactions` check.
- **Removed:** `SUPPLIER_CASHBACK` / `%CASHBACK%` rejected.

### Contract checklist

| Requirement | Evidence | OK |
|-------------|----------|-----|
| Referred profile server-derived | `otp_referred_profile_kind_authoritative` | YES |
| Client cannot set amount | `p_client_amount` check | YES |
| Client cannot override profile | `p_referred_profile_kind` vs authoritative | YES |
| Referrer is beneficiary | Credits `p_beneficiary_org_id` (caller must pass referrer org; tests use referrer org as beneficiary) | YES |
| Self-referral blocked | Lines 177–179 | YES |
| Duplicate reward prevented | Idempotency + `uq_wallet_otp_referral_source` | YES |
| Supplier referrer settled-tx gate | `supplier_referrer_has_settled_otp_tx`; only when persona SUPPLIER | YES |
| Buyer referrers not gated by supplier tx | Gate inside `IF v_persona = 'SUPPLIER'` | YES |
| Matrix amounts only | `otp_referral_bonus_inr` | YES |
| No active flat ₹100 supplier referral | 5-arg dropped; referral uses matrix in 6-arg | YES |

**00221 server-authoritative:** **YES**

---

## 3. Function reference classification

### `credit_otp_referral_bonus_atomic`

| Location | Classification |
|----------|----------------|
| `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql` | Migration — define, REVOKE/GRANT |
| `tests/security/otp-referral-00221-database.test.ts` | Test — RPC contract (local DB) |
| OTP Golden Reconstruction docs | Historical / planning commentary |

**Application / edge callers:** **None** in TypeScript app or `supabase/functions` (credits intended for service_role jobs; not wired in app layer in this tree).

### `credit_supplier_wallet_event_atomic`

| Location | Classification |
|----------|----------------|
| `supabase/migrations/00220_supplier_wallet_ledger_events.sql` | Migration — **historical** 5-arg (flat ₹100 referral) |
| `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql` | Migration — DROP 5-arg; 6-arg matrix referral |
| `tests/security/supplier-wallet-00220-database.test.ts` | Test — RPC contract |
| `tests/security/verified-remediation-00216-redteam.test.ts` | Test — REVOKE pattern on migration ceiling file |
| `packages/services/src/services/supplier-wallet-service.ts` | Comment only — orchestration layer; **no `.rpc()` call** |
| OTP Golden Reconstruction docs | Documentation |

**Active 5-arg overload in app code:** **None**. Post-00221 signature is 6-arg `(uuid, text, uuid, text, numeric, text)`.

---

## 4. Persona data-path audit

**Chain:** Person → Identity → Persona (`RoleContext.side`) → org list → wallet entitlement.

| Layer | Buyer | Supplier |
|-------|-------|----------|
| Portal side | `reconcilePortalSide` in `apps/web/src/features/roles/api/roles.ts` | Same — corrects stale `BUYER` when supplier-only |
| Wallet persona | `walletPersonaFromPortalSide` | `SUPPLIER` when side reconciled |
| Wallet org id | `resolveWalletOrganizationId` → `organizationId` | Prefers non-personal, non-`INDIVIDUAL` org in `organizations` |
| UI | `DashboardPage`, `ProfilePage`, `OtpWalletCreditsWidget` via `useWalletEntitlement` | `SupplierDashboardPage`, same hook; `referSide` from persona |

**Buyer isolated:** **YES** — `resolveWalletOrganizationId` returns active `organizationId` for `BUYER` (`persona-wallet.ts`).

**Supplier isolated:** **PARTIAL / NO for strict gate** — when no non-`INDIVIDUAL` org exists in `organizations`, function **returns `input.organizationId`** (line 65), which can be the personal Individual buyer org. **Prevention when both orgs exist:** lines 49–53 (`resolveWalletOrganizationId`). **Side correction:** `reconcilePortalSide`.

---

## 5. Hardcode audit (`side="buyer"`)

| Match | Classification |
|-------|----------------|
| `ReferAndEarnCard.tsx` default `side = 'buyer'` | Component default; dashboards pass `referSide` from `useWalletEntitlement` |
| `refer-and-earn.test.tsx` | Test fixture |
| `dashboard-refer-persona.test.tsx` | Guard test — asserts Dashboard does **not** hardcode buyer on card |
| `referral-incentive.test.ts` | Domain test fixture |

**Active product paths:** Dashboard, Supplier dashboard, Profile use **`referSide`** from entitlement hook.

---

## 6. Golden wallet audit (UI / entitlement)

| Persona | Entitlement (active UI) |
|---------|-------------------------|
| **Buyer** | Success Cashback + Referral Bonus (`OtpWalletCreditsWidget`, buyer branch) |
| **Supplier** | Referral Bonus + Success Reward ₹100 (supplier branch) |

**Absent in active supplier UI:** Supplier Cashback, Share-in-Success (`persona-wallet-widget.test.ts` asserts).  
**Absent in active buyer UI:** Supplier Success Reward row.

---

## 7. Wallet spending audit

**Policy (domain):** `assertReferralWalletUsagePolicy` in `packages/domain/src/types/referral-incentive.ts` — allows `SUBSCRIPTION_PURCHASE`, `SUBSCRIPTION_RENEWAL`, `RFQ_TOPUP`; blocks `CASH_WITHDRAWAL`, `GMV_PAYMENT`, `SUPPLIER_DISBURSEMENT`.

**Server spend path:** `public.apply_wallet_credits_to_subscription_atomic` (`00181`, hardened in `00216`) — membership check, wallet debit for subscription redemption only.

**Credits:** Non-withdrawable platform entitlements (`BUYER_REWARD_POLICY.isWithdrawable: false` in `pricing-entitlement.ts`).

---

## 8. Public website source

| Source | Matrix copy | Prohibited copy |
|--------|-------------|-----------------|
| `PricingPage.tsx` | Individual ₹10 · RWA ₹25 · MSME ₹50 · Supplier ₹100 | No supplier cashback / withdrawable wallet / GMV settlement |
| `organization-charter.ts` | Same matrix + supplier ₹100 success reward | Explicit: no supplier cashback; wallet for subscription/platform fees only |

**Source copy verified:** **YES**

---

## 9. Browser smoke

**Browser validation: NOT RUN — environment limitation**

- `cursor-ide-browser` available but **no open session**; QA passwords **not** available in environment without secret hunt (not performed).

---

## 10. Build

| Item | Result |
|------|--------|
| Command | `pnpm run build` |
| Result | **PASS** |
| Modules | 621 transformed |
| Duration | ~1m 11s (Vite reported) |

---

## Gate block (required)

## Automated tests
Files: 347 in stage 1 (342 passed, 5 failed); stages 2–5 **not run**
Passed: 4095 (stage 1 only)
Failed: 23 (stage 1 only)
Skipped: 0 (stage 1 summary)
Command: `pnpm test` — **exit 1**; stage 1 duration **1326.16s**; full command ~**1345s**

## Build
Result: **PASS** (vite build apps/web, 621 modules, ~1m 11s)

## 00221
Server-authoritative: **YES**

## Referral matrix
Individual ₹10: **YES** (`otp_referral_bonus_inr`)
RWA ₹25: **YES**
MSME ₹50: **YES**
Supplier ₹100: **YES**

## Persona
Buyer isolated: **YES** (`resolveWalletOrganizationId` BUYER branch)
Supplier isolated: **NO** (strict) — fallback `return input.organizationId` when no non-INDIVIDUAL org; **YES** when supplier org present in list (lines 49–53) + `reconcilePortalSide`

## Wallet
Buyer: Success Cashback + Referral Bonus
Supplier: Referral Bonus + Success Reward

## Browser
Browser validation: NOT RUN — environment limitation (no safe QA login; empty browser tab)

## Public website
Source copy verified: **YES**

## Git
HEAD: 10a4a1291ee3ed2db7200e7c2badcec3e5a01114
Commit created: **NO**

## Deployment
Production deployed: **NO**

## Migration
Local: **00221**
Hosted: **00220**

---

## Code changes

**None** (validation-only pass).

---

## Blockers to LOCAL PRE-RELEASE VALIDATED

1. **Full `pnpm test` failed** (23 failures; downstream test stages not executed).
2. **Supplier wallet org resolution** may bind personal Individual org when no supplier org candidate exists (`resolveWalletOrganizationId` line 65) — treat as persona isolation risk for strict release gate.
