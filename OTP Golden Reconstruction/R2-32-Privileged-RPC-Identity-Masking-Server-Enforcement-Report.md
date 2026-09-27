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
