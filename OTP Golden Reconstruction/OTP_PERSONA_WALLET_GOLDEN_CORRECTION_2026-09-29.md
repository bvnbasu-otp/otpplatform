# OTP Persona Wallet Golden Correction — 2026-09-29

**Status:** Local correction complete · **Production deployed: NO** · **Hosted DB (qsuvtcezffomtwzwyrso): unchanged** · **Not certified** (vitest/vite not present in this workspace run)

## Executive summary

Closed the dashboard gap: `DashboardPage` no longer hardcodes `ReferAndEarnCard side="buyer"`. Wallet org id and refer side are bound via `useWalletEntitlement()` / `walletEntitlementFromContext()` on buyer dashboard, supplier dashboard, and profile. Migration **00221** adds server-authoritative referral amounts by referred profile (`private.otp_referral_bonus_inr`, `credit_otp_referral_bonus_atomic`) without editing migration file **00220** in place.

---

## A — Persona / active context / wallet query map

| Concern | Location |
|--------|----------|
| Server role payload | RPC `my_role_context()` |
| Client context | `apps/web/src/features/roles/api/roles.ts` → `fetchRoleContext()`, `reconcilePortalSide()` |
| Persona wallet entitlement (client) | `packages/domain/src/types/persona-wallet.ts` → `resolveWalletOrganizationId`, `referralBonusInrForReferredProfile` |
| **Unified client binding (new)** | `apps/web/src/features/subscription/hooks/use-wallet-entitlement.ts` |
| Wallet balance | `fetchOrganizationWallet()` → `get_organization_wallet` |
| Wallet UI | `OtpWalletCreditsWidget.tsx` (buyer: Success Cashback + Referral; supplier: Referral + Success Reward ₹100) |
| Profile | `ProfilePage.tsx` |
| Buyer dashboard | `DashboardPage.tsx` → `referSide`, entitled org id |
| Supplier dashboard | `SupplierDashboardPage.tsx` → same hook |
| Supplier wallet SQL (00220 baseline) | `credit_supplier_wallet_event_atomic` |
| Referral matrix SQL (00221, local/future) | `00221_otp_referral_bonus_profile_matrix.sql` |
| Domain supplier referral rules | `packages/domain/src/types/supplier-wallet.ts` → `evaluateSupplierReferralBonus` |
| Public copy | `PricingPage.tsx`, `organization-charter.ts` |

**Trace:** Person → Identity → Persona (`context.side`) → `walletEntitlementFromContext` → wallet org id → `get_organization_wallet` / ledger → widget + `ReferAndEarnCard` side.

---

## B — Golden model (client)

| Persona | Wallet UI | Refer card `side` |
|---------|-----------|-------------------|
| BUYER | Success Cashback + Referral Bonus | `buyer` |
| SUPPLIER | Referral Bonus + Success Reward (₹100) | `supplier` |

No supplier cashback, no buyer Success Reward, no hiding cards after loading wrong org.

---

## C — `reconcilePortalSide`

When buyer and supplier roles coexist, active role side wins over stale `active_portal_side` (`apps/web/src/features/roles/api/roles.ts`).

---

## D — Referral amounts (server authoritative)

| Referred profile | Amount (INR) | Where calculated |
|------------------|-------------|------------------|
| Individual | 10 | `private.otp_referral_bonus_inr()` in **00221** |
| RWA | 25 | same |
| MSME | 50 | same |
| Supplier | 100 | same |

| Entry point | Function |
|-------------|----------|
| Unified referral credit (buyer + supplier referrers) | `public.credit_otp_referral_bonus_atomic(...)` — **00221** |
| Supplier ledger path (backward-compatible default) | `public.credit_supplier_wallet_event_atomic(..., p_referred_profile_kind)` — **replaced in 00221**, default `'SUPPLIER'` ⇒ ₹100 (matches production 00220 behavior until 00221 is applied) |
| Application planning | `referralBonusInrForReferredProfile()` — `persona-wallet.ts`; `evaluateSupplierReferralBonus()` — `supplier-wallet.ts` |

**00221 created:** **YES** — `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql`  
**Why not edit 00220:** Production already applied flat ₹100 supplier referral; profile matrix requires new migration.  
**Security:** `REVOKE` from PUBLIC/anon/authenticated; `GRANT` service_role only; idempotency keys + unique source rows; client amount rejected; self-referral blocked in unified RPC; supplier referrer requires `private.supplier_referrer_has_settled_otp_tx`.  
**NOT applied:** No `supabase db push`, no hosted ref `qsuvtcezffomtwzwyrso`.

---

## E — Supplier referral transaction gate

- **SQL (00221):** `credit_otp_referral_bonus_atomic` when `p_referrer_persona = 'SUPPLIER'`.
- **Domain:** `referrerHasCompletedOtpTransaction === false` → `REFERRER_TRANSACTION_GATE`.
- **Buyers:** No new transaction gate (unchanged).

---

## F — Files changed (this continuation)

| File | Change |
|------|--------|
| `apps/web/src/features/subscription/hooks/use-wallet-entitlement.ts` | **New** — persona-bound wallet + refer props |
| `apps/web/src/features/subscription/hooks/use-wallet-entitlement.test.ts` | Unit tests |
| `apps/web/src/features/subscription/dashboard-refer-persona.test.tsx` | No hardcoded dashboard `side="buyer"` |
| `apps/web/src/pages/DashboardPage.tsx` | `useWalletEntitlement`, `side={referSide}` |
| `apps/web/src/pages/SupplierDashboardPage.tsx` | Entitled org id + `referSide` |
| `apps/web/src/features/profile/pages/ProfilePage.tsx` | Uses shared hook |
| `apps/web/src/features/subscription/index.ts` | Export hook |
| `packages/domain/src/types/supplier-wallet.ts` | Matrix amounts via `referredProfileKind` |
| `packages/domain/src/types/supplier-wallet.test.ts` | MSME ₹50 case |
| `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql` | **New** server referral engine |
| `tests/security/otp-referral-00221-database.test.ts` | DB tests (local Supabase) |
| `apps/web/src/features/site/pages/PricingPage.tsx` | Rewards copy (no false 00220-only caveat) |
| `apps/web/src/features/governance/lib/organization-charter.ts` | Supplier wallet referral clause |

Prior session files (still in scope): `persona-wallet.ts`, `OtpWalletCreditsWidget.tsx`, `roles.ts`, etc.

---

## G — Tests

**Command (required):**

```text
node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts tests/security/verified-remediation-00216-redteam.test.ts tests/security/supplier-wallet-00220-database.test.ts tests/security/otp-referral-00221-database.test.ts packages/domain/src/types/persona-wallet.test.ts packages/domain/src/types/supplier-wallet.test.ts apps/web/src/features/roles/portal-side-reconciliation.test.ts apps/web/src/features/subscription/persona-wallet-widget.test.tsx apps/web/src/features/subscription/hooks/use-wallet-entitlement.test.ts apps/web/src/features/subscription/dashboard-refer-persona.test.tsx apps/web/src/features/governance/organization-charter.test.tsx
```

**Result this run:** **NOT RUN** — `node_modules/vitest/vitest.mjs` absent (root `node_modules` only contains `caniuse-lite` / `.vite-temp`; `npm` not on PATH). Re-run after full `npm install` on a machine with toolchain.

---

## H — Build

```text
node node_modules/vite/bin/vite.js build apps/web
```

**Result:** **NOT RUN** (vite not installed in workspace).

---

## I — Browser QA

**Browser:** **NOT RUN** (no live login; production unchanged).

---

## J — Git / release

| Item | Value |
|------|--------|
| Base HEAD (reference) | `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` |
| New commit | **NO COMMIT** (tests/build not executed) |
| `git push` | Not performed |
| **Production deployed** | **NO** |
| `supabase db push` | Not performed |

---

## K — Dashboard `side="buyer"` hardcode

| Check | Result |
|-------|--------|
| `DashboardPage.tsx` hardcoded `side="buyer"` | **Removed — YES** (`side={referSide}`) |
| Supplier dashboard uses persona hook | **YES** |
| Profile refer card | **YES** (`useWalletEntitlement`) |

---

## L — Follow-up

1. Apply **00221** on staging/local Docker (`127.0.0.1:54322`) before expecting matrix amounts in DB integration tests.
2. Wire settlement/signup jobs to call `credit_otp_referral_bonus_atomic` with referred profile kind from signup/org type.
3. Re-run full security + wallet test suite after `npm install`; commit only if green with message `fix(wallet): persona-bound wallets and server referral amounts`.
