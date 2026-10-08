# OTP Wallet E2E + Five-File Closure Report

**Date:** 2026-09-29  
**Workspace:** `G:\My Drive\otp`  
**Site:** https://otpplatform-theta.vercel.app  
**Supabase project ref:** `qsuvtcezffomtwzwyrso` (hosted ceiling **OPERATOR-ASSERTED `00221`** — not re-proven in this shell)  
**Certified wallet commit (expected):** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` — `feat(wallet): finalize buyer supplier wallet and referral model`  
**Agent pass:** read-only production; no commit, push, deploy, `db push`, or wallet credits

---

## 1. Executive Status — AMBER — CERTIFIED WITH NON-BLOCKING FINDINGS

Committed application code at **`c444df6`** aligns with the golden wallet/referral/persona model. **Targeted Vitest (57 tests) and `pnpm run build` passed** against the current workspace (local Docker `127.0.0.1:54322` for security DB tests). **Operator baseline** treats hosted **`00221`**, referral matrix RPCs, and RPC grants as already applied and certified.

**Non-blocking evidence gaps (prevent GREEN):**

- **Deployed git SHA** not discoverable from public HTTP headers/HTML (SPA shell only) — **INSUFFICIENT EVIDENCE** that edge === `c444df6`.
- **Authenticated wallet browser E2E** not run (no login; MCP browser tab unavailable).
- **Production catalog** not re-queried (`supabase migration list` → `AccessTokenRequiredError`).
- **Public live pricing DOM copy** not observed in browser; hosted HTML fetch contains no wallet strings (client-rendered).

No **P0/P1** golden-rule violation was found in **committed** behavior. Three of five forensic files have **unrelated dirty worktree** hunks; **PricingPage** and **organization-charter** are **clean at HEAD** (included in `c444df6`).

| Action this pass | Result |
| --- | --- |
| Git commit | **NO** |
| Git push | **NO** |
| `supabase db push` | **NO** |
| Create `00222` | **NO** |
| Production schema/grants/balances mutated | **NO** |
| Application source edited | **NO** |

---

## 2. Environment

| Item | Value | Evidence class |
| --- | --- | --- |
| `git rev-parse HEAD` | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` | AGENT |
| Branch | `main` | AGENT |
| `git rev-parse origin/main` (after `git fetch origin main`) | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` | AGENT |
| Expected wallet commit | **MATCH** (HEAD = origin/main = expected) | AGENT |
| Working tree (short) | `M` AwardPage, DecisionReceiptCard, SiteHeader, SiteLayout; untracked Golden Reconstruction / scripts | AGENT |
| Deployed SHA on Vercel | **INSUFFICIENT EVIDENCE** — `Last-Modified: Tue, 29 Sep 2026 08:07:04 GMT`, `X-Vercel-Id` present; no commit SHA in response | AGENT |
| Supabase CLI migration list | **NOT RUN** (blocked: `AccessTokenRequiredError`) | AGENT |
| Hosted migration ceiling | **`00221`** per **USER/OPERATOR** (matrix, `credit_otp_referral_bonus_atomic`, `credit_supplier_wallet_event_atomic`, SECURITY DEFINER, grants) | USER/OPERATOR |
| pnpm | `C:\Users\bloganat\AppData\Local\pnpm\pnpm.exe` | AGENT |
| Local DB for Vitest security tests | Reachable (`127.0.0.1:54322`) — DB tests executed, not skipped | LOCAL DATABASE |

### UI → hook → service → RPC → DB (wallet / referral)

| Layer | Artifact |
| --- | --- |
| UI wallet | `OtpWalletCreditsWidget.tsx` — buyer: Success Cashback + Referral; supplier: Referral + Success Reward |
| UI refer card | `ReferAndEarnCard` via `DashboardPage`, `SupplierDashboardPage`, `ProfilePage` with `useWalletEntitlement()` → `referSide`, `entitledWalletOrgId` |
| Hook | `use-wallet-entitlement.ts` → `walletEntitlementFromContext()` |
| Domain persona | `persona-wallet.ts` → `resolveWalletOrganizationId`, `referralBonusInrForReferredProfile` |
| Balance read | `fetchOrganizationWallet()` → RPC `get_organization_wallet` (`subscription.ts`) |
| Referral credit (server) | `public.credit_otp_referral_bonus_atomic` — **00221** (`private.otp_referred_profile_kind_authoritative`, `private.otp_referral_bonus_inr`) |
| Supplier ledger events | `public.credit_supplier_wallet_event_atomic` (6-arg post-00221) — `SUPPLIER_REFERRAL_BONUS`, `SUPPLIER_SUCCESS_REWARD`; rejects cashback types |
| Buyer success cashback | Buyer reward / allocation path (`credit_buyer_reward_atomic` / platform fee settlement — prior migrations; widget labels Success Cashback) |
| Domain guards | `supplier-wallet.ts` (`evaluateSupplierReferralBonus`, success reward), `referral-incentive.ts` (`assertReferralWalletUsagePolicy`) |
| Public copy | `PricingPage.tsx`, `organization-charter.ts` |

---

## 3. Wallet E2E Results table

| Area | Result | Evidence |
| --- | --- | --- |
| Individual referral ₹10 | **PASS** | **CODE:** `persona-wallet.test.ts`, `private.otp_referral_bonus_inr` in `00221` (default branch). **LOCAL DATABASE:** not isolated per-tier test; matrix function + MSME integration test imply contract. |
| RWA referral ₹25 | **PASS** | **CODE:** `referralBonusInrForReferredProfile('RWA')` → 25; SQL `ELSIF v_kind = 'RWA' THEN RETURN 25`. |
| MSME referral ₹50 | **PASS** | **LOCAL DATABASE:** `otp-referral-00221-database.test.ts` — buyer referrer credits ₹50 for MSME referred org. **CODE:** matrix constant. |
| Supplier referral ₹100 | **PASS** | **CODE:** matrix + SQL `SUPPLIER`/`VENDOR` → 100. **LOCAL DATABASE:** `supplier-wallet-00220-database.test.ts` referral branch still asserts ₹100 for supplier-sourced referral event (default referred profile). |
| Supplier success reward ₹100 + SETTLED fee gate | **PASS** | **LOCAL DATABASE:** `supplier-wallet-00220-database.test.ts` — rejects `SUPPLIER_SUCCESS_REWARD` when fee not SETTLED; credits ₹100 with service_role. **CODE:** `supplier-wallet.ts` `evaluateSupplierSuccessReward`. |
| Buyer Success Cashback path | **PASS** | **CODE:** `OtpWalletCreditsWidget` buyer branch (`Success Cashback`); `persona-wallet-widget.test.tsx`, `profile-wallet-entitlement.test.tsx`. |
| Supplier absence of Success Cashback | **PASS** | **CODE:** widget supplier branch shows Referral + Success Reward only; tests assert no Success Cashback / Share in Success. |
| Supplier Cashback absence | **PASS** | **CODE:** `REMOVED_SUPPLIER_CASHBACK_LEDGER_TYPE`; SQL rejects `%CASHBACK%`; `pricing-msme.test.tsx` / site grep — no Supplier Cashback product string. |
| Idempotency | **PASS** (local, not full matrix replay) | **LOCAL DATABASE:** supplier wallet replay `replayed: true`; **CODE/SQL:** `00221` idempotency_key + unique `OTP_REFERRAL_BONUS` source index. Full referral idempotency replay **NOT RUN** as dedicated test this pass. |
| Self-referral block | **PASS** | **LOCAL DATABASE:** `otp-referral-00221-database.test.ts` — `Self-referral`. **CODE:** `supplier-wallet.test.ts` self/circular. |
| Client amount override | **PASS** | **LOCAL DATABASE:** referral + supplier wallet tests — `Client cannot override`. |
| Profile kind spoof | **PASS** | **LOCAL DATABASE:** `cannot override referred profile kind`. **CODE:** authoritative resolver in `00221`. |
| Anon/authenticated cannot execute credit RPCs | **PASS** (split evidence) | **LOCAL DATABASE:** anon blocked on both credit RPCs. **USER/OPERATOR:** authenticated/PUBLIC cannot execute; service_role can (hosted catalog, not re-queried). |
| Wallet spending restrictions | **PASS** | **CODE:** `assertReferralWalletUsagePolicy` blocks `CASH_WITHDRAWAL`, `GMV_PAYMENT`; `apply_wallet_credits_to_subscription_atomic` (00216); widget/charter/pricing copy — subscription + platform fees only. |
| Accounting separation (wallet vs GMV) | **PASS** | **CODE:** `organization-charter.ts` `financial-separation`; `msme-governance.ts` / `financial-settlement-controls.ts` invariants; referral policy errors on GMV. |
| Authenticated dashboard wallet E2E | **NOT RUN** | No QA login; browser wallet smoke **USER/OPERATOR** prior PASS — not re-observed. |
| Logout persona isolation (browser) | **NOT RUN** | Code path certified; browser logout **NOT RUN**. |
| Production DB matrix `SELECT private.otp_referral_bonus_inr(...)` | **NOT RUN** | No hosted DB session in shell; operator asserts **00221** applied. |

---

## 4. Persona Isolation

| Check | Result | Evidence |
| --- | --- | --- |
| Supplier must not use personal INDIVIDUAL buyer org | **PASS** | **CODE:** `resolveWalletOrganizationId` — `SUPPLIER` returns non-INDIVIDUAL org or **`null`** (never silent `organizationId` fallback when only personal org). `persona-wallet.test.ts`, `use-wallet-entitlement.test.ts`. |
| Buyer uses active `organizationId` | **PASS** | **CODE:** `BUYER` branch returns `input.organizationId`. |
| Refer card side follows persona | **PASS** | **CODE:** `referSide` = supplier \| buyer; `dashboard-refer-persona.test.tsx` — no hardcoded `ReferAndEarnCard side="buyer"` on dashboard. |
| Portal side reconciliation | **PASS** | **CODE:** `reconcilePortalSide` in `roles.ts` (committed at `c444df6`). |
| Supplier refer identifier without org | **PASS** | **CODE:** `referIdentifier` uses `supplierId` when `entitledWalletOrgId` null — not buyer `organizationId`. |

---

## 5. Five-file table

| File | In `c444df6`? | Worktree vs HEAD | Why deferred / history | Golden conflict? | Status |
| --- | --- | --- | --- | --- | --- |
| `AwardPage.tsx` | Yes (baseline label) | **Dirty** — conditional label: committee vs buyer justification | Excluded from `10a4a129` pre-commit; **not** in wallet commit scope; UX copy only | **No** — unrelated to wallet/referral | **SAFE — NO CHANGE REQUIRED** (release commit). Dirty hunk **OUT OF RELEASE / not certified as part of c444df6**. |
| `organization-charter.ts` | **Yes** — wallet/referral clauses surgically in `c444df6` | **Clean** | Was dirty at `10a4a129`; included in wallet finalize commit | **No** — matches golden copy (matrix, no supplier cashback, spend limits) | **SAFE — NO CHANGE REQUIRED** |
| `DecisionReceiptCard.tsx` | Yes | **Dirty** — MSME heading de-capitalized; removed “(PA-09)” from title | Excluded from RC; reveal/governance display only | **No** | **SAFE — NO CHANGE REQUIRED** (committed). Dirty **OUT OF RELEASE**. |
| `SiteLayout.tsx` | Yes | **Dirty** — removes `MobileSimulatorFrame` wrapper | Excluded from RC; marketing shell | **No** — no wallet/persona logic | **SAFE — NO CHANGE REQUIRED** (committed). Dirty **OUT OF RELEASE**. |
| `PricingPage.tsx` | **Yes** — reward copy in `c444df6` | **Clean** | Surgically included in `c444df6` after `10a4a129` exclusion | **No** — Success Cashback buyer-only narrative; ₹10/25/50/100; no Supplier Cashback | **SAFE — NO CHANGE REQUIRED** |

### Special checks (evidence)

| File | Check | Finding |
| --- | --- | --- |
| **AwardPage** | Wallet/referral impact | **None** — only award justification label text (dirty vs committed `Recorded Committee Consensus:`). |
| **organization-charter** | Matrix + spend + no supplier cashback | **PASS** at HEAD — `wallet-referrals`, `buyer-success-cashback`, `supplier-wallet-rewards` clauses; `organization-charter.test.tsx`. |
| **DecisionReceiptCard** | Wallet copy | **None** — MSME governance display string only (dirty). |
| **SiteLayout** | Persona routing | **None** — layout wrapper only; dirty removes simulator frame. |
| **PricingPage** | Public golden copy | **PASS** at HEAD — `pricing-msme.test.tsx` asserts matrix and forbids Supplier Cashback / withdrawable / supplier settlement wallet claims. **Hosted DOM:** **NOT RUN** (SPA). |

---

## 6. Bugs

| ID | Severity | Description | Action |
| --- | --- | --- | --- |
| — | — | No new P0/P1 golden violations identified in committed `c444df6` wallet/referral/persona paths | None |

**Observation (P3 / debt, not release blockers):** Legacy domain strings still mention “Share in Success” in some `packages/domain` types/tests (`pricing-entitlement.ts`, `buyer-reward.ts`) — **not** active supplier product surface; UI tests explicitly reject Share in Success / Supplier Cashback in wallet widget and pricing.

---

## 7. Tests exact counts

**Command (this pass):**

```text
pnpm exec vitest run \
  tests/security/otp-referral-00221-database.test.ts \
  tests/security/supplier-wallet-00220-database.test.ts \
  packages/domain/src/types/persona-wallet.test.ts \
  packages/domain/src/types/supplier-wallet.test.ts \
  apps/web/src/features/subscription/hooks/use-wallet-entitlement.test.ts \
  apps/web/src/features/subscription/persona-wallet-widget.test.tsx \
  apps/web/src/features/subscription/dashboard-refer-persona.test.tsx \
  apps/web/src/features/profile/profile-wallet-entitlement.test.tsx \
  apps/web/src/features/site/pricing-msme.test.tsx \
  apps/web/src/features/governance/organization-charter.test.tsx \
  packages/domain/src/types/referral-share-hardening.test.ts
```

| Metric | Value |
| --- | --- |
| Test files | **11 passed** |
| Tests | **57 passed**, **0 failed**, **0 skipped** |
| Duration | **~40.0s** (Vitest v5.0.0) |

**Build:**

```text
pnpm run build
```

| Metric | Value |
| --- | --- |
| Result | **PASS** |
| Modules | **621** transformed |
| Duration | **~57.9s** |

**Not run:** full root `pnpm test` (~18 min; 23 known unrelated failures). **Not run:** authenticated browser wallet E2E.

---

## 8. Database: 00221 already applied per operator; this pass did not push or create 00222

| Item | Status |
| --- | --- |
| `supabase db push` | **NOT PERFORMED** |
| Migration `00222` | **NOT CREATED** |
| Production schema / grants / balances | **NOT MODIFIED** |
| Hosted ceiling | **OPERATOR-ASSERTED `00221`** — agent recorded baseline, did not re-prove via CLI |
| Repo file `00221_otp_referral_bonus_profile_matrix.sql` | Read-only review — matrix 10/25/50/100, authoritative profile, supplier gate, REVOKE/GRANT pattern matches golden model |
| Local Docker | **LOCAL DATABASE** tests executed successfully (implies `00221` contract present locally) |

---

## 9. Deployment

**No code change required.**

Deploy identity: public site returns **200** for `/pricing` but **no git SHA** in static HTML. Operator may have deployed `c444df6`; this pass **cannot equate** source HEAD to live edge without build metadata or authenticated deploy API.

---

## 10. Gates W1–W10

| Gate | Criterion | Result |
| --- | --- | --- |
| **W1** | Referral matrix 10 / 25 / 50 / 100 server-side | **PASS** — CODE + LOCAL DATABASE (MSME ₹50); operator asserts hosted SQL |
| **W2** | Supplier ₹100 success reward + SETTLED platform fee gate | **PASS** — LOCAL DATABASE + CODE |
| **W3** | Buyer Success Cashback; supplier has no buyer cashback UI | **PASS** — CODE + tests |
| **W4** | No Supplier Cashback / second share-in-success ledger for suppliers | **PASS** — CODE + SQL guards + pricing tests |
| **W5** | Idempotency, self-referral, client amount/profile anti-tamper | **PASS** — LOCAL DATABASE (partial idempotency on supplier path) + SQL contract |
| **W6** | Anon/authenticated cannot execute wallet credit RPCs | **PASS** — LOCAL DATABASE anon; authenticated/PUBLIC **USER/OPERATOR** on hosted |
| **W7** | Wallet spend: OTP subscription + platform fee only | **PASS** — CODE (`assertReferralWalletUsagePolicy`, subscription RPC, UI copy) |
| **W8** | Wallet ledger segregated from procurement GMV | **PASS** — CODE (charter, domain settlement controls, policy errors) |
| **W9** | Persona isolation (`resolveWalletOrganizationId` null for supplier-only personal org) | **PASS** — CODE + unit tests |
| **W10** | Deploy SHA + live public wallet copy provably match `c444df6` | **BLOCKED** — no SHA in public headers/HTML; browser pricing **NOT RUN**; PO UI smoke **USER/OPERATOR** only |

---

## 11. FINAL RECOMMENDATION

**CERTIFIED WITH NON-BLOCKING FINDINGS**

Application behavior required by the golden wallet/referral/persona model is **implemented and tested at commit `c444df6`** with **local database corroboration**. Remaining gaps are **observability and production re-proof** (deploy SHA, authenticated wallet UI, hosted catalog CLI), not code defects found in this pass.

---

## 12. Fifteen self-audit questions

| # | Question | Answer |
| --- | --- | --- |
| 1 | Did this pass mutate production schema, grants, or wallet balances? | **No.** |
| 2 | Was `supabase db push` or `00222` created? | **No** to both. |
| 3 | Were secrets, passwords, tokens, or service-role keys printed? | **No.** |
| 4 | Were `git commit` or `git push` performed? | **No.** |
| 5 | Is `HEAD` the expected wallet commit `c444df6`? | **Yes** — matches `origin/main`. |
| 6 | Was deployed SHA independently proven equal to `c444df6`? | **No** — insufficient public evidence. |
| 7 | Was hosted `00221` re-verified via Supabase CLI in this shell? | **No** — `AccessTokenRequiredError`; ceiling recorded as **operator-asserted**. |
| 8 | Does committed code enforce referral amounts by referred profile (not UI text alone)? | **Yes** — `00221` SQL + domain matrix; MSME proven locally. |
| 9 | Is Supplier Cashback absent from active product paths? | **Yes** — CODE/SQL/UI tests. |
| 10 | Does supplier referrer require settled OTP tx while buyers do not? | **Yes** — `00221` + LOCAL DATABASE gate test. |
| 11 | Was authenticated browser wallet E2E executed? | **No** — classified NOT RUN; operator prior smoke USER/OPERATOR. |
| 12 | Were any of the five forensic files edited during certification? | **No.** |
| 13 | Are dirty worktree hunks in AwardPage / DecisionReceiptCard / SiteLayout golden violations? | **No** — unrelated UX; committed blobs safe for release. |
| 14 | Were PricingPage and organization-charter included in `c444df6` and golden-aligned? | **Yes** — clean worktree; tests pass. |
| 15 | Is final honesty status GREEN without deploy/login/production catalog proof? | **No** — hence **AMBER / CERTIFIED WITH NON-BLOCKING FINDINGS**. |

---

*End of report.*
