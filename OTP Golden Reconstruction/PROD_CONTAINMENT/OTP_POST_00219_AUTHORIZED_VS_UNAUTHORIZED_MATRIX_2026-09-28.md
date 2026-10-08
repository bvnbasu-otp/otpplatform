# OTP POST-00219 Authorized vs Unauthorized Matrix — 2026-09-28

**Environment:** Production (`https://otpplatform-theta.vercel.app` + Supabase `qsuvtcezffomtwzwyrso`)  
**Phase A:** No dedicated production QA identities → **no authenticated tests**; **no mutating anon RPCs**  
**Legend:** Classifications are **runtime behavioural** only. **CODE CONTEXT** notes are not evidence.

---

## Summary by control group

| Group | Domain | Authorized test | Unauthorized test | Classification |
|-------|--------|-----------------|-------------------|----------------|
| **A** | Anon / PUBLIC execute containment (**00217**) | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **B** | Privileged admin / diagnostic RPCs | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **C** | Wallet reward credit (**00216**) | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **D** | Award, reveal, PO RPCs | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **E** | RFQ status direct write (**00218**) | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **F** | RFQ approval stage direct write (**00219**) | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **G** | Supplier invoice status | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **H** | Org role appointment | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **I** | Delegation / tier approval | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **J** | Committee quorum / COI on award | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **K** | Milestone progression / subscription wallet | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **L** | `demo_status`, signup review, `get_org_role` gates | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **M** | Profile privilege / `audit_events` DELETE | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **N** | Supplier anon flows (magic link, messaging) | NOT EXECUTED | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **O** | Frontend routes (SQ-01/02/03, F-RUN2) + public smoke | Partial smoke only | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** (routes); smoke **INSUFFICIENT EVIDENCE** |

---

## Group A — Anon / PUBLIC execute containment

| Test ID | Actor | Operation | Expected (authz) | Actual | Classification |
|---------|-------|-----------|------------------|--------|----------------|
| A-01-UNAUTH | `anon` | `rpc/credit_buyer_settlement_reward_atomic` | Deny | NOT EXECUTED — unsafe without staging | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| A-02-UNAUTH | `anon` | `rpc/lock_and_reveal_award_atomic` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| A-03-UNAUTH | `anon` | `rpc/demo_status` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| A-04-UNAUTH | `anon` | `rpc/admin_run_diagnostic_query` (representative) | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| A-05-AUTH | Org member | `rpc/get_organization_wallet` (own org) | Allow read | NOT EXECUTED — no QA JWT | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| A-06-READONLY | `anon` | `rpc/platform_heartbeat` (read-only) | Allow if granted | NOT EXECUTED — no anon key in verifier env | **INSUFFICIENT EVIDENCE** |

**CODE CONTEXT:** **00217** revokes `PUBLIC`/`anon` on all `public` routines; restores 11-function allowlist. Operator catalog summary: anon **11**, public **0**.

---

## Group B — Admin / diagnostic RPC sweep

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| B-01-UNAUTH | `anon` | `rpc/admin_bulk_delete_users` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| B-02-UNAUTH | Authenticated non-admin | `rpc/admin_execute_service_action` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| B-03-UNAUTH | Authenticated non-admin | `rpc/admin_get_users_and_organizations` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| B-04-AUTH | Platform admin | `rpc/admin_review_signup_request` (legitimate approve) | Allow when admin | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**CODE CONTEXT:** `PROD_CONTAINMENT/README.md` Group B list; **00216**/**00217** revoke pattern.

---

## Group C — Wallet reward credit

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| C-01-UNAUTH | `anon` | `credit_buyer_settlement_reward_atomic` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| C-02-UNAUTH | Authenticated wrong org | Same RPC with foreign `platform_fee_tx_id` | Deny / business error | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| C-03-AUTH | Buyer QA (own org) | Same RPC with valid fee id | Success once | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**CODE CONTEXT:** **00216** fee binding and membership checks.

---

## Group D — Award, reveal, purchase order

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| D-01-UNAUTH | `anon` | `lock_and_reveal_award_atomic` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| D-02-UNAUTH | `anon` | `create_purchase_order_from_award` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| D-03-AUTH | Buyer manager QA | Legal award lock on owned RFQ | Success when state valid | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

---

## Group E — RFQ status guard (**00218**)

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| E-01-UNAUTH | Buyer JWT | `PATCH rfqs` `EVALUATING→OPEN` | Deny (`RFQ-STATUS-TRANSITION`) | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| E-02-UNAUTH | Buyer JWT | Change `organization_id` on RFQ | Deny (`RFQ-IMMUTABLE`) | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| E-03-AUTH | Buyer JWT | `DRAFT→OPEN` on own RFQ | Allow | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**CODE CONTEXT:** Client path `apps/web/src/features/requirement/api/rfq-lifecycle.ts` uses `.update({ status })`.

---

## Group F — Approval stage guard (**00219**)

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| F-01-UNAUTH | Org member JWT | `UPDATE rfq_approval_stages.status` | Deny (`APPROVAL-STAGE-DIRECT-WRITE`) | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| F-02-UNAUTH | Org member JWT | `INSERT rfq_approval_stages` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| F-03-AUTH | Approver QA | `submit_rfq_tier_approval_atomic` | Success when policy satisfied | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**CODE CONTEXT:** App `approval.ts` SELECT-only on stages.

---

## Group G — Invoice supplier status

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| G-01-UNAUTH | Supplier JWT | `UPDATE invoices` to `PAID` | Deny (trigger) | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| G-02-AUTH | Buyer QA | Record payment via intended RPC | Success | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**CODE CONTEXT:** **00216** `trg_guard_invoice_supplier_status`.

---

## Group H — Org role appointment

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| H-01-UNAUTH | Member (non-owner) | `appoint_org_role_atomic` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| H-02-AUTH | Owner QA | Appoint MANAGER | Success | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

---

## Group I — Delegation / tier approval identity

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| I-01-UNAUTH | Outsider / expired delegate | `submit_rfq_tier_approval_atomic` + bad `p_delegation_id` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| I-02-AUTH | Valid delegate QA | Approve with valid delegation | Success | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

---

## Group J — Quorum / COI

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| J-01-UNAUTH | Buyer manager | `lock_and_reveal_award_atomic` without quorum | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| J-02-UNAUTH | COI conflicted voter | `cast_committee_vote` RECOMMEND | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

---

## Group K — Milestone / subscription wallet

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| K-01-UNAUTH | Supplier JWT | Invalid `work_orders.progress_percent` | Deny if trigger present | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| K-02-UNAUTH | Authenticated | `apply_wallet_credits_to_subscription_atomic` wrong amount | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| K-03-AUTH | Buyer QA | Valid subscription payment path | Success | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

---

## Group L — Demo flag, signup review, role gates

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| L-01-UNAUTH | `anon` | `demo_status` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| L-02-UNAUTH | Authenticated non-admin | `admin_review_signup_request` approve | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| L-03-UNAUTH | Non-member | RPC using `get_org_role` gate | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**Note:** Prior black-box **D-26** (`submit_signup_request` enumeration) is information disclosure, not tested here (mutating anon RPC forbidden).

---

## Group M — Profile privileges / audit immutability

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| M-01-UNAUTH | User JWT | `UPDATE profiles` elevate `is_platform_admin` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| M-02-UNAUTH | Non-admin | `DELETE audit_events` | Deny | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**CODE CONTEXT:** **00203** profile guard; **00201** audit delete hardening (trigger presence on prod not catalog-verified by this agent).

---

## Group N — Supplier public anon flows

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| N-01-UNAUTH | `anon` | `redeem_supplier_magic_link` (guessed token) | Deny / invalid | NOT EXECUTED — mutating | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| N-02-UNAUTH | `anon` | `submit_messaging_quote` without session | Deny | NOT EXECUTED — mutating | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| N-03-AUTH | Supplier QA via valid token | Complete quote flow | Success | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**CODE CONTEXT:** Allowlist includes these four supplier RPCs per **00217**; app callers in `quick-quote.ts`, `SupplierAwardOnboardingPage.tsx`.

---

## Group O — Frontend routes & public smoke

| Test ID | Actor | Operation | Expected | Actual | Classification |
|---------|-------|-----------|----------|--------|----------------|
| **SQ-01** | Buyer QA session | Navigate `/supplier/quotes` | Redirect / deny supplier workspace | NOT EXECUTED — no buyer QA | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **SQ-02** | Buyer QA | Supplier invitation rows via API | Empty / no cross-org data | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| **SQ-03** | Supplier QA | Same route | Supplier workspace data for own invitations | NOT EXECUTED — no supplier QA | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| O-04 | Buyer QA | F-RUN2-T4-01 `/dashboard` bleed | Buyer-only content | NOT EXECUTED | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| TEST-PUB-001–003 | Anonymous | GET `/`, `/login`, `/signup` | HTTP 200 | **200** for all three | **INSUFFICIENT EVIDENCE** (not authz) |

**CODE CONTEXT (not PROVEN SECURE):** `ProtectedRoute.tsx` `evaluateRouteAccess`; unit test F-RUN2-T4-02; `rfqs_supplier_masked` supplier filter; mock quote cards when zero rows (`SupplierQuotesPage.tsx`) — product integrity concern, not verified on production deploy.

---

## Pass 2 parity — 22 behavioural controls

| # | Control | Matrix group | Classification |
|---|---------|--------------|----------------|
| 1 | Anon wallet mint | A, C | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 2 | Anon award/PO | A, D | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 3 | Cross-org wallet | C | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 4 | RFQ status regression | E | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 5 | RFQ immutable keys | E | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 6 | Approval stage tamper | F | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 7 | Supplier invoice PAID | G | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 8 | Org role appoint | H | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 9 | Delegation approve | I | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 10 | Quorum / COI | J | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 11 | Milestone skip | K | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 12 | Subscription wallet amount | K | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 13 | `demo_status` anon | L | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 14 | Anon allowlist drift | A | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 15 | Admin RPC as anon | B | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 16 | Magic link / messaging abuse | N | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 17 | Signup approve non-admin | B, L | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 18 | `get_org_role` NULL gate | L | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 19 | Profile self-promote | M | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 20 | `audit_events` DELETE | M | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |
| 21 | Public smoke | O | **INSUFFICIENT EVIDENCE** (3× HTTP 200 only) |
| 22 | Buyer blocked `/supplier/quotes` | O (SQ-01) | **BLOCKED — SAFE TEST ENVIRONMENT REQUIRED** |

**PROVEN SECURE count:** **0** (no control had both authorized success and unauthorized denial observed at runtime).

---

*Matrix does not certify OTP secure.*
