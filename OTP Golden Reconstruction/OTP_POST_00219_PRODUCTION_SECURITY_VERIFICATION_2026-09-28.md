# POST-00219 Production Security Verification

**Date:** 2026-09-28  
**Verifier role:** Read-only production security verification (no fixes, no mutations)  
**Project ref:** `qsuvtcezffomtwzwyrso`  
**App URL:** https://otpplatform-theta.vercel.app  

---

## Executive Result

**POST-00219 PRODUCTION SECURITY VERIFICATION — BLOCKED**

Production catalog, migration ceiling, and privilege invariants could not be verified because the Supabase CLI returned `AccessTokenRequiredError` on every Management API call. Verification stopped per protocol; no tokens were sought, no `supabase login` was run, and no production SQL was executed.

---

## Environment

| Item | Value |
|------|--------|
| Workspace | `G:\My Drive\otp` |
| Shell | PowerShell (no `&&` used) |
| CLI paths tried | `supabase` (on PATH), `C:\Users\bloganat\AppData\Local\OtpTools\supabase.exe` |
| Project ref | `qsuvtcezffomtwzwyrso` |
| Intended query path | `supabase db query --project-ref qsuvtcezffomtwzwyrso` (SELECT / catalog only — not reached) |
| Production data modified | **NO** |
| Application deployed | **NO** |
| User claim | CLI authenticated; production ceiling 00219 — **not confirmed in this session** |

**Auth evidence (both CLIs, identical):**

```
AccessTokenRequiredError: Access token not provided. Supply an access token by running `supabase login` or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

---

## Migration Evidence

### Step 1 — Live remote migration list

**Command:** `supabase migration list --project-ref qsuvtcezffomtwzwyrso`  
**Result:** **BLOCKED** (exit code 1, `AccessTokenRequiredError`)

**Expected:** Local\|Remote pairs `00215|00215` through `00219|00219` with remote ceiling **00219**.

**Observed remote tail:** **Not available** (Management API unreachable without access token).

**Decision:** Per instructions, verification **STOPPED** before catalog or browser certification. Status uses blocked ceiling messaging; certification status is **BLOCKED** (not PASS).

---

## Repository Verification (00217 — not production proof)

**File:** `supabase/migrations/00217_revoke_public_execute_default_privileges.sql`  
**Label:** **REPOSITORY VERIFIED**

| Check | Result |
|-------|--------|
| `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC` | Present |
| `REVOKE EXECUTE ... FROM anon` then restore allowlist | Present |
| Anon `GRANT EXECUTE` count | **11** functions |
| `demo_status` in anon grants | **Not granted** (not mentioned in file) |

**Eleven repository anon grants (signatures as in migration):**

1. `submit_signup_request(jsonb)`
2. `verify_profile_verification_otp(text, text)`
3. `verify_whatsapp_password_reset(text, text, text)`
4. `platform_heartbeat()`
5. `service_categories()`
6. `served_cities()`
7. `get_maintenance_status()`
8. `redeem_supplier_magic_link(text, text)`
9. `messaging_quote_context(text)`
10. `submit_messaging_quote(text, jsonb)`
11. `complete_supplier_onboarding_atomic(text, text, text, text, text, jsonb, text, text, text)`

---

## Anonymous Execute Inventory (production)

**Status:** **BLOCKED**

Complete production list of `anon` `EXECUTE` on `public` routines was **not** queried. No count, no extras list, no PASS/FAIL on allowlist parity.

---

## PUBLIC Execute Inventory (production)

**Status:** **BLOCKED**

Production `PUBLIC` `EXECUTE` on `public` schema routines was **not** queried. Violation count unknown.

---

## Sensitive Function Verification (production)

**Status:** **BLOCKED** (no `has_function_privilege` / catalog queries executed)

| Surface | Function(s) (expected to discover on prod) | anon EXECUTE | PUBLIC EXECUTE | Production result |
|---------|-------------------------------------------|--------------|----------------|-------------------|
| Wallet / reward | `credit_buyer_settlement_reward_atomic`, `get_organization_wallet`, overloads | Deny | Deny | **BLOCKED** |
| Award reveal | `lock_and_reveal_award_atomic`, `reveal_award` | Deny | Deny | **BLOCKED** |
| PO | `create_purchase_order_from_award` | Deny | Deny | **BLOCKED** |
| Deploy / dry-run | Names matching deploy, dry_run, migration, admin_run_diagnostic | Report if exist | Report if exist | **BLOCKED** |
| Org authority | `appoint_org_role_atomic` | Deny | Deny | **BLOCKED** |
| Demo | `demo_status` | Deny | Deny | **BLOCKED** |

**Sensitive-function protection (certification line):** **BLOCKED**

---

## RFQ Status Guard (00218)

**Production:** **BLOCKED** — `pg_trigger` / `pg_proc` / `pg_get_functiondef` on production not queried.

**REPOSITORY VERIFIED (migration `00218_rfq_status_transition_whitelist.sql`):**

- Trigger: `trg_guard_rfq_status` on `public.rfqs` → `private.guard_rfq_status_transition()`
- Whitelist helper: `private.rfq_status_transition_allowed(old, new)`
- **EVALUATING → OPEN:** not in whitelist (EVALUATING allows `AWARDED`, `CANCELLED` only)
- Immutability in guard: `organization_id`, `requirement_id`, `created_by` cannot change on direct update

**00218 RFQ transition guard (certification):** **BLOCKED**

---

## RFQ Approval Guard (00219)

**Production:** **BLOCKED** — trigger and function source on production not read.

**REPOSITORY VERIFIED (migration `00219_guard_rfq_approval_stage_direct_write.sql`):**

- Trigger: `trg_guard_rfq_approval_stage_write` on `public.rfq_approval_stages`
- Function: `private.guard_rfq_approval_stage_direct_write()`
- Direct JWT/client writes blocked unless bypass: `service_role`, platform admin, `current_setting('otp.approval_stage_internal', true) = '1'`, or DB superuser roles
- INSERT via client raises `APPROVAL-STAGE-DIRECT-WRITE`

**00219 RFQ approval-stage guard (certification):** **BLOCKED**

---

## RLS

**Production:** **BLOCKED** — `pg_class.relrowsecurity`, `pg_policies` not queried on production.

**Tables of interest (intended):** `rfqs`, `rfq_approval_stages`, `invoices`, `purchase_orders`, `organization_wallets` / `wallets`

**RLS/policy verification (certification):** **BLOCKED**

---

## Function Security Model

**Production:** **BLOCKED** — no live `prosecdef`, owner, `proconfig` (`search_path`), or body authorization review on sensitive RPCs.

**Repository note:** 00218/00219 guard functions use `SECURITY DEFINER` with explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated` on private guards (repository only).

---

## Application Compatibility

### Supplier public flow — **REPOSITORY VERIFIED** (code callers)

| RPC | Application evidence |
|-----|----------------------|
| `redeem_supplier_magic_link` | `apps/web/src/features/quick-quote/api/quick-quote.ts` |
| `messaging_quote_context` | Same |
| `submit_messaging_quote` | Same |
| `complete_supplier_onboarding_atomic` | `apps/web/src/features/supplier/pages/SupplierAwardOnboardingPage.tsx` |

**Production catalog anon execute on those four:** **NOT PROVEN** (blocked).

**Supplier public flow compatibility (certification):** **BLOCKED**

### Browser smoke

**Attempt:** `cursor-ide-browser` navigate to https://otpplatform-theta.vercel.app/  
**Result:** **NOT PROVEN** — tool reported no browser tab available; landing/login/registration were not observed live.

### `demo_status` in app

`apps/web/src/features/demo/api/demo.ts` calls `supabase.rpc('demo_status')`. Repository 00217 does not re-grant anon on `demo_status`; production deny state **not verified**.

---

## Findings

| ID | Severity | Object | Expected | Observed | Evidence | Impact | Next action |
|----|----------|--------|----------|----------|----------|--------|-------------|
| F-001 | **Critical** | Supabase Management API / CLI session | Authenticated CLI able to `migration list` and read-only `db query` | `AccessTokenRequiredError` on `migration list` (both CLI paths) | CLI stderr JSON error, exit 1 | No production security certification possible | Provide `SUPABASE_ACCESS_TOKEN` (or logged-in CLI) **in the agent execution environment**; re-run verification without changing production |
| F-002 | High | Remote migration ceiling | Remote **00219** | Unknown | Step 1 blocked | Cannot confirm remediation deployed | After F-001 fixed, run `supabase migration list --project-ref qsuvtcezffomtwzwyrso` |
| F-003 | High | Anon/PUBLIC execute invariants | Live catalog matches 11-anon allowlist, PUBLIC closed, sensitive deny | Unknown | No SQL session | Privilege regression undetected | After F-001, run catalog queries via `supabase db query --project-ref ...` (SELECT only) |
| F-004 | Medium | Browser smoke | Non-mutating pages load | Not observed | Browser MCP unavailable | UX-only gap | Manual or working browser MCP smoke |
| F-005 | Low | `demo_status` vs 00217 repo | Repo omits anon grant; prod should deny anon | Unknown | Repo only | Demo flag exposure unverified on prod | Catalog `has_function_privilege` after F-001 |

**Finding counts:** Critical **1**, High **2**, Medium **1**, Low **1**

---

## Evidence Classification

| Area | Classification |
|------|----------------|
| Migration list (remote 00219) | **BLOCKED** |
| 00217 SQL file | **REPOSITORY VERIFIED** |
| Anon execute inventory | **BLOCKED** |
| PUBLIC execute inventory | **BLOCKED** |
| Sensitive RPC privileges | **BLOCKED** |
| 00218 guards on production | **BLOCKED** (repo: **REPOSITORY VERIFIED**) |
| 00219 guards on production | **BLOCKED** (repo: **REPOSITORY VERIFIED**) |
| RLS | **BLOCKED** |
| Supplier flow code ↔ RPC names | **REPOSITORY VERIFIED** |
| Supplier flow anon grants on prod | **BLOCKED** |
| Browser smoke | **NOT PROVEN** |
| Local Docker 54322 | **Not used** |

---

## Certification

| Criterion | Result |
|-----------|--------|
| Remote migration ceiling 00219 | **BLOCKED** |
| PUBLIC execute closed (production) | **BLOCKED** |
| Anon allowlist exactly 11 (production) | **BLOCKED** |
| `demo_status` denied anon/PUBLIC (production) | **BLOCKED** |
| Sensitive functions denied anon/PUBLIC (production) | **BLOCKED** |
| 00218 guard present (production) | **BLOCKED** |
| 00219 guard present (production) | **BLOCKED** |

**Overall certification:** **BLOCKED** — insufficient live production evidence.

---

## Comparison Matrix

| Invariant | Expected (post-00219) | Production verified | Repo / other |
|-----------|----------------------|---------------------|--------------|
| Migration remote ceiling | 00219 | **BLOCKED** | — |
| PUBLIC EXECUTE on public app RPCs | 0 (or justified exceptions) | **BLOCKED** | 00217 revokes PUBLIC |
| Anon EXECUTE count | 11, no extras | **BLOCKED** | 11 grants in 00217 |
| `demo_status` anon | Denied | **BLOCKED** | Not in 00217 grants |
| Wallet / award / PO / org RPCs anon | Denied | **BLOCKED** | — |
| `trg_guard_rfq_status` + whitelist | Present; no EVALUATING→OPEN | **BLOCKED** | **REPOSITORY VERIFIED** |
| `trg_guard_rfq_approval_stage_write` | Present; JWT direct write blocked | **BLOCKED** | **REPOSITORY VERIFIED** |
| RLS no `USING (true)` for anon UPDATE/DELETE | No unrestricted policies | **BLOCKED** | — |
| Supplier `/q/` RPC quartet | Anon execute + code calls | **BLOCKED** / **REPOSITORY VERIFIED** (code only) |

---

## Closing Status Block

POST-00219 PRODUCTION SECURITY VERIFICATION — **BLOCKED**

Production migration ceiling:  
**BLOCKED**

Anonymous EXECUTE allowlist:  
**BLOCKED**

Expected anonymous functions:  
11

Unexpected anonymous functions:  
**BLOCKED**

PUBLIC EXECUTE violations:  
**BLOCKED**

Sensitive-function protection:  
**BLOCKED**

00218 RFQ transition guard:  
**BLOCKED**

00219 RFQ approval-stage guard:  
**BLOCKED**

Supplier public flow compatibility:  
**BLOCKED**

RLS/policy verification:  
**BLOCKED**

Critical findings:  
1

High findings:  
2

Medium findings:  
1

Low findings:  
1

Production modified during verification:  
NO

Application deployed during verification:  
NO

Report:  
`OTP Golden Reconstruction/OTP_POST_00219_PRODUCTION_SECURITY_VERIFICATION_2026-09-28.md`
