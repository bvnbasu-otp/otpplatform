# B3 TRANSFORM Batch 5 — Source-Specific Inspection

## 1. Status and boundaries

**Evidence status:** Source inspection complete for the ten migrations in Section 2.  
**Treatment status:** Every treatment below is **PROPOSED / UNAPPROVED**.  
**Validation performed:** Read-only inspection of the manifest, selected source files, and narrowly related replacement/disposition evidence; local source line-count and SHA-256 capture.  
**Validation not performed:** No SQL was executed; no database, Docker/container, hosted environment, network, test, build, lint, or application operation was performed. No runtime behavior is independently validated.

This report is the only file authorized for creation by this task. It does not edit migration sources, the disposition manifest, or prior batch reports. It does not approve any generated stream, migration replay, or workflow testing.

## 2. Exact Batch 5 selection

The selection is the first ten rows currently marked `TRANSFORM`, in manifest order, after excluding all exact IDs named in Batches 1–4. “Manifest row” is the 1-based migration-record position; “TRANSFORM ordinal” is the 1-based ordinal among rows currently marked `TRANSFORM`.

| Manifest row | TRANSFORM ordinal | Version | Exact filename | Lines | SHA-256 |
|---:|---:|---|---|---:|---|
| 186 | 41 | `00186` | `00186_fix_admin_user_deletion_and_purge.sql` | 192 | `0D5BEE2F832865E0FC5904E1C31756DB6DA087A379D2CBDEA61935A51EE20B1B` |
| 187 | 42 | `00187` | `00187_dual_persona_portal_switching.sql` | 600 | `14A2D59C96AE938B852D8C31310B3BA0D96CFCA1FE4C8EFCEFA12F072549357B` |
| 194 | 43 | `00194` | `00194_supabase_data_api_table_grants_and_default_privileges.sql` | 79 | `95C8773B4A1C79736B8B136601AB1F4DCD12928D9B11AEAB4D426BC0E66AEDF7` |
| 212 | 44 | `00212` | `00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql` | 1274 | `B3F36A79E49586A8322B05DB49C5E1AF0D3C692CF7BEB33C62E34C0D49C9FA0A` |
| 215 | 45 | `00215` | `00215_withhold_direct_invite_link_for_existing_suppliers.sql` | 286 | `E31CEF7BE210C06CD1E1B7431BD1F22BE4D3596DCAB3286C564992999CC43666` |
| 254 | 46 | `00254` | `00254_individual_signup_property_owner_catalog_and_rpc.sql` | 171 | `B9DD6F4B204D3D142936B5B2ED6AAB4DB2F3D5E5770633C94619E50320C45DBA` |
| 257 | 47 | `00257` | `00257_canonical_role_catalog_and_signup_provisioning.sql` | 690 | `CDF90D25ABD56836185EDAD9DB0916F998E5D67C226120A1D892C4844094C18A` |
| 265 | 48 | `00265` | `00265_remediate_buyer_taxonomy_and_rls_integrity.sql` | 1344 | `B3734D0F3ACAEDAF35E8C8361C0203F1359CB3138459A5572049B3653A919639` |
| 267 | 49 | `00267` | `00267_authoritative_founder_and_admin_claims.sql` | 158 | `CC618C4359FA552BF2F87FCBA82133284BFC83FC2CD48E581E2859FE374B9A7B` |
| 271 | 50 | `00271` | `00271_fix_supplier_messaging_channels_unique_constraint.sql` | 116 | `19B34C258E9D387086DAFFE113D091FFD44A3EBA44220C9FD03462DC9BB35947` |

These are the ten qualifying rows in current manifest order; no other disposition was substituted.

## 3. Summary matrix

All treatments are **PROPOSED / UNAPPROVED**. The treatment column identifies what could be retained, transformed, or withheld; it is not replay authorization.

| Version | Filename | Lines / SHA-256 | Proposed treatment | Unresolved dependencies / blockers |
|---|---|---|---|---|
| `00186` | `00186_fix_admin_user_deletion_and_purge.sql` | 192 / `0D5BEE2F832865E0FC5904E1C31756DB6DA087A379D2CBDEA61935A51EE20B1B` | **BLOCK** the bulk-delete RPC and one-off identity purge. Do not retain its broad callable surface or replay its account deletion. Treat the optional migration-ledger write separately under an approved runner contract. | Destructive identity/Auth deletion; `anon`/authenticated execution grant and weak caller gate; identity ownership and purge policy unresolved; custom ledger schema/ownership unresolved. `00270` purge is **BLOCKED**. |
| `00187` | `00187_dual_persona_portal_switching.sql` | 600 / `14A2D59C96AE938B852D8C31310B3BA0D96CFCA1FE4C8EFCEFA12F072549357B` | **CONDITIONAL RETAIN** the `active_portal_side` column; **WITHHOLD** role-switch/auto-provision runtime definitions until role and ownership policy is approved. Do not copy the migration-ledger write without runner approval. | Runtime creates organizations, suppliers, and role assignments; role catalog and privileged identity chain unresolved. `00257` is later **TRANSFORM** and unapproved; relevant earlier hardening is **BLOCKED**. |
| `00194` | `00194_supabase_data_api_table_grants_and_default_privileges.sql` | 79 / `95C8773B4A1C79736B8B136601AB1F4DCD12928D9B11AEAB4D426BC0E66AEDF7` | **BLOCK** blanket grants/default privileges. Reconsider only an explicitly scoped privilege matrix, preserving intentional RLS and function ACLs. | Broad `anon`/authenticated table, routine, and sequence privileges; defaults depend on migration execution role; runner/PostgREST behavior is unresolved. |
| `00212` | `00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql` | 1274 / `B3F36A79E49586A8322B05DB49C5E1AF0D3C692CF7BEB33C62E34C0D49C9FA0A` | **CONDITIONAL RETAIN** schema, trigger, and policy changes after dependency/clean-target checks; **WITHHOLD** signup, GST, and address RPC behavior pending identity, entitlement, and authorization review. Preserve the supplier-state conversion only with a verified row-level data plan. | `00196`, `00209`, and `00210` are **BLOCKED**; `00257` later replaces signup routines but is unapproved. Supplier-view recreation depends on live catalog state. Auth and subscription/payment semantics unresolved. |
| `00215` | `00215_withhold_direct_invite_link_for_existing_suppliers.sql` | 286 / `E31CEF7BE210C06CD1E1B7431BD1F22BE4D3596DCAB3286C564992999CC43666` | **WITHHOLD** direct-invite RPC pending authorization, token-sharing, and lifecycle review. **BLOCK** the top-level magic-link expiry update unless its exact affected-row set has been approved. | Depends on direct supplier, invitation, messaging-channel, and magic-link schemas; `00213` is **BLOCKED**. No direct outbound notification is defined here, but a callable response returns a generated link token. |
| `00254` | `00254_individual_signup_property_owner_catalog_and_rpc.sql` | 171 / `B9DD6F4B204D3D142936B5B2ED6AAB4DB2F3D5E5770633C94619E50320C45DBA` | **CONDITIONAL RETAIN** the `PROPERTY_OWNER` catalog upsert if approved canonical role permissions match; **WITHHOLD** this superseded signup function pending the final effective function chain. | `00257` later replaces the role catalog and signup function but is **TRANSFORM** / unapproved. Role catalog is authorization data, not disposable seed data. |
| `00257` | `00257_canonical_role_catalog_and_signup_provisioning.sql` | 690 / `CDF90D25ABD56836185EDAD9DB0916F998E5D67C226120A1D892C4844094C18A` | **CONDITIONAL RETAIN** canonical role data only after role-contract approval; **WITHHOLD** signup/provisioning runtime functions pending Auth, identity, admin, subscription, and audit review. | Overrides `00212`/`00254` signup routines, but is itself unapproved. Provisioning can write Auth identities, roles, organizations/suppliers, subscription/payment logs and audit/notification rows when called. |
| `00265` | `00265_remediate_buyer_taxonomy_and_rls_integrity.sql` | 1344 / `B3734D0F3ACAEDAF35E8C8361C0203F1359CB3138459A5572049B3653A919639` | **BLOCK** the taxonomy/data/policy batch until the actual schema and authoritative taxonomy are reconciled. Preserve required reference data only through a separately approved, dependency-complete plan; do not silently omit it or treat its conflict handling as proof of completeness. | `00013` is **BLOCKED**, `00019` is **EXCLUDE**, `00020` is **TRANSFORM**, `00331` is **EXCLUDE**, and `00330` is **TRANSFORM**. Canonical taxonomy, schema ordering, and capability mappings remain unresolved. No explicit transaction boundary. |
| `00267` | `00267_authoritative_founder_and_admin_claims.sql` | 158 / `CC618C4359FA552BF2F87FCBA82133284BFC83FC2CD48E581E2859FE374B9A7B` | **BLOCK** designated identity claim updates absent explicit approved target identities; **WITHHOLD** admin/founder helper replacements until their full grants, whitelist, and effective-role behavior are approved. | Writes privileged claims to email-matched profiles; helper still accepts service role, session roles, and email allowlists and is executable by `anon`. `00179`/`00178` are unresolved; `00203` and `00216` are **BLOCKED**. |
| `00271` | `00271_fix_supplier_messaging_channels_unique_constraint.sql` | 116 / `19B34C258E9D387086DAFFE113D091FFD44A3EBA44220C9FD03462DC9BB35947` | **CONDITIONAL RETAIN** the unique index only after an approved deduplication/reconciliation plan; **BLOCK** the top-level duplicate deletion absent row-level preservation review; **WITHHOLD** outbound dispatch function pending consent, endpoint, and secret/configuration policy review. | Deletes channel records, then relies on uniqueness. Runtime function can mark a supplier contact phone as verified and call `net.http_post`. Later `00272` is **TRANSFORM** / unapproved; `00109`, `00110`, and `00266` are **BLOCKED**. |

## 4. Detailed source-specific inspection

### 4.1 `00186_fix_admin_user_deletion_and_purge.sql`

**Transaction:** Explicit `BEGIN` at line 6 and `COMMIT` at line 192.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 9–143 | Runtime `SECURITY DEFINER` replacement for `public.admin_bulk_delete_users(uuid[], boolean)`. It attempts to remove Auth users and related profile/account rows, with optional hard purge behavior and multiple exception-handled operations. The caller gate allows service role but also has a branch that does not robustly prove administrator identity; the function is granted to `authenticated`, `service_role`, and `anon` at 143. Definition does not execute the deletion during replay. | **WITHHOLD / BLOCK.** Do not install this callable administrative deletion path without a corrected and separately approved authorization contract. The grant to `anon` is inconsistent with an admin-only destructive operation. |
| 146–181 | Migration-time `DO` block targets the specifically named `bvnbasu@yahoo.com` account/profile/signup/Auth records for deletion, with a fallback soft-delete path. This is not a function body: it executes as part of migration replay. | **BLOCK.** Do not execute against an unknown identity set. If any future isolated reconstruction considers an equivalent operation, require an explicit identity allowlist and prove the exact target rows are test-only before approval; this report does not authorize the deletion. |
| 183–190 | Conditional migration-time upsert to `otp_schema_migrations` if the table exists and has the expected version field. It can write runner state and overwrites `applied_at` on conflict. | **WITHHOLD** until the custom ledger schema, owner, version semantics, and runner ownership are specified. Its conditional presence check does not prove a compatible ledger. |

No external network operation is visible in this source. The function’s credential/account mutations are deferred until called, but the account-specific `DO` block is immediate migration-time DML.

### 4.2 `00187_dual_persona_portal_switching.sql`

**Transaction:** Explicit `BEGIN` at line 6 and `COMMIT` at line 600.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 8–11 | Schema change adds `profiles.active_portal_side` with a default. | **CONDITIONAL RETAIN** after confirming current profile-side schema and its compatibility with existing Individual/RWA/MSME and supplier accounts. |
| 13–90 | Replaces `private.profile_side`; changes role-side resolution based on active portal side; grants execution to authenticated/service roles and `anon`. | **WITHHOLD** pending policy review, particularly because side selection determines authorization context and anonymous execution is granted. |
| 93–180 | Defines `public.ensure_buyer_organization()`. On invocation it may create an Individual buyer organization, membership, and role assignment; writes are runtime-only. | **WITHHOLD** until account ownership, organization creation, and idempotency are verified against the approved signup model. |
| 183–325 | Defines `public.switch_portal_side(signup_side)`. Runtime path can change the active portal side, create/link buyer organizations or supplier records, and add roles. Grants execution to authenticated/service roles. | **WITHHOLD** until persona eligibility, ownership, cross-portal switching, supplier creation, and role assignment are authorized. |
| 328–588 | Replaces `public.my_role_context()`, filters/constructs role context, and contains runtime role/profile provisioning behavior. It also contains privileged email and phone fallbacks; execution is granted to authenticated, service role, and `anon` at 588. | **WITHHOLD** pending effective authorization and identity review. Do not infer the anonymous grant is harmless because the routine is a context read: its body includes data-dependent role behavior. |
| 591–598 | Conditional migration-time write to the custom `otp_schema_migrations` table, with conflict update. | **WITHHOLD** until runner contract and ledger ownership are resolved. |

No data provisioning in the function bodies runs merely because they are defined. The ledger block is the migration-time DML.

### 4.3 `00194_supabase_data_api_table_grants_and_default_privileges.sql`

**Transaction:** No explicit `BEGIN`/`COMMIT`; statements are subject to runner and session transaction behavior.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 23–24 | Grants `USAGE` on `public` to `anon`, `authenticated`, and `service_role`. | **BLOCK** pending explicit schema-usage policy. |
| 26–32 | Grants authenticated/service roles broad DML on all current public tables/views and grants anon SELECT on all current public tables/views. | **BLOCK.** This is a blanket privilege expansion; it does not itself establish safe row-level policy coverage. |
| 34–36 | Grants usage/select on all current public sequences to authenticated/service roles. | **BLOCK** pending least-privilege sequence inventory. |
| 38–40 | Grants EXECUTE on all current public routines to anon/authenticated/service roles. | **BLOCK.** Routines include privileged and `SECURITY DEFINER` APIs; an inventory and explicit function-level ACL plan are necessary. |
| 42–53 | Alters default privileges for the current session role, including broad table, sequence, and routine defaults. | **BLOCK.** Result is dependent on the migration execution role and affects future objects. |
| 55–71 | A `DO` block alters postgres default privileges. This runs at migration time; it does not merely define runtime behavior. | **BLOCK** pending owner and role assumptions, plus explicit least-privilege replacement. |
| 73–79 | Attempts PostgREST schema reload notification inside an exception-handled procedural block. This is a migration-time operational notification, not an outbound network request. | Do not treat the exception handler as evidence that notification or schema-cache refresh succeeded. Revisit only under approved runner behavior. |

No blanket privilege grant should be inferred to make omitted policies, roles, or security controls unnecessary.

### 4.4 `00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql`

**Transaction:** Explicit `BEGIN` at line 53 and `COMMIT` at line 1274. PostgREST `NOTIFY` is at line 1272.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 56–123 | Creates `buyer_addresses` with profile/organization foreign keys, owner and pincode checks, address fields, partial indexes, and RLS enablement; adds address snapshots to RFQs/POs, persona/legal fields to organizations, invite claim fields, supplier lifecycle/trust fields, and indexes. | **CONDITIONAL RETAIN** only after verifying referenced tables/columns, existing constraints, RLS state, and compatibility with the actual buyer/persona schema. No table data is seeded here. |
| 130–215 | Migration-time `DO` block inspects the actual supplier column type; when it is the legacy enum it snapshots definitions/options/ACL/owner for two dependent quote views, drops those views, copies legacy verification values, alters the column to `text` with deterministic mapping, adjusts lifecycle state and notes, then recreates views with captured definitions/ownership/grants. | **CONDITIONAL TRANSFORM.** This is executable DDL and DML, not merely a deferred function. Require verified view definitions/ACL preservation, schema preconditions, and a row-level conversion plan. A zero-row update alone does not establish that the target had the required schema or reference values. |
| 217–231 | Sets default, conditionally adds a verification-status check, and creates verification index. | **CONDITIONAL RETAIN** after checking existing type/default/check/index definitions and permissible lifecycle values. |
| 241–279 | Defines `private.guard_supplier_trust_fields()` and installs/replaces a `BEFORE UPDATE` trigger. The function is security-invoker, has fixed `search_path`, blocks direct authenticated/anon changes to verification, lifecycle, block, and deletion fields except platform-admin sessions; it calls `private.is_platform_admin()`. Function grants and trigger DDL execute during replay; enforcement occurs on subsequent updates. | **CONDITIONAL RETAIN** only after checking effective role resolution, trigger ordering, caller identity, and later guard replacements. |
| 283–365 | Defines `public.verify_supplier_gstin()` as `SECURITY DEFINER`, fixed search path, supplier-membership check, input-length check, lock/update, status transition to pending/reverification as appropriate, and audit event. Execution is granted to authenticated/service role, not anon. The writes occur only when called. | **WITHHOLD** pending authorization and GST verification semantics review; a 15-character input check is not external verification. |
| 371–784 | Defines private signup provisioning. When invoked it may create/link `auth.users` and `auth.identities`, mutate profiles and role assignments, create/update organizations or suppliers and memberships, set a 30-day subscription with fixed amounts and `REG-ONBOARD-M1`, write a `SUCCESS` subscription-payment log, update signup status, and attempt in-app notification/audit inserts with broad exception handlers. It is not executed during migration replay. `private.provision_signup_request` is revoked from PUBLIC/anon/authenticated and granted to service role. | **WITHHOLD** until Auth bootstrap, synthetic identity rules, role provisioning, subscription/payment truth, and failure/atomicity semantics are approved. Exception-swallowed identity, payment-log, notification, and audit failures must not be interpreted as successful durable completion. |
| 789–876 | Defines admin review/rejection RPC. Runtime checks `private.is_platform_admin()`, can reject signup and audit, or delegates approval to the provisioner; function is `SECURITY DEFINER`. Grants authenticated/service role and revokes PUBLIC/anon. | **WITHHOLD** pending effective admin-claim and rejection/approval authorization review. |
| 880–1008 | Defines public signup submission. Runtime validates/coerces fields, reads active category codes, returns existing requests, inserts signup/audit data, and attempts self-service provisioning; caught provisioning errors create a review-required audit entry. It is granted to anon/authenticated/service role. | **WITHHOLD** pending anti-abuse, identity uniqueness/concurrency, role, signup state, and Auth provisioning review. |
| 1010–1062 | Drops/recreates buyer-address SELECT/INSERT/UPDATE/DELETE policies for authenticated users; policies bind personal rows to `private.get_profile_id()`, org rows to membership, and allow platform admin; revokes PUBLIC/anon table rights and grants authenticated/service-role DML. | **CONDITIONAL RETAIN** only after verifying policy composition (including pre-existing permissive policies), organization membership semantics, and RLS enabled state. |
| 1065–1227 | Defines a `SECURITY DEFINER` address upsert RPC. Runtime validates required fields/pincode, checks organization membership and existing-row ownership, prevents moving addresses between personal/org scope, clears prior primary flags, then inserts or updates. It is revoked from PUBLIC/anon and granted authenticated/service role. | **WITHHOLD** until concurrency/primary uniqueness and caller/organization authorization are reviewed; RPC body is not executed during replay. |
| 1229–1270 | Defines `get_buyer_addresses()` with profile/org membership checks, then revokes PUBLIC/anon and grants authenticated/service role. Runtime-only read behavior. | **WITHHOLD** pending the same buyer ownership and RLS policy review. |
| 1272 | Sends `NOTIFY pgrst, 'reload schema'` during migration application. | Treat as runner/PostgREST operational behavior; do not claim delivery or cache refresh was verified. |

**Dependency notes:** The source says it reasserts objects assumed by `00196`; the manifest marks `00196` **BLOCKED**. It replaces signup behavior previously installed in `00210` (**BLOCKED**) and extends the `00209` path (**BLOCKED**). `00257` later replaces role resolution and signup provisioning but remains **TRANSFORM / unapproved**. Consequently, this file cannot be treated as a proven reconciliation or final effective signup contract.

### 4.5 `00215_withhold_direct_invite_link_for_existing_suppliers.sql`

**Transaction:** Explicit `BEGIN` at line 51 and `COMMIT` at line 286. PostgREST `NOTIFY` at line 284.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 53–89 | Defines `private.is_unclaimed_direct_placeholder()`, a `SECURITY DEFINER` SQL helper checking `DIRECT` source/source_ref, organization, supplier-user absence, verified messaging-channel absence, and unused magic-link absence. It is revoked from PUBLIC. | **WITHHOLD** with dependent invitation logic until source, ownership, and placeholder invariants are verified. |
| 91–268 | Defines `public.invite_direct_supplier()` as `SECURITY DEFINER`. Runtime requires organization membership and a permitted org role, permits only DRAFT/OPEN RFQs, normalizes contact data, reuses/creates a pending direct supplier, inserts/reuses invitation and direct-invite rows, and conditionally issues a 7-day single-use hashed magic link for a shareable placeholder. A plaintext token/path is returned in the RPC response and an audit row stores masked contact data. No email/WhatsApp/network dispatch is performed by this body. | **WITHHOLD** until permissions, token recipient binding/disclosure, single-use/revocation, and direct-supplier lifecycle are approved. Do not invoke it during replay or inspection. |
| 270 | Grants the invite RPC to authenticated/service role. | Keep authorization scope under review; no anon grant is present here. |
| 272–282 | Migration-time `UPDATE` expires currently unused, unexpired magic links for direct invitations whose supplier no longer qualifies as an unclaimed placeholder. | **BLOCK** absent row-level approval. For a clean-target omission, prove `supplier_magic_links` has zero rows and no preexisting direct invites before migration; verify row counts and link status pre/post if any future transformation is authorized. |
| 284 | Migration-time PostgREST schema reload notification. | Runner-dependent operational effect; not independently verified. |

**Dependencies:** Uses `rfqs`, `suppliers`, `rfq_invitations`, `direct_supplier_invites`, `supplier_users`, `supplier_messaging_channels`, and `supplier_magic_links`. The adjacent direct-invite email-channel repair `00213` is **BLOCKED**; its behavior is not an effective replacement or prerequisite resolution.

### 4.6 `00254_individual_signup_property_owner_catalog_and_rpc.sql`

**Transaction:** Explicit `BEGIN` at line 4 and `COMMIT` at line 171. PostgREST `NOTIFY` at line 169.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 6–27 | Migration-time upsert of `PROPERTY_OWNER` in `public.user_roles`; conflict update writes side, label, description, permissions, order, and active state when different. This is authorization reference data, not demo data. | **CONDITIONAL RETAIN** only if the approved canonical role matrix matches the exact row. |
| 29–165 | Replaces `public.submit_signup_request(jsonb)` with a `SECURITY DEFINER` runtime function for buyer Individual registration and signup request handling. It validates Individual buyer/Property Owner conditions, writes signup/audit data when called, and contains no migration-time invocation. | **WITHHOLD** this intermediate definition pending review of the final installed function. |
| 166–167 | Revokes function execution from PUBLIC, then grants anon/authenticated/service role. | **WITHHOLD** the anon grant until the signup abuse and privilege contract is approved. |
| 169 | Migration-time PostgREST schema notification. | Runner-dependent; not verified. |

**Replacement chain:** `00257` later upserts the canonical 12-role catalog and replaces this `submit_signup_request` body. `00257` is still `TRANSFORM`, not approved, so its existence does not make this intermediate behavior safe or its later behavior effective.

### 4.7 `00257_canonical_role_catalog_and_signup_provisioning.sql`

**Transaction:** Explicit `BEGIN` at line 4 and `COMMIT` at line 690. PostgREST `NOTIFY` at line 688.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 6–58 | Migration-time upsert of 12 canonical buyer/supplier roles, replacing permissions, labels, descriptions, ordering, and active flags when different. `PROPERTY_OWNER` is READ-only in this catalog. | **CONDITIONAL RETAIN** as essential authorization reference data only after role semantics are approved and all other role/permission migrations are reconciled. |
| 60–155 | Defines `private.resolve_signup_role()` as `SECURITY DEFINER`, with `search_path=public`, fail-closed requested-role, side, and Individual-buyer checks. Execution is revoked from PUBLIC/anon/authenticated and granted only to service role. Runtime-only. | **WITHHOLD** until role catalog and service-role boundary are validated. |
| 157–281 | Replaces `submit_signup_request`; runtime validates buyer type, resolves active category codes and roles, returns existing signup state or inserts request/audit rows, and tries self-service provisioning with a caught failure path. `SECURITY DEFINER`; revoked from PUBLIC and granted to anon/authenticated/service role. | **WITHHOLD** pending unauthenticated signup controls, role/identity policy, and consistent retry/idempotency review. |
| 283–684 | Defines `private.provision_signup_request()` as `SECURITY DEFINER`. On invocation it may create Auth users and identities, update/link profiles, assign roles, create/update buyer organizations or suppliers, membership rows, signup status, subscription values, and audit/notification records. It creates a 30-day subscription record and inserts a payment-log row with `SUCCESS`, fixed tier amounts, and `UPI_QR`/`pay@otp`; this source does not establish that payment was actually received. Runtime-only. | **WITHHOLD** until Auth bootstrap, identity linking, privileged role, subscription entitlement, payment evidence, and exception/atomicity behavior are approved. |
| 685–686 | Revokes private provisioning from PUBLIC/anon/authenticated and grants service role. | Preserve only if service role is correctly isolated and the function itself is approved. |
| 688 | Migration-time PostgREST schema reload notification. | Runner-dependent; not verified. |

**Replacement chain:** The catalog upsert reasserts the roles modified by earlier role migrations, including the `PROPERTY_OWNER` permission contract. It replaces signup definitions from `00212` and `00254`, both of which remain subject to the current source ordering. It is itself **TRANSFORM / unapproved**; do not treat it as an effective fix until approved and verified in a generated dependency-complete stream.

### 4.8 `00265_remediate_buyer_taxonomy_and_rls_integrity.sql`

**Transaction:** No explicit `BEGIN`/`COMMIT` appears in the source. A runner that wraps each migration atomically could change failure behavior; that runner contract was not inspected or tested.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 1–68 | Migration-time insertion of 15 category rows, keyed by stable category codes, with `ON CONFLICT (code) DO NOTHING`; existing conflicting values are not repaired. | **BLOCK** pending authoritative taxonomy and schema reconciliation. These rows are product/reference data, not disposable historical data. |
| 70–237 | Migration-time insertion of capability vocabulary, including units/capacity semantics, with conflict-do-nothing behavior. | **BLOCK** until capability schema and all required codes are proven present and consistent. |
| 240–573 | Inserts the primary subcategory vocabulary and keyword/default-mode data by joining category codes; conflict on subcategory code does nothing. Missing category rows silently prevent matching insert rows. | **BLOCK** until taxonomy parent rows and target schema are verified; do not infer completeness from a successful statement or zero error. |
| 576–606 | Updates `required_attribute_codes` for selected subcategories. A missing subcategory yields a successful zero-row update. | **CONDITIONAL TRANSFORM** only with an explicit existence/count check for every named subcategory and corresponding definitions. |
| 608–797 | Inserts subcategory-to-capability primary/secondary mappings by joining existing subcategory and capability codes, conflict-do-nothing. Missing inputs silently omit mappings; the resulting supplier-discovery reach is behaviorally significant. | **BLOCK** until exact mapping coverage, including the previously reported 23 capability mappings, is reconciled against the approved taxonomy and discovery model. |
| 800–1038 | Inserts category attribute definitions (types, units, validation/options, regex match patterns, help and placeholders) by category-code join, conflict-do-nothing. | **BLOCK** until authoritative category and parser/attribute contracts are agreed; these are application workflow data, not sample rows. |
| 1041–1115 | Inserts subcategory-level attribute definitions by subcategory-code join, conflict-do-nothing. | **BLOCK** pending taxonomy and schema dependencies; verify all required-attribute codes resolve to renderable definitions. |
| 1118–1143 | Inserts evaluation-criteria catalog rows by code, conflict-do-nothing. | **CONDITIONAL RETAIN** only as reviewed product configuration, with exact code/definition comparison. |
| 1146–1184 | Inserts default evaluation suggestions derived from requirement mode and criterion code; conflict-do-nothing. Missing modes/subcategories/criteria silently omit rows. | **CONDITIONAL RETAIN** only after checking full expected coverage and weighting rules. |
| 1189–1219 | Deletes all suggestion rows for six named subcategories, then inserts market-specific replacements. This is migration-time destructive DML against configuration data; it can overwrite established values. | **BLOCK** absent an approved exact target row set and before/after reconciliation. A clean target must prove these six subcategories have zero preexisting suggestion rows before omission is considered safe. |
| 1222–1246 | `DO` block checks that each `required_attribute_codes` reference resolves via `subcategory_attribute_schema`; raises on orphans. This checks only that subset of integrity and does not prove all categories, subcategories, capabilities, or mappings exist. | Retain as a useful necessary check if the migration is otherwise approved; do not treat it as a complete integrity gate. |
| 1248–1295 | Inserts extended subcategories. Conflict update replaces name, description, and keywords for matching codes. Then inserts associated capability mappings with conflict-do-nothing. These updates can overwrite existing parser behavior; absent joined capability/category inputs can silently omit rows. | **BLOCK** until taxonomy version and mapping coverage are agreed; explicitly diff existing rows before any future update. |
| 1298–1306 | Replaces keywords for `amc_facility` with a fixed array. Zero matching rows is not treated as an error. | **CONDITIONAL TRANSFORM** only after confirming the row exists and reviewing parser/discovery effects of replacement keywords. |
| 1309–1314 | Grants anonymous/authenticated SELECT on taxonomy and evaluation tables and EXECUTE on `classify_requirement_text(text)` to anon/authenticated/service role. | **BLOCK** pending least-privilege and function exposure review. |
| 1316–1344 | Drops/recreates SELECT policies for categories, subcategories, capabilities, attributes, and evaluation criteria to expose active rows to anon/authenticated plus platform admins; suggestion policy uses `USING (true)`. Policies are permissive additions in PostgreSQL and can compose with existing policies. | **BLOCK** pending complete policy inventory and RLS-enabled-state review. Do not assume these policies narrow other permissive policies. |

**Taxonomy-specific blocker:** The source comment describes required taxonomy schema/data ordering, but manifest `00013` is **BLOCKED**, `00019` is **EXCLUDE**, and `00020` is **TRANSFORM**. `00331_authoritative_17_category_taxonomy.sql` is **EXCLUDE**, while `00330` is **TRANSFORM**. Therefore the 15-category data in this source is not established as the final authorized taxonomy, and none of these later dispositions can be treated as an effective replacement.

### 4.9 `00267_authoritative_founder_and_admin_claims.sql`

**Transaction:** Explicit `BEGIN` at line 5 and `COMMIT` at line 158.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 7–15 | Adds privileged-claim columns to `profiles` and a partial index. `is_platform_admin` receives default false. | **CONDITIONAL RETAIN** after verifying existing schema, default, and all code paths that rely on the claims. |
| 17–27 | Migration-time profile UPDATEs set founder/admin claims for hard-coded email addresses. They can elevate existing identity rows; these are not neutral seed values. | **BLOCK** unless every target identity is explicitly approved for the exact isolated environment. For omission, verify no matching profile rows and no corresponding Auth/profile identity is provisioned by another migration; do not infer this from a zero-row UPDATE alone. |
| 29–52 | Replaces `private.is_founder()` with a `SECURITY DEFINER` profile-claim check; grants it to authenticated/service role/anon. | **WITHHOLD** until claims, owner, fixed search path, anon exposure, and effective RLS dependency are reviewed. |
| 55–156 | Replaces `private.is_platform_admin()` as `SECURITY DEFINER`. It accepts service-role JWT context and selected direct DB session users; also accepts a hard-coded JWT email allowlist, profile claim, Auth email, or profile email allowlist. It catches malformed JWT context and grants execution to authenticated/service role/anon. This is runtime behavior. | **WITHHOLD.** The function is not “database-profile-claim only” in effect; the email and service-role paths remain part of the authority boundary. Require a reviewed identity/claim model and explicit ACL plan. |

**Replacement dependency:** `00203` and `00216` are **BLOCKED**; `00179` is **TRANSFORM** and unapproved. No later source may be treated as an effective hardening correction absent approved ordering and behavior evidence.

### 4.10 `00271_fix_supplier_messaging_channels_unique_constraint.sql`

**Transaction:** No explicit `BEGIN`/`COMMIT` appears. Migration runner transaction behavior is unresolved.

| Source lines | Classification and behavior | Proposed treatment |
|---|---|---|
| 9–20 | Top-level `DELETE` removes all but one row per `(supplier_id, channel)`, preferring VERIFIED, then latest `verified_at`, then latest `created_at`. This is destructive migration-time data mutation; the discarded rows may contain distinct contact information or verification history. | **BLOCK** pending a row-level comparison and an approved preservation rule. For clean-target omission, prove zero duplicate keys and preserve an auditable pre/post row count. |
| 22–24 | Creates unique index on `(supplier_id, channel)`. This is schema enforcement that requires duplicate-free data. | **CONDITIONAL RETAIN** only after the input constraint and all writers/upsert behavior are verified. |
| 27–116 | Replaces `private.dispatch_supplier_invitation_notification()` as `SECURITY DEFINER` with `search_path=public, private, extensions`. It can return for stub/demo/no-invitation cases; otherwise it may derive a WhatsApp channel from `suppliers.contact_phone`, write it as `VERIFIED`, resolve service URL/key from settings or `private.platform_secrets` (with a hard-coded URL fallback), and call `net.http_post`. An exception is caught and logged as a warning. Definition does not send anything during migration replay; the outbound request happens only if called. | **WITHHOLD** pending phone-consent/verification policy, endpoint and service-role configuration controls, function ACL/owner review, and proof the caller chain is appropriately gated. Never invoke it as part of inspection. |

**Replacement/caller chain:** `00272` later replaces this function and adds operator/buyer-phone guards, but `00272` is **TRANSFORM / unapproved** and also performs test-supplier phone updates and deletes a channel row. `00109` and `00110` are **BLOCKED**, as is `00266`; dispatch enablement/default behavior is therefore unresolved. A later function definition cannot be assumed effective or safe merely because the file exists.

## 5. Dependency and replacement-chain findings

1. **Signup, identity, and role chain:** `00196`, `00209`, and `00210` are **BLOCKED**; `00212` reconciles their assumed schemas and replaces signup routines. `00254` replaces Individual signup behavior and writes the Property Owner role. `00257` later replaces the role catalog and signup/provisioning functions, but remains **TRANSFORM / unapproved**. `00187` also creates runtime persona/role provisioning paths. The final installed signup and role behavior is not approved by source inspection alone.
2. **Privileged identity chain:** `00267` introduces profile claim updates and an admin check with several independent authorization paths. `00179` is unapproved `TRANSFORM`; `00203` and `00216` are **BLOCKED**. There is no verified canonical privileged-identity set or effective function ACL.
3. **Taxonomy chain:** `00013` is **BLOCKED**, `00019` **EXCLUDE**, `00020` **TRANSFORM**, `00265` **TRANSFORM**, and `00331` **EXCLUDE**. `00330` is **TRANSFORM**. Category schema, the 15-category seeds in `00265`, final 17-category authority, subcategory/capability mappings, attribute schemas, and policies have not been reconciled. Missing join inputs and conflict-do-nothing operations can silently yield incomplete data.
4. **Direct supplier invitation chain:** `00215` relies on direct-invite, supplier, channel, and magic-link tables and expires existing links. `00213` is **BLOCKED**; related behavior cannot be treated as established. Its token-producing RPC is runtime behavior, not a migration-time invocation.
5. **Messaging dispatch chain:** `00271` requires unique channel keys and changes dispatch behavior; `00272` replaces that function but remains unapproved and includes test-contact cleanup. `00109`, `00110`, and `00266` are **BLOCKED**. No scheduler, notification, or trigger behavior is claimed effective or invoked here.
6. **Destructive operations and migration runner:** `00186` contains an immediate account-specific purge and optional custom-ledger writes. `00270` purge is **BLOCKED**. `00187` also writes the custom ledger conditionally. Ledger schema, ownership, idempotency, and runner transaction boundaries are unresolved.
7. **RLS, grants, audit, and external effects:** `00194` broadens grants/default privileges; `00212`, `00265`, and `00267` install security policies/functions; `00134` and `00203` hardening are **BLOCKED**. In-app notifications/audit writes are inside runtime signup functions; `00271`/`00272` network requests are inside deferred function bodies, not top-level migration execution.

## 6. Proposed measurable validation conditions

These are **proposed checks, not executed results**. Any execution requires separate authorization and an approved isolated environment.

1. **Selection and source integrity:** Re-derive all ten IDs, manifest positions, and TRANSFORM ordinals; compare each line count and SHA-256 in Section 2 with current sources.
2. **Manifest and previous evidence integrity:** Verify manifest counts remain `1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED`; verify manifest and Batch 1–4 hashes are unchanged.
3. **Identity and purge boundary:** Before any approved omission or transformation, prove no identity matching the hard-coded account purge/claim lists exists in `auth.users`, `profiles`, or related signup data. Require an explicit non-production test identity allowlist and demonstrate no unintended Auth/profile deletion or privilege assignment.
4. **Role catalog and function ACLs:** Compare all 12 `00257` role rows and permission arrays to an approved role contract. Inventory owners, `SECURITY DEFINER`, `search_path`, grants, and effective permissions for `00187`, `00212`, `00254`, `00257`, and `00267`; prove anon/non-admin callers cannot obtain role escalation, provision/link identities, or invoke admin functions.
5. **Signup/payment semantics:** Verify provisioning cannot link an existing identity by unverified email, that subscription fields and `SUCCESS` payment-log rows correspond to an approved entitlement/payment contract, and that swallowed exceptions cannot produce a success response with incomplete identity, audit, or payment state.
6. **Address and supplier-state migration:** Check all referenced tables/columns and dependent quote-view definitions/owners/ACLs before migration. Reconcile every supplier verification/lifecycle value before and after the enum-to-text mapping; demonstrate the trust-field trigger denies direct caller mutation and allows only the intended verified administrative path.
7. **Direct invite and magic links:** On an approved clean target, prove zero direct invites and zero magic-link rows before considering omission of the top-level expiry UPDATE. If data exists, enumerate each affected link and verify ownership, expiry, usage, revocation, and invitation behavior; prove returned tokens cannot be disclosed to an unintended caller.
8. **Taxonomy/reference data:** Compare category/subcategory/capability/attribute/evaluation code sets with the approved canonical taxonomy; assert exact expected row counts and all foreign-key/join matches, including every required mapping and the previously unresolved capability mappings. Verify all required attribute codes resolve and all suggestion weights satisfy the approved totals/rules. A successful insert or the migration’s orphan check alone is not sufficient.
9. **Taxonomy policies:** Record RLS enabled/forced state and every permissive/restrictive policy before and after; verify anon/authenticated can read only the approved active catalog and cannot gain broader rights through policy composition or grants.
10. **Messaging deduplication and egress:** Before index creation, enumerate duplicate `(supplier_id, channel)` groups and reconcile every discarded row; after, require zero duplicates and exact preserved rows. Independently prove no migration replay invokes dispatch and no external request is sent. Any future runtime test must use isolated stubbed endpoints and authorized non-secret configuration.
11. **Transaction and runner behavior:** Confirm the runner’s transaction contract for all selected migrations, especially the non-explicit-transaction files `00194`, `00265`, and `00271`; verify failure rollback, PostgREST notification handling, and custom ledger behavior without treating exception handling as success.
12. **No unauthorized data migration:** For any omitted historical update/delete, require a clean-target precondition measured against exact relevant tables and a postcondition proving zero unintended changed/deleted rows. Do not treat a zero-row statement result as proof that required reference data or schema existed.

## 7. Relevant cross-batch blockers

- **Auth and synthetic identity:** Supabase Auth bootstrap and synthetic identity ownership remain unresolved. `00186` deletes an email-specific account; `00267` promotes email-matched profiles; `00212`/`00257` create or link Auth identities only when their functions are called.
- **Role and authorization:** Canonical role semantics, privileged claims, broad grants, effective RLS, and admin identity approval remain unresolved. The `00257` catalog is essential reference data but is still unapproved; `00194` blanket grants and anon-executable security-definer helpers require explicit review.
- **Taxonomy and discovery:** Batch 1 identified taxonomy/reference ordering and capability mapping gaps. Batch 5 confirms `00013` is **BLOCKED**, `00019` **EXCLUDE**, `00020` **TRANSFORM**, and `00331` **EXCLUDE**; `00265` cannot be assumed a complete authoritative schema/data repair. Supplier discovery remains dependent on the unresolved `00120` **BLOCKED** chain.
- **Messaging and environment:** Demo/system-mode and supplier network stub defaults remain unapproved. Dispatch functions in `00271`/`00272` can call a network endpoint when invoked; blocked `00109`, `00110`, and `00266` do not establish safe live behavior. No function or external integration was invoked.
- **Subscription, quota, and payment:** Signup provisioning in `00212`/`00257` writes fixed subscription values and a `SUCCESS` payment-log row at runtime. Commercial payment, entitlement, quota, and audit semantics remain unresolved; the presence of a log row is not payment evidence.
- **Audit and purge safety:** Audit immutability (`00134`) and later privilege hardening (`00203`) remain **BLOCKED**. The migration-time identity purge and channel dedupe are destructive, and `00270` purge remains **BLOCKED**.
- **Storage, demo, runner, and operations:** Earlier Supabase Storage privacy/bootstrap and demo/environment findings remain open. Custom migration-ledger ownership/idempotency and PostgREST notification/runner transaction behavior have not been verified.

## 8. Closure assessment and recommendation

- **Source inspection status:** COMPLETE for the ten selected migration files.
- **Proposed treatments:** All remain **UNAPPROVED**.
- **Manifest dispositions:** Not changed; counts remain `1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED`.
- **Generated-stream approval:** **NOT GRANTED.**
- **Migration replay:** **NOT AUTHORIZED.**
- **Workflow testing:** **NOT AUTHORIZED.**
- **Batch 6:** **NOT STARTED.**

The principal blockers are destructive identity and channel data mutations; unresolved identity, role, and grant boundaries; the unverified Auth/signup/entitlement chain; taxonomy schema/order and mapping gaps; and unapproved network dispatch behavior. Source inspection does not establish replay safety or runtime correctness.
