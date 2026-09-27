# 32FIX Implementation Order

Derived purely from `32FIX_REMEDIATION_INVENTORY.json` (107 records). No new investigation was performed; batch placement is by `status`/`severity`/`domain`, and `Files`/`Database objects`/`Routes` are taken verbatim from each record's `affected_files`/`affected_rpc`/`affected_routes` arrays. Every one of the 107 IDs appears exactly once below (verified programmatically).

---

## Batch 0 — Already validated, do not redo (13 items)

All SUPERSEDED by the P0 security hotfix (branch `hotfix/p0-security`, commit `2dd3c2d`, migration `00198`), validated live this session (198 migrations applied, zero errors, all targeted security checks passed) per `R2-33-P0-Security-Hotfix-Report.md`. Remaining action is push/deploy to production only — do not re-implement.

- **A-08** — Synthetic pilot quotes auto-submitted to real RFQs via `discover_and_invite_for_rfq` — closed by hotfix `00198`.
- **A-20** — Buyer identity leaked pre-award via `rfqs_supplier_masked` — closed by hotfix `00198`.
- **A-SEC-1** — `lock_and_reveal_award_atomic` missing caller guard — closed by hotfix `00198`.
- **A-SEC-3** — `admin_execute_service_action` always-true guard — closed by hotfix `00198`.
- **A-SEC-4** — `admin_get_users_and_organizations` always-true guard — closed by hotfix `00198`.
- **A-SEC-7** — Buyer-name leak via `rfqs_supplier_masked` (duplicate root cause of A-20) — closed by hotfix `00198`.
- **A-R5a** — Self-promotion to platform admin via `profiles_update` — closed by hotfix `00198`; residual DEFINER-path risk noted in Batch 1.
- **A-R8-AUDITDEL** — `audit_events` anon-deletable (`USING (true)` DELETE policy) — closed by hotfix `00198`.
- **D-01** — `admin_review_signup_request` always-true admin guard + shared default password at the RPC layer — closed by hotfix `00198`.
- **D-02** — `credit_buyer_settlement_reward_atomic` no auth check, anon-executable — closed by hotfix `00198`.
- **D-03** — `private.get_org_role` NULL-bypass across ~24 role-gated functions — closed by hotfix `00198`.
- **D-27** — Migration `00194`'s blanket anon SELECT/EXECUTE grant — mitigated by hotfix `00198`'s targeted revoke sweep.
- **D-31** — Unauthenticated WhatsApp password-reset trigger/leak — already fixed on hotfix `00198`.

---

## Batch 1 — Security/Authorization (26 items)

```
Batch: 1 — Security/Authorization
Issues: A-29, A-30, B-01, B-03 (dup, see A-27 / D-29), A-SEC-2, A-SEC-5, A-SEC-6, A-SWEEP,
        A-R1, A-R2, A-R3, A-R4, A-R5b, A-R6, A-R7, A-R8, A-R8-SUPPORT, A-R9, A-R10, A-R11,
        A-OPEN-PROFILE-INSERT, D-04, D-21, D-26, D-28, D-29
Files: apps/web/src/features/admin/api/admin-ops.ts, apps/web/src/features/admin/components/AdminUsersActivityPanel.tsx,
       apps/web/src/features/portal/api/signup.ts, portal/api/signup.ts, portal/components/BuyerRegisterForm.tsx,
       portal/components/SupplierRegisterForm.tsx, portal/lib/registration-outcome.ts, auth/components/SignInForm.tsx,
       admin/components/AdminUsersActivityPanel.tsx, admin/api/admin-ops.ts, apps/web/src/features/notifications/lib/outbound-dispatch.ts,
       vercel.json, vite.config.ts,
       supabase/migrations/00004_rls_policies.sql, 00076_support_tickets_and_ops_routing.sql,
       00139_admin_operations_and_troubleshooting_suite.sql, 00161_fix_admin_review_signup_request_robustness.sql,
       00179_phase6_group3_cross_cutting_remediation.sql, 00196_buyer_identity_address_rwa_msme_and_supplier_award_onboarding.sql,
       00198* (local main), 00199_harden_privileged_rpcs_supplier_masking_and_financial_enforcement.sql,
       00200_scope_procurement_readers_and_recompute_invoice_on_tds_void.sql,
       00201_scope_procurement_stage_events_audit_delete_and_support_tickets.sql,
       00202_scope_invoice_work_order_updates_and_close_client_audit_notification_inserts.sql,
       00203_restrict_ops_metadata_guard_profile_privileges_and_one_live_tds.sql
       (NOTE: "portal/..." vs "apps/web/src/features/portal/..." duplication reflects inconsistent path notation
       between source part files, not distinct files — carried forward as-is per no-invention rule.)
Database objects: admin_review_signup_request, request_profile_verification_otp, submit_signup_request,
       create_system_notification, admin_bulk_delete_users, upsert_buyer_address_atomic,
       admin_force_transition_order_state, admin_bypass_approval_gate, get_current_procurement_step,
       check_supplier_award_eligibility_atomic, is_platform_admin, create_purchase_order_from_award
Routes: (none in structured fields)
Prerequisites: P0 hotfix (Batch 0 / migration 00198 on hotfix/p0-security) merged & deployed first; resolve
       CONFLICT-MIGRATION-NUMBERING for any item citing local main's 00199/00201/00203 (A-SEC-5, A-R6, A-R8,
       A-R8-SUPPORT, A-R9, A-OPEN-PROFILE-INSERT, D-04 — see Conflict Map); execute local main's own unexecuted
       00198-00203 set against a live DB (A-R7) before trusting any of its unvalidated fix candidates; A-R3
       additionally needs a product-owner decision on whether admin bypass of milestone/allowance rules is
       intended, before it can be scoped as a fix.
Expected change: Replace remaining unvalidated always-true/NULL-bypass guards (A-SEC-2, A-SWEEP); add
       ownership/role checks to upsert_buyer_address_atomic (A-SEC-5) and profiles_insert (A-OPEN-PROFILE-INSERT);
       remove the hard-coded admin email whitelist from is_platform_admin (A-R5b); scope RLS on
       procurement_stage_events / support_tickets / ops-metadata / invoices/work_orders and close forged
       audit/notification inserts (A-R6, A-R8, A-R8-SUPPORT, A-R9, A-R10, A-R11); close the anon-caller bypass
       branch inside create_purchase_order_from_award (D-04); replace the shared default password + browser-only
       notice with an invite/magic-link flow and guaranteed server-side dispatch (A-29, B-01, D-21); move OTP
       delivery fully server-side (A-30); prevent signup-request enumeration (D-26); remove the admin
       client-side direct-table fallback (D-28); deploy current local build to production (D-29).
Must NOT change: Already-correct RLS row-visibility scoping (tighten write/delete only); the already-validated
       P0 hotfix guard logic itself (Batch 0); is_platform_admin's role-based branch (only remove the whitelist
       branch); admin_bulk_delete_users' body behavior (soft- vs hard-delete) until CONFLICT-MIGRATION-NUMBERING
       is resolved.
Tests required: see Test Plan section below.
Acceptance criteria: every RPC in this batch's Database-objects list rejects an unauthorized caller with a live
       DB test (not static text); admin approval issues no shared password and guarantees a server-side notice;
       is_platform_admin never returns true via email pattern; RLS on procurement_stage_events / support_tickets /
       ops-metadata / invoices / work_orders / audit_events / notifications is verified live; production
       frontend fingerprint matches local main post-deploy.
```

---

## Batch 2 — Buyer/Supplier Portal Isolation (5 items)

```
Batch: 2 — Buyer/Supplier Portal Isolation
Issues: F-RUN2-T4-01, F-RUN2-T4-02, F-RUN2-T4-03, C-01 (dup, see F-RUN2-T4-02),
        RUN-2B (partially confirmed — buyer-identity-masking sub-check cleared this session via Run-2d;
        quote-immutability, cross-supplier-isolation, and award-reveal-to-winner-only sub-checks remain unverified)
Files: apps/web/src/pages/HomePage.tsx, apps/web/src/features/auth/ProtectedRoute.tsx,
       apps/web/src/features/supplier/pages/SupplierQuotesPage.tsx, App.tsx, features/auth/ProtectedRoute.tsx,
       features/supplier/pages/SupplierQuotesPage.tsx, features/supplier/api/fetch-invitations.ts
Database objects: (none in structured fields)
Routes: /dashboard, /supplier/quotes, /orders, /purchase-orders, /supplier/* (other unguarded routes)
Prerequisites: F-RUN2-T4-02's ProtectedRoute fix MUST land before F-RUN2-T4-03 — explicit shared dependency,
       both bugs run through ProtectedRoute.tsx's evaluateRouteAccess logic. F-RUN2-T4-01's HomePage
       loading-gate fix is independent and can proceed in parallel.
Expected change: Fix HomePage.tsx's loading-gate boolean (&& -> correct "all sources loaded" check) so the
       buyer dashboard never transiently renders for a supplier session (F-RUN2-T4-01); make ProtectedRoute
       check the user's actual resolved side against the specific role required by the route, not "any allowed
       role" (F-RUN2-T4-02, closes C-01); make /orders -> /purchase-orders role-aware instead of hardcoding
       role="buyer" (F-RUN2-T4-03); remove SupplierQuotesPage's fabricated mock-quote fallback (C-01 secondary
       note); complete RUN-2B's three remaining sub-checks with a genuine supplier persona.
Must NOT change: ProtectedRoute behavior for single-role routes that already work; the already-validated
       buyer-identity-masking behavior RUN-2B's Run-2d check confirmed clean.
Tests required: see Test Plan section below.
Acceptance criteria: a buyer session reaches only buyer-permitted routes/content and a supplier session reaches
       only supplier-permitted routes/content across every dual-role route, verified live with both a buyer and
       a genuine supplier persona; no mock/fabricated quote data renders under any session; RUN-2B's three
       remaining sub-checks pass with a real supplier persona.
```

---

## Batch 3 — Procurement Lifecycle (18 items)

```
Batch: 3 — Procurement Lifecycle
Issues: D-13, D-05, D-06, D-07, D-08, D-09, D-14, D-15, D-16, D-17, D-19, D-23,
        A-07, A-09, A-11, A-13, A-17, A-22
Files: apps/web/src/features/fulfillment/api/invoices.ts, apps/web/src/features/award/api/approval.ts,
       apps/web/src/features/requirement/api/rfq-lifecycle.ts,
       apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx,
       packages/domain/src/types/procurement-communications.ts,
       apps/web/src/features/reveal/components/DecisionReceiptCard.tsx,
       apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx, reporting/lib/pdf-generator.ts,
       apps/web/src/features/fulfillment/components/InvoicePaymentPanel.tsx,
       apps/web/src/features/fulfillment/api/payments.ts, apps/web/src/features/profile/api/buyer-addresses.ts
Database objects: record_invoice_payment_atomic, submit_rfq_tier_approval_atomic,
       create_purchase_order_from_award, apply_tds_withholding_atomic, publish_requirement
Routes: (none in structured fields)
Prerequisites: D-08's reject-branch auth fix is gated on D-07 (rfq_approval_stages insert path) landing first;
       A-13's TDS double-subtraction fix must ship atomically with migration 00199's TDS-netting change (see
       Conflict Map — 00199 dependency); A-13 and D-16 need LEGAL/RULE verification (TDS section rates/rounding;
       GST rate, place of supply, CGST+SGST vs IGST) before implementation; A-11 must land together with D-13
       (invoice can still be raised at 0% progress until both ship).
Expected change: Align audit_events schema so record_invoice_payment_atomic stops failing (D-05); set
       balance_due correctly at invoice creation instead of relying on a stale backfill default (D-06);
       implement the real INSERT path for rfq_approval_stages tied to an actual approval workflow and tighten
       its permissive policy (D-07); add the missing authorization check to submit_rfq_tier_approval_atomic's
       reject branch once D-07 lands (D-08); compare against the resolved profile id, not raw auth.uid(), in the
       anti-self-approval check (D-09); add a trigger/explicit WITH CHECK restricting which roles may set which
       invoice status values, closing the supplier self-approval gap beyond 00202's row-visibility fix (D-13);
       move RFQ status transitions server-side with an explicit allowed-transition table (D-14); persist real PO
       line items/GST breakdown server-side instead of client-invented values (D-15); compute GST rate and place
       of supply from real order/location data (D-16); replace the fake Math.imul "SHA-256" decision-receipt
       hash with a real server-side cryptographic hash or correct the copy claim (D-17); compute real
       savings/on-time metrics or remove fabricated report figures (D-19); add the missing write path that
       populates rfqs.delivery_address_snapshot on publish/award (D-23); harden RFQ open-RFQ idempotency beyond
       DB unique constraints (A-07); replace remaining window.print() PDF paths with real document generation
       (A-09); enforce the 0-25-50-75-100 milestone sequence server-side (A-11); fix client-side TDS
       double-subtraction alongside server netting (A-13); add proper delivery_instructions/sub-locality columns
       instead of the address-field-mapping workaround (A-17); add the server-side pilot-allowance check to
       publish_requirement (A-22).
Must NOT change: The existing correct milestone 0..100 CHECK constraint (extend, don't replace); legitimate
       buyer-side approve/pay invoice transitions (D-13's fix must be role-aware, not a blanket lock); the
       already-correct PO->COMPLETED transition guard (00171) while adding the new DRAFT->OPEN guard (D-14).
Tests required: see Test Plan section below.
Acceptance criteria: payment recording succeeds end-to-end on a live DB (D-05/D-06); a multi-tier RFQ cannot be
       approved without real approval-stage rows and the reject path is authorization-checked (D-07/D-08/D-09);
       a supplier cannot self-approve/self-pay an invoice or skip a milestone tier (D-13/A-11); PO/invoice GST
       figures match stored data, not fabricated values (D-15/D-16/D-19); delivery_address_snapshot is populated
       on every new award (D-23); TDS is computed once, correctly, per legal rate/rounding rules (A-13);
       publish_requirement rejects direct RPC calls that exceed the pilot allowance (A-22).
```

---

## Batch 4 — Registration/Validation (2 items)

```
Batch: 4 — Registration/Validation
Issues: F-RUN2-VAL-01 (canonical), C-03 (dup, see F-RUN2-VAL-01)
Files: BuyerRegisterForm.tsx, SupplierRegisterForm.tsx, portal/api/signup.ts
Database objects: submit_signup_request
Routes: (none in structured fields)
Prerequisites: None blocking — isolated to registration form UI + submit_signup_request error humanization.
Expected change: Add client-side field-level validation with visible error messages on Buyer/Supplier
       registration forms instead of a silently-disabled submit button; humanize the raw enum error
       submit_signup_request currently raises for an empty "side" field.
Must NOT change: submit_signup_request's existing NOT NULL/shape CHECK constraints (email, phone, pincode,
       category) — correct and must stay; the anti-enumeration behavior tracked separately under D-26 (Batch 1).
Tests required: see Test Plan section below.
Acceptance criteria: submitting the registration form with empty required fields shows field-level, human-
       readable errors before any network call; a deliberately empty "side" value returns a humanized message,
       not a raw enum error.
```

---

## Batch 5 — API/Data Integrity (3 items)

```
Batch: 5 — API/Data Integrity
Issues: F-RUN2-API-01 (canonical), B-02 (dup, see F-RUN2-API-01), C-02 (dup, see F-RUN2-API-01)
Files: features/announcements/hooks/useAnnouncements.ts, features/announcements/components/AnnouncementBanner.tsx,
       packages/database/src/reset/clean-start-reset.ts, scripts/scan-canonical-vocabulary.cjs
Database objects: get_active_announcements, admin_manage_announcement
Routes: (none in structured fields)
Prerequisites: None blocking — fully open, no candidate fix exists anywhere yet (confirmed not touched by local
       main's 00198-00203 per F-RUN2-API-01's evidence).
Expected change: Sanitize/retire the get_active_announcements banner content that exposes internal
       dev/hardening text and prohibited vocabulary to authenticated users — a forward migration archiving/
       expiring the seeded announcement row (id e2000001-...) by id (no delete), and/or filtering the RPC's
       returned text; extend scripts/scan-canonical-vocabulary.cjs to cover DB-seeded copy so this class of
       drift is caught automatically going forward (pairs with D-30 in Batch 6).
Must NOT change: get_active_announcements' audience-targeting/expiry logic itself — only its content and
       vocabulary compliance; the announcements table or admin_manage_announcement's ability to author new
       announcements.
Tests required: see Test Plan section below.
Acceptance criteria: get_active_announcements returns no prohibited/internal vocabulary to any authenticated
       caller, verified live; the vocabulary scanner flags DB-seeded copy in CI going forward.
```

---

## Batch 6 — UX/Accessibility (13 items)

```
Batch: 6 — UX/Accessibility
Issues: F-RUN2-DASH-01 (partially confirmed — visible-label gap only; the "missing tooltip"/"missing accessible
        label" sub-claims are false as coded and are NOT in scope here), A-01, A-04, A-19, A-23, A-24, A-26,
        A-32, B-06, B-07 (dup, see A-26), B-04 (dup, see A-25 [Needs-discovery] / A-32), D-22, D-30
Files: apps/web/src/components/MobileBottomNav.tsx, apps/web/index.html,
       apps/web/src/features/site/pages/PricingPage.tsx, apps/web/src/pages/MobileShowcasePage.tsx,
       apps/web/src/features/site/pages/AboutPage.tsx, ProcurementStageNavigator.tsx,
       ActiveRfqMonitoringPage.tsx, App.tsx, InvoicePaymentPanel.tsx, MilestoneInspectionChecklist.tsx,
       SupplierAwardOnboardingPage.tsx, SupplierWorkOrderPage.tsx, apps/web/src/features/org/api/org-members.ts,
       scripts/scan-canonical-vocabulary.cjs
Database objects: (none in structured fields)
Routes: /, /pricing, /showcase, /mobile, /mobile-showcase, /about, * (catch-all / unknown paths)
Prerequisites: A-01/A-23/A-26 are already fixed in local source but need D-29's production deploy (Batch 1) to
       go live — no additional code change beyond confirming the deploy carries them; D-30's scanner extension
       pairs naturally with Batch 5's F-RUN2-API-01 fix.
Expected change: Add a small visible text label to the mobile "+" FAB instead of relying on title/aria-label
       alone (F-RUN2-DASH-01); remove the residual "10% reward" pricing copy (A-04) and "6-Stage Commercial
       Procurement Lifecycle" showcase copy (A-24); replace ad-hoc toLocale* date calls with the shared IST
       formatter in remaining admin/financial dashboards (A-19); adjust the fixed-position navigator bar and
       monitoring dock layouts to stop colliding with page content (A-32); add a real 404 page instead of the
       silent catch-all redirect to "/" (B-06); rewrite notification-related UI copy to match true delivery-
       state guarantees instead of over-claiming (D-22); extend the vocabulary scanner to cover DB-seeded copy
       (D-30, pairs with Batch 5).
Must NOT change: AboutPage's underlying role-gating logic (A-26) — already correct locally, this batch only
       confirms the deployed bundle matches; ProcurementStageNavigator/ActiveRfqMonitoringPage's functional
       behavior, only their fixed-position layout offsets (A-32).
Tests required: see Test Plan section below.
Acceptance criteria: mobile FAB has a visible label at all tested viewport widths; no banned copy strings ("10%
       reward", "6-Stage Commercial Procurement Lifecycle", legacy brand names) remain in the deployed
       production bundle after D-29's deploy; unknown routes render a real 404 state; notification copy passes a
       manual accuracy read-through against the notification-status.ts domain model.
```

---

## Needs further discovery before batching (24 items)

Base-series items (Parts A/B/D) that are still UNVERIFIED and do not obviously belong to Batches 1–6 above. Each needs a code-read / live-DB check before it can be scoped as an implementation batch item — no further speculation performed here per the consolidation-only mandate.

- **A-02** — Claimed favicon SVG stopColor fix; not code-read. Low priority.
- **A-03** — Claimed admin bulk-action UI safety fix; not code-read. Related direct-table fallback is separately confirmed open as D-28 (Batch 1).
- **A-05** — Claimed address-write client fix; not code-read. Server-side ownership gap tracked separately as A-SEC-5 (Batch 1); schema gap as A-17/D-23 (Batch 3).
- **A-06** — Claimed requirement-intake prefill fix; not code-read.
- **A-10** — Governance charter is a placeholder; blocked pending a product-owner decision and a missing charter/agreement schema.
- **A-12** — Claimed single settlement-CTA fix; not code-read.
- **A-14** — Claimed Invoice/Balances real-data fix; not code-read.
- **A-15** — Claimed sign-off blocker message fix; not code-read.
- **A-16** — Claimed mobile footer layout fix; static class tests only, not device-verified.
- **A-18** — Claimed voice-input/autofocus fix; not code-read.
- **A-21** — Claimed Google Places quota label fix; not code-read.
- **A-25** — Claimed homepage CTA-duplication fix; not deployed, local source not re-read; production bundle still shows the duplication.
- **A-27** — Claimed removal of cryptographic-language copy; production still shows "cryptographic salts"; full local scan not performed.
- **A-28** — Claimed supplier RFQ minimal-field UI fix; not code-read. Server-side counterpart tracked as A-SEC-6 (Batch 1) / A-SEC-7 (Batch 0).
- **A-31** — Claimed footer/scroll architecture fix; static tests only, not device-verified.
- **B-05** — Legacy route aliases incl. an obfuscated "blind-comparison" path; no original Run-1 evidence to confirm which route was reported.
- **B-08** — Navigation-hierarchy concern with no original evidence recorded to scope it.
- **D-10** — Award-committee quorum/COI/membership rules not enforced in SQL; needs live verification, not re-checked this session.
- **D-11** — Bundle of award-path gaps (award-while-OPEN, repeat award, direct-insert bypass, unmask-gate skip); needs live verification.
- **D-12** — Supplier can edit quote status/score post-deadline; needs live verification.
- **D-18** — Milestone sign-off hash computed client-side with a hard-coded salt; needs live verification.
- **D-20** — Supplier "truthful verification" token check is regex-only/plaintext with an anon EXECUTE grant; needs live verification.
- **D-24** — No idempotency key/unique constraint for settlement payments; duplicate-payment protection unverified.
- **D-25** — Platform-fee deduction vs "deducts/holds" copy may contradict the non-escrow pilot rule; needs product/legal confirmation before scoping.

---

## Deferred / No action needed (3 items)

- **D-32** — FALSE POSITIVE. Earlier draft suspected `notifications` DELETE RLS used `USING (true)`. Migration `00134` (which runs after the vulnerable `00130`-`00132` definitions) unconditionally drops and recreates the policy scoped to `profile_id = private.get_profile_id() OR private.is_platform_admin()`. Already correctly scoped by migration `00134` — no code fix needed.
- **RUN2D-FP-01** — TEST-HARNESS FALSE POSITIVE. An automated identity-leak regex flagged the string "Production Hardening v6.3" as a person's name. Live Run-2d visual/network validation (buyer persona "Manimekalai", supplier persona "Dhiya") confirmed no actual buyer-identity leak. Fix the test harness's identity-detection regex, not the product.
- **CONFLICT-MIGRATION-NUMBERING** — PROCESS-ONLY, not a code defect. Local main's own migrations `00198`-`00203` and the P0 hotfix's separately-numbered `00198` collide on numbering with divergent content. Awaiting an explicit product-owner reconciliation decision (see Conflict Map below) before any implementation that touches local main's `00199`/`00201`/`00203` content can proceed.

---

## Conflict Map

**The collision.** Local main's own migrations `00198`–`00203` (6 files, commits `5325988`/`769813a`/`4db44c4`/`c23d6fc`/`d3e98a9`/`168409e`) and the P0 hotfix's migration `00198` (branch `hotfix/p0-security`, commit `2dd3c2d`) are numbered identically but contain entirely different content, both rooted at the same commit `a1586c9`. This is a genuine numbering collision, not mere overlap.

**Scope of duplication.** The hotfix's single `00198` file functionally duplicates/supersedes work spread across **four** of local main's files — `00198` (synthetic quote/pilot simulator isolation), `00199` (privileged RPC hardening / supplier masking / financial enforcement), `00201` (procurement stage events / audit delete / support tickets), and `00203` (ops metadata / profile privileges / TDS). Once reconciled, large portions of those four local-main files become dead/redundant and need stripping, not just renumbering.

**Named behavioral divergences (2):**
1. **`admin_bulk_delete_users`** — local main's `00199` changes the function body to soft-delete-only; the hotfix keeps the original hard-delete body and only patches the caller-authorization guard. Real behavioral conflict; needs a product decision on which behavior is correct.
2. **Synthetic-quote/demo-stub scope** — local main's `00198` restricts the function to platform-admins only; the hotfix's equivalent section also permits members of the demo RFQ's own organization. Scope conflict; needs a decision.

**Items whose `migration_dependency` cites local main's `00199`/`00201`/`00203` and must therefore wait for the reconciliation decision:**

| ID | Batch | Cites |
|---|---|---|
| A-SEC-5 | Batch 1 | 00199 |
| A-R6 | Batch 1 | 00203 |
| A-R8 | Batch 1 | 00201 |
| A-R8-SUPPORT | Batch 1 | 00201 |
| A-R9 | Batch 1 | 00203 |
| A-OPEN-PROFILE-INSERT | Batch 1 | 00203 (context: gap open even after 00203) |
| D-04 | Batch 1 | 00199 (referenced, not redefined) |
| A-11 | Batch 3 | 00199 |
| A-13 | Batch 3 | 00199, 00203 |
| A-22 | Batch 3 | 00199 |
| D-23 | Batch 3 | 00199 (grant exclusion only) |

Everything else in Batches 1–6 cites migrations outside the `00199`/`00201`/`00203` set (e.g. `00200`, `00202`, `00196`, `00004`, `00161`, `00179`, or none) and is **not** gated by this conflict.

---

## Test Plan

Minimum tests implied by each batch's actual issues — not the full suite.

**Batch 1 — Security/Authorization**
- Static: grep sweep confirming no remaining always-true (`OR auth.role()='anon'`)-style guards across the batch's RPC list.
- Unit: guard-check unit tests per RPC (admin-only, owner-only, resolved-role-only as applicable).
- Integration: end-to-end admin approval flow issuing no shared password.
- Database: live-DB execution of local main's `00198`-`00203` plus RLS policy tests on `procurement_stage_events`, `support_tickets`, ops-metadata tables, `invoices`/`work_orders`, `audit_events`, `notifications`.
- Functional: anon/unauthenticated calls to every Database-object in this batch return `permission denied`, not data.
- Security: privilege-escalation regression pass (self-promotion to admin, email-whitelist removal, enumeration attempt on `submit_signup_request`).
- Regression: existing legitimate admin/owner flows for the same RPCs still succeed.

**Batch 2 — Buyer/Supplier Portal Isolation**
- Static: lint check that ProtectedRoute no longer branches on "any allowed role."
- Unit: ProtectedRoute unit tests per role/route combination (buyer-only, supplier-only, dual-role).
- Functional: buyer session cannot reach `/supplier/quotes`/`/supplier/*`; supplier session cannot reach buyer-only dashboard content; `/orders` renders the correct role-specific view for both sides.
- Security: live black-box run with a genuine supplier persona covering RUN-2B's remaining sub-checks (quote immutability, cross-supplier isolation, award-reveal-to-winner-only).
- Regression: existing dual-role routes that are correctly shared (if any) remain accessible to both sides.

**Batch 3 — Procurement Lifecycle**
- Unit: milestone-sequence guard (0-25-50-75-100), anti-self-approval id comparison, TDS calculation.
- Integration: full invoice payment flow from creation through `record_invoice_payment_atomic` and `apply_tds_withholding_atomic` on a live DB.
- Database: `rfq_approval_stages` insert path + tightened policy; `delivery_address_snapshot` populated on award.
- Functional: PO/invoice documents reflect stored GST data, not fabricated figures.
- Security: reject-branch authorization check on `submit_rfq_tier_approval_atomic`; supplier cannot flip invoice to APPROVED/PAID.
- Regression: legitimate buyer approve/pay transitions and the existing PO->COMPLETED guard still work.

**Batch 4 — Registration/Validation**
- Unit: field-level validators for Buyer/Supplier registration forms.
- Functional: empty-field submission shows visible errors; empty "side" shows a humanized message.
- Regression: valid submissions still succeed through `submit_signup_request`.

**Batch 5 — API/Data Integrity**
- Database: forward migration archiving/expiring the seeded announcement row by id.
- Static: vocabulary scanner run against DB-seeded copy (new coverage).
- Functional: `get_active_announcements` returns no prohibited vocabulary to authenticated callers.
- Regression: legitimate, compliant announcements still display correctly.

**Batch 6 — UX/Accessibility**
- Static: vocabulary scanner clean run across local source + DB-seeded copy (D-30 extension) post-deploy.
- Functional: mobile FAB visible-label check at tested viewport widths (incl. 320-375px per A-16/A-31 context, though those items themselves remain in discovery); unknown-route 404 rendering.
- Regression: production bundle fingerprint check confirming banned copy strings are gone post-D-29-deploy.

---

**Batch item-count summary:** Batch 0 = 13, Batch 1 = 26, Batch 2 = 5, Batch 3 = 18, Batch 4 = 2, Batch 5 = 3, Batch 6 = 13, Needs further discovery = 24, Deferred = 3. Total = 107.
