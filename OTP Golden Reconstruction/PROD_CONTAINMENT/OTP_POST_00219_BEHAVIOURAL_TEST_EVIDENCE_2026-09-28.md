# OTP POST-00219 Behavioural Test Evidence — 2026-09-28

**Scope:** Adversarial paths considered for production reconciliation.  
**Production modified:** **NO**  
**Mutating RPCs on production:** **NONE**  
**Authenticated production sessions:** **NONE** created or used.

---

## Environment notes

| Check | Result |
|-------|--------|
| `supabase migration list --project-ref qsuvtcezffomtwzwyrso` | **NOT EXECUTED** — failed `AccessTokenRequiredError` (single attempt) |
| Catalog SQL on production | **NOT EXECUTED** by this agent (operator user-captured catalog used in reconciliation) |
| Browser: `https://otpplatform-theta.vercel.app/` | **NOT TESTED** — MCP browser reported no tab / navigate failure |
| Browser: `/login`, `/signup` (no submit) | **NOT TESTED** |
| Local Docker `127.0.0.1:54322` | **NOT USED** as production evidence (per mandate) |

Prior black-box evidence (`OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md`) is cited only where noted; it is not re-run here.

---

## Attack records

### ATTACK-001 — Anon wallet mint

| Field | Value |
|-------|--------|
| **ATTACK** | Wallet credit without platform fee |
| **ACTOR** | `anon` |
| **TARGET** | `public.credit_buyer_settlement_reward_atomic` |
| **ACTION** | `rpc` with forged org/fee parameters |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Permission denied or business rule rejection |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00216`, `00217`; **LIVE CATALOG — USER EVIDENCE** (not in 11-RPC allowlist) |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-002 — Anon award / reveal / PO

| Field | Value |
|-------|--------|
| **ATTACK** | Force award reveal or PO creation |
| **ACTOR** | `anon` |
| **TARGET** | `lock_and_reveal_award_atomic`, `create_purchase_order_from_award`, `reveal_award` |
| **ACTION** | PostgREST RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | `permission denied` for anon |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00216` `REVOKE … FROM anon`; **LIVE CATALOG — USER EVIDENCE** |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-003 — Authenticated cross-org wallet credit

| Field | Value |
|-------|--------|
| **ATTACK** | Credit another org’s wallet using stolen fee id |
| **ACTOR** | `authenticated` (non-admin, wrong org) |
| **TARGET** | `credit_buyer_settlement_reward_atomic` |
| **ACTION** | RPC with another org’s `platform_fee_tx_id` |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** (needs fixture rows / accounts) |
| **EXPECTED** | Exception: fee not found / not belong |
| **ACTUAL** | **NOT EXECUTED — NO AUTH** |
| **EVIDENCE** | Local `scripts/p0-gaps-contract-run.mjs` **GAP1-*** PASS on Docker only (`OTP_REMEDIATION_CERTIFICATION_2026-09-28.md`) |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-004 — RFQ status direct update (PostgREST regression)

| Field | Value |
|-------|--------|
| **ATTACK** | Re-open evaluation (`EVALUATING` → `OPEN`) via table API |
| **ACTOR** | `authenticated` buyer JWT with UPDATE on own RFQ |
| **TARGET** | `public.rfqs.status` |
| **ACTION** | `PATCH` / `.update({ status: 'OPEN' })` |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | SQLSTATE error `RFQ-STATUS-TRANSITION` from `private.guard_rfq_status_transition()` |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **CODE EVIDENCE** client path: `apps/web/src/features/requirement/api/rfq-lifecycle.ts` uses `.from('rfqs').update({ status: … })`; **MIGRATION/CODE** `00218` whitelist excludes `EVALUATING→OPEN`; **LIVE CATALOG — USER EVIDENCE** trigger `trg_guard_rfq_status` |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-005 — RFQ immutable fields

| Field | Value |
|-------|--------|
| **ATTACK** | Reassign RFQ to another org via direct update |
| **ACTOR** | `authenticated` |
| **TARGET** | `rfqs.organization_id` / `requirement_id` / `created_by` |
| **ACTION** | Direct UPDATE |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | `RFQ-IMMUTABLE` |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00218` |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-006 — Approval stage direct write

| Field | Value |
|-------|--------|
| **ATTACK** | Mark approval stage APPROVED without RPC |
| **ACTOR** | `authenticated` org member |
| **TARGET** | `public.rfq_approval_stages` |
| **ACTION** | `UPDATE status`, `approver_profile_id`, signature fields |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | `APPROVAL-STAGE-DIRECT-WRITE` unless `otp.approval_stage_internal=1` |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00219`; app **SELECT-only** on stages in `apps/web/src/features/award/api/approval.ts`; **LIVE CATALOG — USER EVIDENCE** trigger `trg_guard_rfq_approval_stage_write` |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-007 — Supplier invoice self-approve

| Field | Value |
|-------|--------|
| **ATTACK** | Supplier sets invoice `PAID` |
| **ACTOR** | `authenticated` supplier |
| **TARGET** | `public.invoices.status` |
| **ACTION** | Direct UPDATE / client `.update({ status: 'PAID' })` |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Trigger `INV-SUPPLIER-STATUS` rejection |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00216` `private.guard_invoice_supplier_status()` |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-008 — Org role appointment by member

| Field | Value |
|-------|--------|
| **ATTACK** | Non-owner appoints MANAGER/OWNER |
| **ACTOR** | `authenticated` member |
| **TARGET** | `appoint_org_role_atomic` |
| **ACTION** | RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Authorization exception (OWNER-only per **00216**) |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00216`; anon deny per user catalog |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-009 — Delegation identity spoof

| Field | Value |
|-------|--------|
| **ATTACK** | Approve using expired or foreign delegation |
| **ACTOR** | `authenticated` delegate / outsider |
| **TARGET** | `submit_rfq_tier_approval_atomic` |
| **ACTION** | RPC with `p_delegation_id` |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Delegation validation errors in RPC body |
| **ACTUAL** | **NOT EXECUTED — NO AUTH** |
| **EVIDENCE** | Local `P0-GAP-3` PASS (Docker); **MIGRATION/CODE** `00219` |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-010 — Quorum / COI bypass on award lock

| Field | Value |
|-------|--------|
| **ATTACK** | Lock award without committee quorum or with COI voter |
| **ACTOR** | `authenticated` buyer manager |
| **TARGET** | `lock_and_reveal_award_atomic`, `cast_committee_vote` |
| **ACTION** | RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Quorum / COI errors in **00216** bodies |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00216`; local GAP2/GAP3 |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-011 — Milestone percent skip

| Field | Value |
|-------|--------|
| **ATTACK** | Supplier sets `progress_percent` outside 0/25/50/75/100 |
| **ACTOR** | `authenticated` supplier |
| **TARGET** | `work_orders.progress_percent` |
| **ACTION** | UPDATE |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Trigger rejection if `00199` trigger deployed |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | Master register Issue 11 / **00199** text; production trigger not agent-verified |
| **CLASSIFICATION** | **INSUFFICIENT EVIDENCE** |

---

### ATTACK-012 — Subscription / wallet arbitrary amount

| Field | Value |
|-------|--------|
| **ATTACK** | Credit ₹1 toward subscription |
| **ACTOR** | `authenticated` |
| **TARGET** | `apply_wallet_credits_to_subscription_atomic`, `process_subscription_payment` |
| **ACTION** | RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Catalog amount mismatch error |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00216`; local PASS |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-013 — Anon `demo_status`

| Field | Value |
|-------|--------|
| **ATTACK** | Read demo flag without login |
| **ACTOR** | `anon` |
| **TARGET** | `demo_status()` |
| **ACTION** | RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** (staging preferred) |
| **EXPECTED** | Permission denied |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **LIVE CATALOG — USER EVIDENCE** anon=false; app calls as authenticated in `apps/web/src/features/demo/api/demo.ts` |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-014 — Anon allowlist drift (11 functions)

| Field | Value |
|-------|--------|
| **ATTACK** | Call sensitive RPC not in allowlist |
| **ACTOR** | `anon` |
| **TARGET** | e.g. `get_organization_wallet`, `admin_execute_service_action` |
| **ACTION** | RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Permission denied |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **LIVE CATALOG — USER EVIDENCE** counts 11/0; summary row `…192326.txt` (not object-level) |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-015 — Privileged admin RPC as anon

| Field | Value |
|-------|--------|
| **ATTACK** | `admin_run_diagnostic_query` or signup approval as anon |
| **ACTOR** | `anon` |
| **TARGET** | Admin / diagnostic RPCs |
| **ACTION** | RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EXPECTED** | Permission denied post-**00217** |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** `00217`; `PROD_CONTAINMENT/README.md` historical exposure |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-016 — Redeem magic link / submit messaging quote (production)

| Field | Value |
|-------|--------|
| **ATTACK** | Abuse token flows to alter unrelated RFQ |
| **ACTOR** | `anon` with guessed token |
| **TARGET** | `redeem_supplier_magic_link`, `submit_messaging_quote` |
| **ACTION** | Mutating RPC |
| **RESULT** | **NOT EXECUTED — UNSAFE ON PRODUCTION** (mutating; needs token) |
| **EXPECTED** | Token-bound authorization inside RPC |
| **ACTUAL** | **NOT EXECUTED — UNSAFE ON PRODUCTION** |
| **EVIDENCE** | **MIGRATION/CODE** session token design `00037`; allowlist includes RPCs per user catalog |
| **CLASSIFICATION** | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** |

---

### ATTACK-017 — Public site read-only smoke

| Field | Value |
|-------|--------|
| **ATTACK** | N/A (observability) |
| **ACTOR** | Anonymous visitor |
| **TARGET** | `/`, `/login`, `/signup` |
| **ACTION** | Navigate only; no form submit |
| **RESULT** | **NOT TESTED** |
| **EXPECTED** | Pages render; no console auth errors on static load |
| **ACTUAL** | **NOT TESTED** |
| **EVIDENCE** | Browser MCP failure this session; prior black-box covered signup submit (out of scope for this pass) |
| **CLASSIFICATION** | **INSUFFICIENT EVIDENCE** |

---

### ATTACK-018 — Signup enumeration (non-destructive read of public RPC behaviour)

| Field | Value |
|-------|--------|
| **ATTACK** | Infer existing registration |
| **ACTOR** | `anon` |
| **TARGET** | `submit_signup_request` |
| **ACTION** | Repeat submit with known email |
| **RESULT** | **NOT EXECUTED ON PRODUCTION** (prior black-box already documented) |
| **EXPECTED** | Generic response |
| **ACTUAL** | Prior audit: reveals status + REG reference (`OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md` D-26 narrative) |
| **EVIDENCE** | **LIVE CATALOG — USER EVIDENCE** (RPC on allowlist); black-box **USER EVIDENCE** |
| **CLASSIFICATION** | **PROVEN OPEN** (information disclosure, P3) |

---

## Summary

| Classification | Count |
|----------------|------:|
| FIXED — BEHAVIOURAL VERIFICATION REQUIRED | 14 |
| NOT EXECUTED / NOT TESTED (blocked) | 16 attack rows with no live denial proof |
| INSUFFICIENT EVIDENCE | 2 |
| PROVEN OPEN | 1 (enumeration, prior black-box) |

**Behavioural verification for P0 paths:** **BLOCKED** (no safe production execution; no staging session in this pass).
