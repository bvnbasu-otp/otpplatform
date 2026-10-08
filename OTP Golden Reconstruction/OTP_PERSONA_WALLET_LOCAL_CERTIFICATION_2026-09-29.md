# OTP Persona + Wallet + Referral — Local Certification (2026-09-29)

**Status: CERTIFIED (local persona/wallet/referral scope)** — dependencies installed, targeted Vitest suites green, production build green. Full monorepo `pnpm test` not executed in this pass.

**Production deployed: NO** · **Git commit: NO** · **00221 on hosted `qsuvtcezffomtwzwyrso`: NO**

---

## ROOT CAUSE

Migration **00221** (initial version) computed referral amounts via `private.otp_referral_bonus_inr(p_referred_profile_kind)` using a **caller-supplied** `p_referred_profile_kind`. Even with `service_role`-only RPC access, that let the orchestration layer (or any bug passing through client input) pick tier amounts without reading the **referred participant’s** authoritative record — a server-trust defect relative to the golden model.

`credit_supplier_wallet_event_atomic` had the same pattern for `SUPPLIER_REFERRAL_BONUS` via optional `p_referred_profile_kind` defaulting to `SUPPLIER`.

**Second defect (this pass):** 00221 added a **6-arg** `credit_supplier_wallet_event_atomic` without dropping 00220’s **5-arg** signature, causing PostgREST `PGRST203` ambiguous overload. Fixed in 00221 with `DROP FUNCTION` before replace (re-applied on local Docker via `docker exec`).

---

## INSTALL

| Step | Result |
|------|--------|
| Node | **v24.18.1** (`C:\Users\bloganat\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe`) |
| PATH search | `where.exe npm/pnpm/corepack/npx` — **no matches**; `Get-Command` — **node only**; `C:\Program Files\nodejs\npm.cmd` / `corepack.cmd` — **missing**; `%APPDATA%\npm` / `%LOCALAPPDATA%\pnpm` — **missing** |
| Lockfile | Root **`pnpm-lock.yaml`**; `package.json` → **`packageManager`: `pnpm@9.15.0`** |
| Recovery | Official script `https://get.pnpm.io/install.ps1` with **`PNPM_VERSION=9.15.0`** → `C:\Users\bloganat\AppData\Local\pnpm\pnpm.exe` |
| Install command | **`pnpm install --frozen-lockfile`** (session `PATH` += `%PNPM_HOME%`) — **exit 0**, **+182 packages**, **~4m 6s** |

---

## PERSONA FIX

| Item | Evidence |
|------|----------|
| Persona-bound wallet binding | `apps/web/src/features/subscription/hooks/use-wallet-entitlement.ts` — `walletEntitlementFromContext()` / `useWalletEntitlement()` |
| Domain wallet org resolution | `packages/domain/src/types/persona-wallet.ts` — `resolveWalletOrganizationId()`, `walletPersonaFromPortalSide()` |
| Supplier vs buyer wallet UI | `OtpWalletCreditsWidget.tsx` — buyer: Success Cashback + Referral; supplier: Referral + Success Reward (₹100); no Supplier Cashback |
| Unit tests (source) | `use-wallet-entitlement.test.ts`, `persona-wallet-widget.test.tsx`, `persona-wallet.test.ts` |

---

## DASHBOARD FIX

| Page | Refer card | Wallet org |
|------|------------|------------|
| `DashboardPage.tsx` | `side={referSide}` (not hardcoded buyer) | `entitledWalletOrgId` from hook |
| `SupplierDashboardPage.tsx` | `side={referSide}` | same |
| `ProfilePage.tsx` | uses `useWalletEntitlement()` | same |

Repo search: no active `ReferAndEarnCard side="buyer"` in `apps/web/src/pages` (covered by `dashboard-refer-persona.test.tsx`).

---

## REFERRAL ENGINE (exact function)

**Primary unified credit RPC:** `public.credit_otp_referral_bonus_atomic(...)`

**Call graph (00221 after fix):**

1. `credit_otp_referral_bonus_atomic`
   - Auth: `service_role` or `private.is_platform_admin()` only
   - Self-referral: `p_referrer_org_id = p_referred_org_id` → reject
   - Supplier referrer gate: `private.supplier_referrer_has_settled_otp_tx(p_referrer_supplier_id)` when `p_referrer_persona = SUPPLIER`
   - **Profile resolution:** `private.otp_referred_profile_kind_authoritative(p_referred_org_id, p_source_entity_id)` — loads from `signup_requests`, `suppliers`, or `organizations.org_type` (COMMUNITY/ENTERPRISE/INSTITUTION → RWA)
   - Amount: `private.otp_referral_bonus_inr(v_referred_kind)` → Individual **₹10**, RWA **₹25**, MSME **₹50**, Supplier **₹100**
   - Rejects client `p_referred_profile_kind` mismatch and `p_client_amount` override
   - Credits **`p_beneficiary_org_id` (referrer org)** — referred org is not the wallet beneficiary
   - Idempotency: `idempotency_key` + unique `OTP_REFERRAL_BONUS` source index

2. `private.otp_referral_bonus_inr(text)` — immutable tier matrix

3. `private.org_type_to_otp_referred_profile_kind(org_type)` — buyer org_type → profile kind

4. `private.otp_referred_profile_kind_authoritative(uuid, uuid)` — **server state only**

5. `private.supplier_referrer_has_settled_otp_tx(uuid)` — `platform_fee_transactions.status = SETTLED`

**Supplier ledger path:** `public.credit_supplier_wallet_event_atomic(...)` — single **6-arg** signature after DROP; referral branch uses authoritative resolver on `p_source_entity_id`; success reward remains ₹100 with SETTLED fee check.

---

## 00221 vs 00220

| | **00220 (production ceiling)** | **00221 (local file + local Docker only)** |
|--|--------------------------------|--------------------------------------------|
| Supplier referral amount | Flat **₹100** | Matrix by **referred** profile (supplier source → ₹100 when referred is supplier) |
| Unified referral RPC | N/A | `credit_otp_referral_bonus_atomic` |
| Profile kind | N/A / implicit | **DB-resolved** in fixed 00221 |
| Applied to hosted DB | **YES** | **NO** |
| Applied to `127.0.0.1:54322` | N/A until migrate | **YES** (00221 + overload DROP on local Docker) |

00220 file was **not** edited in place.

---

## SECURITY

| Control | Status |
|---------|--------|
| `SECURITY DEFINER` + `search_path` on referral/wallet RPCs | YES |
| `REVOKE` PUBLIC/anon/authenticated; `GRANT` service_role | Covered by DB tests |
| Self-referral blocked | SQL + `otp-referral-00221-database.test.ts` |
| Supplier referrer settled-tx gate | SQL + `otp-referral-00221-database.test.ts` |
| Client amount override rejected | SQL + wallet/referral DB tests |
| Client profile kind override rejected | **00221 fix** + tests |

---

## WALLET contents (active UI)

| Persona | Shown in `OtpWalletCreditsWidget` |
|---------|-----------------------------------|
| Buyer | Success Cashback (~0.1% share-in-success), Referral Bonus |
| Supplier | Referral Bonus, Success Reward (₹100 one-time after settled platform fee) |

Footer: non-cash credits; no withdrawal/UPI/bank language. **No Supplier Cashback** in active UI.

---

## REFERRAL TABLE (server)

| Referred profile (resolved) | Referrer wallet credit (INR) |
|----------------------------|------------------------------|
| INDIVIDUAL | 10 |
| RWA | 25 |
| MSME | 50 |
| SUPPLIER | 100 |

Referrer receives credit; referred participant does not receive the referrer bonus.

---

## WEBSITE pages (public copy)

`PricingPage.tsx` and `organization-charter.ts` align with matrix: ₹10/25/50/100, MSME example ₹50, supplier success ₹100 after settlement, wallet not cash, no Supplier Cashback, no separate Share-in-Success product for suppliers, no withdrawal language.

**Production URL** still serves pre-local-copy deploy; workspace build verified locally.

---

## TESTS (exact numbers)

**Command:**

```text
pnpm exec vitest run tests/security/otp-referral-00221-database.test.ts tests/security/supplier-wallet-00220-database.test.ts tests/security/verified-remediation-00216-database.test.ts tests/security/verified-remediation-00216-redteam.test.ts packages/domain/src/types/persona-wallet.test.ts packages/domain/src/types/referral-incentive.test.ts packages/domain/src/types/supplier-wallet.test.ts packages/domain/src/types/referral-share-hardening.test.ts apps/web/src/features/subscription/hooks/use-wallet-entitlement.test.ts apps/web/src/features/subscription/persona-wallet-widget.test.tsx apps/web/src/features/subscription/dashboard-refer-persona.test.tsx apps/web/src/features/referral/refer-and-earn.test.tsx
```

| Metric | Value |
|--------|--------|
| **Test files** | **12 passed** |
| **Tests** | **107 passed**, **0 failed** |
| Duration | ~48s (Vitest **v5.0.0**) |

| Suite | Coverage |
|-------|----------|
| `otp-referral-00221-database.test.ts` | Matrix ₹50 MSME, anon block, self-referral, supplier settled-tx gate, client override |
| `supplier-wallet-00220-database.test.ts` | Anon block, ₹100 credit + client override reject, SETTLED gate for success reward |
| `verified-remediation-00216-database.test.ts` + redteam | 00216–00220 static/SQL contracts; repo ceiling **00221** |
| Persona / dashboard / refer UI | `use-wallet-entitlement`, widget, `dashboard-refer-persona`, `refer-and-earn`, domain referral types |

**Test fixes this pass (not assertion weakening):** valid `supplier_status` **`ACTIVE`** (not invalid `VERIFIED`); valid referrer `supplierId` UUID; seed suppliers for DB-resolved profile; `verified-remediation-00216-redteam` ceiling file **00221**.

**Not run:** full root `pnpm test` (domain/services/database second passes, `test-functions.ts`, integration/demo).

---

## BUILD

| Command | Result |
|---------|--------|
| **`pnpm run build`** (`vite build apps/web`) | **PASS** — **621 modules**, **~61s**, output under `apps/web/dist/` |

---

## BROWSER

**BROWSER AUTH NOT RUN** (no QA credentials persisted).

**Public pricing smoke:** `cursor-ide-browser` could not attach a tab (`No browser tab available`). Local **`pnpm run preview`** served **`http://localhost:3000/`**; SPA shell fetched without MCP DOM check. Copy remains verified by **source** (`PricingPage.tsx`) plus Vitest (`pricing-msme`, site content tests not in targeted bundle).

---

## MIGRATION ceiling

| Environment | Highest migration |
|-------------|-------------------|
| Hosted production `qsuvtcezffomtwzwyrso` | **00220** |
| Repo on disk | **00221** (`supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql`) |
| Local Docker `127.0.0.1:54322` | **00221** (+ manual DROP of 5-arg `credit_supplier_wallet_event_atomic` before retest; DROP now in migration file) |

---

## GIT

| Item | Value |
|------|-------|
| HEAD | `10a4a12` — `cert(release): OTP Golden Reconstruction supplier network wallet baseline` |
| Branch | `main...origin/main` |
| Commit | **NO** |
| Changed | Persona/wallet/referral work + 00221 + certification doc + test fixes |

---

## DEPLOYMENT

**Production deployed: NO**

---

## Certification verdict

**CERTIFIED (local persona/wallet/referral scope)** — `pnpm install --frozen-lockfile` recovered `node_modules`; **107/107** targeted Vitest tests passed; **production build passed**; 00221 authoritative profile + supplier RPC overload fix validated on local Docker. **Not claimed:** full monorepo test script, hosted 00221, production deploy, git commit.
