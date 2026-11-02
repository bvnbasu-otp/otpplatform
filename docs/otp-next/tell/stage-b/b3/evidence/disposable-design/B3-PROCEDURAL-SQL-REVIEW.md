# Procedural SQL, Dynamic SQL, and Side-Effect Review

## Result

The repository scan found **97 `DO` blocks in 73 migrations**. Keyword
inventory flags **33 blocks** with DML/action keywords and **15** with
`EXECUTE`. These are screening counts, not a PostgreSQL parse or proof that
each keyword is executable SQL. The reconciled DML register contains
**79 of 293 direct migration-time operations inside `DO` blocks**; such
blocks execute during migration and must not be treated as stored-function
bodies. Phase 0E found that migration `00020:342` explicitly invokes
`public.backfill_taxonomy()`, whose function body contains 13 DML statement
sites. Those are migration-time effects, increasing the effective count to
306 DML statement sites (152 INSERT, 132 UPDATE, 22 DELETE). The two
`00138` INSERTs at lines 228 and 247 remain deferred function-body writes
because that migration does not invoke their function.

The complete semantic review of every function, procedure, trigger, and
call-chain is **not verified**. Critical unresolved items include full
migration-time DML/trigger interaction, the exact Supabase bootstrap, and
catalog-driven security/ownership rewrites listed below. Migration 00328 is
resolved against 00261 and is RETAINED in the ordered manifest; see
`B3-REVIEW-00328.md`.

## `DO` block inventory

The list below records each detected block by migration and starting line;
bracketed terms are lexical effect indicators, not a semantic certification.

| Migration | Block lines and indicators |
|---|---|
| `00019_taxonomy_data.sql` | 1222 [RAISE] |
| `00027_capability_capacity_source.sql` | 67 [RAISE] |
| `00041_phase_engine.sql` | 607 [PERFORM, CREATE, RAISE; pg_cron scheduling] |
| `00044_manager_check_null_fix.sql` | 52 [RAISE] |
| `00045_award_closeout_mutual_reveal.sql` | 568 [RAISE] |
| `00067_governance_p2_exit_reasons_and_buyer_scoring.sql` | 5 [CREATE]; 15 [CREATE] |
| `00071_seed_super_admin_ops_user.sql` | 4 [INSERT, UPDATE; account provisioning] |
| `00079_fix_discover_and_invite_uniqueness.sql` | 159 [PERFORM] |
| `00082_seed_gas_pipeline_suppliers.sql` | 146 [INSERT, UPDATE, DELETE; seed/mutation] |
| `00083_link_furniture_rental_rfq.sql` | 6 [INSERT, UPDATE, DELETE] |
| `00084_auto_generate_pilot_supplier_quotes.sql` | 341 [PERFORM] |
| `00086_reset_admin_password.sql` | 4 [UPDATE; account/password operation] |
| `00113_seed_real_super_admin_bvnbasu.sql` | 4 [INSERT, UPDATE; account provisioning] |
| `00115_seed_benchmark_org_and_fix_test_runner.sql` | 39 [INSERT, UPDATE] |
| `00117_canonical_identity_protected_views_and_enums.sql` | 19 [ALTER] |
| `00121_multi_user_org_hierarchy_and_context_switching.sql` | 4 [DELETE, ALTER] |
| `00130_clear_audit_logs_notifications_and_fix_toggle.sql` | 9 [DELETE]; 316 [DELETE, CREATE] |
| `00131_mode_aware_clear_audit_logs_and_notifications.sql` | 530 [DELETE, CREATE] |
| `00132_bulletproof_notifications_purge_and_mode_counts.sql` | 10 [DELETE, CREATE] |
| `00134_fix_audit_trail_and_notifications_mode_logging.sql` | 145 [INSERT, EXECUTE, CREATE, DROP]; 224 [INSERT, UPDATE, DELETE, CREATE, ALTER, DROP] |
| `00136_fix_quotes_identity_protected_and_award_po_flow.sql` | 731 [PERFORM, RAISE] |
| `00139_admin_operations_and_troubleshooting_suite.sql` | 8 [ALTER] |
| `00141_user_profile_customization.sql` | 8 [ALTER]; 368 [INSERT, UPDATE] |
| `00143_set_admin_password.sql` | 6 [INSERT, UPDATE, DELETE; account/password operation] |
| `00144_prepaid_subscription_model.sql` | 52 [CREATE] |
| `00148_strict_linear_15_step_procurement_pipeline.sql` | 158 [INSERT; ledger write] |
| `00149_admin_user_and_organization_bulk_management.sql` | 7 [ALTER]; 46 [ALTER]; 85 [ALTER] |
| `00157_fix_auth_users_gotrue_null_tokens.sql` | 33 [INSERT, UPDATE; identity repair] |
| `00158_seed_buyer_account_bvnbasu_yahoo.sql` | 6 [INSERT, UPDATE, CREATE; account seed] |
| `00162_user_online_presence_and_heartbeat.sql` | 8 [ALTER] |
| `00165_fix_super_admin_presence_visibility_and_all_tabs.sql` | 135 [ALTER] |
| `00167_phase5a_progressive_invoicing_and_line_items.sql` | 108 [INSERT, UPDATE; operational backfill] |
| `00168_phase5b_statutory_gst_and_tax_splitting.sql` | 70 [UPDATE; financial backfill] |
| `00169_phase5c1_payment_allocations_and_partial_settlement.sql` | 267 [INSERT, UPDATE, RAISE; financial backfill] |
| `00177_phase6_group1_database_hardening.sql` | 125 [EXECUTE, PERFORM, CREATE, RAISE; pg_cron]; 385 [EXECUTE, ALTER, RAISE]; 414 [EXECUTE, ALTER, RAISE] |
| `00178_phase6_group2_edge_and_adapters.sql` | 478 [EXECUTE, ALTER, RAISE] |
| `00179_phase6_group3_cross_cutting_remediation.sql` | 54 [CREATE] |
| `00186_fix_admin_user_deletion_and_purge.sql` | 146 [UPDATE, DELETE]; 183 [INSERT, UPDATE] |
| `00187_dual_persona_portal_switching.sql` | 591 [INSERT, UPDATE] |
| `00189_clarification_workbench_enhancements.sql` | 18 [ALTER] |
| `00192_approval_execution_orchestration_and_award_gate.sql` | 29 [DELETE, ALTER] |
| `00194_supabase_data_api_table_grants_and_default_privileges.sql` | 55 [role-conditional grants]; 73 [PERFORM/pg_notify] |
| `00196_buyer_identity_address_rwa_msme_and_supplier_award_onboarding.sql` | 91 [ALTER] |
| `00198_harden_synthetic_quote_and_pilot_simulator_isolation.sql` | 232 [ALTER] |
| `00199_harden_privileged_rpcs_supplier_masking_and_financial_enforcement.sql` | 46 [EXECUTE]; 831 [EXECUTE]; 865 [EXECUTE, RAISE]; 1008 [CREATE, RAISE]; 1616 [RAISE] |
| `00202_scope_invoice_work_order_updates_and_close_client_audit_notification_inserts.sql` | 184 [INSERT, DROP] |
| `00203_restrict_ops_metadata_guard_profile_privileges_and_one_live_tds.sql` | 190 [CREATE, RAISE] |
| `00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql` | 130 [UPDATE, EXECUTE, CREATE, ALTER, DROP]; 219 [ALTER] |
| `00265_remediate_buyer_taxonomy_and_rls_integrity.sql` | 1228 [RAISE] |
| `00269_harden_sourcing_mode_identity_reveal.sql` | 24 [ALTER] |
| `00270_unsuccessful_rfq_retention_purge.sql` | 22 [ALTER] |
| `00273_persist_pin_coverage_in_canonical_suppliers.sql` | 137 [UPDATE; backfill] |
| `00274_location_pin_coverage_durable_recovery.sql` | 236 [PERFORM, CREATE, RAISE; pg_cron and pg_net scheduler] |
| `00275_isolate_rfq_subcategory_recipients.sql` | 8 [ALTER] |
| `00280_canonical_subscription_pricing.sql` | 22 [ALTER]; 144 [ALTER] |
| `00281_individual_personal_ownership_foundation.sql` | 31 [EXECUTE, CREATE, ALTER] |
| `00282_individual_personal_procurement_lifecycle.sql` | 547 [EXECUTE, ALTER, RAISE] |
| `00283_personal_document_issuance.sql` | 20 [ALTER]; 43 [EXECUTE, ALTER] |
| `00287_buyer_address_book_invariants.sql` | 341 [ALTER, DROP, RAISE] |
| `00289_pilot_simulated_purchase_entitlements.sql` | 20 [ALTER]; 37 [ALTER]; 63 [ALTER]; 120 [ALTER] |
| `00295_legal_review_grant_authority_columns.sql` | 40 [ALTER, DROP] |
| `00305_po_transition_payment_gst_milestones.sql` | 9 [CREATE] |
| `00317_rfq_category_service_coverage_guard.sql` | 18 [RAISE] |
| `00318_support_ticket_rpc_hardening.sql` | 28 [RAISE] |
| `00320_audit_actor_identity_registry.sql` | 8 [DELETE, RAISE]; 180 [RAISE]; 218 [DELETE, RAISE]; 504 [RAISE] |
| `00321_founder_superadmin_role_guard.sql` | 12 [RAISE]; 367 [ALTER, RAISE] |
| `00322_restrict_is_demo_marker.sql` | 7 [RAISE] |
| `00323_superadmin_demo_user_deletion.sql` | 7 [DELETE, EXECUTE, RAISE] |
| `00324_public_contact_enquiries.sql` | 7 [RAISE] |
| `00326_authoritative_committee_tenure.sql` | 9 [RAISE] |
| `00327_notification_dispatch_isolation.sql` | 8 [RAISE] |
| `00328_admin_test_runner_canonical_status_enum.sql` | 5 [EXECUTE, RAISE; dynamic function replacement; see `B3-REVIEW-00328.md`] |
| `00331_authoritative_17_category_taxonomy.sql` | 79 [UPDATE] |

## Migration-time side-effect inventory

The following inventory distinguishes source constructs from execution.
It is a targeted textual/source review, not a PostgreSQL parser or proof of
complete call-graph closure.

| Effect class | Source evidence | Phase 1 treatment |
|---|---|---|
| Direct data mutation | 293 direct DML statements in 86 files; 79 occur inside executable `DO` blocks. See the statement-by-statement register. | Keep every DML statement excluded, transformed, or explicitly approved per its source row; no blanket DML deletion. |
| Called stored-function mutation | `00020:342` calls `public.backfill_taxonomy()`. Its body has 13 DML sites at `:100,106,119,128,140,179,204,255,265,278,294,310,323`. | Remove the call in the generated copy; retain function definition. This is now classified as a transform, not a deferred-only function. |
| Deferred function-body DML | `00138:228,247` define INSERTs within `private.notify_suppliers_of_outcome(uuid)`; no call in that migration was found. | Keep definition only if needed; do not invoke during replay. |
| Scheduler mutations | `00041:607-624`, `00177:125-142`, `00274:236-273` create/unschedule/schedule cron jobs; 00274 can schedule an HTTP retry call. | Remove each complete scheduler `DO` block; do not merely remove `schedule`; no `pg_cron` setup/jobs in the sanitized stream. |
| Extension installation | `pgcrypto` at `00001:3`/`00002:3`; `pg_net` at `00109:16`/`00112:12`; `pg_cron` also attempted in the scheduler blocks above. | Require exact offline image/package evidence for `pgcrypto` and `pg_net`; suppress scheduler-block `pg_cron` creation. |
| Outbound HTTP function bodies | `net.http_post` in `00109`, `00110`, `00112`, `00266`, `00271`, `00272`; 00274's invocation is inside the scheduler block. | Function definitions alone defer requests. Preserve definitions where required, but no credentials/URL, no calls, no scheduler, and deny egress in any separately authorized replay. |
| Local notification | `00194:73-79` calls `pg_notify('pgrst', 'reload schema')` in a `DO` block; errors are swallowed. | Remove this cache-notification block from the generated database-only stream; preserve grants/default privileges. |
| Trigger execution | Migrations create triggers, and migration-time DML can fire triggers already installed. | No trigger should be invoked artificially. Call graph and DML/trigger interaction remain a blocker; use an empty target and no seed data. |
| Catalog-driven security rewrites | 00177, 00178, 00199, 00212, 00282, 00283 inspect catalogs and issue dynamic DDL/grants/policy changes. | Preserve source target logic; fail closed on errors and verify explicit postconditions in the generated replay. |

No evidence from the reviewed source indicates a migration-time `COPY
... PROGRAM`, `ALTER SYSTEM`, database subscription/publication, or external
process invocation. A lexical search is not sufficient to certify absence
from arbitrary dynamic SQL; exhaustive statement parsing and call-graph
review remain required.

## Dynamic SQL, function calls, and deferred effects

- **Resolved 00328:** `00328:10-24` uses `pg_get_functiondef`, `EXECUTE`, and
  postcondition checks to replace the exact legacy token installed by 00261.
  No later migration redefines the function. Its inaccurate comment is not a
  replay blocker; see `B3-REVIEW-00328.md`.
- **Scheduled-work transformation (not executed):** `00041:607-624` and `00177:125-134` attempt
  `pg_cron` setup and schedule the RFQ phase worker during migration.
  `00274:236-275` can install extensions and conditionally schedule a retry
  using `net.http_post`. A sanitized stream must preserve the worker and
  retry function definitions but must not create active schedules or run
  outbound work. Phase 0D specifies removing each complete scheduler block;
  no generated copy or validation exists.
- **Security/ownership DDL blocker:** `00177:385-414` dynamically changes
  `SECURITY DEFINER` search paths and enables RLS across catalog-discovered
  public tables; `00178:478-496` enables RLS across its discovered public
  tables; `00199:831-865` changes function grants and column grants using
  live catalog results; `00212:130-175` captures/rebuilds views and changes
  supplier verification state; `00281:31-44` creates ownership checks and
  indexes; `00282:547-580` rewrites buyer-scope policy expressions. Their
  behavior depends on the exact ordered schema/catalog state. They cannot be
  deleted as generic dynamic SQL or certified without verifying the
  resulting object/security state.
- `00109:16,48-49` and `00112:12,39-42` define pg_net-backed notification
  and attachment functions. Related calls also occur in `00110:302-303`,
  `00266:207-208`, `00271:99`, and `00272:124`. These are possible runtime
  side effects, not evidence that these exact calls ran during migration.
- Migration-time `INSERT`/`UPDATE`/`DELETE` may fire previously installed
  triggers. The full trigger-to-write-to-network dependency closure has not
  been established.
- Function/procedure definitions can contain runtime writes and network
  requests without executing those bodies at `CREATE FUNCTION`; however,
  `DO` bodies, explicit migration-time function calls, and triggers fired by
  migration-time DML execute now. They must be distinguished statement by
  statement.

## Unresolved review items

The 97-block list is a source-location index, not a full PL/pgSQL parse.
Phase 0D/0E now specifies generated-copy handling for the scheduled jobs,
the `00020` backfill invocation, and the `00194` notification. Those
transformations have not been generated or validated. Remaining critical
work is to establish the exact bootstrap, finish source-to-output/call-graph
review, and prove the final security/ownership state after catalog-driven
rewrites. No external service, scheduled job, database, or migration was
executed.

## Phase 0D addendum — scheduled work and fail-closed transformations

**Assessment date:** 2026-11-01. The following source review narrows the
remaining procedural blockers and supersedes the earlier statement that
scheduled-job handling had not yet been designed. The transformations below
are proposals only; no generated migration stream was produced or executed.

### Scheduler blocks and effects

| Source | Migration-time behavior | Fail-closed stream treatment |
|---|---|---|
| `00041:607-624` | A `DO` block creates `pg_cron`, unschedules `otp-advance-rfq-phases` if present, then schedules `public.advance_rfq_phases()` every five minutes. Its broad exception handler converts failure to `NOTICE`. | Remove this complete scheduler `DO` block from the generated copy, including the `pg_cron` create and schedule/unschedule calls. Retain the phase functions, triggers, and grants defined earlier in the migration. Do not replace it with a no-op schedule. |
| `00177:125-142` | Repeats the `pg_cron` create/unschedule/schedule flow for the same phase worker; broad exception handler also emits only `NOTICE`. | Remove this complete scheduler `DO` block. Retain `advance_rfq_phases()` and the migration's security/RLS definitions. Do not install `pg_cron` for this path. |
| `00274:236-273` | A `DO` block creates `pg_cron` and `pg_net`, reads application settings or `private.platform_secrets`, and—when a URL and service key exist—schedules a once-per-minute `net.http_post` to the location-pin retry Edge Function. Errors become `NOTICE`. | Remove this complete scheduler `DO` block, including extension creation and secret lookup. Retain retry functions, grants, and recovery tables. Keep `pg_net` installed by its earlier required migration for deferred function definitions, but provide no endpoint/key and do not invoke the functions. |

Removing only the `cron.schedule` call is insufficient: the unschedule side
effect still mutates scheduler state, and the 00274 block also reads secrets
and constructs an outbound request. The generated stream must contain zero
`cron.schedule`, `cron.unschedule`, or migration-time `net.http_post`
invocations. A source scan alone is not proof; a generated-stream validation
must parse all SQL/PL/pgSQL and inspect dynamic strings.

### Catalog-driven security and ownership requirements

- **00177:385-435** enumerates `SECURITY DEFINER` routines in `public` and
  `private`, changes their `search_path`, then enumerates public base tables
  to set RLS enabled and `NO FORCE`. Both loops catch all errors and continue
  with `NOTICE`. Preserve their object scope and resulting settings, but
  transform those handlers to abort on any failed alteration. Validate
  complete postconditions against the catalog; do not infer success from the
  loop completing.
- **00178:478-496** independently enumerates public base tables and applies
  RLS enabled plus `NO FORCE`, again swallowing errors. Preserve the exact
  source behavior otherwise; change failures to abort and validate every
  table, including agreement with the preceding migration.
- **00199:831-865** selects routines by exact schema/name sets and applies
  routine-level revokes/grants. Its RFQ column grant derives the column list
  from `information_schema` and excludes the address snapshots. Require
  expected routine identities and both excluded columns to exist; preserve
  the derived grant list and fail if it is empty, incomplete, or unexpected.
- **00212:130-199** snapshots selected views' definitions, options, ACLs,
  and owners from catalogs, drops them around a type change, then rebuilds
  them. Preserve each captured property exactly. Fail rather than substituting
  the current migration owner or skipping an unavailable grantee. Its row
  backfills remain individually governed by the DML register.
- **00281:31-44** adds owner-profile references, makes organization ownership
  nullable, enforces exactly one of organization/profile ownership, and
  indexes personal ownership. Preserve these constraints and the later
  owner-only RLS/immutability triggers.
- **00282:547-580** rewrites matching expressions in existing buyer-scope
  policies using regexes over `pg_policies`. **00283:43-56** similarly
  rewrites a matching policy expression. Preserve the expression mappings;
  assert expected source policies/expressions and resulting owner-aware
  predicates, and fail on unmatched or ambiguous policy state. Never replace
  these rewrites with broader organization-only or unconditional policies.

All such blocks depend on the exact predecessor schema, policy inventory,
routine signatures, grants, and role OIDs. In particular, `00212` needs
existing owner/grantee roles to restore captured metadata, and `00194`
expects `postgres` for its role-specific defaults. The source does not prove
these identities or the resulting effective ACL/RLS state in a disposable
bootstrap.

### Deferred external effects and replay boundary

`pg_net` call sites in `00109`, `00112`, `00110`, `00266`, `00271`, and
`00272` are inside function bodies; defining them does not itself send a
request. Creating triggers is also not a call. However, replay-time DML can
fire installed triggers, and any migration-time function invocation could
dispatch requests. Therefore the proposed stream requires no application
seed data, no endpoint/service key, no scheduler, and database-level outbound
network denial. The complete migration DML/trigger call graph is not certified
by this focused review and remains a replay blocker.

**Phase 0E outcome: BLOCKED.** Source-backed transformations are specified,
but the exact Supabase bootstrap, exhaustive side-effect closure, and final
catalog postconditions have not been established. No database, Docker
resource, migration, test, build, or network operation was performed.
