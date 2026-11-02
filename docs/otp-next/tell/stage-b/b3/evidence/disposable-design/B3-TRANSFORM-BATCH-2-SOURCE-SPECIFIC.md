# B3 TRANSFORM Batch 2 — Source-Specific Treatment Proposal

## Status and boundaries

**PROPOSED READ-ONLY ANALYSIS — EVERY TREATMENT IS UNAPPROVED.**

This report inspects ten current `TRANSFORM` migrations and proposes generated-stream treatments only. It does not modify migration source, the disposition manifest, or previous evidence; it does not generate SQL or authorize replay. No database, Docker, tests, builds, network, hosted environment, credential, staging, commit, or deployment activity was performed. Proposed validation conditions are not test results.

The manifest baseline remains **331 files / versions 00001–00331; 1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED**. No disposition is changed here.

Batch 1's named set is not a contiguous prefix of manifest `TRANSFORM` entries: it omits `00020` and `00041`, which precede some Batch 1 entries. To honor "manifest order" without repeating any Batch 1 ID, selection used the first ten manifest-ordered `TRANSFORM` entries not in the exact Batch 1 set. The result is `00020, 00041, 00114, 00115, 00117, 00122, 00123, 00125, 00126, 00128`.

Line numbers and SHA-256 values below are from the current source files. `RETAIN`, `TRANSFORM`, `WITHHOLD`, and `BLOCK` refer to proposed handling in a future generated stream, not approved actions. No file contains an explicit `BEGIN`/`COMMIT` unless identified below; transaction behavior of the eventual migration runner is unknown.

## Summary matrix

| Version / migration | Lines | SHA-256 | Proposed treatment (UNAPPROVED) | Dependencies / unresolved items |
|---|---:|---|---|---|
| 00020 `00020_taxonomy_backfill.sql` | 342 | `F68E944775DB23894561C8E6F977C40C8CF931E6D9F6D0D6B0DCA94A1F896DE5` | Retain helper/function definitions and grant. Withhold only the final migration-time invocation of `backfill_taxonomy()` for a proven clean target. | Requires populated taxonomy/capability catalogs if the function is called. No invocation should be inferred safe from zero-row UPDATE behavior. |
| 00041 `00041_phase_engine.sql` | 625 | `4221E9DCFD9671A52C822467345AFFDE942AD450C3F7D795A54E67DCDF87E5B8` | Retain phase schema, functions, triggers, grants. Withhold two RFQ backfills only on a verified empty RFQ table; withhold the complete pg_cron DO block. | `00177` later replaces the phase-advance function and scheduler but is BLOCKED. pg_cron/bootstrap and automatic advancement remain unresolved. |
| 00114 `00114_purge_prohibited_terms_and_update_supplier_aliases.sql` | 157 | `65844C57203365EF79C592C90911F6734EA7BA2C01D3FB6CBF535C626D4943DA` | Retain runtime definitions, view alias, grants, and five role-description updates when canonical role rows exist. Withhold two historical wording updates only for an empty target. | Role catalog depends on earlier role migrations and later canonical upserts; preserve the role descriptions as reference data, not disposable DML. |
| 00115 `00115_seed_benchmark_org_and_fix_test_runner.sql` | 371 | `30659AD6199A6270E8F132A285DB3C3392C9500627375A91C42DA13ED0BA4153` | Withhold benchmark organization/member provisioning. Block the test-runner RPC exposure pending authorization review or an approved later replacement. | Seed embeds a real-person identity and fallback profile IDs. `00261` is BLOCKED and cannot be presumed to harden this RPC. |
| 00117 `00117_canonical_identity_protected_views_and_enums.sql` | 279 | `59E42C96147619A459BA6AF04DF4E85981AF1C4948FC3E17F65019A378254034` | Retain enum/default, masked view definitions, compatibility aliases, and grants. Withhold only the RFQ status rewrite on an empty RFQ target. Block the CASCADE view-drop group pending dependency proof. | Drops many views with `CASCADE`; `00288` later replaces a canonical view but is BLOCKED. |
| 00122 `00122_signup_org_and_active_org_sync.sql` | 415 | `286D90BECB85B1A89299F9554349068BD19464FD34D73C76E8B7123A08686D09` | Retain function definitions and grants, subject to Auth/bootstrap and authorization validation. Withhold the active-organization backfill only on a verified clean identity target. | Depends on role/taxonomy catalogs and Supabase Auth internals. Later signup rewrites, including `00257`, are not implied by this report. |
| 00123 `00123_superadmin_pure_role_isolation.sql` | 235 | `F3A3F9B8D50226EE620D6DA0738655A61CD558BB4F7F4892463A9DF551A16414` | Withhold hard-coded identity cleanup on a clean target. Block the email-based authorization/context definitions pending security and identity approval; retain `NOTIFY` only with a verified local PostgREST listener. | Contains real-person/admin email literals and changes platform-admin recognition. Later context rewrites do not establish the final `is_platform_admin()` contract. |
| 00125 `00125_production_preservation_and_staging_gate.sql` | 561 | `0CE0C51FBDEB87C90F9297DBF34B8E7C4F68BFA4BF8CD1F032E057B1E38AC79F` | Retain table/RLS and safety-function definitions only after environment/bootstrap approval. Block the `STAGING` singleton insert; withhold the legacy migration-ledger seed unless its history contract is approved. Never invoke purge or integrity RPCs. | Unknown environment identity is not fail-closed. Purge RPC is later replaced by BLOCKED migrations; `00203`'s metadata hardening is also BLOCKED. |
| 00126 `00126_fix_admin_orders_join_duplication.sql` | 279 | `6F0D4BD76C96AC22ABB2120EE015A193BD5EE16B886783EB09444648F06AABB7` | Preserve transaction boundary. Block the two SECURITY DEFINER admin RPCs/grants pending authorization review. Keep the migration-ledger write only if its tracking semantics are approved. | Returns buyer/supplier and financial fields; admits `anon`/any `authenticated` caller. `00128` adds different-arity overloads; it does not drop these signatures. |
| 00128 `00128_admin_mode_data_isolation.sql` | 1075 | `28BBCEC8221A596131DD2853632767D7BFF9C1C4263A93C6A2892D0882FCD479` | Retain columns, indexes, inheritance function/triggers, and mode-aware RPC definitions only after authorization/environment decisions. Withhold all historical flag backfills and their audit-trigger drops on a verified clean target. | `00134` restores audit immutability but is BLOCKED. `demo_settings` controls AUTO mode; Batch 1's demo default remains unresolved. Several SECURITY DEFINER RPCs expose sensitive data to `anon`/all authenticated callers. |

## Detailed statement-level evidence

### 00020 — `00020_taxonomy_backfill.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 13–34 | Stored pure helper `private.nearest_city`; maps coordinates to eight hard-coded South Indian cities. No invocation during replay. | Retain unchanged. Do not expand or infer cities. |
| 42–60 | Runtime `classify_requirement_text`; reads active subcategory `match_keywords`, scores matches, and grants EXECUTE to `authenticated`. | Retain exact function and grant. It depends on a final taxonomy catalog; a missing catalog can produce no classification, not proof of completeness. |
| 71–339 | Runtime `backfill_taxonomy()` definition. Its 13 DML sites are: requirement classification/defaults (100–134), universal fields (140–177), mapped attributes (179–198), supplier capability derivation (204–253 and 255–263), supplier grade-note update (265–273), coordinate service areas (278–292), pincode areas (294–308), supplier home-city update (310–316), and performance defaults (323–327). These writes execute only when the function is invoked. | Retain the callable function unchanged; do not invoke it as a migration. Preserve its COALESCE/no-overwrite behavior, supported taxonomy codes, attribute-type filter, capacity derivation, coordinate mapping, and return shape. |
| 342 | Migration-time `SELECT public.backfill_taxonomy()` invokes the function and therefore executes those 13 DML sites against current rows. | Withhold this call only for a clean-target replay. The precondition is zero rows in `requirements`, `suppliers`, `supplier_capabilities`, and `supplier_service_areas` at this point, plus no preloaded seed rows intended for backfill. Proposed check: independent row counts for all four tables equal zero immediately before the omitted call. If any count is nonzero, treatment is BLOCKED until each source row's disposition is approved. |

**Dependencies and preservation:** The function requires the requirements taxonomy, `subcategory_attribute_schema`, `requirement_mode_base_type`, capability records, and supplier-capability/service-area schema. Its source codes must resolve against actual reference data; a successful run with zero matches is not a completeness check. `00019` is EXCLUDE in the manifest and taxonomy/capability final-state inputs remain unresolved in prior B3 evidence. The source comment says later seeds may call the function, but this inspection found no later migration invocation; no future caller may be inferred or removed without a call-site check.

**Validation conditions:** the generated stream contains exactly one definition for each helper and preserves the `authenticated` EXECUTE ACL; contains no top-level call to `backfill_taxonomy()`; leaves all four clean-target tables at zero rows before fixtures; and an object/call-site search finds no other migration-time invocation. These are proposed checks, not executed results.

### 00041 — `00041_phase_engine.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 36–56 | Adds five RFQ phase/deadline columns and comments on deadline semantics. | Retain unchanged; verify exact types, nullability, comments, and no duplicate column definitions in the stream. |
| 58–64 | Two migration-time UPDATEs derive `bid_deadline` and `opened_at` from existing RFQs and fill remaining null bid deadlines. | Withhold only if `rfqs` has exactly zero rows before this section. Otherwise BLOCK; do not accept partial or zero-row execution as proof of completed backfill. |
| 69–120 | Runtime `sync_rfq_phase_window()` and `rfqs_phase_window` trigger. | Retain unchanged, including explicit-deadline precedence and status-specific behavior. |
| 135–194 | Runtime deadline/phase helpers `quoting_refusal` and `clarification_ends`. | Retain unchanged. |
| 198–258 | Runtime `is_api_call`, quote-window enforcement, and INSERT triggers on `quotes` and `quote_versions`. | Retain exact function security/search path and both enforcement triggers. Preserve the source's API-vs-direct-session distinction; do not invoke. |
| 261–318 | Runtime clarification and voting enforcement functions/triggers. | Retain unchanged, including demo-window and non-API exemptions; validate trigger event/table and function binding. |
| 335–425 | `advance_rfq_phases()` definition, function-body UPDATEs to quotes/RFQs and INSERT to audit, comment and EXECUTE grant to `authenticated, service_role`. These DML statements are runtime behavior, not migration-time DML. | Retain definition and grant without invocation. Preserve no-award behavior, state transitions, audit entry, and error/transition semantics. |
| 439–594 | Read-only `rfq_phase()` and authorized `set_rfq_schedule()` RPC definitions and grants. | Retain unchanged. Validate role/ownership, signatures, grants, schedule ordering checks, and access-helper calls. |
| 607–625 | DO block creates `pg_cron`, unschedules any existing named job, and schedules `advance_rfq_phases()` every five minutes; catches all errors and emits a notice. | Withhold the complete block, including extension creation and unscheduling. It is an external scheduler/configuration side effect, not merely a function definition. Do not claim automatic phase advancement; it needs a separately approved scheduler/worker decision. |

**Dependencies and preservation:** Requires RFQ status/deadline fields, quote versions, clarification messages, committee votes, access helpers, `private.in_demo_write_window()`, and audit schema. Later `00177` replaces `advance_rfq_phases()` with row locking and repeats the pg_cron schedule; it is BLOCKED in the manifest, so neither its concurrency behavior nor scheduler contract can be assumed. The disposable bootstrap also has not verified `pg_cron` preload/privileges.

**Validation conditions:** exact five columns/comments and three enforcement triggers exist; no RFQ data was present if the two updates are omitted; helper/RPC signatures and ACLs match; the phase-advance definition is present but no execution or cron job was created by this migration; no award is performed. None of these postconditions has been tested.

### 00114 — `00114_purge_prohibited_terms_and_update_supplier_aliases.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 11–49 | Runtime replacement of `private.assign_anonymous_label`; returns collision-checked `Supplier` aliases and raises if the RFQ has no salt. | Retain unchanged; preserve uniqueness, cryptographic code helper, and failure behavior. |
| 50–61 | Two migration-time historical text updates: invitation aliases and audit payload aliases beginning `Bidder `. | Withhold only for a clean target where both `rfq_invitations` and `audit_events` are empty at this point. If either is populated, block until preservation/remapping is explicitly decided. Do not rewrite audit history by default. |
| 64–82 | Five migration-time `user_roles.description` updates for `COMMITTEE_MEMBER`, `FINANCE_APPROVER`, `SUPPLIER_FOUNDER`, `SUPPLIER_BD_HEAD`, and `SUPPLIER_FINANCE`. These are role-catalog/UX data, not historical records. | Retain unchanged only after all five canonical role codes are present and active. Validate exactly one row per code and exact description values after all later role upserts; do not blanket-suppress these updates. |
| 85–140 | Runtime `private.notify_suppliers_of_outcome`; writes notifications and audit events when called. | Retain definition unchanged; these INSERTs are function-body behavior, not migration-time DML. Preserve alias-only outcome audit payload and exact security-definer/search-path behavior. Never invoke during replay. |
| 142–152 | Backward-compatible runtime wrapper `notify_bidders_of_outcome` forwarding to new helper. | Retain unchanged unless a reviewed later replacement proves the signature is unused; do not remove compatibility by assumption. |
| 154–157 | `my_quote_outcome` view alias to `my_bid_outcome` and authenticated SELECT grant. | Retain unchanged and verify the referenced legacy view exists at this point and that the grant remains. |

**Dependencies and preservation:** The role-description updates depend on the buyer/supplier role catalog established in earlier migrations and reconciled by later canonical role data. Prior Batch 1 evidence treats the role catalog as essential. Later identity-protected view migrations may replace the alias view; inspect the final view chain before replay. No trigger or external integration is invoked by this migration.

**Validation conditions:** the five target role rows exist before the update and match expected descriptions afterward; the historical alias backfills are omitted only with both clean-table counts zero; notification functions retain signatures and grants/ACLs; `my_quote_outcome` remains identity-protected through its final replacement chain.

### 00115 — `00115_seed_benchmark_org_and_fix_test_runner.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 8–26 | Migration-time upsert of a benchmark organization, including `bvnbasu@gmail.com`, a real-person name/phone, fixed UUID, pilot label, and reliability values. | Withhold from the disposable stream. It is identity/business demo data, not schema. Do not copy its contact details. If retained for another environment, require explicit identity/product approval and a source-specific fixture contract. |
| 27–66 | DO block selects a profile by real email, fixed UUID, or arbitrary platform-admin fallback, then inserts/updates an OWNER membership. | Withhold as one inseparable identity-assignment block. Do not run against a synthetic or real admin. Clean-target check: no benchmark organization ID and no matching/fallback profile or membership is supplied before this migration. |
| 68–371 | Runtime `SECURITY DEFINER` test-runner RPC; its SELECTs inspect schema/data, and its body does not execute during migration replay. Source authorization accepts `anon` and any `authenticated` caller in addition to admins/service role (lines 80–84); unknown test IDs return a success-shaped pass (lines 353–361). No explicit grant/revoke appears in this file. | BLOCK exposure/replay of this definition until the effective EXECUTE ACL and authorization contract are approved. Do not silently narrow or broaden its privileges here. `00261` proposes a later auth/truthfulness replacement but is BLOCKED; it cannot be presumed to resolve this source. |

**Dependencies and preservation:** The benchmark seed conflicts with the no-real/demo-identity boundary. The test runner depends on broad schema and catalogs and embeds numerous account emails in test conditions. Direct replacement evidence consulted: `00261_admin_run_test_case_truthful_execution_and_auth.sql` revokes anon and changes the body, but is currently BLOCKED.

**Validation conditions:** no benchmark organization or membership row is created by the generated stream; effective ACLs do not permit anon/general authenticated invocation absent explicit approval; unknown test IDs cannot be reported as passed in the approved final RPC. These checks are proposed only.

### 00117 — `00117_canonical_identity_protected_views_and_enums.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 18–28 | DO block conditionally adds `PROTECTED` before `REVEALED` to `rfq_reveal_status`. | Retain unchanged. Validate one enum value with ordering `PROTECTED` before `REVEALED`; source assumes the enum exists. |
| 30–32 | Sets RFQ default to `PROTECTED` and updates existing `BLIND` rows. | Retain the default alteration. Withhold only the row UPDATE when `rfqs` is verified empty at this point; otherwise preserve/convert every legacy status and validate no `BLIND` rows remain. |
| 35–50 | Drops fourteen listed legacy/canonical views with `CASCADE` (eight legacy aliases and six canonical views). | BLOCK pending a generated dependency inventory proving every dependent view/rule is intentionally recreated or excluded. Do not assume the explicit list contains all CASCADE dependents. |
| 52–254 | Defines seven security-barrier canonical views for quotes, supplier RFQs, clarifications, attachments, evaluations, invitations, and quote outcomes. | Retain exact projections, identity masking, status gates, and authorization helper predicates. Validate security-barrier properties, column sets, and no supplier identity leakage before reveal. |
| 257–263 | Recreates seven backward-compatible security-barrier aliases to canonical views. | Retain to preserve caller compatibility unless every caller has been migrated and removal is separately approved. |
| 265–279 | SELECT grants on canonical and legacy views to `authenticated, anon, service_role`. | Retain exact ACLs with the view predicates and underlying RLS/security contracts; verify effective privileges, not only grant statements. |

**Dependencies and preservation:** Requires the enum, RFQ/quote/invitation/attachment/evaluation/award tables, identity-access helper functions, and predecessor views. `00288_authenticated_quote_comparison_levels.sql` later replaces `quotes_identity_protected`, but is BLOCKED. `CASCADE` can remove unknown dependents before those later changes; exact final columns and grants must be validated against all callers.

**Validation conditions:** enum order/default are correct; any omitted UPDATE has `rfqs=0`; catalog dependency comparison before/after each CASCADE shows only the intended objects removed; all seven canonical views and seven aliases exist with security barriers; grants and view predicates match source. Proposed, not executed.

### 00122 — `00122_signup_org_and_active_org_sync.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 16–117 | Runtime `submit_signup_request`; validates side/active role and active taxonomy codes, defaults an Individual buyer to `PROPERTY_OWNER`/`Self`, writes signup request/audit rows when called; grant to `anon, authenticated`. | Retain definition/grant only with the approved role/taxonomy contract and reviewed anonymous signup policy. All writes are function-body behavior, not migration-time DML. Never invoke during replay. |
| 122–402 | Runtime SECURITY DEFINER `admin_review_signup_request`; requires `private.is_platform_admin()`, can write Auth users/identities, profiles, roles, organizations/suppliers, memberships, notifications and audit; default password argument and password returned in response. | Retain only after exact Auth schema/version, function authorization, password/activation handling, and RLS dependencies are approved. Do not invoke; do not synthesize account or credential values. |
| 402–403 | EXECUTE grant on admin review to `authenticated`. | Preserve exactly pending effective authorization review; verify the platform-admin check cannot be bypassed by the caller role. |
| 407–415 | Migration-time derived backfill sets `active_organization_id` from the earliest organization membership for profiles with NULL context. | Withhold only if both `profiles` and `organization_members` are verified empty at this point. If either contains a profile/membership, block or preserve the derivation; postcondition for a retained update is every eligible profile points to its earliest `joined_at` organization. |

**Dependencies and preservation:** Requires role catalog (`PROPERTY_OWNER` for Individual buyers), active taxonomy category codes, signup schema, Auth `users`/`identities`, `extensions.crypt/gen_salt`, notification RPC, and private admin/profile helpers. Later signup definitions replace this contract, including `00257`; those later migration dispositions and effective behavior remain outside this batch's approval.

**Validation conditions:** exact function signatures and grants; Individual role/name defaults; Auth dependencies resolve without creating records; admin review remains admin-only and never executes during replay; backfill is omitted only with zero `profiles` and zero `organization_members`. The source's default password is not an environment credential and must never be used to provision a user.

### 00123 — `00123_superadmin_pure_role_isolation.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 6–34 | Migration-time deletes memberships for fixed real/test admin emails or all platform admins; updates profiles and a fixed benchmark organization contact. | Withhold only on a clean target with zero profiles, organization memberships, supplier users, and no benchmark organization. Never copy or mutate real/admin identities in a disposable fixture. Non-empty target requires identity-by-identity approval. |
| 36–51 | Replaces `private.is_platform_admin()` with email fallback recognition; EXECUTE granted to `authenticated, service_role, anon`. | BLOCK pending security/product approval of email-based administrator identity and effective grants. Preserve neither hard-coded real-person identity nor admin semantics by an invented substitute. |
| 53–95 | Replaces `private.profile_side()` with admin/email membership exclusion; grants EXECUTE to `authenticated, service_role, anon`. | BLOCK until buyer/supplier/admin persona and authorization semantics are approved and later effective implementation is resolved. |
| 98–232 | Replaces `public.my_role_context()`; designated emails are forced to admin context, and normal user role/org membership data is returned. | BLOCK the source version pending security review; preserve no real email literals in fixtures. Later role-context replacements exist, but the effective final chain is not established by this migration alone. |
| 235 | `NOTIFY pgrst, 'reload schema'` sends a local PostgREST schema-reload notification during replay. | Retain only if the disposable bootstrap includes the expected PostgREST listener/channel contract; do not substitute hosted access or treat absence of a listener as proof the schema loaded. |

**Dependencies and preservation:** Depends on profiles, organization/supplier membership, profile roles, user roles, committee assignments, and Auth identity helpers. Later `my_role_context()` rewrites exist, but they do not prove the enduring `private.is_platform_admin()` behavior or grant policy. This remains an authorization decision, not a data-cleanup-only transformation.

**Validation conditions:** no real/superadmin identities are seeded; effective platform-admin and side-context checks are exercised only with approved synthetic identities; anon cannot acquire admin semantics; PostgREST reload notification is observed only in a local disposable bootstrap. No such validation was run.

### 00125 — `00125_production_preservation_and_staging_gate.sql`

**Transaction boundary:** no explicit `BEGIN`/`COMMIT`.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 6–26 | Creates environment settings table, environment CHECK constraint, RLS, public read policy, and admin-only write policy. | Retain schema/RLS only after bootstrap and least-privilege review. Preserve constraint and policies exactly unless an approved security change replaces them. `00203` later hardens this table but is BLOCKED. |
| 28–30 | Inserts singleton environment as `STAGING`, non-production, unlocked; conflict does nothing. | BLOCK. Do not infer or set an environment identity. Require explicit disposable-environment authorization and a fail-closed behavior for missing/unknown configuration before any replay. |
| 33–43 | Creates `otp_schema_migrations`, enables RLS, and permits anon/authenticated reads. | Retain table and RLS definitions only with the later privilege contract. `00203` revokes anon/public access and changes policy, but is BLOCKED. |
| 45–172 | Inserts 125 purported earlier migration names into the custom ledger. These are historical ledger/configuration records, not schema; names do not match the current 331-file version inventory. | Withhold pending an approved ledger-history contract. Do not fabricate applied history. Before omission, verify no application or migration runner reads these records; repository search found migration writes but no application reader. |
| 174–204 | Defines `private.is_production_environment()`: checks `app.environment='production'`, then the singleton row; catches all setting errors and returns false when no row/flags exist. | BLOCK effective safety use until unknown/missing environment fails closed or an explicit, approved setting contract proves the disposable identity. Do not silently retain a fail-open environment test as a verified safety guard. |
| 207–459 | Replaces the purge RPC with a SECURITY DEFINER function. Its body checks admin/environment, snapshots data, truncates transactional tables with CASCADE, deletes organizations, seeds benchmark/demo records, and reassigns admin identity. These effects occur only when the RPC is invoked. | Do not invoke. Preserve the protected lifecycle only after security/environment approval; do not include benchmark/demo row data in a fixture. The explicit production confirmation token can authorize destructive behavior in the source and must not be used. Later `00129`, `00133`, and `00184` replace purge signatures/behavior; `00129` is BLOCKED. |
| 462–477 | Defines `clear_all_transactional_data()`, which checks environment and invokes the purge function; authenticated EXECUTE grant. | Do not invoke. Block exposure until the exact authorization/unknown-environment contract and effective replacement chain are verified. |
| 480–561 | Defines `assert_production_data_integrity()` and grants EXECUTE to `authenticated, anon`. It asserts at least 10 suppliers, one organization, one admin, and zero admin org-memberships. | Do not execute as a reconstruction check: its thresholds encode production/demo fixtures and fail a valid clean schema. Preserve only as optional runtime behavior after ACL and contract review; never report its `HEALTHY` payload as validation evidence. |

**Dependencies and preservation:** Requires `private.is_platform_admin`, snapshot tables, transactional tables and Auth. The environment singleton and GUC are not interchangeable without authorization. The current source's absent-row behavior is false/not-production; this does not meet a disposable safety contract. Ledger policy tightening (`00203`), purge rewrites (`00129`, `00133`, `00184`), and environment/demo decisions remain blockers.

**Validation conditions:** exact RLS and grants; environment value set only by explicit authorization; missing/unknown environment cannot authorize destructive operations; no purge/clear/integrity RPC invocation; no fabricated ledger rows; final purge signature and ACL reconciled across all later replacements. None has passed.

### 00126 — `00126_fix_admin_orders_join_duplication.sql`

**Transaction boundary:** explicit `BEGIN` at line 5 and `COMMIT` at line 279; both function replacements, grants and ledger write are one source transaction.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 8–133 | Replaces `admin_get_live_transactions(int,int,text,boolean)` with a SECURITY DEFINER read RPC. Returns buyer email/name, buyer organization, supplier identity, order/payment data and phase summaries. Auth check permits `anon` and any `authenticated` role; grant at 133. | BLOCK exposure pending security approval. Do not remove the auth check/grant or assume function name means admin-only. Preserve transaction boundary if later authorized. |
| 136–272 | Replaces `admin_get_seller_orders(int,int,text,text)`; returns supplier legal/contact/GST and buyer/order/invoice/payment data. Its check likewise permits anon/any authenticated role; grant at 272. | BLOCK exposure pending security approval and explicit authorization contract. Do not invoke. |
| 275–277 | Migration-time upsert into `otp_schema_migrations` for `00126_fix_admin_orders_join_duplication`, replacing `applied_at` with `now()` on conflict. | Conditional: retain only if the custom ledger is approved as a live replay marker and its exact version format is accepted. Validate one exact row and transaction rollback behavior. Otherwise withhold rather than invent a version-history contract. |

**Dependencies and preservation:** Requires the custom ledger from 00125 and admin/order/fulfilment tables. `00128` defines five-argument versions of both RPCs; those are different signatures, so `CREATE OR REPLACE` does not remove these four-argument overloads. Both old and new endpoints may therefore remain callable. `00128` is the next selected migration; the final catalog must explicitly enumerate both signatures and ACLs. The custom ledger has no application reader found in this repository search.

**Validation conditions:** function overload inventory, `prosecdef`, owners, `search_path`, and effective EXECUTE grants are inspected; unauthenticated/ordinary authenticated access is not accepted without approval; no unintended data rows are returned to unauthorized roles; transaction contains only intended schema/RPC and approved ledger effects. No RPC was called.

### 00128 — `00128_admin_mode_data_isolation.sql`

**Transaction boundary:** explicit `BEGIN` at line 4 and `COMMIT` at line 1075.

| Source lines | Classification and effect | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 9–26 | Adds `is_demo` columns to eight transactional/communication tables and creates partial indexes for true rows. | Retain unchanged; validate all eight column types/defaults/not-null properties and all eight named partial indexes. |
| 30–74, 79–91 | Ten migration-time backfills mark requirements, RFQs, quotes, POs, work orders, invoices, payments, notifications, audit events, and support tickets as demo based on related demo records or fixed test identifiers. | Withhold all ten updates only when each of the ten target tables is verified empty at this point. If any is populated, block until each row's classification is evidenced. Zero affected rows alone is not a completeness check. |
| 76–77 | Drops `audit_events_no_update` and `audit_events_no_delete` before the audit backfill and does not recreate them in this migration. | Withhold these drops together with the audit backfill on a clean target, preserving append-only audit behavior. If replaying on non-empty data, BLOCK unless an approved temporary bypass/restoration is defined. Later `00134` recreates these triggers but is BLOCKED; do not assume it runs. |
| 97–170 | Defines `trg_inherit_is_demo()` and seven BEFORE INSERT triggers for quotes, POs, work orders, invoices, payments, notifications, and audit events. | Retain unchanged; validate every trigger/function binding and inheritance path. Source has no support-ticket inheritance trigger or branch, so do not claim new support tickets are auto-tagged by this migration. |
| 174–202 | Defines `resolve_admin_mode()`: AUTO follows `demo_settings.demo_mode_enabled`; recognized production labels map to PROD, demo/staging/test to DEMO, and other values map to ALL. | Retain only after explicit environment/demo decision. No environment marker or AUTO value is inferred. Preserve exact mapping and test unknown-input behavior; Batch 1's `00021` demo-enabled default remains unresolved. |
| 206–341 | SECURITY DEFINER `admin_get_live_transactions` mode-filtered RPC; exposes buyer and supplier identities and order/payment summaries. Auth check accepts anon/any authenticated role; anon/authenticated grant at 341. | BLOCK exposure pending security approval; preserve exact semantics only after authorization is resolved. |
| 346–494 | SECURITY DEFINER `admin_get_seller_orders`; exposes supplier legal/contact/GST and buyer/order/payment data. Auth check accepts anon/any authenticated role; grant at 494. | BLOCK exposure pending security approval. This is a five-argument overload and does not remove 00126's four-argument function. |
| 499–584 | `admin_get_all_notifications`; explicitly checks `private.is_platform_admin()`, filters by mode, returns recipient identity/notification payload; grant to anon/authenticated. | Retain only with exact admin check and effective ACL review; do not treat the grant alone as authorization. |
| 589–826 | `admin_search_entities`; SECURITY DEFINER search over supplier, organization, requirement/RFQ, and PO details; auth check accepts anon/any authenticated role; grant at 826. | BLOCK exposure pending authorization review. |
| 831–937 | `admin_get_system_health`; mode-filtered counts/status and demo setting; auth check accepts anon/any authenticated role; grant at 937. | BLOCK exposure pending authorization review; do not use its hard-coded service-health claims as evidence. |
| 942–1003 | `admin_get_audit_trail`; returns actor email/name, organization and audit payload; auth check accepts anon/any authenticated role; grant at 1003. | BLOCK exposure pending authorization and audit privacy review. |
| 1008–1073 | `admin_get_support_tickets`; returns ticket descriptions, routed/user email, user role/side and page URL; auth check accepts anon/any authenticated role; grant at 1073. | BLOCK exposure pending authorization/privacy review. |

**Dependencies and preservation:** The mode helper depends on `demo_settings`; the source does not establish a safe environment default. The `is_demo` tagging trigger does not cover support-ticket inserts. Backfill trigger drops weaken append-only auditing unless restored. `00134` is BLOCKED and recreates audit immutability triggers. The `00126` four-argument admin RPC overloads remain alongside these five-argument overloads. No RLS, ownership, or table grants are changed by this migration; do not claim these SECURITY DEFINER RPCs are protected by underlying RLS.

**Validation conditions:** the eight columns and indexes match source; all ten backfills are omitted only when every named table has zero rows; audit immutability triggers remain installed; seven inheritance triggers bind to the expected function; support-ticket tagging gap is explicitly tested/accepted; mode mapping is validated against an approved environment contract; complete RPC overload/ACL inventory proves no unapproved anon/general-authenticated exposure. No such checks ran.

## Cross-batch issues and preservation requirements

1. **Environment coupling:** `00125` proposes a `STAGING` singleton while Batch 1 `00021` inserts demo settings with `demo_mode_enabled = true`; `00128` AUTO mode uses that demo setting, not the environment table. Neither default is approved. Do not infer that a disposable database should be labeled staging, demo, or production.
2. **Taxonomy/backfill coupling:** `00020`'s callable logic requires real taxonomy and capability records; its final SELECT runs that logic during replay. This report proposes withholding only that invocation on a verified clean target, not deleting or replacing the parser/backfill functions or inventing mappings.
3. **Authorization chain:** `00115`, `00123`, `00126`, and `00128` contain role/admin RPC behavior or grants whose effective access is not established. `00261` and later hardening candidates are BLOCKED; no replacement is credited as effective.
4. **Audit immutability:** `00128` drops append-only triggers to update audit rows. `00134` recreates them but is BLOCKED. A stream that executes 00128 without a validated restoration does not preserve the audit contract.
5. **Overload retention:** 00128's five-argument `admin_get_live_transactions` and `admin_get_seller_orders` do not replace 00126's four-argument signatures. Both overloads and grants must be reconciled.
6. **Phase scheduling:** `00041` and blocked later `00177` create/replace cron jobs. Withholding scheduler DO blocks prevents migration-time scheduling but means automatic advancement is not established; no scheduler may be started as part of this read-only analysis.
7. **Clean-target rule:** omitted historical or derived updates require pre-replay row-count evidence for every affected table. A successful no-op, a partial update, or empty output from a classifier is not proof the required source catalog exists.

## Proposed measurable validation conditions

These are checks for a future, separately authorized generated-stream review; **none has been executed**:

- Confirm source hashes/line counts against this report and manifest order; generated source contains no unapproved identity or historical/demo seed.
- Verify each required table, column, enum value, index, function signature, trigger, view, policy and grant against catalog-level expected values. Check function `SECURITY DEFINER`, owner, `search_path`, and effective EXECUTE ACLs.
- Check clean-target row-count preconditions immediately before omitting each backfill; require exact zero across each listed table, not merely zero affected rows.
- Enumerate view dependencies before any `DROP ... CASCADE`; reject any unplanned dropped dependent object.
- Verify audit append-only triggers remain present after 00128 and all later migrations; no migration-time audit data is modified in the clean-target stream.
- Inventory all overloads of admin RPCs and prove each exposed function has an approved caller policy; anon and generic authenticated grants are not accepted as proof of admin authorization.
- Confirm no pg_cron extension/job is created by omitted scheduler blocks, and do not claim automatic lifecycle advancement without a separately approved execution mechanism.
- Verify environment/demo settings are explicit and fail closed for absent/unknown configuration; do not use `assert_production_data_integrity()` as a clean-target acceptance test.
- Validate the final effective migration chain, including only later replacements whose manifest disposition and source evidence are closed; a BLOCKED later migration cannot be credited as a fix.

## Closure assessment

**Sufficiently source-specific evidence:** all ten files have hashes, line counts, explicit statement groups, proposed treatments, dependencies, and measurable postconditions above. The source inspection supports separating `00020`'s 13 function-body DML sites from its migration-time invocation, and separating all other function-body runtime writes from top-level replay effects.

**Still blocked:** effective environment identity and fail-closed safety; taxonomy/capability final-state availability for any backfill caller; Supabase Auth/bootstrap compatibility; exact role/admin authorization and RPC grants; the 00117 CASCADE dependency graph; the 00128 audit-trigger restoration chain; the custom migration-ledger contract; pg_cron scheduling; and later blocked function/view replacements. No proposed omission or retention is approved.

**Recommendation: NO-GO for generated-stream approval or replay.** This report closes source-specific inspection for the selected batch only. It does not approve generated SQL or replay, resolve the existing blockers, or authorize Batch 3.
