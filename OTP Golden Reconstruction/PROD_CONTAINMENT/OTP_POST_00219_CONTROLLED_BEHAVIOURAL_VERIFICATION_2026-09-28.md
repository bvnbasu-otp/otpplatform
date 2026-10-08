# OTP POST-00219 Controlled Behavioural Verification — 2026-09-28

**Verifier role:** Independent production-safe authorized-vs-unauthorized behavioural verification (not implementer).  
**Mandate:** Falsify security assumptions at runtime where safe; do not infer production security from source alone.  
**Production app:** https://otpplatform-theta.vercel.app  
**Supabase project ref:** `qsuvtcezffomtwzwyrso`  
**Repository migration ceiling (local):** `00219`  
**Date:** 2026-09-28  
**Shell:** PowerShell (no `&&`)

**Production modified:** **NO** (no SQL, RPC, auth sessions, registrations, or business-record mutations).

---

## 1. Inputs read (read-only)

| Document | Purpose |
|----------|---------|
| `OTP_POST_00219_ADVERSARIAL_RECONCILIATION_2026-09-28.md` | Pass 1 reconciliation baseline |
| `OTP_POST_00219_BEHAVIOURAL_TEST_EVIDENCE_2026-09-28.md` | Prior attack catalogue (mostly not executed) |
| `OTP_POST_00219_REMAINING_RISK_REGISTER_2026-09-28.md` | Residual risks |
| `OTP_POST_00219_ADVERSARIAL_CHALLENGE_2026-09-28.md` | Pass 2 challenge; F-RUN2-T4-02 downgrade; 22-control list |
| `supabase/migrations/00216_verified_remediation_p0_p1_security_integrity.sql` | **CODE CONTEXT** |
| `supabase/migrations/00217_revoke_public_execute_default_privileges.sql` | **CODE CONTEXT** |
| `supabase/migrations/00218_rfq_status_transition_whitelist.sql` | **CODE CONTEXT** |
| `supabase/migrations/00219_guard_rfq_approval_stage_direct_write.sql` | **CODE CONTEXT** |

---

## 2. Catalog evidence files (present in repo; not re-queried this pass)

| File | Role |
|------|------|
| `OTP_POST_00219_PRODUCTION_CATALOG_EVIDENCE_20260928_191744.txt` | Operator capture (early) |
| `OTP_POST_00219_PRODUCTION_CATALOG_EVIDENCE_20260928_192326.txt` | Summary row only (`17_FINAL_TARGETED_CHECK`) |
| `OTP_POST_00219_PRODUCTION_CATALOG_EVIDENCE_DETAILED_20260928.txt` | Detailed catalog (operator) |
| `OTP_POST_00219_OBJECT_LEVEL_EVIDENCE_20260928.txt` | Mis-scoped aggregate — **not used as proof** |
| `OTP_POST_00219_SINGLE_RESULT_EVIDENCE_20260928.txt` | Broad dump — **not parsed as compact allowlist** |
| `OTP_POST_00219_COMPACT_READONLY.sql` | Intended readonly catalog script |
| `OTP_POST_00219_USER_CATALOG_READONLY.sql` | User catalog script |
| `OTP_POST_00219_OBJECT_LEVEL_READONLY.sql` | Object-level readonly script |
| `OTP_POST_00219_SINGLE_RESULT_READONLY.sql` | Single-result readonly script |

**Agent re-query:** `supabase migration list --project-ref qsuvtcezffomtwzwyrso` → `AccessTokenRequiredError` (single attempt; no token hunt).

---

## 3. Phase A — production QA identities

| Search target | Result |
|---------------|--------|
| `QA-ORG-A` / `QA-ORG-B` / dedicated production QA org names | **Not found** in repo docs or env templates |
| `manager@greenview.test`, `buyer@greenview.test`, etc. | **Local Docker seeds only** (`OTP_LOCAL_DATABASE_CONTRACT_2026-09-28.md`, `_p0_gaps_evidence.json`) — **not production identities** |
| Env vars named `QA_*`, `OTP_QA_*`, `PRODUCTION_QA_*` in agent shell | **None set** (names only checked; values not read) |
| `.env.production.example`, `apps/web/.env.example` | Template placeholders only; no production QA credential bundle |

**Phase A conclusion:** **No safe dedicated production QA orgs or QA users identified without real-customer credentials.**

**Effect:** All mutating production tests and all authenticated production attack paths **stopped**. No login attempts. No anon mutating RPCs (`submit_signup_request`, OTP verify, magic link redeem, messaging quote submit, supplier onboarding complete).

**Allowed continuation:** CODE CONTEXT endpoint naming; optional unauthenticated public page load; readonly anon RPCs **skipped** (no anon key in agent environment without scraping client bundles — not performed).

---

## 4. CODE CONTEXT — endpoints that would be probed (not runtime evidence)

| Surface | Mechanism | Notes |
|---------|-----------|--------|
| Wallet mint | `POST /rest/v1/rpc/credit_buyer_settlement_reward_atomic` | **00216** body + **00217** anon revoke |
| Award / PO | `rpc/lock_and_reveal_award_atomic`, `create_purchase_order_from_award`, `reveal_award` | Anon deny per **00217** intent |
| RFQ status | `PATCH /rest/v1/rfqs?id=eq.{uuid}` | **00218** `trg_guard_rfq_status` |
| Approval stages | `PATCH /rest/v1/rfq_approval_stages` | **00219** `trg_guard_rfq_approval_stage_write` |
| Invoices | `PATCH /rest/v1/invoices` | **00216** `trg_guard_invoice_supplier_status` |
| Org roles | `rpc/appoint_org_role_atomic` | **00216** OWNER gate |
| Tier approval | `rpc/submit_rfq_tier_approval_atomic` | **00219** internal flag |
| Admin sweep | e.g. `admin_run_diagnostic_query`, `admin_bulk_delete_users` | **00217** revoke pattern |
| Anon allowlist (11) | Per **00217** grants | Read-only candidates: `platform_heartbeat`, `service_categories`, `served_cities`, `get_maintenance_status` |
| Supplier UI | `/supplier/quotes` | `ProtectedRoute` + `rfqs_supplier_masked` (**CODE**); SQ-01/02/03 need buyer + supplier QA sessions |

---

## 5. Tests executed this pass

### TEST-PUB-001 — Landing (anonymous, no form submit)

| Field | Value |
|-------|--------|
| **TEST ID** | TEST-PUB-001 |
| **Environment** | Production Vercel (`otpplatform-theta`) |
| **Actor** | Anonymous visitor (no cookies established) |
| **Expected** | HTTP 200; HTML shell loads |
| **Actual** | HTTP **200** (`Invoke-WebRequest` GET `/`) |
| **UI** | Not inspected (browser MCP unavailable) |
| **Backend** | Static/hosted frontend response only |
| **DB** | No access |
| **Before/after** | N/A |
| **Classification** | **INSUFFICIENT EVIDENCE** for security controls (availability smoke only) |

### TEST-PUB-002 — Login page load

| Field | Value |
|-------|--------|
| **TEST ID** | TEST-PUB-002 |
| **Environment** | Production |
| **Actor** | Anonymous |
| **Expected** | HTTP 200; login route reachable |
| **Actual** | HTTP **200** GET `/login` |
| **UI** | Not inspected |
| **Backend** | Static/hosted |
| **DB** | No access |
| **Before/after** | N/A |
| **Classification** | **INSUFFICIENT EVIDENCE** (security) |

### TEST-PUB-003 — Signup page load

| Field | Value |
|-------|--------|
| **TEST ID** | TEST-PUB-003 |
| **Environment** | Production |
| **Actor** | Anonymous |
| **Expected** | HTTP 200; signup route reachable |
| **Actual** | HTTP **200** GET `/signup` |
| **UI** | Not inspected |
| **Backend** | Static/hosted |
| **DB** | No access |
| **Before/after** | N/A |
| **Classification** | **INSUFFICIENT EVIDENCE** (security) |

### ATTACK-001 through ATTACK-018 (matrix controls)

| Field | Value |
|-------|--------|
| **ACTUAL** | **NOT EXECUTED** — Phase A: no safe production QA identities; mutating or authenticated production probes forbidden |
| **Classification** | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** (per control row in matrix file) |

### SQ-01 / SQ-02 / SQ-03 (`/supplier/quotes`)

| Field | Value |
|-------|--------|
| **ACTUAL** | **NOT EXECUTED** — requires genuine buyer QA session and supplier QA session |
| **Classification** | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **CODE CONTEXT** | `ProtectedRoute.tsx` dual-side guard; `protected-route.test.ts` F-RUN2-T4-02; `fetch-invitations.ts` → `rfqs_supplier_masked` — **not PROVEN SECURE** without production sessions |

---

## 6. Attempt counts

| Metric | Count |
|--------|------:|
| Authorized behavioural tests attempted (authz success path) | **0** |
| Unauthorized behavioural tests attempted (denial path) | **0** |
| Public read-only HTTP smoke (non-security) | **3** |
| Control groups A–O with both sides proven | **0** |
| Control groups blocked (safe env required) | **15** (all groups; no partial two-sided proof) |
| Confirmed behavioural security gaps (unauthorized success) | **0** |

---

## 7. Position vs Pass 2 hypothesis

Pass 2 hypothesis (not upgraded by this pass): **security P0 open 0**, **security P1 open 0**, **F-RUN2-T4-02** requires production behavioural verification (not **PROVEN OPEN** as data leak), **~22** runtime controls still unverified.

This pass **did not falsify** or **confirm** backend authorization at runtime. No unauthorized mutation or protected data return was observed because **no authz probes ran**.

---

## 8. Verdict

**AMBER — NO CONFIRMED CRITICAL GAP, BUT BEHAVIOURAL COVERAGE REMAINS**

GREEN is **forbidden**: P0 controls were not tested on both authorized-success and unauthorized-denial axes.

RED is **not** warranted: no unauthorized actor succeeded in a executed test.

---

## 9. Metric block

```
BEHAVIOURAL VERIFICATION STATUS: AMBER — NO CONFIRMED CRITICAL GAP, BUT BEHAVIOURAL COVERAGE REMAINS
Production app: https://otpplatform-theta.vercel.app
Production data modified: NO
Phase A safe production QA identities: NONE IDENTIFIED
Pass 2 hypothesis (unchanged by runtime proof): security P0 open 0 | security P1 open 0
F-RUN2-T4-02: behavioural verification required (not reproduced on production)
Behavioural controls unverified at runtime (hypothesis): ~22
Control groups A–O both-sided proven: 0
Authorized behavioural tests attempted: 0
Unauthorized behavioural tests attempted: 0
Behavioural tests blocked (safe env): 22+ (full matrix; see matrix file)
Confirmed behavioural security gaps P0: 0
Confirmed behavioural security gaps P1: 0
Confirmed behavioural security gaps P2: 0
Confirmed behavioural security gaps P3: 0
Public smoke only (non-security): 3
Supabase migration list (agent): BLOCKED (AccessTokenRequiredError)
```

*This report does not state that OTP is secure.*
