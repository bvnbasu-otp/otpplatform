# OTP — MASTER INDEPENDENT PURE WHITE-BOX PILOT READINESS AUDIT

Date: 2026-10-08. Repo `g:\My Drive\otp`. `HEAD` = `origin/main` = `9594a951e5e4fe0431e3b052d15e96b30dc3a07b` (`fix(ci): retry transient production migration reads`). No commit, push, migration apply, deploy, or hosted mutation was performed during this audit.

Later correction, 2026-10-08 evening: this file is a historical audit. `00252` is committed and was present in hosted `schema_migrations` at ceiling `00252`. The statements below that call `00252` untracked, or that call `payment-webhook` and `otp-dispatch` missing, describe that morning's read and are not the current hosted state. Cancelled-RFQ allowance and Union Territory GST are migration `00253`, not an edit of this audit's findings.

This audit is **source/migration-level white-box analysis only**. It explicitly builds on, and does not re-litigate, the hosted/runtime proof already captured the same day in `OTP_PILOT_AMBER_GREEN_MASTER_REGISTER.md` (Gates A–K), which this agent cannot independently reproduce (no hosted Supabase/HTTP access in this sandbox). Where this audit's findings overlap that register, the register's runtime evidence is treated as authoritative for *deployment/runtime* status; this report adds *source-correctness* findings underneath it.

---

## A. EXECUTIVE CONCLUSION

```text
WHITE-BOX STATUS (source/migration-level, this audit):
P0: 0 newly found in source logic
P1: 5  (1 already has an authored-but-uncertified fix in the working tree)
P2: 6
P3: 2
UNVERIFIED: test-suite execution could not be reproduced in this sandbox (no local Postgres/Supabase); hosted migration ceiling, hosted edge-function reachability, and hosted bundle contents were not re-checked (no network access) — carried forward from the master register as still-open, independently-dated evidence.

CARRIED FORWARD FROM `OTP_PILOT_AMBER_GREEN_MASTER_REGISTER.md` (same date, deployment/runtime layer, RED/AMBER, not re-verified by this agent):
- P0: hosted `payment-webhook` and `otp-dispatch` Edge Functions HTTP 404 on production Supabase project.
- P0: hosted migration ceiling not independently read (no access token in this environment).
- P1 (AMBER): live web bundle still serves placeholder Form 16A TDS certificate (TAN `BLR0998811`, PAN `AAACB1234F`) — already corrected in the uncommitted working tree, not deployed.
- P1 (AMBER): deployed admin bundle still performs a direct client write of `subscription_status`; a correct RPC (`platform_admin_set_organization_subscription_status`) exists in the working tree but the live bundle was not rebuilt.
- P1 (AMBER): Google Places discovery and ONDC remain credential-gated / SPA-only in production; this is EXPECTED BY CONTRACT for the pilot, not a new defect.

DECISION: BLOCKED BY P0/P1
```

Rationale: no catastrophic, currently-exploitable security bypass was found in the authoritative RLS/RPC/trigger layer (Section G) — the database-level authorization boundary is in materially good shape. However, (1) a confirmed financial/business-rule defect exists in the RFQ-quota count (cancelled RFQs are not reclaimed), (2) a confirmed statutory-tax defect exists for Union Territory buyers (UTGST never produced), (3) the previously-identified RWA award-lock quorum gap has a drafted fix but it is **uncommitted, not applied to the local migration ceiling, and not deployed** — so the gap is still live in every environment that actually runs today, and (4) the carried-forward deployment P0s (webhook/dispatch 404, stale TDS bundle) remain open per the master register. None of this is "Pilot GREEN." The independent black-box audit remains a separate, later gate.

---

## B. PRODUCT CONTRACT INTEGRITY

| Contract item | Verdict | Evidence |
|---|---|---|
| Individual/RWA/MSME only, no customer-facing Enterprise | CONFIRMED | `PricingPage.tsx` shows only 3 tiers; ENTERPRISE is an internal compatibility object in `pricing-entitlement.ts`/`roles.ts`, never rendered to buyers. |
| TELL→REVIEW→DECIDE→TRACK | PARTIAL | Intake ("Tell"), Fulfillment tracking ("Track") use the literal terminology; the mid-funnel stage is implemented as `EVALUATING` in code/UI rather than literal "Review"/"Decide" labels (prior UX audit finding, carried forward — cosmetic, not a functional defect). |
| RFQ entitlement: 3/month + 1 non-carrying quarterly bonus for YEARLY plans | **PARTIAL — P1 defect** | Confirmed correctly implemented for org isolation, calendar-month boundary (UTC), non-carry, org-type gating, and race-safety (`FOR UPDATE`) in `00248_yearly_plan_quarterly_rfq_bonus.sql`. **Defect:** the monthly count has no RFQ-status filter, so a CANCELLED RFQ still consumes one of the 3 (or blocks the bonus). See Bug Register B-01. |
| Quote-count requirement (min quotes) | CONFIRMED | Persisted (`min_quotes_required`), enforced only at award (`00023_award_lock_reveal.sql`), waivable with mandatory reason. Correct by design — does not force reaching the minimum before an early close. |
| Sourcing modes do not alter entitlement/quota/deadline/governance/payment/tax | CONFIRMED | No sourcing-mode read found in the allowance trigger, deadline trigger, or GST-split functions. |
| Supplier trust states (DISCOVERED_IN_AREA / OTP_REGISTERED / GST_VERIFIED) | CONFIRMED | Preserved; Google-discovered suppliers never auto-promoted (prior-session verified fact, re-confirmed by governance/RLS subagents). |
| Identity masking pre-award | CONFIRMED | RLS on `suppliers`/`quotes` scoped by `is_supplier_user_for`/reveal state; blind-quote views enforce masking; storage policy (`can_read_attachment_path`) and `issued_document_snapshots` perspective policies prevent premature leakage. |
| Quote comparison (Landed Cost+GST / Turnaround / Warranty-SLA / Smart Merit) | CONFIRMED, no scoring defects found | Null-safe (neutral 50, not 0 or dropped weight), divide-by-zero guarded, weight-rounding drift absorbed, stale-score invalidation on quote revision or weight change (`00017_evaluation_weights_scoring.sql`). Award RPC does **not** require the top-ranked quote — buyer can award any FINAL quote with a justification. This matches the "OTP does the work, customer decides" principle; flagged as an open design confirmation, not a defect. |
| Governance (RWA quorum/COI/anti-self-approval, MSME delegation/spend-caps, Individual isolation) | PARTIAL | See Section C/F. RWA quorum fix exists but is uncommitted/unapplied (B-04). MSME delegation, spend caps, self-add prevention, sequential approval, and stale-route detection are solidly DB-enforced. Individual buyers can theoretically self-vote on their own RFQ if they seat themselves via auto-committee-seating (P2, B-05). |
| PO cancellation ("buyer may cancel before acceptance, including after reveal") | CONFIRMED | `cancel_purchase_order_atomic` (00239) requires ≥5-char reason, OWNER/MANAGER only, blocked once `acknowledged_at` is set; direct-write guard rejects client bypass (`PO-CANCEL-DIRECT-WRITE`). Has real test coverage (see Section N correction). |
| Payment structures (SINGLE / 30-50-20 / 4×25) | CONFIRMED (migration 00240) | Not independently re-executed in this audit; structurally present and referenced by downstream invoice/milestone logic. |
| Tax/GST (CGST/SGST/IGST) | **PARTIAL — P1 defect for UTGST** | See Bug Register B-03. |
| Supplier platform fee 0.5%, pilot-waivable | CONFIRMED | `platform-fee.ts` + migration 00174; `PILOT_COMMERCIAL_MODE_POLICY.supplierPlatformFeeCharged=false` for pilot. |
| Buyer reward / referral / Share-in-Success distinct | CONFIRMED | Buyer reward (`credit_buyer_settlement_reward_atomic`, 00216) and referral (`credit_otp_referral_bonus_atomic`, 00221) are fully implemented with idempotency, self-referral/duplicate guards, and ledger entries. Share-in-Success is an enum/field placeholder only — **NOT IMPLEMENTED**, no RPC/trigger/consumer anywhere in the repo. This is a planned feature, not a defect; do not treat its absence as a bug. |
| Supplier cashback prohibition | CONFIRMED | Active guard in migration 00220 (`RAISE EXCEPTION 'Supplier cashback has been removed'`); no active credit path found anywhere. |
| ONDC disabled for pilot | CONFIRMED | Discovery-only observation table (00230), environment-gated; public copy says "Not connected." No defect. |
| WAHA as sole pilot messaging provider | CONFIRMED | `docker-compose.prod.yml` deploys `otp-waha-paired`; Meta/Twilio code exists but unconfigured; MOCK provider is explicitly rejected (`503`) inside `otp-dispatch`/`onboarding-notify`/`messaging-outbound` when selected outside test context — it never silently masquerades as a real send. |

---

## C. DATABASE / AUTHORITY REPORT

- **RLS:** Enabled on every audited sensitive table (`organizations`, `suppliers`, `purchase_orders`, `invoices`, `wallet_transactions`, `issued_document_snapshots`, `quotes`, etc.) with org/role/perspective-scoped policies. No `USING (true)` pattern found on a sensitive table.
- **SECURITY DEFINER functions:** All audited instances (`private.is_platform_admin`, `private.is_org_member`, `private.is_supplier_user_for`, the award/PO/quorum RPCs) perform their own internal authorization check rather than trusting the RLS caller context or a client-supplied role — this is the correct pattern and avoids the "secure RLS, unsafe SECURITY DEFINER RPC" failure mode.
- **Direct-write guard coverage is uneven** (see Section F / Bug Register B-07): `rfqs`, `awards`, and `purchase_orders` (commercial fields + cancellation) have explicit BEFORE-UPDATE trigger guards rejecting illegal direct client writes. `requirements`, `work_order_milestones`, `invoices`, and `payments` have **no equivalent trigger-level state-machine guard** — correctness for those four currently rests entirely on RLS role scoping plus "the application only calls the right RPC," which is a weaker guarantee.
- **Admin authority:** `AdminUsersActivityPanel.tsx` still performs three direct `.update()` calls (profiles.is_demo, suppliers.status/verification_status, organizations.gst_verified) instead of dedicated RPCs. Each is independently backed by an RLS policy requiring `is_platform_admin()`, so this is **LATENT ARCHITECTURAL RISK, not an active vulnerability** — but per the master register, production (`9594a951`) still runs an older variant of this panel that directly writes `subscription_status` as well, which the newer in-working-tree RPC (`platform_admin_set_organization_subscription_status`) correctly replaces; that RPC is not yet live.
- **Wallet:** append-only ledger, `idempotency_key` uniqueness, credit RPCs revoked from `anon`/`authenticated` as of migration 00250 (service_role only). No arbitrary-credit path found. Supplier cashback actively blocked.
- **SuperAdmin immutability:** a whitelist-based trigger (00152) blocks demotion/deletion/email-hijack of specific root admin accounts; the whitelist table itself is not queryable by client roles.
- **Transaction boundaries:** generally solid for single-RPC operations (RFQ publish, phase advance via `FOR UPDATE SKIP LOCKED`, award lock, PO cancellation, payment recording with idempotency key + `ON CONFLICT`). The weakest boundary is award-reveal → PO-creation on the **manual** (non-auto-reveal) path, which is two separate RPC calls with no compensating transaction (Bug Register B-06).

---

## D. BUSINESS-RULE TRACEABILITY MATRIX

| Business Rule | Source | Persistence | Enforcement | Downstream Consumer | Test | Status |
|---|---|---|---|---|---|---|
| 3 RFQs/month | `00248_yearly_plan_quarterly_rfq_bonus.sql:59` | `rfqs.created_at` count | BEFORE INSERT trigger, org row locked | RFQ creation UI/API | `tests/security/ent-01-yearly-quarterly-rfq-bonus.test.ts` (static/regex only — does not execute the trigger) | PARTIAL (cancelled RFQs not reclaimed) |
| Quarterly non-carrying bonus | same file, lines 76–109 | same | same trigger | same | same (static only) | CONFIRMED logic, NOT VERIFIED by execution in this session |
| Min quotes required | `00002_core_tables.sql:93`, enforced `00023_award_lock_reveal.sql:71-76` | `rfqs.min_quotes_required` | Checked at award lock, waivable w/ reason | Award RPC | not independently re-run | CONFIRMED |
| RFQ deadline enforcement | `00041_phase_engine.sql:104-224` | `rfqs.quote_deadline` | BEFORE INSERT trigger on quotes/quote_versions | Quote submission (web + messaging) | not independently re-run | CONFIRMED (rejection); auto-close to CLOSED status is MISSING (P2) |
| RWA committee quorum before award lock | `00252_rwa_award_quorum_met.sql` (**uncommitted, untracked, not applied to local migration ceiling**) | `committee_votes`, `conflict_of_interest_declarations` | `private.enforce_rwa_award_quorum()` called from both `lock_award()` and `lock_and_reveal_award_atomic()` | Award lock | `tests/security/rwa-award-quorum-00252.test.ts` (string-match on exception text, not an executed-trigger test) | **SOURCE-DRAFTED, NOT MIGRATION-CONFIRMED, NOT DEPLOYED** — functionally still an open gap in any running environment today |
| Anti-self-approval (MSME tier) | `00219_guard_rfq_approval_stage_direct_write.sql:56-109` | `rfq_approval_stages` | Trigger raises on `created_by = caller` | Tier approval RPC | referenced in `p1-wiring` tests | CONFIRMED |
| Anti-self-approval (RWA award lock) | `00252` lines ~108-110 | — | checks `is_org_manager_or_above()` only, no explicit `created_by ≠ caller` | Award lock | none found | **MISSING** (P3) |
| PO cancellation pre-acceptance / post-reveal | `00239_p1_buyer_po_cancellation_authoritative_rpc.sql` | `purchase_orders.cancellation_reason/cancelled_at/cancelled_by` | RPC + direct-write guard | PO UI | `tests/security/p1-wiring-00237-00241-database.test.ts` (real RPC-level test) | CONFIRMED |
| Supplier cashback prohibition | `00220_supplier_wallet_ledger_events.sql:45-47` | n/a (rejected) | `RAISE EXCEPTION` on event type match | Wallet credit path | not independently re-run | CONFIRMED |
| GST split (same-state/inter-state) | `00245_f13_po_gst_tax_accuracy.sql:140-170` | PO/invoice tax columns | computed at PO creation, frozen post-approval (00168 trigger) | Invoice, settlement, documents | not independently re-run | PARTIAL — UTGST case missing (P1) |
| Buyer reward | `00216...sql:46-168` | `wallet_transactions`, `buyer_reward_allocations` | idempotency_key unique, service_role-only | Wallet balance | not independently re-run | CONFIRMED |
| Referral bonus | `00221_otp_referral_bonus_profile_matrix.sql` | `wallet_transactions` | self-referral guard, unique source constraint | Wallet balance | not independently re-run | CONFIRMED |
| Share-in-Success | `buyer-reward.ts` (enum only) | none | none | none | none | NOT IMPLEMENTED (planned, not a defect) |

---

## E. PERSONA / WORKFLOW MATRIX (implementation coverage only — not runtime-tested)

| Domain | Individual | RWA | MSME | Supplier | Admin |
|---|---|---|---|---|---|
| Entitlement/quota | CONFIRMED (shared trigger, org-isolated); cancellation-reclaim defect applies equally | same | same | n/a | exempt (`is_platform_admin()` bypass) |
| Governance/approval | No committee requirement by design, but **can self-seat into committee and self-vote** if an INDIVIDUAL org auto-seats the sole member (P2 gap) | Quorum now source-drafted (00252, uncommitted); COI/recusal/anti-self-approval for tier approvals CONFIRMED | Spend-tier/delegation/self-add CONFIRMED | n/a | Platform-admin role check CONFIRMED (DB-sourced, not JWT-trusted) |
| Award/PO | Full lifecycle usable without committee semantics (CONFIRMED) | Blocked pre-00252-apply if quorum logic not yet live in the running DB | Approval-route gate blocks award until all tiers satisfied (CONFIRMED) | Identity reveal gated (CONFIRMED) | Admin cannot arbitrarily force award/PO state (RLS + RPC) |
| Financial/wallet | Buyer reward/referral apply | same | same | Supplier cashback blocked | Cannot credit wallets outside service_role RPCs |
| Cancellation | CONFIRMED | CONFIRMED | CONFIRMED | n/a (receives notification) | n/a |

---

## F. STATE-MACHINE REPORT (summary; full detail gathered via subagent trace, file:line citations above)

| Entity | Valid states found | DB-enforced transitions? | Atomicity | Risks |
|---|---|---|---|---|
| Requirement | DRAFT→SUBMITTED→RFQ_CREATED→QUOTING→EVALUATION→AWARDED→IN_PROGRESS→COMPLETED/CANCELLED | NO trigger guard — relies on RPC discipline only | `publish_requirement()` atomic; later transitions are separate app-layer orchestrations | P2: direct `UPDATE requirements SET status=...` not blocked by a trigger |
| RFQ | DRAFT/OPEN/CLOSED/EVALUATING/AWARDED/CANCELLED (+ CLARIFICATION referenced in 00218 but not in the base enum — naming drift, P3) | YES — `trg_guard_rfq_status` whitelist trigger (00218) | `advance_rfq_phases()` uses `FOR UPDATE SKIP LOCKED`; award lock atomic | No auto-close at deadline (P2) |
| Quote | DRAFT/SUBMITTED/REVISED/FINAL/SELECTED/NOT_SELECTED/WITHDRAWN | PARTIAL — quoting-window trigger blocks late writes; no trigger stops a direct `status='SELECTED'` update outside the award RPC | Quote-version insert not wrapped with status update | P2: double-click could create two versions (no idempotency key) |
| Award | PENDING_REVEAL/REVEALED | YES — `prevent_rehide()` + `guard_award_client_write()` + approval-route gate, SECURITY DEFINER only | `lock_and_reveal_award_atomic` atomic when auto-reveal; manual `reveal_award()` is a separate call | P2: PENDING_REVEAL can be stuck indefinitely on crash between lock and manual reveal |
| PO | DRAFT/PENDING_APPROVAL/APPROVED/ISSUED/ACCEPTED/IN_PROGRESS/COMPLETED/CANCELLED | PARTIAL — commercial-field and cancellation writes guarded (00242, 00239); lifecycle status transitions (ISSUED→ACCEPTED→IN_PROGRESS) are **not** trigger-guarded | `create_purchase_order_from_award()` idempotent on `award_id` unique constraint; completion gated by `validate_po_status_transition()` requiring full settlement | P1: award-reveal→PO-creation is two separate calls on the manual-reveal path (B-06); creation-status default inconsistency (DRAFT in schema default vs ISSUED in practice, P3 cosmetic) |
| Milestone | No enum; `status` is a free text/unconstrained column | **NO** — no RPC, no trigger | None found | **P1: no modeled state machine at all; direct client UPDATE of milestone status is not prevented by any trigger** (B-02) |
| Invoice | SUBMITTED/APPROVED/REJECTED/PAID | PARTIAL — over-invoicing amount guard exists (00171); no trigger guards the status enum transitions themselves | Invoice insert + allocation validation atomic; payment-status sync is a separate step | P2: no unique constraint found on (purchase_order_id, invoice_number) in the reviewed migrations — possible duplicate invoice numbers |
| Payment | RECORDED/VERIFIED/DISPUTED | PARTIAL — authorization check inside `record_invoice_payment_atomic`; no trigger blocks a direct `UPDATE payments SET status='VERIFIED'` | `record_invoice_payment_atomic` fully atomic with idempotency key + `ON CONFLICT` + `SELECT FOR UPDATE` | P1 risk if RLS alone is relied on for the VERIFIED transition — recommend trigger-level guard |
| Settlement | Not a persisted state — computed on demand by `get_po_settlement_summary()` | n/a | n/a | P3: cannot query "is this PO settled" without re-running the computation; acceptable but worth noting as a design limitation, not a defect |

---

## G. SECURITY REPORT

- Authentication/role resolution is DB-sourced (`profiles.is_platform_admin`), not JWT-trusted; frontend route guards are a second layer, not the authority boundary.
- RLS + SECURITY DEFINER combination reviewed for the highest-value tables: no `USING (true)`, no IDOR found in quote/PO/wallet/document access paths sampled.
- Storage: `otp-attachments` bucket is private; access resolved through `private.can_read_attachment_path()` checking org/invite/quote/committee membership; `original_filename` never crosses the identity boundary pre-reveal, only a neutral `display_name`.
- Admin direct-write paths in `AdminUsersActivityPanel.tsx`: functionally blocked by RLS today (LATENT RISK, not ACTIVE), but the master register's independent runtime check found the **deployed** bundle still performs a disallowed direct `subscription_status` write that the newer RPC should replace — this is a source/deployment mismatch, not a live breach (RLS still blocks it even if attempted).
- Replay/idempotency: strong on payment recording (unique `gateway_event_id`, idempotency key, `ON CONFLICT`) and on RFQ allowance (row lock). Weaker on quote-version submission (no idempotency key — double submission risk is low-severity, P2).
- No evidence of role-escalation paths, cross-org wallet reads, or cross-tenant PO/quote access in the sampled RPCs/policies.

---

## H. FINANCIAL REPORT

- Gross commercial amount is `taxable_total + CGST/SGST/IGST/UTGST` (not a literal `GMV` column) — consistent across `financial-settlement-controls.ts` and the PO/invoice migrations, except for the UTGST gap below.
- Platform fee 0.5%, pilot-waivable — confirmed, consistently read from the same policy object.
- Buyer reward = 20% of platform fee, correctly computed, idempotent, ledgered.
- Referral bonus is persona-tiered (₹100 supplier / ₹50 MSME / ₹25 RWA / ₹10 individual), service_role-gated, self-referral blocked, unique-source-constraint blocked.
- Share-in-Success: not implemented (field/enum placeholder only) — planned, not a defect.
- Supplier cashback: actively rejected at the database layer.
- **Tax defect (P1):** `00245_f13_po_gst_tax_accuracy.sql` and the award decision-receipt function in `00241` only branch on same-state vs inter-state; neither produces UTGST for Union Territory buyers/suppliers (state codes 04/25/26/31/35/38/97 etc.), even though the earlier backfill migration `00168` correctly implements CGST+UTGST splitting. New POs/receipts for UT parties will show CGST+SGST instead of CGST+UTGST — a genuine statutory misclassification, not merely cosmetic.
- **Secondary tax defect (P2):** `00245` has no fallback when `stateCode` is missing (falls to `UNAVAILABLE` → all-zero tax), whereas `00168`'s backfill defaults to Karnataka (`29`) from the GSTIN prefix. This asymmetry is a drift risk if state-code data quality varies.
- Tax values are frozen (immutable) once an invoice reaches APPROVED/PAID via `freeze_invoice_tax_snapshot()` — correct control against retroactive tampering.

---

## I. INTEGRATION / DEPLOYMENT REPORT

*(Source-only; do not infer runtime status — hosted facts are from the same-day master register, labeled accordingly.)*

| Component | Source | Configured | Migration | Deployment (CI workflow) | Runtime Evidence | Status |
|---|---|---|---|---|---|---|
| `payment-webhook` | present, fails closed on missing secret | webhook-secret env present by name | n/a | present in `.github/workflows/ci-cd.yml` (uncommitted single-shot step) | master register: HOSTED HTTP 404 (2026-10-08) | SOURCE-CONFIRMED, DEPLOYMENT NOT PROVEN, NOT RUNTIME-PROVEN |
| `otp-dispatch` | present, fails closed on missing provider config or MOCK-in-prod | `MESSAGING_PROVIDER` + per-provider vars | n/a | present in CI workflow (uncommitted) | master register: HOSTED HTTP 404 | same as above |
| `location-pin-coverage` | present | Supabase creds | 00251 (uncommitted) | present in CI workflow | master register: HOSTED GET 405 (reachable) | partially RUNTIME-PROVEN (reachable, not functionally exercised here) |
| `messaging-inbound`/`messaging-outbound`/`onboarding-notify`/`rfq-quotes-*`/`supplier-magic-link`/`demo-reset`/`process-attachment`/`ondc-on-search` | all present, all fail closed on missing config/signature | varies per function | n/a | **NOT found in CI deploy workflow** | NOT VERIFIED | SOURCE-CONFIRMED only |
| WAHA messaging gateway | `otp-waha-paired:latest` in `docker-compose.prod.yml` | yes | n/a | n/a (separate container, not an Edge Function) | prior session's own runtime check (not re-run here) | DEPLOYMENT-CONFIGURED |
| Migration 00251 (fresh-pin OTP-registered fallback) | present, untracked by git | n/a | local Docker ceiling reported as 00251 (applied) per master register | not pushed | hosted ceiling NOT_INDEPENDENTLY_VERIFIED | SOURCE-CONFIRMED + LOCAL-MIGRATION-CONFIRMED (per register); NOT hosted-verified |
| **Migration 00252 (RWA award quorum)** | present, **untracked by git**, not referenced in the master register (newer than it) | n/a | **NOT applied to the local Docker ceiling** (register states ceiling is 00251) | not pushed | not hosted | **SOURCE-DRAFTED ONLY — the fix for the previously known RWA award-lock quorum gap exists as code but has not been locally applied, tested end-to-end, committed, or deployed.** |

---

## J. PUBLIC TRUTH REPORT

No contradictions found between customer-facing copy and the underlying implementation for: customer types, messaging provider, ONDC status, RFQ pricing/allowance figures, supplier-cashback absence, or buyer-reward/referral/Share-in-Success framing (site copy correctly states "pilot does not pay" where applicable).

One pre-existing, already-tracked contradiction carried forward from the master register: the **deployed** production bundle still contains a placeholder "Form 16A" TDS certificate string with a fabricated TAN (`BLR0998811`) and PAN (`AAACB1234F`). The working-tree component (`TdsWithholdingPanel.tsx`) has already been corrected to explicitly disclaim being an official Form 16A and to stop using the placeholder values — but that fix is **uncommitted and not deployed**, so the live site is still presenting the inaccurate statutory claim today. This is a legal/compliance-relevant P1, not a new finding — re-confirmed here at the source level.

---

## K. BUG REGISTER

| ID | Severity | Domain | Rule | Root Cause | Evidence | Impact | Surgical Fix |
|---|---|---|---|---|---|---|---|
| B-01 | P1 | RFQ Entitlement | 3 RFQs/month quota | Monthly-count query has no RFQ-status filter | `supabase/migrations/00248_yearly_plan_quarterly_rfq_bonus.sql` — count query (`SELECT count(*) ... FROM public.rfqs WHERE organization_id = ... AND created_at >= v_month_start ...`) has no `status NOT IN ('CANCELLED')` clause | A buyer who cancels an RFQ cannot reclaim that slot, and the quarterly bonus becomes unreachable in the same month it was cancelled | Add `AND status <> 'CANCELLED'` (or equivalent) to the count query; add a regression test that publishes 3, cancels 1, and confirms a 4th (not bonus) succeeds |
| B-02 | P1 | State Machine | Milestone lifecycle | `work_order_milestones.status` has no enum, no RPC, no trigger | No CHECK constraint or trigger found governing milestone status; `is_invoiced` flag is the only semi-structured signal | A client can set an arbitrary milestone status directly; no DB-level guarantee that milestone completion precedes invoicing | Define a milestone_status enum + BEFORE UPDATE trigger mirroring the RFQ/Award/PO guard pattern already used elsewhere in the codebase |
| B-03 | P1 | Tax/GST | CGST/SGST/IGST/UTGST | PO-creation (00245) and decision-receipt (00241) GST-split logic only branches on same-state vs inter-state; no UTGST branch exists, even though the later backfill (00168) correctly implements it | `supabase/migrations/00245_f13_po_gst_tax_accuracy.sql` lines ~161-170 (no `v_utgst` variable); `00241_p1_decision_receipt_truthfulness.sql` ~95-110 (same gap); contrast `00168_phase5b_statutory_gst_and_tax_splitting.sql` ~225-244 (correct UT handling) | New POs/invoices for Union Territory buyers/suppliers are statutorily misclassified (CGST+SGST shown instead of CGST+UTGST) | Port the UT-detection + UTGST-split logic from 00168 into the PO-creation and decision-receipt functions as a new forward migration; do not touch 00168 or 00251 |
| B-04 | P1 (open in practice, fix drafted) | Governance | RWA award-lock committee quorum | Previously-known gap: `lock_award()`/`lock_and_reveal_award_atomic()` did not check `quorum_met`. A fix (`private.enforce_rwa_award_quorum`) is now drafted in `00252_rwa_award_quorum_met.sql`, requiring ≥2 unconflicted RECOMMEND votes for COMMUNITY/RWA/SOCIETY orgs before award lock | `supabase/migrations/00252_rwa_award_quorum_met.sql` (file confirmed to exist, content read directly) — **but git status shows it as `??` (untracked)**, and the same-day master register states the local Docker migration ceiling is `00251`, i.e. 00252 has not yet been applied even locally | Until 00252 is applied, tested end-to-end against a live Postgres, committed, and deployed, an org manager-or-above can still lock an RWA award without committee quorum in every environment that is actually running today | Apply 00252 locally, run `tests/security/rwa-award-quorum-00252.test.ts` plus a fresh end-to-end RPC-level test (not just a string-match test), then commit and schedule for hosted deployment alongside 00251 |
| B-05 | P2 | Governance | Individual buyer isolation | Auto-committee-seating (`close_clarification_for_evaluation()`, 00050) seats all org members including the sole creator of an INDIVIDUAL-type org; the RWA-specific vote-authority gate (00238) only restricts COMMUNITY orgs, so an INDIVIDUAL org's sole member can vote on (effectively approve) their own RFQ | `00050_close_clarification_for_evaluation.sql:19-25`; `00238_p1_rwa_vote_authority_write_boundary.sql:54-82` (COMMUNITY-only branch) | Low-probability (requires a buyer to deliberately use an INDIVIDUAL org as a shell), low-impact (Individual buyers are not required to have independent approval by contract), but an architectural gap worth closing | Add an explicit "voter ≠ RFQ creator" check for INDIVIDUAL-org committee votes, or skip auto-seating entirely for INDIVIDUAL org_type |
| B-06 | P2 | Atomicity | Award reveal → PO creation | On the manual (non-auto-reveal) path, `reveal_award()` and `create_purchase_order_from_award()` are two separate RPC calls with no shared transaction or saga/compensation logic | `00023_award_lock_reveal.sql:150-217` (reveal) vs `00136_fix_quotes_identity_protected_and_award_po_flow.sql:40-60` (PO creation) — no evidence of a wrapping transaction across both calls | If PO creation fails after a successful reveal (e.g. transient error), the award is REVEALED but no PO exists until a retry; `create_purchase_order_from_award` is idempotent on retry (unique `award_id`), so the practical risk is a stuck state requiring a retry, not data corruption | Add an application-layer retry/compensation check (e.g. a scheduled reconciliation job that finds REVEALED awards with no PO after N minutes) rather than forcing all reveal flows through auto-reveal |
| B-07 | P2 | DB Authority | Direct-write guard coverage | `requirements`, `invoices`, and `payments` status columns have no BEFORE-UPDATE trigger guard analogous to the ones already built for `rfqs`/`awards`/`purchase_orders` | Cross-cutting table in Section F; confirmed absent via targeted migration search | Correctness for these three tables currently depends entirely on RLS role-scoping plus "nothing else calls `.update()` on these columns" being true across the whole frontend/services codebase forever | Extend the existing `guard_*_client_write` trigger pattern (already used for awards/POs in 00242) to `requirements.status`, `invoices.status`, and `payments.status` |
| B-08 | P2 | RFQ Lifecycle | Deadline-based auto-close | `quote_deadline` correctly blocks new quote writes (00041) but no scheduled job/trigger transitions the RFQ itself from OPEN to CLOSED when the deadline passes | No auto-close job found across migrations 00041-00252 | An RFQ can remain visibly OPEN to suppliers indefinitely after its deadline, even though new quotes are silently rejected — confusing, not unsafe | Add a `pg_cron`-driven close step to the existing `advance_rfq_phases()` scheduler (which already runs on a 5-minute cadence for other phase transitions) |
| B-09 | P3 | Governance | RWA anti-self-approval consistency | Award lock (00252) checks `is_org_manager_or_above()` but not `created_by ≠ caller`, unlike the MSME tier-approval guard (00219) which explicitly blocks the RFQ creator from approving their own RFQ | `00252_rwa_award_quorum_met.sql` ~108-110 vs `00219_guard_rfq_approval_stage_direct_write.sql:56-60` | Low likelihood (requires the RFQ creator to also hold the MANAGER role) but an inconsistent control compared to the MSME path | Add the same `created_by ≠ caller` check to the RWA award-lock authority check for parity |
| B-10 | P3 | PO Lifecycle | Creation-status naming drift | Schema default for `purchase_orders.status` is `DRAFT` (00002), but the actual creation RPC inserts rows directly as `ISSUED` (00136/00053) | `00002_core_tables.sql:265` vs `00136_fix_quotes_identity_protected_and_award_po_flow.sql:52` | Cosmetic/documentation drift only — no observed functional impact since the RPC path is the only way POs are created | Update the column default or a code comment to reflect that POs are never actually created in DRAFT via the current flow |

---

## L. ROOT-CAUSE REMEDIATION GROUPS

**Group 1 — RFQ entitlement quota integrity (B-01).** Affected systems: `private.enforce_pilot_rfq_allowance` trigger only. Minimum fix: one-line WHERE-clause change. Regression risk: low (must re-verify the quarterly-bonus arithmetic still holds with the new filter). Targeted tests: cancel-then-republish scenario, bonus-still-non-carrying scenario.

**Group 2 — Missing state-machine guards (B-02, B-07).** Affected systems: `work_order_milestones`, `requirements`, `invoices`, `payments`. Minimum fix: four new BEFORE-UPDATE trigger functions following the existing `guard_award_client_write`/`guard_po_commercial_write` pattern already proven in 00242. Regression risk: medium — must enumerate every legitimate status-writing caller first so the new guard doesn't break a currently-working RPC. Targeted tests: one direct-write-rejection test per table, mirroring the existing `PO-CANCEL-DIRECT-WRITE` pattern.

**Group 3 — GST UTGST gap (B-03).** Affected systems: PO creation (00245), decision receipt (00241). Minimum fix: port the UT-detection branch already proven correct in the 00168 backfill into both forward-creation functions. Regression risk: low — the UT logic is already implemented and tested once in the codebase, this is a port, not a new design. Targeted tests: new PO for a UT-registered buyer/supplier; confirm `utgst_total` populated and `sgst_total = 0`.

**Group 4 — RWA award-lock quorum certification (B-04).** Affected systems: `lock_award`, `lock_and_reveal_award_atomic`. Minimum fix: none needed at the source level — the fix is already written. What's needed is process: apply 00252 to a local Postgres, run a real (non-string-match) RPC-level test that attempts an award lock with 0/1/2 unconflicted votes and asserts the correct accept/reject outcome, then commit and schedule for hosted deployment together with 00251 (both are currently untracked). Regression risk: must confirm the quorum threshold (2 unconflicted RECOMMEND votes) matches the product's actual committee-sizing policy, not just the seeded test fixture's 2-voter committee.

**Group 5 — Deployment parity (carried forward from master register, not re-verified here).** `payment-webhook`, `otp-dispatch` HTTP 404; stale Form 16A bundle; admin direct-subscription-write bundle. Minimum fix: redeploy the already-corrected working tree. Regression risk: none expected (these are already-authored corrections awaiting deployment, not new code).

---

## M. FALSE-POSITIVE / EXPECTED-BEHAVIOR REGISTER

| Observation | Why it looks suspicious | Why it is expected | Evidence |
|---|---|---|---|
| Award can be locked on a non-top-ranked quote | Looks like the scoring model is being ignored | By contract, OTP's scoring is decision support; the buyer makes the final call ("OTP does the work, customer decides") | `00023_award_lock_reveal.sql` `lock_award()` has no top-rank check, only FINAL-status + min-quotes + justification-text checks |
| Share-in-Success field exists but does nothing | Looks like dead/broken code | Explicitly a planned, not-yet-built feature per product contract | No RPC/trigger/consumer anywhere; enum/field only |
| ENTERPRISE org_type and pricing tier exist in code/tests | Looks like a banned customer tier leaking back in | Internal compatibility object only; never rendered on `PricingPage.tsx` or selectable by a customer | `pricing-entitlement.ts`, `PricingPage.tsx` |
| Supplier cashback types/utilities still exist in `supplier-wallet.ts` | Looks like cashback could be reintroduced | They are explicitly *removal-detection* utilities (`isRemovedSupplierCashbackPath`) plus an active exception guard — defensive code confirming the ban, not a backdoor | `00220` + `supplier-wallet.ts` |
| MOCK messaging provider exists in production code paths | Looks like a fake-delivery risk | `otp-dispatch`/`onboarding-notify`/`messaging-outbound` explicitly return HTTP 503 and refuse to proceed if the resolved provider is MOCK outside test context | `otp-dispatch/index.ts` ~263-278 |
| COMMUNITY orgs are excluded from the MSME multi-tier spend-approval route | Looks like RWA orgs have no governance | RWA orgs use committee quorum/COI/voting (00238, 00252) instead of spend tiers — a different, not absent, control | `00237` line ~184-188 comment + `00252` header comment |
| 00251 and 00252 are untracked in git | Looks like forgotten/incomplete work | Consistent with the master register's explicit policy of not committing release-gating fixes until all P0s are closed, to avoid a partial release | Master register "Not committed" section; `git status --short` |

---

## N. COVERAGE GAPS

- **Test execution:** this agent's sandbox has no local Postgres/Supabase running, so the full `pnpm vitest run` suite (437 files / 4640 tests per the master register's prior run) could not be independently re-executed here. The master register's PASS result from the same day is taken as evidence but not re-verified in this session.
- **Correction to an initial subagent claim:** a first-pass finding stated PO cancellation has "zero test coverage." Direct `grep` verification in this session found this to be **false** — `tests/security/p1-wiring-00237-00241-database.test.ts`, `tests/security/msme-spend-governance-redteam.test.ts`, and `tests/security/track-milestone-settlement-redteam.test.ts` all contain real RPC-level PO-cancellation assertions, including direct-write-rejection and post-acceptance-block cases. Retracted; recorded here so the correction is traceable.
- **Test quality sampling:** only ~17 of ~431 test files were deep-sampled for mock-vs-real classification; the ~59% "heavily mocked" figure reported by the test-quality subagent is an estimate from that sample, not a full-suite census.
- **Hosted state:** migration ceiling, Edge Function reachability, live bundle contents, and Google Places/ONDC live behavior were not independently re-checked (no network/hosted access in this sandbox) — the master register's same-day findings are carried forward, not re-verified.
- **Payment structures (SINGLE/30-50-20/4×25) rounding/paise-precision:** reviewed structurally (migration 00240 present, referenced downstream) but not re-traced line-by-line in this session for rounding edge cases.
- **Identity-leak surfaces (notification payloads, WhatsApp message bodies, email templates):** reviewed at the RLS/storage/document level; message-payload content was not independently re-inspected for incidental identity leakage in this session.

---

## O. FINAL WHITE-BOX QUESTION

> **Does the current implementation correctly enforce and execute OTP's established product, business, security, financial, governance and integration contracts across the supported workflows?**

```text
PARTIALLY VERIFIED
```

The database-level authorization boundary (RLS + SECURITY DEFINER RPCs), identity masking, supplier-cashback prohibition, PO-cancellation rule, buyer-reward/referral mechanics, and the quote-comparison scoring engine are all correctly implemented and well-guarded. Against that, this audit confirms one live financial-entitlement defect (B-01, cancelled RFQs not reclaimed), one live statutory-tax defect (B-03, UTGST never produced), one governance control that is drafted but not yet applied/committed/deployed anywhere (B-04, RWA quorum), and several entities (Milestone, Requirement, Invoice, Payment) whose state machines rely on application discipline rather than a database-enforced guard. Combined with the still-open deployment-layer P0s carried forward from the same-day master register (hosted Edge Functions 404, stale public TDS claim), the implementation is **not yet safe to certify as Pilot GREEN**, and per the audit's own rules, that certification is explicitly out of scope for this report regardless.

---

*End of pure white-box audit. No files were modified, no migrations were applied, no commits were made, no deployments were performed. Findings are handed off for convergence with an independent black-box audit per the standard OTP process; this report's contents were not disclosed to any black-box audit process.*
