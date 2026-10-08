# OTP POST-00219 Adversarial Challenge (Pass 2) — 2026-09-28

**Mandate:** Independent challenge of Pass 1 adversarial reconciliation. Read-only; no production mutations, deploys, migrations, commits, or credential hunting.

**Production app:** https://otpplatform-theta.vercel.app  
**Supabase project ref:** `qsuvtcezffomtwzwyrso`  
**Repository migration ceiling:** `00219`  
**Agent shell:** `supabase migration list --project-ref qsuvtcezffomtwzwyrso` → `AccessTokenRequiredError` (single attempt; no further token search).

**Production modified:** **NO**  
**Secrets disclosed:** **NO**

**Sources read:** `OTP_POST_00219_ADVERSARIAL_RECONCILIATION_2026-09-28.md`, `OTP_POST_00219_BEHAVIOURAL_TEST_EVIDENCE_2026-09-28.md`, `OTP_POST_00219_REMAINING_RISK_REGISTER_2026-09-28.md`, `OTP_POST_00219_COMPACT_READONLY.sql`, `OTP_POST_00219_PRODUCTION_CATALOG_EVIDENCE_20260928_192326.txt` (summary row only), migrations `00216`–`00219`, current `apps/web` route guard and supplier quotes stack.

**Catalog note:** Full compact SQL stdout for `OTP_POST_00219_COMPACT_READONLY.sql` was **not** present in repo (only summary PASS row). Object-level catalog remains operator-captured / pending per detailed evidence file.

---

## Pass 2 priority: F-RUN2-T4-02 (`/supplier/quotes`)

| Question | Answer |
|----------|--------|
| **Security issue definition** | Unauthorized access to **another party’s supplier-scoped procurement data** (not merely rendering a page shell). |
| **Route configuration** | `App.tsx` wraps `/supplier/quotes` in `ProtectedRoute` with `allowedRoles={['BUYER','SUPPLIER','ADMIN']}` (dual-side pair). |
| **Current guard logic** | `evaluateRouteAccess` (`ProtectedRoute.tsx` L117–147): for dual-side routes, paths under `/supplier/` require `context.side === 'SUPPLIER'` (platform admin exempt). Buyer `side: 'BUYER'` → `REDIRECT` to `/dashboard` with state clear. |
| **Automated proof in repo** | `protected-route.test.ts` — test *“denies an authenticated buyer… /supplier/quotes (F-RUN2-T4-02)”* expects `REDIRECT` → `/dashboard`. |
| **Data layer if route were reached** | `useSupplierHomeData` → `fetchSupplierInvitations()` → `rfqs_supplier_masked` (`fetch-invitations.ts` L137–140). View definition (`00199`) filters `WHERE private.is_supplier_user_for(ri.supplier_id)`; `REVOKE ALL … FROM anon`; `GRANT SELECT … TO authenticated`. A buyer JWT should see **zero supplier invitation rows**, not peer suppliers’ RFQs. |
| **What buyer might still see without DB rows** | `SupplierQuotesPage.tsx` L58–118: hard-coded **mock** quote cards when `activeQuotes.length === 0` (e.g. “RFQ #0842”, merit score 9.4). Static UI fixtures — **not** cross-org supplier data from PostgREST. |
| **Pass 1 basis** | Run2 session + coarse-role narrative; **not reproduced** in Pass 1; cited matrix without re-reading current `ProtectedRoute`. |
| **Production deploy** | **Not measured** (D-29). Theta bundle may predate repo guard fix. |

**Pass 2 verdict on F-RUN2-T4-02**

| Dimension | Challenge result | Final classification |
|-----------|------------------|----------------------|
| Buyer with resolved `side=BUYER` reaching `/supplier/quotes` | **CODE FIXED** in repo; production session **not tested** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (P2 route/UX if deploy lags; not P1 data leak) |
| Buyer accessing unauthorized supplier RFQ/quote **data** | No reproducible production or staging session; code shows RLS/view scoping | **NOT PROVEN OPEN** (security) |
| Run2 “buyer sees supplier quotes page” on old build | Cannot replay without credentials | **NOT REPRODUCIBLE** in this pass |
| Mock quote fallback | Misleading product integrity | **PRODUCT/UX P2** (related A-08 / C-01 narrative; not database authorization) |
| `side` null after load (`!userSide && (allowsBuyer \|\| allowsSupplier)` fallback, L137) | Unit test allows null side on `/purchase-orders` only; same fallback would allow `/supplier/quotes` if `side` stays unset after `roleLoading` completes | **INSUFFICIENT EVIDENCE** for exploit; if confirmed, **P2 route bug** not P1 data leak |

Pass 1 **PROVEN OPEN P1 (security)** for F-RUN2-T4-02 is **withdrawn** — evidence does not support ongoing unauthorized **supplier data** access; repo guard contradicts Run2-era coarse-role claim.

---

## Challenge of every “FIXED — BEHAVIOURAL VERIFICATION REQUIRED” (Pass 1)

**Rule applied:** No row upgraded to **PROVEN FIXED** (production behaviour). Alternate paths considered (REST PATCH, RPC overload, `auth.uid()` vs profile id, `SECURITY DEFINER`, RLS, cross-org, `service_role` bypass in triggers). **None disproven with reproducible production/staging attacks in this pass.**

| Bypass hypothesis | Applicable controls | Pass 2 result |
|-------------------|---------------------|---------------|
| Anon RPC after **00217** | Wallet, award, admin sweep | Grant layer + **00216** bodies; catalog summary anon=11 public=0 — **still BVR** |
| Authenticated cross-org RPC | Wallet, PO, appoint | **00216** org checks; **BVR** |
| Direct `PATCH rfqs.status` | **00218** | Whitelist + immutable keys; platform admin / `service_role` bypass by design in trigger — **BVR** |
| Direct `INSERT/UPDATE rfq_approval_stages` | **00219** | INSERT blocked; governance columns blocked unless `otp.approval_stage_internal=1` — **BVR** |
| Approval RPC identity | **00216** / **00219** | `v_caller_id := private.get_profile_id()` in tier approval paths — **code aligned**; **BVR** |
| Supplier invoice → PAID | **00216** trigger | **BVR** |
| Trigger “presence” in catalog | RFQ / approval / invoice | Summary catalog only — **not runtime-proven** |

**Downgrades from Pass 1:** Only **F-RUN2-T4-02** (security P1 → not proven open + BVR + product mock).

**Upgrades to PROVEN FIXED:** **0**

---

## RFQ `status` change paths (code/SQL inventory)

| Path | Mechanism | Notes |
|------|-----------|--------|
| Client `openRfq` | `rfq-lifecycle.ts` `.update({ status: 'OPEN' })` from `DRAFT` | Must satisfy **00218** whitelist |
| Client / other updates | `.update({ status: … })` on `rfqs` | Same trigger |
| `advance_rfq_phases()` | Scheduled / authenticated RPC (`00177`) | `SECURITY DEFINER`; internal updates |
| Award / cancel RPCs | e.g. `lock_and_reveal_award_atomic`, cancellation helpers in older migrations | Bypass via `service_role` / admin / trigger depth per **00218** |
| Illegal regression e.g. `EVALUATING→OPEN` | PostgREST | **00218** `rfq_status_transition_allowed` excludes edge — **BVR** |

---

## `rfq_approval_stages` INSERT / UPDATE / DELETE paths

| Path | Pass 2 code evidence |
|------|----------------------|
| PostgREST INSERT | **00219** trigger raises `APPROVAL-STAGE-DIRECT-WRITE` on INSERT |
| PostgREST UPDATE (status, approver, signature, delegation fields) | Blocked unless session flag / bypass roles |
| `submit_rfq_tier_approval_atomic` / reject path in **00219** | Sets `otp.approval_stage_internal=1` before stage UPDATE |
| App client | `approval.ts` — **SELECT** on stages only (no client INSERT found) |
| Workflow population | **D-07**: stages may never be inserted by product flow — PO gate inert (**product**, not direct-write bypass) |

---

## Cross-org reads

| Test | Result |
|------|--------|
| Unauthenticated cross-org table read on production | **NOT TESTED** (no anon table policy probe without credentials) |
| Buyer → `rfqs_supplier_masked` | **CODE**: view scoped to `is_supplier_user_for`; buyer should get empty set — **BVR** |

---

## Eleven anon `EXECUTE` functions (**00217** allowlist)

| Function | Attacker-controlled input escalation (SQL body review only) |
|----------|---------------------------------------------------------------|
| `submit_signup_request` | Returns differentiated `status` (`ONBOARDED` vs `PENDING`) and `REG-…` reference for existing email (**D-26**); not a privilege escalation — **info disclosure** |
| `verify_profile_verification_otp` | Token + code bound; rate limits in **00208** lineage — **no concrete SQL bypass identified without test** |
| `verify_whatsapp_password_reset` | Token/code path — **BVR** |
| `platform_heartbeat`, `service_categories`, `served_cities`, `get_maintenance_status` | Read-only reference — **low risk** |
| `redeem_supplier_magic_link` | Token-hash lookup, rate limits, RFQ status gate (**00037**) — guessing yields `INVALID` — **no proven escalation** |
| `messaging_quote_context`, `submit_messaging_quote` | Session token via `private.quote_session`; RFQ open/deadline/invitation checks — **no proven cross-supplier write without valid session** |
| `complete_supplier_onboarding_atomic` | Token-bound onboarding — **BVR** |

---

## Twenty-two behavioural controls (Pass 1 parity + F-RUN2 deploy check)

| # | Protected operation | Who must / must not | RPC / table | Attack path | Tested this pass | Evidence | Status |
|---|---------------------|----------------------|-------------|-------------|------------------|----------|--------|
| 1 | Wallet credit mint | Anon must not | `credit_buyer_settlement_reward_atomic` | Anon RPC | No (unsafe) | **00216**/**00217**; not in 11-RPC list | **BVR** |
| 2 | Award / reveal / PO | Anon must not | `lock_and_reveal_award_atomic`, `create_purchase_order_from_award` | Anon RPC | No | **00217** revoke | **BVR** |
| 3 | Cross-org wallet credit | Wrong org must not | `credit_buyer_settlement_reward_atomic` | Authenticated RPC | No | Local Docker only (not prod) | **BVR** |
| 4 | RFQ status regression | Buyer must not illegal transition | `rfqs.status` PATCH | PostgREST | No | **00218** + client `rfq-lifecycle.ts` | **BVR** |
| 5 | RFQ immutable keys | Must not reassign org | `rfqs` UPDATE | PostgREST | No | **00218** | **BVR** |
| 6 | Approval stage tamper | Member must not direct-write | `rfq_approval_stages` | PATCH/INSERT | No | **00219** | **BVR** |
| 7 | Supplier invoice PAID | Supplier must not | `invoices.status` | UPDATE | No | **00216** trigger | **BVR** |
| 8 | Org role appoint | Non-owner must not | `appoint_org_role_atomic` | RPC | No | **00216** | **BVR** |
| 9 | Delegation approve | Outsider / expired must not | `submit_rfq_tier_approval_atomic` | RPC + `p_delegation_id` | No | **00219** + local GAP3 | **BVR** |
| 10 | Quorum / COI award | Must not bypass committee | `lock_and_reveal_award_atomic`, `cast_committee_vote` | RPC | No | **00216** | **BVR** |
| 11 | Milestone skip | Supplier must not arbitrary % | `work_orders.progress_percent` | UPDATE | No | **00199** trigger not agent-verified on prod | **INSUFFICIENT EVIDENCE** |
| 12 | Subscription wallet amount | Must not arbitrary ₹ | subscription RPCs | RPC | No | **00216** | **BVR** |
| 13 | `demo_status` anon | Anon must not | `demo_status()` | RPC | No | User catalog anon=false | **BVR** |
| 14 | Anon allowlist drift | Anon must not call admin/wallet | assorted `public` RPCs | RPC | No | Summary catalog 11/0 | **BVR** |
| 15 | Admin RPC as anon | Anon must not | admin/diagnostic RPCs | RPC | No | **00217** | **BVR** |
| 16 | Magic link / messaging quote abuse | Anon must not cross-RFQ | `redeem_supplier_magic_link`, `submit_messaging_quote` | Mutating RPC | No | **00037** token binding | **BVR** |
| 17 | Signup approve as non-admin | Non-admin must not | `admin_review_signup_request` | RPC | No | **00216** body | **BVR** |
| 18 | `get_org_role` NULL gate | Non-member must not pass | role gates in RPCs | RPC | No | **00216** | **BVR** |
| 19 | Profile privilege self-promote | User must not | `profiles` UPDATE | PostgREST | No | **00203** trigger not catalog-verified | **INSUFFICIENT EVIDENCE** |
| 20 | `audit_events` DELETE | Non-admin must not | `audit_events` | DELETE | No | **00201** lineage | **BVR** |
| 21 | Public smoke `/`, `/login`, `/signup` | Observability | static routes | Navigate | No | Browser MCP unavailable Pass 1/2 | **INSUFFICIENT EVIDENCE** |
| 22 | Buyer blocked from `/supplier/quotes` + no supplier data leak | Buyer must not see supplier workspace data | route + `rfqs_supplier_masked` | Direct URL | No prod session | **CODE** guard + tests + view scope; deploy unknown | **BVR** (was misclassified P1 open) |

---

## Reconciliation matrix (Pass 2)

| Finding | Pass-1 Classification | Challenge Result | Evidence | Final Classification |
|---------|----------------------|------------------|----------|----------------------|
| **F-RUN2-T4-02** | **PROVEN OPEN** P1 (security) | Run2 not reproduced; repo dual-side guard denies `side=BUYER`; data via `rfqs_supplier_masked` supplier-scoped; mock UI if empty is not peer data | `ProtectedRoute.tsx` L117–147; `protected-route.test.ts` L211–230; `fetch-invitations.ts` L130–140; `00199` view; `SupplierQuotesPage.tsx` L58–118 | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (route on production); mock fallback **PRODUCT/UX P2**; security data leak **NOT PROVEN OPEN** |
| **F-RUN2-T4-02-MOCK** | (bundled in F-RUN2 narrative) | Static fabricated quotes when zero real rows | `SupplierQuotesPage.tsx` L19, L58–118 | **PRODUCT/UX P2** (misleading; not authorization bypass) |
| D-26 | **PROVEN OPEN** P3 | Black-box not re-run; **00212** `submit_signup_request` still returns `ONBOARDED` vs `PENDING` + `REG-…` for existing email | `00212` L928–945; prior `OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md` | **PROVEN OPEN** P3 (information disclosure) |
| AUD-SEC-001, SEC-1, SEC-2, SEC-3, SEC-4, A-SWEEP, D-02, D-27, D-01, D-03, D-31, A-08, D-04 | **FIXED — BVR** P0/P1 | No production mutating retest; grant/code alignment holds | **00216**/**00217**; user catalog summary; local Docker certs **not** prod | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (unchanged) |
| SEC-5, SEC-6, SEC-7, INV-SUPPLIER, ORG-APPOINT, DELEGATION, QUORUM-COI, SUBSCRIPTION-WALLET, A-R10, D-10/D-11 | **FIXED — BVR** P1 | Same | **00216**/**00219**; migrations lineage | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (unchanged) |
| SM-RFQ-00218, SM-APPROVAL-00219 | **FIXED — BVR** P0 | Trigger presence in summary catalog ≠ runtime deny | **00218**/**00219**; `rfq-lifecycle.ts` | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (unchanged) |
| DEMO-STATUS | **FIXED — BVR** P2 | Anon deny in user catalog | Summary catalog + **00217** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (unchanged) |
| A-R8-AUDITDEL | **FIXED — BVR** P0 | Not executed on prod | **00201** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (unchanged) |
| AUD-SEC-002 | **INSUFFICIENT EVIDENCE** P0 if lag | Agent `migration list` blocked; summary row only | `AccessTokenRequiredError`; `…192326.txt` one row | **INSUFFICIENT EVIDENCE** (unchanged) |
| AUD-SEC-004 | **INSUFFICIENT EVIDENCE** P2 | View grants not in compact capture | Partial user catalog | **INSUFFICIENT EVIDENCE** (unchanged) |
| MILESTONE / ATTACK-011 | **INSUFFICIENT EVIDENCE** P1 | Prod trigger not verified | **00199** narrative | **INSUFFICIENT EVIDENCE** (unchanged) |
| A-R5a | **INSUFFICIENT EVIDENCE** P0 | Trigger not catalog-verified | **00203** | **INSUFFICIENT EVIDENCE** (unchanged) |
| F-RUN2-T4-01 | **INSUFFICIENT EVIDENCE** P1 | Not re-run | Run2 race narrative | **INSUFFICIENT EVIDENCE** (unchanged) |
| CI false-green / D-29 deploy lag | **INSUFFICIENT EVIDENCE** P2 | Theta deploy vs repo not measured | No bundle hash | **INSUFFICIENT EVIDENCE** (unchanged) |
| AUD-SEC-003, A-R5b allowlist | **INTENTIONAL DESIGN** / BVR | Still in `is_platform_admin()` | **00179** | **INTENTIONAL DESIGN** + **BVR** for signup-approve chain (unchanged) |
| D-07 approval stages empty | **PARTIALLY FIXED** P1 product | Workflow gap | Master register | **PARTIALLY FIXED** (product; unchanged) |
| D-01 (black-box fees), D-02 (legal draft) | **PROVEN OPEN** P1 product | Not security authorization | Black-box static content | **PRODUCT/LEGAL PROVEN OPEN** (unchanged; not security P1) |
| Remaining black-box UX (D-03–D-11, Issue 05–27, etc.) | Per Pass 1 §D | No new live tests | Prior audits | **Unchanged** (product/UX/legal/insufficient per Pass 1) |
| AUD-UX-005 `/register` | **FIXED — BVR** | Route-only | Repo routing | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (unchanged) |

---

## Summary counts

| Metric | Pass 1 | Pass 2 |
|--------|--------|--------|
| Previous proven open **security** P0 | 0 | — |
| Previous proven open **security** P1 | 1 (F-RUN2-T4-02) | — |
| New proven open **security** P0 | — | **0** |
| New proven open **security** P1 | — | **0** |
| Downgraded findings | — | **1** (F-RUN2-T4-02 security P1 → BVR + product mock) |
| Findings **proven fixed** (production behaviour) | 0 | **0** |
| Behavioural verification still required | 22 | **22** (includes item 22 = F-RUN2 production route/data boundary) |
| Insufficient evidence | 8 | **8** |
| Product/UX/legal findings | 24 | **24** (+ mock quotes called out under F-RUN2-MOCK, not new security) |
| New migration candidates | 0 | **0** |

---

## Certification block

```
SECURITY RECONCILIATION STATUS: AMBER — NO PROVEN OPEN P0, BUT P1/BEHAVIOURAL VERIFICATION REMAINS
Production migration ceiling (claimed): 00219
Catalog security baseline: ACCEPTED FROM OPERATOR SUMMARY ONLY (agent did not re-query)
Behavioural verification: BLOCKED ON PRODUCTION (no safe mutating tests; no buyer session)
Proven open security P0: 0
Proven open security P1: 0
Proven open information disclosure (non-P0/P1 security): D-26 P3
Behavioural verification required: 22
Insufficient evidence: 8
Product/UX/legal findings: 24
New migration candidates: 0
```

**GREEN** not warranted: extensive P0 paths remain **BVR**; deploy parity unproven.  
**RED** not warranted: no reproducible open **security** P0/P1 in this pass.

*This challenge does not state that OTP is secure.*
