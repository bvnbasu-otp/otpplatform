# OTP Supplier Persona Isolation — 2026-09-29

## Root cause

`resolveWalletOrganizationId` in `packages/domain/src/types/persona-wallet.ts` ended the SUPPLIER branch with `return input.organizationId` when no non-INDIVIDUAL / non-personal organization could be resolved from `organizations`. That silently reused the active session organization, which is often the auto-provisioned personal **INDIVIDUAL** Buyer org. Supplier wallet and referral paths could therefore inherit Buyer context without an explicit failure.

Secondary leak: `walletEntitlementFromContext` used `context.organizationId` in the supplier `referIdentifier` fallback chain after `supplierId`, which could still surface a Buyer org id when `entitledWalletOrgId` was null.

## Correction (exact files/functions)

| File | Function / change |
|------|---------------------|
| `packages/domain/src/types/persona-wallet.ts` | `resolveWalletOrganizationId` — SUPPLIER branch now returns `null` when no valid supplier-capable org is found (removed silent `input.organizationId` fallback). |
| `apps/web/src/features/subscription/hooks/use-wallet-entitlement.ts` | `walletEntitlementFromContext` — supplier `referIdentifier` uses `entitledWalletOrgId \|\| supplierId \|\| email` only; Buyer path unchanged (`entitledWalletOrgId \|\| organizationId \|\| email`). |
| `packages/domain/src/types/persona-wallet.test.ts` | Added isolation and dual-persona assertions. |
| `apps/web/src/features/subscription/hooks/use-wallet-entitlement.test.ts` | Added dual-persona and unresolved-supplier-org assertions. |

## Persona isolation

| Scenario | Result |
|----------|--------|
| Buyer-only / Buyer active | **PASS** — `portalSide: 'BUYER'` still returns `input.organizationId` (INDIVIDUAL/RWA/MSME preserved). |
| Supplier-only / Supplier active with valid non-INDIVIDUAL org | **PASS** — resolves non-personal / non-INDIVIDUAL org from list. |
| Dual persona — Buyer active | **PASS** — wallet org = buyer personal (`org-buyer-personal` in tests). |
| Dual persona — Supplier active | **PASS** — wallet org = `org-msme`, not buyer personal. |
| Supplier with no valid Supplier org | **PASS** — `entitledWalletOrgId` is `null`; `referIdentifier` falls back to `supplierId`, not buyer `organizationId`. |

## Wallet

Contract preserved (no new ledger concepts):

- **BUYER persona:** Success Cashback + Referral Bonus (`OtpWalletCreditsWidget` persona `BUYER`). Not Supplier Success Reward.
- **SUPPLIER persona:** Referral Bonus + Success Reward ₹100 (`OtpWalletCreditsWidget` persona `SUPPLIER`). Not Success Cashback, not Supplier Cashback, not Share in Success.

`ProfilePage`, `DashboardPage`, and `SupplierDashboardPage` bind `OtpWalletCreditsWidget` / wallet RPC org via `entitledWalletOrgId` from `useWalletEntitlement()` (persona from reconciled portal side).

## Referral

- `referSide` remains derived from persona (`supplier` vs `buyer`) in `walletEntitlementFromContext`.
- Dashboard and supplier dashboard use `side={referSide}` (no hard-coded `side="buyer"` in page source).

### `side="buyer"` audit (active `apps/web` + `packages` `.ts`/`.tsx`)

| Location | Classification |
|----------|----------------|
| `dashboard-refer-persona.test.tsx` | Test assertion only — **persona-safe** |
| `refer-and-earn.test.tsx` | Component fixture tests for `ReferAndEarnCard` — **not a Supplier runtime path** |
| `use-wallet-entitlement.ts` (`referSide: 'buyer'`) | Persona-conditional when not supplier — **persona-safe** |

No Supplier dashboard/profile wallet path selects referral or wallet data via a hard-coded Buyer `side`.

### `resolveWalletOrganizationId` callers

| Caller | Why persona-safe |
|--------|------------------|
| `walletEntitlementFromContext` (`use-wallet-entitlement.ts`) | Passes `portalSide: walletPersonaFromPortalSide(context.side)` (reconciled portal side). BUYER returns session org; SUPPLIER only returns vetted org ids or `null`. Consumed by `useWalletEntitlement` on Profile, Buyer Dashboard, Supplier Dashboard. |

No other production callers.

### Organization / portal side

`reconcilePortalSide` (`apps/web/src/features/roles/api/roles.ts`) remains the source of reconciled `context.side` before wallet entitlement runs; this fix does not alter reconciliation—only removes unsafe org id substitution on the SUPPLIER wallet path.

## Referral — 00221 unchanged YES/NO

**UNCHANGED THIS PASS — YES**

```
git diff -- supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql
```
(empty output at end of this task; no edits to 00221 during this pass)

## Tests — affected files, passed, failed

Command:

```text
pnpm exec vitest run packages/domain/src/types/persona-wallet.test.ts apps/web/src/features/subscription/hooks/use-wallet-entitlement.test.ts apps/web/src/features/subscription/persona-wallet-widget.test.tsx apps/web/src/features/subscription/dashboard-refer-persona.test.tsx
```

| Metric | Value |
|--------|-------|
| Test files | 4 passed |
| Tests | 17 passed, 0 failed |

Unrelated prior failures (award-closeout quorum, demo-mode, role-access, requirement-engine, direct-invite, etc.) were **not** run or fixed.

## Build PASS/FAIL

**PASS** — `pnpm run build` (vite production build for `apps/web`) completed successfully.

## Git HEAD full sha, Commit NO, Push NO

- **HEAD:** `10a4a1291ee3ed2db7200e7c2badcec3e5a01114`
- **Commit:** NO
- **Push:** NO

## Deployment Production NO

## Migration Local 00221, Hosted 00220

- Local migration tree includes **00221** (not applied to hosted in this task).
- Hosted project `qsuvtcezffomtwzwyrso` remains at **00220** (no `supabase db push`, no hosted 00221 apply).

## Final gate

```
SUPPLIER PERSONA ISOLATION BLOCKER CLOSED — READY FOR FINAL LOCAL RELEASE VALIDATION
```
