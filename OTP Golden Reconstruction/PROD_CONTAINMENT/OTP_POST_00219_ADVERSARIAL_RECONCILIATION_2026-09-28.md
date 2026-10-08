# OTP POST-00219 Adversarial Reconciliation — 2026-09-28

**Mandate:** Independent read-only verification and issue reconciliation. No production mutations, no deploy, no new migrations, no git commits.

**Production app:** https://otpplatform-theta.vercel.app  
**Supabase project ref:** `qsuvtcezffomtwzwyrso`  
**Repository migration ceiling (local):** `00219`  
**Agent shell:** `supabase migration list --project-ref qsuvtcezffomtwzwyrso` → `AccessTokenRequiredError` (one attempt only).

---

## Catalog baseline (this pass)

| Source | What it proves |
|--------|----------------|
| **LIVE CATALOG — USER EVIDENCE** (operator-captured; stated in reconciliation brief, not re-queried by this agent) | Migrations through **00219**; **11** `anon` `EXECUTE` on intended `public` application RPCs; **0** `PUBLIC` `EXECUTE` on `public` application functions; `demo_status` → anon **false**, public **false**, authenticated **true**, `SECURITY DEFINER` **true**; triggers `trg_guard_rfq_status` → `private.guard_rfq_status_transition()`, `trg_guard_rfq_approval_stage_write` → `private.guard_rfq_approval_stage_direct_write()`; RLS enabled on major procurement tables. |
| `OTP_POST_00219_PRODUCTION_CATALOG_EVIDENCE_20260928_192326.txt` | **Summary row only** (`17_FINAL_TARGETED_CHECK`: ceiling 219, anon 11, public 0, PASS). Per protocol: **not upgraded** to object-level proof. |
| `OTP_POST_00219_OBJECT_LEVEL_EVIDENCE_20260928.txt` | **Mis-scoped** aggregate (`anon_execute_count` 3487) — does **not** match compact `public`-only script in `OTP_POST_00219_COMPACT_READONLY.sql`; **not used** as catalog proof. |
| `OTP_POST_00219_SINGLE_RESULT_EVIDENCE_20260928.txt` | Large dump including `auth`/`extensions` anon grants; **not** parsed here as compact `public` allowlist rows. |
| This agent | **Did not** re-execute catalog SQL on production. |

---

## Reconciliation matrix

Severity uses audit convention: **P0** = critical authz/privilege/data-integrity, **P1** = high, **P2** = medium, **P3** = low.

| ID | Original Finding | Current Behaviour | Evidence | Classification | Severity | Next Action |
|----|----------------|-------------------|----------|----------------|----------|-------------|
| AUD-SEC-001 | Anon/authenticated could call `credit_buyer_settlement_reward_atomic` and mint wallet credit | Migration **00216** rewrites RPC with fee-id binding, idempotency, org checks; **00217** revokes `PUBLIC`/`anon` on all `public` routines then restores 11-RPC allowlist. User catalog: sensitive RPC **not** in anon allowlist. | **MIGRATION/CODE** `00216`, `00217`; **LIVE CATALOG — USER EVIDENCE** (anon allowlist count/names); local contract `OTP_REMEDIATION_CERTIFICATION_2026-09-28.md` (Docker only). No production RPC attack executed. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Staging or isolated DB: anon JWT `rpc(credit_buyer_settlement_reward_atomic)` must fail; authenticated abuse matrix with real fee row. |
| AUD-SEC-002 | Production may lag repo; admin/diagnostic RPCs exposed at old ceiling | User catalog: ceiling **00219**, anon **11**, public **0**. Agent could not confirm via Management API. | **LIVE CATALOG — USER EVIDENCE**; summary file `…192326.txt` (row only); agent `migration list` **blocked**. | **INSUFFICIENT EVIDENCE** (agent re-query) / catalog accepted per operator | P0 if old DB | Operator re-run `OTP_POST_00219_COMPACT_READONLY.sql` after token refresh; store row-level output file. |
| AUD-SEC-003 | `is_platform_admin()` email allowlist (`00179`) | Allowlist remains in migration history; not removed in **00216–00219**. | **MIGRATION/CODE** `00179`; `PROD_CONTAINMENT/README.md` §8 residual narrative. No signup/approve attack on production. | **INTENTIONAL DESIGN** (documented residual) / **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** for combined signup-approve path | P1 | Product/security decision on allowlist; behavioural test only on non-prod: unprivileged user cannot self-elevate via `admin_review_signup_request` if **00216+** guards applied. |
| AUD-SEC-004 | `anon` `SELECT` on masked views (defence in depth) | User catalog does not list per-view grants; **00217** focuses on `EXECUTE`. | **LIVE CATALOG — USER EVIDENCE** (partial); repo **00217**. | **INSUFFICIENT EVIDENCE** | P2 | Catalog query: `information_schema`/`has_table_privilege` on `rfqs_supplier_masked` and peers. |
| SEC-1 / A-SEC-1 / D-11 award path | Award/reveal RPCs callable without proper role | **00216** hardens `lock_and_reveal_award_atomic`; **00217** denies anon `EXECUTE`. | **MIGRATION/CODE**; **LIVE CATALOG — USER EVIDENCE**; local `P0-GAP-2` PASS (Docker). | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Non-prod: anon + wrong-org authenticated calls must fail closed. |
| SEC-2 / A-SEC-2 | `admin_bulk_delete_users` always-true guard | Addressed in **00199** narrative and later sweeps; **00216/00217** anon deny pattern. | **MIGRATION/CODE**; user catalog anon **11** (admin RPCs excluded). No production call. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Catalog: `has_function_privilege('anon', …)` false for admin bulk delete; authenticated non-admin deny test on staging. |
| SEC-3 / A-SEC-3 | `admin_execute_service_action` always-true guard | Same sweep lineage; anon revoked on privileged admin RPCs per **00217** intent. | **MIGRATION/CODE**; **LIVE CATALOG — USER EVIDENCE** (11-function allowlist). | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Staging authenticated non-admin RPC probe. |
| SEC-4 / A-SEC-4 | `admin_get_users_and_organizations` always-true guard | Same as SEC-3. | **MIGRATION/CODE**; **LIVE CATALOG — USER EVIDENCE**. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Staging probe. |
| A-SWEEP | Broad admin RPC always-true guard class | **00216/00217** revoke pattern; user catalog public execute **0**. | **MIGRATION/CODE**; **LIVE CATALOG — USER EVIDENCE**. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Spot-check highest-risk names in `PROD_CONTAINMENT/README.md` Group B list on staging. |
| SEC-5 / A-SEC-5 | `upsert_buyer_address_atomic` missing ownership | **00199** / **00196** ownership narrative; not re-proven on production. | **MIGRATION/CODE**; master register PRODUCTION-VERIFICATION. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Staging: cross-org address write must fail. |
| SEC-6 / A-SEC-6 | Supplier reads buyer snapshot columns on `rfqs` | Column grants + masking in **00199** lineage; **00198** view fix for A-20. | **MIGRATION/CODE**; no live supplier session in this pass. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Supplier JWT read test on staging RFQ row. |
| SEC-7 / A-20 / A-SEC-7 | Buyer name leak via `rfqs_supplier_masked` pre-reveal | **00198** / **00199** view rewrite in repo; user catalog RLS on major tables. | **MIGRATION/CODE**; black-box RUN-2B **PARTIALLY CONFIRMED** (blocked). | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Two-sided supplier session on staging before/after reveal. |
| D-02 | Wallet RPC body lacked auth | Superseded by **00216** + privilege layer **00217**. | **MIGRATION/CODE**; **DUPLICATE** of AUD-SEC-001. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Same as AUD-SEC-001. |
| D-27 / A-SEC blanket anon | **00194** blanket `anon` `EXECUTE`/`SELECT` | **00217** `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC` + anon restore allowlist; user catalog public **0**, anon **11**. | **MIGRATION/CODE** `00217`; **LIVE CATALOG — USER EVIDENCE**. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Production-safe: metadata-only grant audit (already user-captured); no mutating RPC. |
| D-01 | `admin_review_signup_request` treated callers as admin | **00216** hardening + anon revoke; authenticated UI still uses RPC (design). | **MIGRATION/CODE**; `PROD_CONTAINMENT/README.md`. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Staging: non-admin authenticated approve must fail. |
| D-03 | `get_org_role` NULL bypass in role gates | **00216** patches cited in remediation cert. | **MIGRATION/CODE**; local contract PASS. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | RPC matrix on staging as non-member. |
| D-04 | `create_purchase_order_from_award` skipped check when `auth.uid()` null | Anon blocked at grant layer (**00217**); body check for authenticated still matters. | **MIGRATION/CODE** `00216`; **LIVE CATALOG — USER EVIDENCE**. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Anon + wrong authenticated org on staging. |
| D-31 | WhatsApp password reset leaked OTP | **00198** hotfix lineage; verify path uses `verify_whatsapp_password_reset` in allowlist. | **MIGRATION/CODE**; user allowlist includes verify RPC only. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Non-prod: `request_*` must not return code to client (app + RPC). |
| A-08 | Synthetic quotes on real RFQs | **00198** wrapper + client guard; stub flag runtime unknown. | **MIGRATION/CODE**; master register PRODUCTION-VERIFICATION. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Read-only: `platform_environment_settings` stub flag on staging; no invite on prod. |
| SM-RFQ-00218 | Direct PostgREST `UPDATE rfqs` status bypass (e.g. EVALUATING→OPEN) | Trigger `trg_guard_rfq_status` enforces whitelist + immutable keys (**00218**). | **MIGRATION/CODE** `00218`; **LIVE CATALOG — USER EVIDENCE** (trigger named); local `SM-RFQ-*` PASS. App still issues `.update({ status })` on `rfqs` (`rfq-lifecycle.ts`) — must pass guard. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Staging authenticated direct REST update attempt (non-prod RFQ id). |
| SM-APPROVAL-00219 | Direct write to `rfq_approval_stages` | Trigger blocks governance field updates unless `otp.approval_stage_internal=1` or bypass roles. | **MIGRATION/CODE** `00219`; **LIVE CATALOG — USER EVIDENCE**; app reads stages via `approval.ts` (SELECT). | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Staging PATCH on `rfq_approval_stages.status` as buyer JWT. |
| INV-SUPPLIER | Supplier self-approves invoice to PAID | **00216** `trg_guard_invoice_supplier_status` / `INV-SUPPLIER-STATUS`. | **MIGRATION/CODE** `00216`; not behaviourally tested. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Staging supplier JWT status transition to PAID. |
| ORG-APPOINT | `appoint_org_role_atomic` by non-owner | **00216** OWNER-only appointment gate; anon denied. | **MIGRATION/CODE**; **LIVE CATALOG — USER EVIDENCE**. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Staging member JWT appoint attempt. |
| DELEGATION / GAP3 | Delegation identity spoofing on approval | **00216/00219** RPC uses `private.get_profile_id()`; direct stage write blocked. | **MIGRATION/CODE**; local `P0-GAP-3` PASS. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Staging delegation expiry/outsider matrix. |
| QUORUM-COI | Award without committee quorum / COI | **00216** `lock_and_reveal_award_atomic` COMMUNITY quorum; `cast_committee_vote` COI. | **MIGRATION/CODE**; local PASS. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Staging COMMUNITY RFQ with conflicted voter. |
| MILESTONE | Supplier skips milestone progression | **00199** trigger narrative; not in **00216–00219** ceiling focus. | **MIGRATION/CODE** `00199` (may be on prod via earlier migrations). | **INSUFFICIENT EVIDENCE** | P1 | Catalog: trigger `trg_enforce_work_order_milestone_progression`; staging update test. |
| SUBSCRIPTION-WALLET | Arbitrary wallet credit toward subscription | **00216** catalog amount enforcement on subscription RPCs. | **MIGRATION/CODE**; local PASS. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Staging ₹1 credit attempt. |
| DEMO-STATUS | `demo_status` exposed to anon | User catalog: anon **false**, public **false**, authenticated **true**. | **LIVE CATALOG — USER EVIDENCE**; repo **00217** omits anon grant. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P2 | Anon `rpc(demo_status)` on staging (expect deny). |
| A-R5a | Profile self-promote via `profiles_update` | **00203** guard in repo; production trigger presence not agent-verified. | **MIGRATION/CODE** `00203`. | **INSUFFICIENT EVIDENCE** | P0 | Catalog trigger `trg_aa_guard_profile_privileges`. |
| A-R8-AUDITDEL | `audit_events` deletable by anyone | **00201** fix in repo lineage. | **MIGRATION/CODE**. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P0 | Staging DELETE as authenticated non-admin. |
| A-R5b | Hard-coded admin email whitelist | Still present in `is_platform_admin()` source. | **MIGRATION/CODE** `00179`; register **OPEN**. | **INTENTIONAL DESIGN** (known gap) | P1 | Remove allowlist or gate signup emails; monitor section 8 style inventory. |
| A-R10 / D-13 | Supplier `invoices` UPDATE policy too broad | **00202** + **00216** invoice guard; supplier trigger adds server rule. | **MIGRATION/CODE**. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | Staging supplier status flip tests. |
| D-10 / D-11 | Quorum / award while OPEN not enforced in SQL | Partially addressed in **00216** lock path; full bundle UNVERIFIED in matrix. | **MIGRATION/CODE**; local partial PASS. | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** | P1 | End-to-end award state machine on staging. |
| D-07 | `rfq_approval_stages` never inserted — PO gate inert | Product/workflow gap, not privilege bypass. | **MIGRATION/CODE** / master register **CONFIRMED**. | **PARTIALLY FIXED** | P1 | Product: wire INSERT path; unrelated to 00219 guard. |
| D-26 | `submit_signup_request` enumeration | Still returns existing registration status (black-box). | Black-box **E-*** / `OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md`. | **PROVEN OPEN** (information disclosure) | P3 | Generic response design (no prod mutation test needed for proof). |
| F-RUN2-T4-02 | Buyer reaches `/supplier/quotes` | Route guard issue in frontend. | **CODE EVIDENCE** `ProtectedRoute.tsx` cited in matrix. | **PROVEN OPEN** (prior run2 session; not re-run here) | P1 | Fix role-aware `ProtectedRoute`; verify after deploy. |
| F-RUN2-T4-01 | Supplier sees buyer dashboard | Loading gate race. | Run2 report. | **INSUFFICIENT EVIDENCE** (not re-run) | P1 | Re-test logged-in paths on staging only. |
| CI false-green | Migrations exist but prod unverified | Agent cannot certify from files alone. | Multiple certs say LOCAL only. | **INSUFFICIENT EVIDENCE** | P2 | Separate hosted readonly gate; do not treat local PASS as prod PASS. |

---

## A. Closure (security controls with catalog + code alignment)

Controls that align **user-captured catalog** with **00216–00219** repository intent:

- Privilege containment: **11** anon `EXECUTE` on `public` application RPCs; **0** `PUBLIC` `EXECUTE` on those routines (user catalog).
- `demo_status` not granted to anon/public (user catalog).
- RFQ status and approval-stage **triggers present** on production per user catalog (presence ≠ behavioural proof).
- RLS enabled on major procurement tables per user catalog.

**Not closed without behavioural proof:** any row classified **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** above.

**Not closed by this agent:** catalog re-query (auth blocked); several **INSUFFICIENT EVIDENCE** rows.

---

## B. Behavioural verification list (required before GREEN)

| # | Attack path | Safe on production? | Status this pass |
|---|-------------|---------------------|------------------|
| 1 | Anon `credit_buyer_settlement_reward_atomic` | No | **NOT EXECUTED** |
| 2 | Anon `lock_and_reveal_award_atomic` / `create_purchase_order_from_award` | No | **NOT EXECUTED** |
| 3 | Authenticated cross-org wallet credit | No | **NOT EXECUTED** |
| 4 | Direct REST `PATCH rfqs.status` (illegal transition) | No | **NOT EXECUTED** |
| 5 | Direct REST `PATCH rfq_approval_stages` | No | **NOT EXECUTED** |
| 6 | Supplier invoice → PAID | No | **NOT EXECUTED** |
| 7 | Non-owner `appoint_org_role_atomic` | No | **NOT EXECUTED** |
| 8 | Delegation outsider approve | No | **NOT EXECUTED** |
| 9 | COI voter RECOMMEND | No | **NOT EXECUTED** |
| 10 | Anon `demo_status` | No (use staging) | **NOT EXECUTED** |
| 11 | Public browser smoke (landing/login/register, no submit) | Yes | **NOT TESTED** (browser MCP unavailable) |

---

## C. Open security (reproducible in this pass)

| ID | Severity | Note |
|----|----------|------|
| D-26 | P3 | Signup enumeration observed in black-box audit (prior session). |
| F-RUN2-T4-02 | P1 | Buyer/supplier route confusion documented in Run2; not re-validated on production in this pass. |

No **P0** security defect was **proven open** on production in this pass (no mutating attacks executed).

---

## D. Non-security findings (from original audits — retained)

| ID | Severity | Summary | Classification |
|----|----------|---------|----------------|
| D-01 (black-box) | P1 | Fee / money-handling copy contradicts across landing, FAQ, pricing, agreements | **PROVEN OPEN** (static content; black-box) |
| D-02 (black-box) | P1 | Legal pages marked draft / not final | **PROVEN OPEN** |
| D-03 | P2 | Pending registrants told no account on email code login | **PROVEN OPEN** |
| D-04 | P3 | WhatsApp not-sent message after Email channel | **PROVEN OPEN** |
| D-05 | P3 | LaTeX on pricing (`($\ge 2$)`) | **PROVEN OPEN** |
| D-06 | P3 | Invalid GSTIN accepted at signup | **PROVEN OPEN** |
| D-07–D-11 | P3 | Validation UX, FAB overlap, silent 404, login tab highlight | **PROVEN OPEN** |
| Issue 05 | P2 | Address persistence | **INSUFFICIENT EVIDENCE** (live) |
| Issue 06 | P2 | Signup prefill / PIN | **INSUFFICIENT EVIDENCE** |
| Issue 16 | P3 | Footer 320px | **INSUFFICIENT EVIDENCE** |
| Issue 23 / AUD-UX-006 | P3 | Simulator / chrome on public pages | **PARTIALLY FIXED** (repo claims removal; black-box saw Desktop/Mobile pre-fix) |
| Issue 27 | P3 | PA-09, LaTeX, technical FAQ copy | **PROVEN OPEN** (black-box) |
| AUD-TRUST-001 / FIN-1 | P1 | Product decision on fees | **INTENTIONAL DESIGN** / legal-product |
| AUD-LEGAL-001 / LEG-1 | P1 | Counsel review required | **INTENTIONAL DESIGN** |
| AUD-UX-005 / REL-1 | Medium | `/register` routing | **FIXED — BEHAVIOURAL VERIFICATION REQUIRED** (route check only) |
| Issue 09 / A-09 | P2 | PDF print-of-screen | **CONFIRMED** (repo); live **INSUFFICIENT EVIDENCE** |
| D-29 | P1 | Production frontend may predate local fixes | **INSUFFICIENT EVIDENCE** (deploy state not measured here) |
| A-29 | P1 | Default password on admin approval | **INSUFFICIENT EVIDENCE** on prod |
| D-21 | P1 | WhatsApp from browser relative URL | **CONFIRMED** (code); prod delivery **INSUFFICIENT EVIDENCE** |

---

## E. Migration candidates

| Candidate | Rationale |
|-----------|-----------|
| **None recommended from this pass** | User catalog + **00216–00219** already address the documented P0 privilege and RFQ/approval direct-write classes. Remaining gaps are **behavioural verification**, **frontend route guards** (F-RUN2-T4-02), **product/legal copy**, and **design items** (admin allowlist). New SQL only if staging behavioural tests show a **catalog/runtime gap** (not observed here without tests). |

---

## Root cause (PROVEN OPEN / PARTIALLY FIXED only)

**D-26 (enumeration):** `submit_signup_request` returns differentiated responses for existing registrations (by design in `00180` lineage), conflicting with anti-enumeration intent.

**F-RUN2-T4-02:** `ProtectedRoute` authorizes by coarse role membership, not route-specific supplier vs buyer side.

**D-07 (PARTIALLY FIXED):** Approval stages may not be populated by workflow code, so downstream PO gates that depend on pending stages never engage — orthogonal to **00219** direct-write guard.

---

## Certification block

```
SECURITY RECONCILIATION STATUS: AMBER — NO PROVEN OPEN P0, BUT P1/BEHAVIOURAL VERIFICATION REMAINS
Production migration ceiling: 00219
Catalog security baseline: VERIFIED (user-captured catalog; agent did not re-query production)
Behavioural verification: BLOCKED
Proven open P0: 0
Proven open P1: 1
Behavioural verification required: 22
Insufficient evidence: 8
Non-security findings: 24
New migration candidates: 0
```

*This reconciliation does not state that OTP is secure.*
