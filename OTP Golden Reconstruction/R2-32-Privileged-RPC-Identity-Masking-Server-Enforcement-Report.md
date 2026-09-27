# R2-32 — Privileged RPC Hardening, Supplier Identity Masking and Server-Side Financial / Milestone / Allowance Enforcement (Local)

Date: 27 Sep 2026 (IST). Scope: local working tree only, under the Product Owner decision to add one local migration `00199`. No push, no deploy, no `supabase db push` / link, no production or shared database access, no real messages sent. The eight `apps/web/public/wa-*` screenshots were not touched or staged.

**Migration 00199 has never been executed.** No local Postgres, Docker or Supabase CLI is available in this environment. Every SQL claim below is proven only by static contract tests that read the migration text, re-parse migrations 00001–00198, and emulate the guard rewrite in JavaScript. "FIXED (static)" means exactly that: the SQL is written and pinned by tests, but no database has run it.

Every number below was copied from commands run in this session.

---

## A. Baseline

| Item | Value |
|---|---|
| HEAD at start | `532598839f5901922a2b92b157f016db23738ff8` |
| Working tree at start | clean |
| Migrations at start | 198 files, highest `00198` |
| Migrations added | 1 (`00199_harden_privileged_rpcs_supplier_masking_and_financial_enforcement.sql`, 1638 lines, single `BEGIN … COMMIT`) |
| Migrations at end | 199 files, highest `00199`, contiguous 00001–00199 (asserted by test) |

Ceiling references updated to 199:
- `packages/database/src/reset/clean-start-reset.ts` and its test;
- `tests/security/synthetic-quote-migration-00198-redteam.test.ts`, which now asserts 00198 sits at position 198 of a 199-file contiguous chain;
- `scripts/otp-promote-certified.ps1`, which was still at 197 from before 00198.

---

## B. Per-item matrix

Test files: **T199** = `tests/security/privileged-rpc-hardening-00199-redteam.test.ts` (62 tests). **TCOL** = `apps/web/src/features/admin/rfq-column-privileges.test.ts` (2 tests). Line numbers for 00199 refer to the final file.

| Item | Root cause (file:line at 5325988) | Fix in 00199 | Tests | Status |
|---|---|---|---|---|
| SEC-1 `lock_and_reveal_award_atomic` | 00151:47-52 had a buyer `is_org_manager_or_above` check. 00156 dropped it, and 00160 / 00192 / 00196 kept the drop (latest body 00196:527-746, `GRANT … anon` at 00196:746). Any caller, including anon, could lock and reveal an award. | :304-533. Same body as 00196 plus one guard, placed right after the RFQ row lock and before any write: service_role, platform admin, or `auth.uid()` non-null and `COALESCE(is_org_manager_or_above(org), false)`. Raises `AWARD-UNAUTHORIZED`. Revoked from PUBLIC and anon. Delegated ISSUE_PO holders are not honoured (quotes have no amount column to check against), so this fails closed. | T199 "SEC-1": the guard, guard-before-write ordering, a line diff vs 00196 (0 removed; exactly the 7 guard lines added, so approval-tier / quorum / COI / anti-self-approval are unchanged), revoke. | FIXED (static) |
| SEC-2 `admin_bulk_delete_users` | 00186:24 always-true guard (`OR auth.role()='authenticated'`). Anon grant at 00186:143. Hard-delete path at 00186:74-106. The audit insert used non-existent `actor_role`/`action` columns inside a swallowed exception, so no audit row was ever written. | :201-298. Guard is platform admin or service_role only. Always deactivates (`status='DELETED'`, `deleted_at`); signup request set to REJECTED. No DELETE anywhere, and `p_soft_delete=false` is accepted but refused (`hardDeleteRefused`). Audit uses real columns (`event_type 'admin.bulk_delete_users'`), with no exception swallowing. Protected-admin filter kept. Revoked from PUBLIC and anon. | T199 "SEC-2": guard, no DELETE, `IF p_soft_delete` branch removed, protected filter, audit columns, no `EXCEPTION WHEN`. | FIXED (static) |
| SEC-3 `admin_execute_service_action` | 00131:316 always-true guard; anon grant 00131:525. | Sweep (§C): disjunct stripped from the live definition, result asserted clean, revoked from PUBLIC and anon. | T199 "A1": in sweep list; rewrite emulation clean and still admin-gated. | FIXED (static) |
| SEC-4 `admin_get_users_and_organizations` | 00165:195 always-true guard; anon grant 00165:337. | Sweep, as for SEC-3. | T199 "A1". | FIXED (static) |
| SEC-5 `upsert_buyer_address_atomic` | 00196:246. On update, "unset other primaries" and the UPDATE ran with no ownership check on `p_address_id`, so any signed-in user could overwrite any address. Anon grant 00196:321. | :539-705. Before anything is touched, the existing row is locked FOR UPDATE and `v_can_edit` is computed: admin, or owning profile for personal addresses, or org member for org addresses, all wrapped in COALESCE so it fails closed. A caller who can't edit gets "Address record not found", so existence isn't leaked. Moving an address between profile and org is rejected. Revoked from anon on the full 15-arg signature, and on `get_buyer_addresses(uuid)`. | T199 "SEC-5": ownership check before primary-unset and update, the three permitted actors, line diff vs 00196 (only the unlocked SELECT removed), revokes. | FIXED (static) |
| SEC-6 address snapshots | Policy 00004:181-183 lets invited suppliers read their `rfqs` rows, and 00196:97-99 added `delivery_address_snapshot` / `billing_address_snapshot` to `rfqs`. RLS cannot hide columns, so suppliers could read the full buyer address pre-award. | :857-883 `DO $cols$`. SELECT on `rfqs` revoked from PUBLIC, anon and authenticated, then re-granted to authenticated on every column except the two snapshots, with the list built from `information_schema`. Pincode and city stay available (`requirements.delivery_city`, masked view). Client: `admin-ops.ts:86` `select('*')` became `select('id', …)`, the only `*` select on `rfqs`. | T199 "SEC-6"; TCOL scans all of `apps/web/src` for `select('*')`, bare `.select()` after rfqs writes, `rfqs(*)` embeds and snapshot column names (0 found). | FIXED (static) |
| SEC-7 / Issues 20 & 28 buyer name | `rfqs_supplier_masked` 00117:126-133 showed `o.name` whenever `buyer_anonymous_to_suppliers` was false, and 00180:221 sets that flag false for OPEN_RFQ. `supplier_rfq_message_payload` 00037:177-179 had the same rule, with an anon/authenticated grant at 00037:997. The WhatsApp template (`templates.ts:162`) reads `payload.buyerDisplay`. | :886-1002. The view and the payload show the buyer name only when `r.reveal_status='REVEALED'` and a REVEALED award exists whose quote's `supplier_id` is this supplier. Otherwise they show "Identity protected" / "IDENTITY PROTECTED". View columns and order are unchanged from 00117. Payload is service_role only. | T199 "SEC-7": reveal predicate in both places, column list equals 00117, payload diff (only the 3 old CASE lines removed), grants. | FIXED (static) |
| Wider sweep | 41 always-true SECURITY DEFINER overloads (38 names) in 00072–00186, plus the extras in §C. | §C. | T199 "A1" re-derives the inventory from 00001–00198 and asserts 0 uncovered. | FIXED (static) |
| Issue 13 TDS | 00173:326-481 `apply_tds_withholding_atomic` never worked:<br>• audit insert used a non-existent `action` column with no `event_type`;<br>• checked the non-existent enum labels `DRAFT`/`CANCELLED` (00173:373);<br>• `get_org_role` NULL let callers without a role through (00173:357);<br>• `p_organization_id` was never matched to the invoice;<br>• trusted the client's taxable amount;<br>• no idempotency.<br>Buyers could also write `tds_deductions` directly (policy 00173:316-320). Balance was never netted: 00178:443, 00172:424 and 00175:979 all compute `amount − paid`, so an invoice with TDS could never reach PAID. Client `settlement-state.ts:315` used the server balance as "outstanding", which would double-subtract TDS once the server nets it. | :1005-1311.<br>• Same RPC signature; `p_taxable_amount` is ignored and recorded as `client_taxable_amount`.<br>• Org is derived from the invoice's PO (direct or via work order); mismatch → `TDS-5C4-ORG-MISMATCH`.<br>• OWNER/MANAGER check via COALESCE.<br>• Idempotent replay of the live deduction.<br>• Real statuses; rate 0–20.<br>• Base = gross − GST split, else `taxable_total`, else gross (same precedence as `deriveInvoiceTdsBase`); nearest rupee, ₹1 floor; may not exceed outstanding.<br>• Audit `'tds.deducted'` with real columns.<br>• Partial unique index: one live deduction per invoice.<br>• Direct mutation is admin-only.<br>• BEFORE UPDATE trigger nets live TDS into `balance_due` and moves APPROVED/PARTIALLY_PAID → PAID when paid + TDS ≥ amount; voiding or changing TDS re-runs it.<br>Client: `buildInvoiceBalanceRows` now computes outstanding as gross − paid; `applyTdsWithholdingRpc` returns `idempotentReplay` / `taxableAmount`; the panel shows "already recorded" on replay. | T199 "Issue 13" (12 tests, including a JS mirror of the SQL base checked against `deriveInvoiceTdsBase` on 6 invoices). `invoice-balances-and-blockers.test.tsx`: "does not subtract TDS twice when the server balance already nets it", "an invoice settled by payment plus TDS shows nothing left to pay". `tds-withholding-panel.test.tsx`: replay / server-base test plus panel source test; the existing expectation now also includes `idempotentReplay:false`. | FIXED (static) |
| Issue 11 milestones | Client `work-orders.ts:217,224` (HEAD) set `COMPLETED` / `completed_at` when progress reached 100, and the server had no rule on `work_orders.progress_percent` at all. | :1314-1563.<br>• BEFORE UPDATE OF progress_percent, status trigger: only the supplier user or a buyer owner/manager may change progress; values 25/50/75/100 only, and exactly the next step (`STEP` / `BACKWARD` / `SKIP` errors); a COMPLETED row is locked.<br>• COMPLETED only with the transaction-local sign-off flag set by `accept_delivery_inspection` and at 100%.<br>• AFTER trigger writes `work_order.milestone_recorded` / `work_order.completed` audit events.<br>• `accept_delivery_inspection` (00195 body) now requires 100% first (`WO-INSPECTION-BEFORE-100`) and sets and clears the flag around its UPDATE.<br>• Exemptions: platform admins, and the demo simulator only when running inside another trigger on a demo row.<br>Client: `updateWorkOrderProgress` always writes `IN_PROGRESS` and never `completed_at`. | T199 "Issue 11" (7 tests, including a JS mirror of the step rule and a 00195 line diff with 0 removed / 5 added). `milestone-progression.test.tsx`: **the prior test "marks COMPLETED only on the deliberate 75 → 100 step" was replaced** by "records 100% … leaves completion to buyer inspection", because the required behaviour changed; a new source test asserts `updateWorkOrderProgress` never writes `COMPLETED`/`completed_at`. | FIXED (static) |
| Issue 22 pilot allowance | 00180:125 `publish_requirement` had no allowance check, and `rfq-lifecycle.ts:185` inserts `rfqs` directly, so the UI gate was the only enforcement. | :1565-1611. BEFORE INSERT trigger on `rfqs`: 3 RFQs per organization per UTC calendar month. The allowance equals the domain's `PILOT_MONTHLY_RFQ_ALLOWANCE` (= `STANDARD_MONTHLY_RFQ_ALLOWANCE`) and the month window matches `getCalendarMonthWindow`. The org row is locked to serialize concurrent publishes; admins bypass. The error text is word-for-word the client gate's message, with HINT `PILOT_ALLOWANCE_EXHAUSTED`. | T199 "Issue 22" (4 tests: the constant is imported from `@otp/domain`, the message is compared with `PILOT_ALLOWANCE_EXHAUSTED_ERROR`). | FIXED (static) |
| Issue 5/17 | SEC-5 needed no new columns. | None beyond SEC-5. | — | UNCHANGED (not required) |
| Issues 3, 10, 29, 30 | Out of scope. | None. | — | NOT TOUCHED |

---

## C. Always-true / anon-granted SECURITY DEFINER functions and their disposition

**Inventory method:** T199 statically parses migrations 00001–00198, keeps the latest definition per name and argument types, drops removed functions, and flags SECURITY DEFINER bodies that contain any of:
- `auth.role() = 'authenticated'|'anon'`
- `auth.role() IN (… 'authenticated'|'anon' …)`
- `current_user IN ('postgres', …)`, which is always true inside a definer function because `current_user` is the owner.

**Result:** 41 overloads across 38 names. All 38 names are covered: 36 by the sweep and 2 re-created by hand. The test asserts 0 uncovered.

**Sweep, 00199:46-135.** The same 36 names are processed on the live database, covering every overload returned by `pg_proc` at run time. For each one:
1. Three `regexp_replace` passes remove the always-true part of the guard.
2. If an always-true pattern remains, the migration raises and aborts.
3. If the rewrite would lose `private.is_platform_admin()`, it also raises.
4. Otherwise the rewritten definition is executed.
5. Every overload is revoked from PUBLIC and anon.

The JS mirror in T199 applies the same three rewrites to all 41 static bodies. Each comes out clean and still contains the admin check, so the abort path is not expected to trigger on the current chain.

| # | Function (overload) | Origin | Disposition |
|---|---|---|---|
| 1-2 | `admin_create_db_backup(text,text)`, `admin_get_db_backups()` | 00072 | Swept → admin only, anon revoked |
| 3 | `admin_run_diagnostic_query(text)` (arbitrary SQL) | 00074 | Swept → admin only, anon revoked |
| 4 | `admin_fix_buyer_issue(text,text,text,text)` | 00099 | Swept |
| 5-6 | `admin_run_buyer_diagnostics`, `admin_run_seller_diagnostics` `(text,text)` | 00100 | Swept |
| 7 | `admin_fix_seller_issue(text,text,text,text)` | 00102 | Swept |
| 8 | `admin_generate_proactive_maintenance_alerts()` | 00104 | Swept |
| 9 | `admin_search_entities(text,int)` | 00105 | Swept |
| 10 | `admin_run_test_case(text,text)` | 00115 | Swept |
| 11 | `admin_mark_all_notifications_read(text)` (`current_user` pattern) | 00116 | Swept |
| 12 | `admin_mark_notification_read(uuid)` (`current_user` pattern) | 00116 | **Re-created** (00199:159-195): admins mark any, users only their own; anon revoked |
| 13 | `admin_restore_db_backup(uuid,text,…)` | 00124 | Swept |
| 14-15 | `admin_get_live_transactions(int,int,text,boolean)`, `admin_get_seller_orders(int,int,text,text)` | 00126 | Swept |
| 16-18 | `admin_get_live_transactions(…,text)`, `admin_get_seller_orders(…,text)`, `admin_search_entities(text,int,text)` | 00128 | Swept |
| 19-20 | `admin_toggle_maintenance_mode(boolean,text)`, `admin_toggle_demo_mode(boolean)` | 00130 | Swept |
| 21 | `admin_execute_service_action(text,text,jsonb)` (SEC-3) | 00131 | Swept |
| 22 | `admin_get_system_health(text)` | 00132 | Swept |
| 23-26 | `admin_get_all_notifications`, `admin_get_audit_trail`, `admin_clear_audit_logs_and_notifications`, `admin_clear_notifications` | 00134 | Swept |
| 27-34 | `admin_get_system_alerts`, `admin_force_transition_order_state`, `admin_bypass_approval_gate`, `admin_toggle_entity_gst_compliance`, `admin_unblock_sealed_quote`, `admin_simulate_po_acceptance`, `admin_retry_invoice_payment_webhook`, `admin_get_entity_audit_trail` | 00139 | Swept |
| 35-36 | `admin_resolve_support_ticket`, `admin_get_support_tickets` | 00140 | Swept |
| 37 | `admin_review_signup_request(uuid,text,text,text)` | 00161 | Swept |
| 38-39 | `admin_get_signup_requests(text)`, `admin_get_users_and_organizations()` (SEC-4) | 00165 | Swept |
| 40 | `admin_purge_all_transactional_records(text)` | 00184 | Swept → admin only, anon revoked |
| 41 | `admin_bulk_delete_users(uuid[],boolean)` (SEC-2) | 00186 | **Re-created** (00199:201-298) |

**Other anon-granted or unchecked SECURITY DEFINER objects:**

| Object | Problem | Disposition |
|---|---|---|
| `clear_all_transactional_data`, `review_signup_request` (wrappers) | Delegate to the swept overloads | Revoked from PUBLIC/anon (in the sweep); protected by the inner guard |
| `admin_database_snapshots` RLS (00072:18-22) | Full-DB snapshots readable and writable by anon | Policies re-created as `TO authenticated USING/WITH CHECK (is_platform_admin())`; table revoked from anon (:141-153) |
| `lock_and_reveal_award_atomic` (SEC-1) | No caller check, anon grant | Re-created with a guard (§B) |
| `upsert_buyer_address_atomic`, `get_buyer_addresses` | Anon grant; no owner check on update | Re-created / anon revoked (§B) |
| `create_system_notification` (all overloads) | Anon/authenticated could send spoofed notifications to any profile | Revoked from PUBLIC, anon and authenticated; service_role only. T199 asserts every caller in 00001–00198 is SECURITY DEFINER and `apps/web/src` never calls it. |
| `get_organization_subscription(uuid)` | No caller check, anon grant (org billing data) | Guard added: org member, platform admin or service_role; anon revoked |
| `get_purchase_order_invoicing_summary(uuid)` | No caller check, anon grant | Guard added: admin, buyer org member or PO supplier; anon revoked |
| `get_current_procurement_step`, `check_supplier_award_eligibility_atomic` | Anon grant | Anon revoked; **still callable by any signed-in user** (residual R1) |
| `supplier_rfq_message_payload(uuid,uuid)` | Leaked buyer name; anon/authenticated grant | Masked; service_role only |
| `apply_tds_withholding_atomic` | See Issue 13 | Re-created; anon revoked |
| `accept_delivery_inspection` | Anon grant | Re-created; anon revoked |

**Kept public by design (anon-callable, reviewed, no change):**
- Read-only reference or flag data: `demo_status`, `served_cities`, `service_categories`, `role_catalog`, `get_maintenance_status`, `admin_get_system_mode` (read-only flags), `lookup_market_intelligence`.
- Pre-login flows with their own rate limits and OTP checks: `check_and_increment_rate_limit`, `submit_signup_request`, `request_whatsapp_password_reset` / `verify_whatsapp_password_reset`, `request_profile_verification_otp` / `verify_profile_verification_otp`.

**Token-gated (kept):**
- `redeem_supplier_magic_link`, `submit_messaging_quote`, `complete_supplier_onboarding_atomic`;
- `messaging_quote_context`, which now inherits the masked `buyerDisplay`.

**Post-condition, 00199:1613-1636:** a DO block raises a WARNING (it does not fail) if any public SECURITY DEFINER function still matches the patterns. This catches definitions that exist only on the live database and not in the migration chain.

---

## D. Security implications

**What changes for callers:**
- Anon can no longer execute any admin RPC, the award lock, address writes, subscription and invoicing readers, notification creation or the supplier payload.
- Signed-in non-admins get "Access denied" from all 36 swept admin RPCs instead of full admin power.
- The award lock requires the buying org's OWNER/MANAGER. A buyer MEMBER who could previously lock an award now gets `AWARD-UNAUTHORIZED`. This is intended, and it is consistent with 00151.
- Suppliers lose the two address snapshot columns entirely, and see the buyer name only after the award is revealed to them.

**Compatibility risks (unproven without a DB):**
1. Any code path outside `apps/web/src` / `packages` that selects `*` or the snapshot columns from `rfqs` as `authenticated` will now fail. Edge functions use service_role and are unaffected.
2. A column added to `rfqs` later must be granted to `authenticated` explicitly.
3. The milestone trigger can reject legitimate non-demo writers that I did not find. The ones I checked were the client, the admin functions (bypassed), the demo simulator (exempt only inside a trigger on demo rows) and `accept_delivery_inspection`.
4. The TDS balance trigger changes `balance_due` on every invoice that has live TDS.

**Pilot financial freeze is untouched:** 00199 contains no settings, fee, reward, referral or ledger-mode writes (asserted by T199).

**PA-01..PA-10:**
- **PA-06** (`lock_and_reveal_award_atomic`) was changed on purpose by the SEC-1 fix. The 00196 body is kept line for line and only the caller guard is added (T199 line diff).
- **PA-09** (anti-self-approval) was being bypassed server-side through SEC-1. That bypass is now closed.
- **PA-04** (`quotes_identity_protected`), **PA-05**, **PA-08** (bilateral GST RLS) and **PA-10** (append-only votes and stage events) are not modified. The only RLS policies 00199 touches are `admin_database_snapshots` and `tds_deductions_mutate`.
- **PA-01, PA-02, PA-03 and PA-07** are not touched.

---

## E. Rollback

00199 is additive and non-destructive: T199 asserts no DELETE, TRUNCATE, table / column / function / view / index drop, or RLS / trigger disabling. To roll back, a follow-up migration would:

1. Drop the four new triggers:
   - `trg_enforce_invoice_tds_balance`
   - `trg_touch_invoice_after_tds_change`
   - `trg_enforce_work_order_milestone_progression` and `trg_audit_work_order_milestone`
   - `trg_enforce_pilot_rfq_allowance`
2. Re-run the 00196 / 00195 / 00173 / 00166 / 00167 / 00117 / 00037 definitions of the re-created functions and view.
3. `GRANT SELECT ON public.rfqs TO authenticated`.
4. Drop `uq_tds_deductions_one_live_per_invoice` and restore the 00173 `tds_deductions_mutate` policy.
5. Restore the 00072 snapshot policies.

Two parts should not be rolled back, because they re-open anon admin access: the always-true guard rewrites and the anon revokes. No data is changed by 00199 except `balance_due` / `status` on invoices that already carry live TDS, and only when those rows are next updated.

---

## F. Residuals (open, not fixed)

| ID | Residual |
|---|---|
| R1 | `get_current_procurement_step` and `check_supplier_award_eligibility_atomic` are readable by any signed-in user. They need a per-RFQ caller check. |
| R2 | Voiding a TDS deduction after the invoice reached PAID does not move it back to APPROVED / PARTIALLY_PAID. `balance_due` is recomputed only if the invoice still has live TDS. |
| R3 | Platform admins bypass the milestone and allowance rules by design. |
| R4 | The sign-off flag `otp.wo_inspection_signoff` is a transaction-local GUC. It is not settable through PostgREST (`set_config` is not exposed), but any future exposed function that calls `set_config` with user input could forge it. |
| R5 | `private.is_platform_admin()` still honours the email whitelist from 00179:532, which is only as strong as email verification. |
| R6 | If duplicate live TDS rows already exist, the unique index is skipped with a WARNING. The RPC still refuses a second deduction, but a direct admin write could add one. |
| R7 | None of this has been executed against Postgres. The first real run should be on a disposable local or branch database, checking the sweep's NOTICE / WARNING output and the `rfqs` column grant list. |

---

## G. Gate results (commands run in this session, after all edits)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `node node_modules/tsx/dist/cli.mjs scripts/typecheck.ts` | domain, database, services and web PASSED (first run failed on one strict-null error in a new test; fixed and re-run clean) |
| Vocabulary | `node scripts/scan-canonical-vocabulary.cjs` | PASSED: 455 files, 0 violations |
| Coverage policy | `node scripts/check-test-coverage-policy.cjs --strict` | PASSED: UNIT 81, MODULE 196, FUNCTIONAL 46, REGRESSION 4; 327 test files |
| Vitest root | `node node_modules/vitest/vitest.mjs run` | 317 files passed (317); 3510 passed, 371 skipped (3881); exit 0 |
| Vitest domain | run in `packages/domain` | 61 files; 773 passed |
| Vitest services | run in `packages/services` | 40 files; 559 passed |
| Vitest database | run in `packages/database` | 2 files; 5 passed |
| Vitest web | `vitest run --config apps/web/vitest.config.ts` (repo root) | 163 files; 1634 passed |
| Build | `node ./node_modules/vite/bin/vite.js build apps/web` | built in 37.85s, exit 0 |

The web workspace was first run from inside `apps/web`. There, `components/ui/otp-logo-brand.test.ts` failed 4 tests because it resolves asset paths from `process.cwd()`. That test is unchanged by this work and passes from the repo root, as in the recorded R2-31 gate.

---

## H. Git

Single local commit on top of `5325988`, with no push. The SHA is reported in the hand-off message, because a commit cannot contain its own hash. Live-DB execution: **none**.

---

## I. Follow-up: migration 00200 (R1 and the TDS-void gap)

Product Owner decision, 27 Sep 2026. Built on top of `769813a706bba8c8d48fd2815b911387a093f9cd`. 00199 was not edited: it is committed and referenced, so the fixes are in a new migration, `00200_scope_procurement_readers_and_recompute_invoice_on_tds_void.sql` (249 lines, single `BEGIN … COMMIT`).

**Migration 00200 has never been executed.** There is still no local database. Its claims are proven only by static tests: **T200** = `tests/security/procurement-readers-and-tds-void-00200-redteam.test.ts` (16 tests), plus one app-level test.

**Baseline:** HEAD `769813a`, clean tree, 199 migrations. **After:** 200 migrations, contiguous 00001–00200.

Ceiling references moved to 200:
- `clean-start-reset.ts` and its test;
- `scripts/otp-promote-certified.ps1`;
- the 00198 test, which now expects 200 files with 00198 at position 198;
- the 00199 test, which now expects 00199 at position 199 of 200.

### I.1 Per-item matrix

| Item | Root cause (file:line) | Fix in 00200 | Tests | Status |
|---|---|---|---|---|
| R1 `get_current_procurement_step(uuid)` | 00148:43-82 has no caller check; the anon grant at 00148:84 was revoked by 00199, but any signed-in user could still read any requirement's stage, RFQ id and PO id. | :28-81. The 00148 body plus a guard evaluated before the stage events are read: the requirement's organization is resolved, and only service_role, a platform admin or a member of that organization gets through (COALESCE, so it fails closed). Anyone else gets `{ok:false, error:'Access denied'}`, the pattern 00199 uses for `get_organization_subscription`. Revoked from PUBLIC and anon. | T200: guard ordering; line diff vs 00148 (0 removed; only the org lookup and guard added); no supplier path; grants. | FIXED (static) |
| R1 `check_supplier_award_eligibility_atomic(uuid)` | 00196:371-430 has no caller check; the anon grant at 00196:430 was revoked by 00199. Any signed-in user could read any awarded supplier's lifecycle and verification state. | :83-154. The 00196 body plus the same guard, keyed to the organization of the award's RFQ and placed after "Award not found" and before quote and supplier data are read. Revoked from PUBLIC and anon. | T200: ordering; line diff vs 00196 (0 removed); no supplier path; no buyer fields in the output; grants. | FIXED (static) |
| R1 supplier access decision | Neither function has a caller in `apps/web/src`, `packages` or `supabase/functions`, and no SQL function calls them (T200 scans all three trees). | Suppliers get no access. The functions return no buyer identity or other suppliers' data in any case. | T200 "neither reader has a client caller". | Decided: no supplier path |
| R2 TDS void | 00199:1272 `private.enforce_invoice_tds_balance` returned early when live TDS was 0. Voiding the only deduction therefore left `balance_due` netted by the voided amount, and a PAID invoice stayed PAID. The AFTER trigger (00199:1310) also missed inserts and `invoice_id` changes, and no void was audited. There is no void RPC; voiding is an admin-only direct update (00199 `tds_deductions_mutate`). | :162-248.<br>• The balance trigger now recomputes every invoice that has ever had a TDS row, live or voided. Invoices that never had one are untouched, so the 00178 / 00172 / 00175 writers behave as before for them.<br>• `balance_due = amount − paid − live TDS`.<br>• APPROVED / PARTIALLY_PAID → PAID when paid + TDS ≥ amount, as before.<br>• New: PAID → PARTIALLY_PAID (paid > 0) or APPROVED (paid = 0) when paid + TDS < amount, the same rule as `sync_invoice_payment_state` (00178:429-438). Enum values are cast explicitly.<br>• The AFTER trigger now fires on INSERT or UPDATE OF status / tds_amount / invoice_id, and touches both the old and new invoice.<br>• A non-VOIDED → VOIDED transition writes one `tds.voided` audit event with the invoice's status and balance after recompute. Re-voiding is a no-op and writes no audit, and the recompute is deterministic.<br>Client: no change needed. `sumLiveTdsByInvoice` already ignores VOIDED and `buildInvoiceBalanceRows` computes outstanding as gross − paid, so the UI matches the reopened server balance. | T200: recompute condition, PAID revert with casts, a JS mirror of the apply → void → void-again → re-apply cycle, trigger events, audit ordering and single-fire condition, grants. `invoice-balances-and-blockers.test.tsx`: "after the TDS is voided the reopened server balance is what the buyer owes", which covers both the `paidAmount` and the balance-only fallback paths. | FIXED (static) |

### I.2 Section F re-review

| ID | Disposition |
|---|---|
| R1 | Fixed (I.1). |
| R2 | Fixed (I.1). |
| R3 Admin bypass of the milestone and allowance rules | By design; left open. |
| R4 Transaction-local sign-off flag | Not in these functions; left open. |
| R5 `is_platform_admin` email whitelist | Different function (00179), not trivial; left open. |
| R6 Unique TDS index skipped if duplicates exist | Depends on live data; left open. |
| R7 Nothing executed against Postgres | Still true for 00199 and 00200. |
| R8 (new) | `procurement_stage_events` read policy 00148:27-32 is `USING (true)`: any signed-in user can read stage rows directly, which weakens the R1 guard on `get_current_procurement_step`. It is a table policy, not one of these functions, and changing it needs a client read-path check, so it is left open. |
| Future `rfqs` columns need an explicit column grant (from §D) | Left open. |

### I.3 Security implications and rollback

**What changes:**
- Signed-in users outside the buying organization now get "Access denied" from both readers. No client path calls them, so no UI should change.
- Invoices whose TDS is voided now show the reopened balance and move out of PAID. A buyer who had treated such an invoice as settled will see it outstanding again. That is the correct ledger state, and the void is audited.

**Rollback:** re-run the 00148 / 00196 / 00199 definitions of the four functions and the 00199 trigger definition. 00200 drops or deletes nothing, apart from `DROP TRIGGER IF EXISTS` immediately followed by recreating the same trigger (asserted by T200). Do not re-grant anon.

### I.4 Gate results (run from the repo root after all edits)

| Gate | Result |
|---|---|
| Typecheck | domain, database, services and web PASSED |
| Vocabulary | PASSED: 455 files, 0 violations |
| Coverage policy `--strict` | PASSED: UNIT 81, MODULE 196, FUNCTIONAL 47, REGRESSION 4; 328 test files |
| Vitest root | 318 files passed (318); 3527 passed, 371 skipped (3898) |
| Vitest domain (`--config packages/domain/vitest.config.ts`) | 61 files; 773 passed |
| Vitest services | 40 files; 559 passed |
| Vitest database | 2 files; 5 passed |
| Vitest web (`--config apps/web/vitest.config.ts`) | 163 files; 1635 passed |
| Build `vite build apps/web` | built in 1m 2s, exit 0 |

Single local commit on top of `769813a`, with no push and no deploy. Live-DB execution: **none**.

---

## J. Follow-up: migration 00201 (R8, plus the same always-true pattern on audit_events delete and support_tickets)

Product Owner decision, 27 Sep 2026. Built on top of `4db44c4eb2127d077955c9882453980c6ad83e55`. New migration: `00201_scope_procurement_stage_events_audit_delete_and_support_tickets.sql` (173 lines, single `BEGIN … COMMIT`).

**Migration 00201 has never been executed.** There is still no local database. Its claims are proven only by **T201** = `tests/security/stage-events-audit-delete-support-tickets-00201-redteam.test.ts` (18 tests). T201 re-derives the effective RLS policy set by applying every CREATE / DROP POLICY in 00001–00201 in order.

**Baseline:** HEAD `4db44c4`, clean tree, 200 migrations. **After:** 201 migrations, contiguous 00001–00201.

Ceiling references moved to 201:
- `clean-start-reset.ts` and its test;
- `scripts/otp-promote-certified.ps1`;
- the 00198, 00199 and 00200 tests, each now checking its own position in a 201-file chain.

There are no client changes.

### J.1 Every reader and writer of `procurement_stage_events`

| Reader / writer | Kind | Finding |
|---|---|---|
| `get_current_procurement_step` (00148, re-created in 00200:28-81) | SQL, SECURITY DEFINER | Reads the table; org-guarded since 00200 |
| `advance_procurement_step` (00148:88-155) | SQL, SECURITY DEFINER, the only writer | No caller check, anon grant. Re-created in 00201 with a guard |
| Views | — | None in 00001–00201 (asserted by T201) |
| `apps/web/src`, `packages`, `supabase/functions` | Client / edge | No reads or writes. `packages/database/src/reset/clean-start-reset.ts:123` only lists the table name in the reset inventory. No caller of `advance_procurement_step` or `get_current_procurement_step` exists (asserted by T201). |

Because no client or edge code reads the table, **no supplier path was added**.

### J.2 Per-item matrix

| Item | Root cause (file:line) | Fix in 00201 | Tests | Status |
|---|---|---|---|---|
| R8 `procurement_stage_events` read | 00148:27-32: SELECT policy `TO authenticated USING (true)` | :29-41. SELECT allowed to platform admins or members of the requirement's buying organization (`requirements.organization_id` is NOT NULL, and the RFQ org is the same org). service_role bypasses RLS. | T201: root cause in the pre-00201 policy set; the new scope; no supplier clause | FIXED (static) |
| Same table: insert | 00148:35-40: INSERT `WITH CHECK (true)`, so any signed-in user could append forged stage rows (PA-10 integrity) | :43-55. Same scope as reads. The DEFINER writer is unaffected, because tables are NO FORCE RLS (00178:490) and the owner bypasses RLS. | T201 | FIXED (static) |
| Same table: append-only (PA-10) | Append-only by policy absence only | No UPDATE, DELETE or ALL policy is added. Table-level UPDATE / DELETE / TRUNCATE revoked from PUBLIC, anon and authenticated; all privileges revoked from anon (:57-58). | T201: the effective policies on the table are exactly {INSERT, SELECT}; the revokes | FIXED (static) |
| `advance_procurement_step` | 00148:88-155: no caller check; anon grant at 00148:155 | :60-139. The 00148 body plus the same guard as 00200 (service_role, platform admin, or member of the requirement org, via COALESCE), evaluated before the insert. Returns `{ok:false, error:'Access denied'}` otherwise. Revoked from PUBLIC and anon. | T201: count-based line diff vs 00148 (0 removed; only the guard added); guard before insert; revoke | FIXED (static) |
| `audit_events_delete` | 00134:242-244: `FOR DELETE TO anon, authenticated, service_role USING (true)`, so anyone, anon included, could delete audit rows through PostgREST (PA-10) | :145-148. `TO authenticated USING (private.is_platform_admin())`. The only client deletes, the admin reset fallbacks at `admin-ops.ts:618` and `:1428`, run as a platform admin. The DEFINER clear-audit RPCs bypass RLS. | T201: root cause, new policy, the only client deleter is the admin ops module | FIXED (static) |
| `support_tickets` read / update | 00076:31-38: SELECT and UPDATE `USING (true)` with no `TO`, so PUBLIC including anon could read every ticket's email, role, description and page URL, and rewrite tickets | :154-171. SELECT: platform admin, or `lower(user_email) = lower(auth.jwt()->>'email')`. UPDATE: platform admin only. No client code reads or updates the table directly: admin reads use the DEFINER `admin_get_support_tickets`, and creation uses `create_support_ticket`. | T201: root cause, new policies, no client select / update | FIXED (static) |

### J.3 Other always-true policies (effective state after 00201, from T201)

**SELECT / ALL `USING (true)` reaching API roles.** All are kept, because none holds tenant, identity or financial data. T201 pins exactly these nine tables.

| Table | Origin | Content | Disposition |
|---|---|---|---|
| `buyer_type_config` | 00021 | Org-type labels, voting power | Keep: reference |
| `demo_settings` | 00021 | Demo flag, seed, run id | Keep: read by `notificationService.ts` and `admin-ops.ts` |
| `demo_price_anchors` | 00025 | Synthetic price anchors | Keep: reference |
| `market_intelligence_baselines` | 00008 | Aggregated price and delivery ranges per category and city | Keep: read by `fetch-market-intelligence.ts:226`; no supplier identity |
| `subcategory_capabilities`, `subcategory_evaluation_suggestions` | 00013 | Taxonomy | Keep: read by `intake/api/taxonomy.ts:263` |
| `platform_fee_policies` | 00174 | Published fee policy (0.5%, waived in pilot) | Keep: public pricing |
| `platform_environment_settings`, `otp_schema_migrations` | 00125 | Environment name and flags, applied migration versions | Keep. They are anon-readable ops metadata with no tenant data, a minor information disclosure (listed as R9). |

**Other always-true patterns, listed and not fixed:**

| Policy | Pattern | Why not fixed |
|---|---|---|
| `invoices.invoices_update` (00004:467-479), `work_orders.work_orders_update` (00004:436-448) | USING is scoped (supplier / buyer roles) but `WITH CHECK (true)`. An authorized updater could re-point a row's supplier or PO. | Financial update paths; tightening needs per-flow verification. Listed as R10. |
| `audit_events.audit_events_insert` (00134:238-240, anon included) | `WITH CHECK (true)`: forged audit rows possible | The client writes audit rows directly (`notificationService.ts:372`, `admin-telemetry.ts:36`, `admin-ops.ts`). Needs an RPC migration. Listed as R11. |
| `notifications_insert`, `supplier_notifications_insert` (00134) | `WITH CHECK (true)` for authenticated: spoofed notifications possible | Client notification writers would need moving to an RPC. Listed as R11. |
| `organizations.organizations_insert` | `WITH CHECK (true)` for authenticated | Signup creates organizations; by design |
| `support_tickets` "Anyone can create support tickets" | `WITH CHECK (true)` for PUBLIC | Public support form; by design. The table has no DELETE policy, so the client fallback `admin-ops.ts:617` deletes nothing (pre-existing, harmless). |

T201 pins that no UPDATE or DELETE policy reaching API roles is `USING (true)` after 00201. It also pins the two `WITH CHECK (true)` UPDATE policies and the five always-true INSERT policies above, so any new one fails the test.

### J.4 Security implications and rollback

**What changes:**
- Signed-in users outside a requirement's buying organization can no longer read or append its stage events.
- Anon can no longer touch the table, call `advance_procurement_step`, delete audit rows, or read or update support tickets.
- Non-admin signed-in users can no longer delete audit rows or update tickets.
- No client path relies on any of the removed access (asserted by T201). PA-10 is strengthened: stage events are append-only by policy and by table privileges, and audit rows can no longer be deleted by non-admins.

**Rollback:** re-create the 00148 policies and function, the 00134 `audit_events_delete` policy and the 00076 ticket policies, and re-grant table privileges. That would re-open anon access, so it is not recommended. 00201 drops or deletes nothing except `DROP POLICY IF EXISTS` immediately followed by recreating the same policy (asserted by T201).

### J.5 Gate results (run from the repo root after all edits)

| Gate | Result |
|---|---|
| Typecheck | domain, database, services and web PASSED |
| Vocabulary | PASSED: 455 files, 0 violations |
| Coverage policy `--strict` | PASSED: UNIT 81, MODULE 196, FUNCTIONAL 48, REGRESSION 4; 329 test files |
| Vitest root | 319 files passed (319); 3545 passed, 371 skipped (3916) |
| Vitest domain | 61 files; 773 passed |
| Vitest services | 40 files; 559 passed |
| Vitest database | 2 files; 5 passed |
| Vitest web (`--config apps/web/vitest.config.ts`) | 163 files; 1635 passed |
| Build | built in 36.05s, exit 0 |

**Open after 00201:** R3–R7 as in I.2 (R7: nothing has been executed against Postgres, for 00199, 00200 or 00201), the future `rfqs` column grants, and new residuals R9–R11 above.

Single local commit on top of `4db44c4`, with no push and no deploy. Live-DB execution: **none**.

## K. Follow-up: migration 00202 (R10 and R11)

Product Owner decision, 27 Sep 2026. Built on top of `c23d6fc41bec4ad8ae768e892174fde8a4ef4208`. New migration: `00202_scope_invoice_work_order_updates_and_close_client_audit_notification_inserts.sql` (266 lines, single `BEGIN … COMMIT`).

**Migration 00202 has never been executed.** There is still no local database. Its claims are proven only by static tests:
- **T202** = `tests/security/invoice-work-order-linkage-and-client-inserts-00202-redteam.test.ts` (19 tests). It re-derives the effective policy set from 00001–00202 and scans the latest definition of every SQL function, plus all client, package and edge source.
- App-level tests for the changed client call sites: `features/audit/client-audit-rpc.test.ts` (3), `features/admin/client-audit-writers.test.ts` (4) and `features/notifications/notification-purge-audit.test.ts` (2).

**Baseline:** HEAD `c23d6fc`, clean tree, 201 migrations. **After:** 202 migrations, contiguous 00001–00202.

Ceiling references moved to 202:
- `clean-start-reset.ts` and its test;
- `scripts/otp-promote-certified.ps1`;
- the 00198–00201 tests, each checking its own position in a 202-file chain.

The T201 always-true pin now expects no `WITH CHECK (true)` UPDATE policy, and only `organizations_insert` and the public support-ticket insert among always-true INSERT policies.

### K.1 R10: every update path of `invoices` / `work_orders`

| Path | Columns written | Effect of 00202 |
|---|---|---|
| `invoices.ts:412` approve, `:427` reject | status, approved_at | Unchanged: the row stays within the same parties |
| `payments.ts:393`, `:748` (test-fallback allocation sync) | paid_amount, balance_due, status, updated_at | Unchanged. The 00199/00200 `enforce_invoice_tds_balance` still recomputes. |
| `payments.ts:522`, `purchase-orders.ts:514` (settlement sync) | status, balance_due, updated_at | Unchanged |
| `payments.ts:530`, `:535` | work_orders.status, completed_at | Unchanged. The 00199 milestone trigger still decides whether COMPLETED is allowed. |
| `work-orders.ts:228` milestone progress | progress_percent, status, updated_at | Unchanged |
| SQL (all SECURITY DEFINER; latest definitions): `accept_delivery_inspection`, `admin_fix_buyer_issue`, `admin_force_transition_order_state`, `admin_retry_invoice_payment_webhook`, `admin_simulate_po_acceptance`, `apply_tds_withholding_atomic`, `record_verified_payment`, `reverse_payment_allocation_atomic`, `sync_invoice_payment_state`, `touch_invoice_after_tds_change`, `simulate_pilot_supplier_fulfillment` | status / financial / timestamp / rating fields only | Unchanged. T202 parses every `UPDATE invoices|work_orders … SET` and asserts that none sets a linkage column. |
| `validate_invoice_allocation_integrity` (00171, BEFORE trigger) | Derives `NEW.purchase_order_id` from the work order when NULL | Allowed: the guard permits exactly NULL → the work order's own PO, and fires first (`trg_aa_…`) |
| FK `invoices.milestone_id ON DELETE SET NULL` | milestone_id → NULL | Allowed: the cascade runs as a nested trigger (`pg_trigger_depth() > 1`) |
| Edge functions | none update either table | — |

**Fix:**
- `work_orders_update` (:52-73) and `invoices_update` (:80-101) now have WITH CHECK identical to USING. T202 compares the parsed clauses and checks that USING is unchanged from 00004.
- `private.guard_invoice_linkage` (:107-143) rejects changes to work_order_id, supplier_id, purchase_order_id (except the derivation above), milestone_id and is_demo. `private.guard_work_order_linkage` (:145-171) rejects changes to purchase_order_id, supplier_id and is_demo.
- The guards let through only service_role, sessions with no JWT (migrations and direct DB) and nested triggers. **Platform-admin JWTs are not exempt**, per the "non-service_role callers" instruction; no admin UI changes these columns.
- Both guards are SECURITY DEFINER, revoked from API roles, and named to fire before every other BEFORE UPDATE trigger on their table.
- Neither table has `organization_id` or `rfq_id`: ownership derives through `purchase_orders`.

### K.2 R11: every writer of `audit_events` / `notifications` / `supplier_notifications`

| Writer | Kind | Old path | New path |
|---|---|---|---|
| `admin-telemetry.ts:36` `emitAdminTelemetryEvent` (e.g. `AdminBuyerTroubleshooter` tenant switch) | Client | Direct insert with a client-supplied `actor_id` (the auth user id, not the profile id) | `logClientAuditEvent` → `log_client_audit_event`; the server sets the actor |
| `admin-ops.ts` `purgeTransactionalData` fallback | Client | Direct insert, omitting NOT NULL `entity_id`, so it always failed silently | RPC with `entity_id = 'all_transactional_data'` |
| `admin-ops.ts` `clearAuditLogsAndNotifications` fallback | Client | Direct insert | RPC (mode carried in `p_is_demo`) |
| `notificationService.ts` `clearAllNotifications` fleet fallback | Client | Direct insert | RPC |
| notifications / supplier_notifications | Client | **No client inserts exist** | — |
| `messaging-outbound` edge function | Edge | Reads `supplier_notifications` with a service_role client | Unaffected |
| 93 SQL functions (for example `create_system_notification`, `notify_*` triggers, `admin_clear_*`, audit triggers) | SQL | All SECURITY DEFINER; they run as the owner and bypass RLS | Unaffected. T202 asserts that every writer's latest definition is DEFINER. |

**Fix:**
- The three INSERT policies are dropped with no replacement, and INSERT is revoked from PUBLIC, anon and authenticated (:174-190). service_role bypasses RLS.
- `public.log_client_audit_event(p_event_type, p_entity_type, p_entity_id, p_payload, p_organization_id, p_is_demo)` (:196-264):
  - requires a session and a platform admin;
  - accepts only `admin.[a-z0-9_.]` event types;
  - allow-lists 11 entity types;
  - requires an entity id;
  - requires the payload to be a JSON object under 16 KB;
  - checks org membership when `organization_id` is given;
  - sets `actor_id := private.get_profile_id()` (there is no actor parameter);
  - stamps `payload.source = 'client_rpc'`;
  - is granted to authenticated only.
- audit_events stays append-only (PA-10): the effective policies are {SELECT, DELETE admin-only}, and the 00134 no-update / no-delete triggers are untouched.

**Writers that could not be migrated:** none. The RPC accepts only platform-admin `admin.*` events because every current client writer is a platform-admin tool; a non-admin client audit need would require widening it deliberately.

### K.3 Security implications and rollback

**What changes:**
- Anon and signed-in users can no longer insert audit rows, forge `actor_id`, or create notifications for anyone.
- Invoice and work order updates can no longer move a row to another supplier, work order, PO or milestone, or flip its demo flag.
- All legitimate paths listed above keep working (asserted statically, not executed).

**Rollback:** re-create the 00004 update policies and the 00134 insert policies, re-grant INSERT, and drop the two `trg_aa_guard_*` triggers. That would re-open R10 and R11, so it is not recommended.

### K.4 Gate results (run from the repo root after all edits)

| Gate | Result |
|---|---|
| Typecheck | domain, database, services and web PASSED |
| Vocabulary | PASSED: 456 files, 0 violations |
| Coverage policy `--strict` | PASSED: UNIT 81, MODULE 199, FUNCTIONAL 49, REGRESSION 4; 333 test files |
| Vitest root | 323 files passed (323); 3574 passed, 371 skipped (3945) |
| Vitest domain | 61 files; 773 passed |
| Vitest services | 40 files; 559 passed |
| Vitest database | 2 files; 5 passed |
| Vitest web (`--config apps/web/vitest.config.ts`) | 166 files; 1644 passed |
| Build | built in 36.43s, exit 0 |

**Open after 00202:**
- R3–R6 as in I.2.
- R7: nothing has been executed against Postgres, for 00199–00202.
- The future `rfqs` column grants.
- R9: anon-readable ops metadata.
- `organizations_insert` and the public support-ticket insert, by design.

Single local commit on top of `c23d6fc`, with no push and no deploy. Live-DB execution: **none**.

## L. Follow-up: migration 00203 (R9, R3–R6 and the `rfqs` column-grant guard)

Product Owner decision, 27 Sep 2026. Built on top of `d3e98a9108403d3861e532e71f858aecb9c3ca6f`. New migration: `00203_restrict_ops_metadata_guard_profile_privileges_and_one_live_tds.sql` (255 lines, single `BEGIN … COMMIT`).

**Migration 00203 has never been executed.** There is still no local database. Its claims are proven only by **T203** = `tests/security/ops-metadata-profile-privileges-tds-rfqs-guards-00203-redteam.test.ts` (27 tests). T203 re-derives the effective policy set, scans the latest definition of every SQL function (all schemas), and scans client, package, edge and script source.

**Baseline:** HEAD `d3e98a9`, clean tree, 202 migrations. **After:** 203 migrations, contiguous 00001–00203.

Ceiling references moved to 203:
- `clean-start-reset.ts` and its test;
- `scripts/otp-promote-certified.ps1`;
- the 00198–00202 tests, each checking its own position in a 203-file chain.

The T201 open-SELECT pin drops `platform_environment_settings` and `otp_schema_migrations`, leaving seven reference and config tables.

No web-app client code changed. Two ops scripts changed (listed in L.1).

### L.1 R9: every reader found

| Reader | Kind | Finding / new path |
|---|---|---|
| `scripts/ping-supabase-keep-alive.ts:34` | Script, anon REST | Read `environment, is_production`, but only needs a database round trip. It now POSTs `/rest/v1/rpc/platform_heartbeat`, which returns `{"ok": true}` and reads no table. |
| `scripts/deploy-migrations.ts` `ensureTrackingTables` | Script, postgres connection | **Re-created `otp_schema_migrations_read` `TO authenticated, anon, service_role USING (true)` on every deploy**, which would have silently re-opened R9. It now drops that policy and revokes anon. |
| `deploy-prod.ps1`, `update-live.ps1`, `start-platform.ps1`, `otp.ps1`, `deploy-migrations.ts` (psql / pg as postgres) | Scripts, owner | Unaffected: the owner bypasses RLS |
| `private.is_production_environment`, `public.assert_production_data_integrity` | SQL | Both SECURITY DEFINER, so unaffected. This matters because the production lock fails open if the row is invisible. |
| `assert_production_data_integrity()` grant | SQL | Was executable by anon (00125:561) and returns the environment and table counts. Now service_role only; its callers are ops scripts running as postgres. |
| `apps/web/src`, `packages`, `supabase/functions` | Client / edge | No readers. `clean-start-reset.ts` only lists the names. There is no public page, pilot flag or demo-mode detection reading them. |

**Fix (:41-82):**
- Both SELECT policies are now `TO authenticated USING (private.is_platform_admin())`. The migrations one is renamed `otp_schema_migrations_admin_read`, so an old deploy script's DROP cannot remove it.
- All table privileges are revoked from PUBLIC and anon.
- `platform_heartbeat()` is SECURITY INVOKER and granted to anon; it is the only anon grant in 00203.

### L.2 Per-item status

| Item | Status | Detail |
|---|---|---|
| **R9** | FIXED (static) | See L.1 |
| **R3** Admin bypass of the milestone and allowance rules | **Left open, by design** | The admin repair tools (`admin_force_transition_order_state`, `admin_retry_invoice_payment_webhook`, `admin_fix_buyer_issue`) exist to move stuck orders. Removing the bypass changes operator recovery behaviour, which is a product decision rather than a contained fix. |
| **R4** Transaction-local sign-off GUC | **Guarded (test), design unchanged** | The flag cannot be removed without redesigning the inspection sign-off. Revoking `set_config` from API roles would break PostgREST, which uses it for JWT claims. T203 now fails if any migration calls `set_config` with anything but a literal `otp.*` name and constant value (13 calls today); if anything other than `accept_delivery_inspection` sets `otp.wo_inspection_signoff`; if its readers change; or if any client calls `rpc('set_config')`. |
| **R5** `is_platform_admin` email whitelist | **Partially fixed** | **New finding:** `profiles_update` / `profiles_insert` (00004) check only row ownership, and no trigger guarded `is_platform_admin`. `is_platform_admin()` trusts `profiles.is_platform_admin` and `profiles.email`, so any signed-in user could make themselves a platform admin. 00203 :84-144 adds `trg_aa_guard_profile_privileges`, which blocks this for non-admin, non-service callers (details below). The JWT / `auth.users` email whitelist itself **stays**: removing it needs a live-data check that every whitelisted account carries the profile flag. GoTrue auto-confirm also means requiring confirmed email would not help. Neither can be verified statically. |
| **R6** TDS unique index skipped if duplicates exist | **Fixed (static), no financial row touched** | :146-253. `trg_enforce_one_live_tds_per_invoice` rejects any new live duplicate, whatever the caller (details below). The unique index is retried; if duplicates exist, a WARNING gives the count and points to `admin_list_duplicate_live_tds()`, a read-only function for admin and service_role that lists duplicate groups and whether the index exists. Existing duplicates are not voided automatically, because voiding re-opens invoice balances through the 00200 triggers. They must be voided through an audited correction. |
| **Future `rfqs` column grants** | **Guarded (test)** | T203 `rfqsGrantViolations` checks every migration after 00199 (details below). No DB change. |

**R5 guard.** For callers that are not platform admins, service_role or JWT-less sessions, it rejects:
- setting or changing `is_platform_admin`;
- inserting or changing to one of the seven whitelisted admin emails (T203 checks this list equals the `is_platform_admin` whitelist);
- changing `status`, `deleted_at` or `blocked_*`, which stops self-unblocking.

Every SQL writer of those columns is an `admin_*` function. The only non-admin email writer is `verify_and_update_profile_credential`, which verifies the email first. The client writes only `last_seen_at` (the presence heartbeat) outside the admin feature. All of this is asserted by T203.

**R6 trigger.** It rejects any insert, un-void or re-point that would create a second live TDS row for an invoice, for every caller including admins and service_role. It locks the invoice row. The only writer, `apply_tds_withholding_atomic`, already returns the existing live row, and clients only read the table.

**`rfqs` guard.** For every migration after 00199, it requires each added `rfqs` column (except the two address snapshots) to be matched by `GRANT SELECT (col) ON public.rfqs TO authenticated` or by the 00199 dynamic re-grant. It forbids table-wide `GRANT SELECT|ALL ON rfqs` and `GRANT … ON ALL TABLES IN SCHEMA public` to API roles. Synthetic cases prove it fails on each violation and accepts valid grants.

### L.3 Security implications and rollback

**What changes:**
- Anon can no longer read the environment flags or migration ledger, or run the integrity report.
- Signed-in users can no longer grant themselves platform admin, claim an admin email, or unblock themselves.
- A second live TDS deduction per invoice is impossible from 00203 on.

**Rollback:** re-create the 00125 policies, re-grant, restore the old deploy and keep-alive scripts, and drop the two new triggers. That would re-open R9 and the admin self-escalation, so it is not recommended.

### L.4 Gate results (run from the repo root after all edits)

| Gate | Result |
|---|---|
| Typecheck | domain, database, services and web PASSED |
| Vocabulary | PASSED: 456 files, 0 violations |
| Coverage policy `--strict` | PASSED: UNIT 81, MODULE 199, FUNCTIONAL 50, REGRESSION 4; 334 test files |
| Vitest root | 324 files passed (324); 3601 passed, 371 skipped (3972) |
| Vitest domain | 61 files; 773 passed |
| Vitest services | 40 files; 559 passed |
| Vitest database | 2 files; 5 passed |
| Vitest web (`--config apps/web/vitest.config.ts`) | 166 files; 1644 passed |
| Build | built in 30.80s, exit 0 |

**Open after 00203:**
- R3 (by design).
- R4 (design unchanged, guarded).
- The R5 whitelist (live-data check needed).
- Existing TDS duplicates, if any (listed by `admin_list_duplicate_live_tds()`).
- R7: nothing has been executed against Postgres, for 00199–00203.
- `organizations_insert` and the public support-ticket insert, by design.
- `profiles_insert` still lets a user self-insert a profile with a non-default `status` (for example to skip a pending state). Only the admin flag and admin emails are blocked on insert.

Single local commit on top of `d3e98a9`, with no push and no deploy. Live-DB execution: **none**.
