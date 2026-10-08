# OTP Final Local Release Validation — 2026-09-29

**Workspace:** `G:\My Drive\otp`  
**Validator:** automated local gate (no commit, no push, no deploy)  
**pnpm:** 9.15.0 (`C:\Users\bloganat\AppData\Local\pnpm\pnpm.exe`)  
**Code changes during this run:** none (read-only validation)

---

## FINAL LOCAL RELEASE VALIDATION

### Full test suite

Command: `pnpm test` from repo root (`package.json` test script: root vitest → domain → services → database → `tsx scripts/test-functions.ts`).

**Stage 1 (root `vitest run`):** completed. **Stages 2–5:** did **not** run inside `pnpm test` because stage 1 exited non-zero (`&&` chain stopped). Stages 2–5 were executed separately in this session (all passed; see below).

Files:
- Stage 1: **347** total — **342** passed — **5** failed — **0** skipped (no skip count reported)

Passed (failed files only):
- `tests/integration/requirement-engine.test.ts` (2 tests failed)
- `tests/security/award-closeout.test.ts` (13 tests failed)
- `tests/integration/role-access.test.ts` (2 tests failed)
- `tests/integration/demo-mode.test.ts` (3 tests failed)
- `tests/integration/direct-invite-existing-supplier.test.ts` (3 tests failed)

Tests (stage 1):
- **4125** total — **4102** passed — **23** failed — **0** skipped

Duration (stage 1): **1109.49s** (~18.5 min)

**Supplemental stages (not part of failed `pnpm test` chain):**
| Stage | Result | Files | Tests | Duration |
|-------|--------|-------|-------|----------|
| `packages/domain` vitest | PASS | 64/64 | 794/794 | 11.25s |
| `packages/services` vitest | PASS | 41/41 | 562/562 | 21.56s |
| `packages/database` vitest | PASS | 2/2 | 5/5 | 10.25s |
| `scripts/test-functions.ts` | SKIP | — | — | Deno not installed (message only) |

Release-related DB tests in stage 1 that **passed:** `tests/security/otp-referral-00221-database.test.ts`, `tests/security/supplier-wallet-00220-database.test.ts`, persona wallet unit tests under `apps/web` and `packages/domain`.

### Previous 23 failures

Still present: **YES** (same 5 files, 23 tests)

Related to this release: **NO**

Evidence (all **A — pre-existing / unrelated** to persona/wallet/referral 00221):

| File | Failures | One-line reason | Class |
|------|----------|-----------------|-------|
| `award-closeout.test.ts` | 13 | Award RPC blocked by committee quorum (`at least 2 unconflicted votes`); tests never reach reveal/close-out assertions | A |
| `requirement-engine.test.ts` | 2 | Seed data leaves P0 GAP requirements unclassified; award-lock error text mismatch (`OPEN` vs expected regex) | A |
| `role-access.test.ts` | 2 | `role_catalog` / `my_role_context` denied to anon (`42501 permission denied`) | A |
| `demo-mode.test.ts` | 3 | `demo_status` denied to anon; `demo_reset` RFQ status transition `OPEN → DRAFT` rejected | A |
| `direct-invite-existing-supplier.test.ts` | 3 | Missing audit rows / repeat invite returns token when tests expect withheld link | A |

No failures reference `persona-wallet`, `use-wallet-entitlement`, `credit_otp_referral_bonus_atomic`, or 00221 matrix amounts. Stage 1 passed **7** more tests than the prior baseline (4102 vs 4095), consistent with new persona/wallet tests.

### 00221

**Contract review** (full file read: `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql`)

Server-authoritative: **YES**

| Check | Citation / evidence |
|-------|---------------------|
| Referred profile from DB, not client | `v_referred_kind := private.otp_referred_profile_kind_authoritative(...)` (L191); mismatch raises (L193–196) |
| Caller amount rejected | L200–202 (`p_client_amount` must match server `v_amount`) |
| Mismatched profile kind rejected | L193–196 |
| Referrer is beneficiary | Credits `p_beneficiary_org_id` only (L228–247); no credit path for referred org as beneficiary in this RPC |
| Referred participant not paid referrer reward | Reward is wallet credit to beneficiary org; referred org is input for profile resolution only |
| Self-referral rejected | L177–180 |
| Duplicate prevented | Unique index `uq_wallet_otp_referral_source` (L134–136); idempotency + org/source replay (L204–226) |
| Supplier referrer settled-tx gate | L182–188 (`supplier_referrer_has_settled_otp_tx`) |
| Buyers NOT under supplier gate | Gate only when `v_persona = 'SUPPLIER'` (L182) |
| Amount matrix | `private.otp_referral_bonus_inr` (L8–25): Supplier/Vendor 100, MSME 50, RWA 25, default 10 |
| No active flat-₹100 supplier referral path | `SUPPLIER_REFERRAL_BONUS` uses authoritative kind + `otp_referral_bonus_inr` (L320–326); not flat 100 for all profiles |
| 5-arg `credit_supplier_wallet_event_atomic` DROPPED | L281 |
| No PUBLIC/anon EXECUTE | REVOKE/GRANT on 9-arg referral RPC (L273–278) and 6-arg supplier RPC (L415–416) |

Individual: ₹10 — **PASS**  
RWA: ₹25 — **PASS**  
MSME: ₹50 — **PASS** (integration test `otp-referral-00221-database.test.ts` asserts ₹50)  
Supplier: ₹100 — **PASS**

### Caller audit

| Hit | Classification |
|-----|----------------|
| `supabase/migrations/00221_*.sql` | Definition + REVOKE/GRANT |
| `supabase/migrations/00220_*.sql` | Superseded 5-arg definition (hosted baseline) |
| `tests/security/otp-referral-00221-database.test.ts` | Security/integration tests (6-arg referral RPC) |
| `tests/security/supplier-wallet-00220-database.test.ts` | Security/integration tests (6-arg supplier RPC post-00221) |
| `tests/security/verified-remediation-00216-redteam.test.ts` | Static SQL policy grep |
| `packages/services/.../supplier-wallet-service.ts` | Comment only; orchestration uses domain evaluators, not direct 5-arg RPC |
| Golden Reconstruction / INTEGRATION markdown | Documentation |

**Active app dependency on removed 5-arg overload:** **NONE** (no TypeScript `.rpc('credit_supplier_wallet_event_atomic', …)` with five parameters; tests use 6-arg shape).

### Persona

Buyer isolation: **PASS** — `resolveWalletOrganizationId` returns `input.organizationId` for `BUYER` (persona-wallet.ts L68); tests + `use-wallet-entitlement.test.ts`.

Supplier isolation: **PASS** — supplier path excludes INDIVIDUAL/personal orgs; returns `null` when only buyer org exists (L49–65, tests L46–65).

Dual persona: **PASS** — `walletEntitlementFromContext` uses `context.side`; dual-org tests select `org-msme` vs `org-buyer-personal` by active side.

Supplier without org: **PASS** — `entitledWalletOrgId` null; `referIdentifier` uses `supplierId` not `organizationId` (use-wallet-entitlement.ts L39–41, test L74–93).

UI: `DashboardPage` / supplier dashboard bind via `useWalletEntitlement()` (no hardcoded `ReferAndEarnCard side="buyer"` per `dashboard-refer-persona.test.tsx`).

### Wallet

Buyer: Success Cashback + Referral Bonus (`OtpWalletCreditsWidget` buyer branch; `persona-wallet-widget.test.tsx`).

Supplier: Referral Bonus + Success Reward ₹100 (supplier branch; no Success Cashback / Supplier Cashback in widget tests).

SQL: buyer rewards via `credit_buyer_reward_atomic` / allocations (00181); supplier events `SUPPLIER_REFERRAL_BONUS` + `SUPPLIER_SUCCESS_REWARD` only (00221 L312–314); cashback rejected (L316–318).

### Spending

OTP-only: **PASS**

Enforcement:
- `public.apply_wallet_credits_to_subscription_atomic` — subscription redemption debits wallet (`SUBSCRIPTION_REDEMPTION`) (00181 / 00216).
- `packages/domain/src/types/referral-incentive.ts` — blocks `CASH_WITHDRAWAL`, `GMV_PAYMENT`, etc.
- Public copy: subscription + platform fees only; no withdrawal (PricingPage, charter, widget footer).

### Public website

Reward copy: **PASS** — PricingPage L343: ₹10 · ₹25 · ₹50 · ₹100; charter L45, L127.

Forbidden Supplier Cashback wording: **PASS** — charter states “no supplier cashback”; supplier pricing card does not market Supplier Cashback; site search under `apps/web/src/features/site` has no “Supplier Cashback” product string.

### Browser

**NOT RUN — environment limitation** (no authenticated session without storing credentials; cursor-ide-browser not used for login).

### Build

**PASS** — `pnpm run build` (vite), **621** modules transformed, **~71s** build time.

### Git

HEAD: `10a4a1291ee3ed2db7200e7c2badcec3e5a01114`

Commit: **NO**  
Push: **NO**

**Persona / wallet / referral isolation worktree (this release):**  
`packages/domain/src/types/persona-wallet.ts`, `persona-wallet.test.ts`, `apps/web/src/features/subscription/hooks/use-wallet-entitlement.ts`, `use-wallet-entitlement.test.ts`, related subscription/dashboard/profile/supplier-wallet files, `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql`, `tests/security/otp-referral-00221-database.test.ts`, etc.

**Unrelated pre-existing dirty files (examples):** `AwardPage.tsx`, `roles.ts`, `DecisionReceiptCard.tsx`, site header/layout, various INTEGRATION markdown, scripts evidence JSON — not required for persona gate.

### Deployment

Production: **NO**

### Migration

Local: **00221** (file present; applied on local Docker per prior certification docs)  
Hosted: **00220** (per operator scope — **00221 not applied** to `qsuvtcezffomtwzwyrso`)

---

## Hard-code search (`side="buyer"` / buyer fallbacks)

| Location | Classification |
|----------|----------------|
| `dashboard-refer-persona.test.tsx` | Guard test — harmless |
| `refer-and-earn.test.tsx` | Component unit tests with explicit `side: 'buyer'` props — harmless |
| `use-wallet-entitlement.ts` L41 | Buyer-only fallback chain for refer identifier — correct for BUYER persona |
| Supplier `referIdentifier` | Uses `entitledWalletOrgId \|\| supplierId` — **no** `organizationId` fallback |

---

## Unrelated historical failures (documented debt)

1. Award closeout / committee quorum (13)  
2. Requirement engine seed + message regex (2)  
3. Role catalog anon access (2)  
4. Demo mode RPC permissions + reset transition (3)  
5. Direct invite existing supplier audit/token (3)  

---

## FINAL DECISION

`LOCAL PRE-RELEASE VALIDATED`

Release contracts (00221, persona isolation, wallet/spending copy, build, release-related tests) pass. Full `pnpm test` stage 1 still reports 23 unrelated integration failures; stages 2–5 pass when run after stage 1 abort. Edge `test-functions` skipped (Deno absent).
