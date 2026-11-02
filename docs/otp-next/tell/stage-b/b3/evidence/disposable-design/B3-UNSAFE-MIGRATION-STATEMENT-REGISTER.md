# Unsafe and Mixed Migration Statement Register

## Scope and method

This register is a static, value-redacted inventory of migration-time SQL
statements in the 331 ordered migration files at repository HEAD
`77888fba12c6cee441017986a663393d92d4b649`. It records DML statement line,
operation and target table only. It does not reproduce SQL literals or data.
Function and procedure bodies are normally definitions rather than
migration-time execution. The direct-DML scan excludes their bodies, but
Phase 0E records the 13 `00020` body statements reached by an explicit
migration-time call separately. Procedural `DO` blocks execute during
migration and must be reviewed separately.

The scanner found **293 direct migration-time DML statements in 86 files**:
148 INSERT, 123 UPDATE, and 22 DELETE. Phase 0E additionally found a
migration-time call in `00020:342` to `public.backfill_taxonomy()`. Its
function body contains 13 DML statement sites, bringing effective
migration-time DML to **306 statement sites** (152 INSERT, 132 UPDATE, 22
DELETE) across 87 files. The source-level data register now includes those 13
sites separately from the 293 direct statements.

The source inventory identifies **29 files** with identity/account-related
DML, **37 files** with supplier/customer/business table DML, and **55
distinct files** in their union. Those counts overlap. The targets listed
below also include taxonomy/static reference records, migration ledgers and
operational configuration.

**Execution-context reconciliation:** the two `00138` INSERTs at `:228` and
`:247` are inside `private.notify_suppliers_of_outcome(uuid)`, which is not
called by that migration; they are deferred. By contrast, the explicit
`SELECT public.backfill_taxonomy()` at `00020:342` invokes 13 function-body
DML sites during migration. The register therefore contains 308 source
locations: 293 direct DML, 13 invoked function-body DML, and 2 deferred
function-body INSERTs. Effective migration-time totals are 306, not 293.

This is a screening register, not permission to run a generated replay. SQL
parsing, dynamic SQL, procedural blocks and side effects require the separate
manual review and proof described below.

## Per-file statement inventory

`L` is the source line number; statement form is shown as `operation@line →
target`. Actual values and predicates are deliberately omitted.

| Version / migration | Migration-time statements (type, line, target) | Essential to structural schema? | Data-safe disposition |
|---|---|---|---|
| `00018` `00018_attachments.sql` | INSERT@28 → `storage.buckets` | No | Bootstrap metadata; omit from schema-only run, or create a synthetic bucket fixture only if later validation requires it. |
| `00019` `00019_taxonomy_data.sql` | INSERT@16 → `requirement_categories`; INSERT@71 → `capabilities`; INSERT@239 → `requirement_subcategories`; UPDATE@578 → `requirement_subcategories`; INSERT@610 → `subcategory_capabilities`; INSERT@800/@1040 → `category_attribute_definitions`; INSERT@1115 → `evaluation_criteria`; INSERT@1147/@1190 → `subcategory_evaluation_suggestions`; DELETE@1183 → `subcategory_evaluation_suggestions` | No | Static taxonomy is important to application behavior but not table/constraint creation. Preserve reviewed, canonical reference data in a separate sanitized fixture stream; do not silently remove if testing parser/classification behavior. |
| `00020` `00020_taxonomy_backfill.sql` | UPDATE@100/@106/@119/@128/@140/@179 → `requirements`; INSERT@204/@255 → `supplier_capabilities`; UPDATE@265 → `supplier_capabilities`; INSERT@278/@294 → `supplier_service_areas`; UPDATE@310/@323 → `suppliers`; top-level call@342 invokes `public.backfill_taxonomy()` | No | The top-level invocation executes all 13 DML statement sites against existing requirements/supplier data. Remove only the invocation in a sanitized stream; retain the function definition. |
| `00021` `00021_demo_foundation.sql` | INSERT@51 → `demo_settings`; INSERT@118 → `buyer_type_config`; UPDATE@190 → `committee_votes` | No | Mixed schema/function/security plus demo/config data. Omit demo/account data; preserve DDL and review configuration/backfill separately. |
| `00022` `00022_identity_protection.sql` | UPDATE@101 → `rfqs`; UPDATE@103 → `requirements` | No | Existing-record normalization/backfill. Exclude from initial schema-only stream; assess invariant impact before any synthetic substitute. |
| `00025` `00025_demo_simulation.sql` | INSERT@124 → `demo_price_anchors` | No | Demo-only reference/configuration data; exclude. |
| `00027` `00027_capability_capacity_source.sql` | UPDATE@28 → `capabilities` | No | Data backfill/normalization; schema DDL remains separate; test with synthetic rows only if required. |
| `00032` `00032_attachment_rfq_link.sql` | UPDATE@38 → `attachments` | No | Existing-record association backfill. Exclude and record that synthetic fixtures will not reproduce historical attachment links. |
| `00039` `00039_role_based_access.sql` | INSERT@91/@123 → `user_roles` | No | Role/catalog seed. Preserve required non-personal role catalog only as a reviewed synthetic/static fixture, separate from account grants. |
| `00041` `00041_phase_engine.sql` | UPDATE@58/@63 → `rfqs` | No | Existing procurement-state data update. Do not execute in schema-only replay; preserve procedure/trigger definitions. |
| `00056` `00056_grant_all_permissions_to_buyer_leads.sql` | UPDATE@2 → `user_roles` | No | Role assignment data. Omit; do not create buyer identities or memberships. |
| `00058` `00058_furniture_and_painting_taxonomy_and_suppliers.sql` | INSERT@9 → `requirement_categories`; INSERT@28/@96 → `requirement_subcategories`; INSERT@151 → `capabilities`; INSERT@171 → `subcategory_capabilities`; INSERT@204/@295 → `category_attribute_definitions`; INSERT@390 → `suppliers`; INSERT@509 → `supplier_capabilities` | No | Mixed canonical reference data and supplier/business records. Preserve DDL; separate approved non-personal taxonomy fixtures from supplier rows, which must be excluded. |
| `00059` `00059_amenities_sports_pools_vehicle_repair.sql` | INSERT@10/@62 → `requirement_subcategories`; INSERT@93 → `capabilities`; INSERT@108 → `subcategory_capabilities`; INSERT@126 → `suppliers`; INSERT@228 → `supplier_capabilities` | No | Split taxonomy/capability fixtures from supplier/capability data; no real supplier records. |
| `00061` `00061_water_filters_and_purification_suppliers.sql` | INSERT@4 → `public.suppliers` | No | Supplier data, exclude. |
| `00062` `00062_cement_and_construction_suppliers.sql` | INSERT@4 → `public.suppliers` | No | Supplier data, exclude. |
| `00065` `00065_supplier_gst_verification.sql` | UPDATE@167 → `public.suppliers` | No | Existing supplier-row backfill/normalization, exclude. |
| `00071` `00071_seed_super_admin_ops_user.sql` | UPDATE@14 → `auth.users`; INSERT@22 → `auth.users`; UPDATE@55/@84 → `public.profiles`; INSERT@61 → `public.profiles` | No | Auth-account and privileged-profile creation/update, unsafe and not schema-essential; exclude in full. |
| `00078` `00078_seed_solar_cctv_furniture_water_filter_suppliers.sql` | INSERT@25 → `tmp_new_suppliers`; INSERT@273 → `auth.users`; INSERT@291 → `auth.identities`; INSERT@305 → `public.profiles`; INSERT@316 → `public.suppliers`; INSERT@339 → `public.supplier_users` | No | Account, identity and supplier seed; exclude all data operations. Temporary-table creation may be needed only for a separately reviewed sanitized fixture, not schema. |
| `00082` `00082_seed_gas_pipeline_suppliers.sql` | INSERT@21 → `tmp_gas_suppliers`; INSERT@83 → `auth.users`; INSERT@101 → `auth.identities`; INSERT@112 → `public.profiles`; INSERT@120 → `public.suppliers`; INSERT@140 → `public.supplier_users`; DELETE@149 → `rfq_invitations`; INSERT@151 → `rfq_invitations`; UPDATE@158 → `rfqs` | No | Account/supplier/RFQ seed and mutation; exclude all data operations. Do not create the referenced real procurement scenario. |
| `00083` `00083_link_furniture_rental_rfq.sql` | DELETE@9 → `rfq_invitations`; INSERT@11 → `rfq_invitations`; UPDATE@18 → `rfqs` | No | Existing RFQ/supplier-link mutation; exclude. |
| `00086` `00086_reset_admin_password.sql` | UPDATE@10 → `auth.users`; UPDATE@18/@24 → `public.profiles` | No | Password/account mutation; exclude in full. |
| `00093` `00093_swap_supplier_role_order.sql` | UPDATE@3/@4 → `user_roles` | No | Role catalog/configuration update. Keep separately classified from user account seeding. |
| `00094` `00094_seed_royal_teak_and_specialized_furniture_supplier_users.sql` | INSERT@15 → `tmp_furniture_suppliers`; UPDATE@44 → `public.suppliers`; INSERT@52 → `auth.users`; INSERT@71 → `auth.identities`; INSERT@82 → `public.profiles`; INSERT@90 → `public.supplier_users` | No | Account and supplier seed; exclude all data operations. |
| `00095` `00095_update_societycomfort_business_name.sql` | UPDATE@4 → `public.suppliers` | No | Business/supplier record update; exclude. |
| `00111` `00111_standardize_verified_domain_suppliers_and_logins.sql` | INSERT@27 → `tmp_active_verified_suppliers`; INSERT@366 → `public.suppliers`; INSERT@387 → `auth.users`; INSERT@406 → `auth.identities`; INSERT@417 → `public.profiles`; INSERT@425 → `public.supplier_users` | No | Supplier/account creation and normalization; exclude all data operations. |
| `00113` `00113_seed_real_super_admin_bvnbasu.sql` | UPDATE@14 → `auth.users`; INSERT@23 → `auth.users`; UPDATE@58/@88 → `public.profiles`; INSERT@65 → `public.profiles`; INSERT@93 → `auth.identities` | No | Privileged auth account seed/update; exclude in full. |
| `00114` `00114_purge_prohibited_terms_and_update_supplier_aliases.sql` | UPDATE@50 → `rfq_invitations`; UPDATE@55 → `audit_events`; UPDATE@64/@68/@72/@76/@80 → `public.user_roles` | No | Business/audit/role data rewrite. Exclude; preserve any related DDL/functions. Data may be historical and not safely reproducible from synthetic fixtures. |
| `00115` `00115_seed_benchmark_org_and_fix_test_runner.sql` | INSERT@8 → `public.organizations`; INSERT@52 → `public.organization_members` | No | Benchmark organization and membership data; exclude. |
| `00117` `00117_canonical_identity_protected_views_and_enums.sql` | UPDATE@32 → `public.rfqs` | No | Existing RFQ data normalization; exclude. |
| `00122` `00122_signup_org_and_active_org_sync.sql` | UPDATE@407 → `public.profiles` | No | Existing account/profile backfill; exclude from schema-only stream. |
| `00123` `00123_superadmin_pure_role_isolation.sql` | DELETE@6 → `public.organization_members`; DELETE@14 → `public.supplier_users`; UPDATE@22 → `public.profiles`; UPDATE@30 → `public.organizations` | No | Destructive identity/role/organization migration. Exclude; do not apply to synthetic or existing records. |
| `00125` `00125_production_preservation_and_staging_gate.sql` | INSERT@28 → `public.platform_environment_settings`; INSERT@45 → `public.otp_schema_migrations` | No | Environment config and ledger writes. A generated replay ledger must be owned by the harness, not copied from this migration; no environment switch values are imported. |
| `00126` `00126_fix_admin_orders_join_duplication.sql` | INSERT@275 → `public.otp_schema_migrations` | No | Legacy self-managed ledger write; omit/replace with generated replay ledger entry only after the migration's non-data definitions are preserved. |
| `00128` `00128_admin_mode_data_isolation.sql` | UPDATE@30 → `requirements`; UPDATE@38 → `rfqs`; UPDATE@45 → `quotes`; UPDATE@52 → `purchase_orders`; UPDATE@60 → `work_orders`; UPDATE@64 → `invoices`; UPDATE@68 → `payments`; UPDATE@72 → `notifications`; UPDATE@79 → `audit_events`; UPDATE@86 → `support_tickets` | No | Existing business-record mode backfill. Exclude; may be coupled to required constraints/policies and therefore needs per-statement review. |
| `00130` `00130_clear_audit_logs_notifications_and_fix_toggle.sql` | DELETE@16/@19 → `public.audit_events`; DELETE@17/@20 → `public.notifications` | No | Destructive data purge. Exclude both deletes; retain only separately reviewed function/DDL definitions. |
| `00135` `00135_clean_ascii_notifications_and_rpc_templates.sql` | UPDATE@41 → `public.notifications`; UPDATE@46 → `public.supplier_notifications` | No | Existing notification data rewrite, exclude. |
| `00136` `00136_fix_quotes_identity_protected_and_award_po_flow.sql` | UPDATE@278 → `public.rfq_invitations` | No | Existing invitation/business data rewrite; exclude. |
| `00137` `00137_fix_discover_and_invite_anti_leak_policy.sql` | UPDATE@159 → `rfq_invitations` | No | Existing invitation/business data rewrite; exclude. |
| `00138` `00138_seed_contact_supplier_logins.sql` | INSERT@27 → `tmp_demo_suppliers`; INSERT@74 → `suppliers`; INSERT@101 → `auth.users`; UPDATE@127 → `auth.users`; INSERT@134 → `auth.identities`; INSERT@150 → `profiles`; INSERT@167 → `profile_roles`; UPDATE@176 → `profiles`; INSERT@181 → `supplier_users`; INSERT@192 → `demo_accounts`; INSERT@228 → `notifications` *(stored function body; deferred)*; INSERT@247 → `audit_events` *(stored function body; deferred)*; INSERT@274 → `otp_schema_migrations` | No | Migration-time demo supplier/account/auth/ledger data is excluded. The two function-body INSERTs are retained as function behavior; they do not execute while defining the function. Omit ledger DML in favor of the reconstruction manifest. |
| `00141` `00141_user_profile_customization.sql` | UPDATE@33/@42/@48/@55/@59/@64 → `public.profiles`; INSERT@371 → `public.otp_schema_migrations` | No | Profile backfill and self-managed ledger write. Exclude; preserve schema/function code. |
| `00143` `00143_set_admin_password.sql` | UPDATE@16 → `auth.users`; INSERT@26 → `auth.users`; INSERT@61 → `auth.identities`; UPDATE@89 → `public.profiles`; INSERT@98 → `public.profiles`; DELETE@124 → `public.organization_members`; DELETE@125 → `public.supplier_users` | No | Admin credential/account provisioning and membership deletion; exclude in full. |
| `00144` `00144_prepaid_subscription_model.sql` | UPDATE@16 → `public.organizations` | No | Existing business/subscription data backfill; exclude. |
| `00145` `00145_enable_1month_subscription_from_registration.sql` | UPDATE@9 → `public.organizations`; INSERT@25 → `public.subscription_payment_logs` | No | Organization/subscription record changes; exclude. |
| `00146` `00146_update_nokia_to_basu_and_org_name_edit.sql` | UPDATE@7 → `public.organizations`; UPDATE@12 → `public.signup_requests`; UPDATE@16 → `public.suppliers`; UPDATE@22 → `public.profiles`; UPDATE@27 → `auth.users` | No | Named account/business data rewrite; exclude; no values are copied to this report. |
| `00148` `00148_strict_linear_15_step_procurement_pipeline.sql` | INSERT@161 → `public.otp_schema_migrations` | No | Self-managed ledger write; replace only with harness-owned version tracking. Preserve event-table schema and policy definitions. |
| `00152` `00152_immutable_platform_admin_role.sql` | INSERT@22 → `private_security.admin_whitelist` | No | Privileged identity/authorization whitelist data. Exclude real rows; provide no synthetic administrator unless a narrowly scoped security test explicitly requires it. |
| `00157` `00157_fix_auth_users_gotrue_null_tokens.sql` | UPDATE@8/@41 → `auth.users`; INSERT@64 → `auth.identities`; UPDATE@89 → `public.profiles` | No | Auth/account data repair. Exclude; schema definitions and trigger/function behavior remain separate. |
| `00158` `00158_seed_buyer_account_bvnbasu_yahoo.sql` | INSERT@23 → `public.organizations`; INSERT@34 → `auth.users`; UPDATE@76 → `auth.users`; INSERT@87 → `auth.identities`; INSERT@112 → `public.profiles`; INSERT@142 → `public.organization_members`; INSERT@156 → `public.profile_roles`; UPDATE@167 → `public.profiles` | No | Buyer account/org seed; exclude in full. |
| `00165` `00165_fix_super_admin_presence_visibility_and_all_tabs.sql` | UPDATE@114 → `public.profiles` | No | Existing privileged profile data update; exclude. |
| `00166` `00166_buyer_auto_approval_and_free_rfq_credits.sql` | UPDATE@19/@23 → `public.organizations` | No | Existing organization quota/credit data update; exclude; retain the publication function definition. |
| `00167` `00167_phase5a_progressive_invoicing_and_line_items.sql` | UPDATE@70 → `public.invoices`; INSERT@129 → `public.purchase_order_line_items`; INSERT@155 → `public.work_order_milestones`; UPDATE@164 → `public.work_order_milestones` | No | DDL is needed to represent downstream execution/accounting schema; these backfills synthesize financial/operational records and must not run. Keep DDL/checks/FKs/triggers; omit/backfill neither real nor fictitious buyer items. |
| `00168` `00168_phase5b_statutory_gst_and_tax_splitting.sql` | UPDATE@126/@143/@160 → `public.purchase_order_line_items`; UPDATE@186 → `public.purchase_orders`; UPDATE@226/@243/@260 → `public.invoice_line_items`; UPDATE@300 → `public.invoices` | No | Existing financial record backfills; preserve DDL/functions, exclude data transformations from schema-only replay. |
| `00169` `00169_phase5c1_payment_allocations_and_partial_settlement.sql` | UPDATE@274 → `public.invoices`; UPDATE@280 → `public.payments`; INSERT@297 → `public.payment_allocations`; UPDATE@322 → `public.invoices`; UPDATE@341 → `public.payments` | No | Financial settlement backfill; preserve DDL, omit all account/payment/business rows. |
| `00174` `00174_phase5c5_settlement_execution_fees_and_reconciliation.sql` | INSERT@85 → `public.platform_fee_policies` | No | Static business policy data; retain only after explicit synthetic/reference-data review; no real policy/account balances. |
| `00179` `00179_phase6_group3_cross_cutting_remediation.sql` | UPDATE@29 → `public.profiles`; INSERT@633 → `public.announcements` | No | Profile normalization and announcement seed. Exclude; preserve relevant schema/function definitions. |
| `00181` `00181_phase6_group4_wallet_and_rewards.sql` | INSERT@167 → `public.organization_wallets` | No | Business/financial initialization; exclude. |
| `00184` `00184_production_clean_state_reset_and_demo_isolation.sql` | INSERT@363 → `public.otp_schema_migrations` | No | Self-managed ledger write in a reset-related migration. Do not execute reset behavior; replace ledger tracking with harness metadata. |
| `00186` `00186_fix_admin_user_deletion_and_purge.sql` | DELETE@158/@159/@160/@162/@166/@175/@177/@178 → `profile_roles`, `organization_members`, `supplier_users`, `notification_preferences`, `profiles`, `signup_requests`, `auth.identities`, `auth.users`; UPDATE@168 → `public.profiles`; INSERT@186 → `public.otp_schema_migrations` | No | Destructive account deletion/purge statements; omit all. Preserve reviewed security function definitions only. |
| `00187` `00187_dual_persona_portal_switching.sql` | INSERT@594 → `public.otp_schema_migrations` | No | Self-managed ledger write; replace with replay manifest. |
| `00212` `00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql` | UPDATE@160/@177/@185 → `public.suppliers` | No | Existing supplier/address/business data normalization; exclude. |
| `00215` `00215_withhold_direct_invite_link_for_existing_suppliers.sql` | UPDATE@272 → `supplier_magic_links` | No | Existing invitation/security token data rewrite; exclude. |
| `00223` `00223_otp_taxonomy_03_buyer_taxonomy.sql` | UPDATE@9/@60/@115/@123 → `requirement_subcategories`; INSERT@23/@70 → `requirement_subcategories`; INSERT@128 → `subcategory_capabilities` | No | Static taxonomy/reference update; preserve only through reviewed canonical non-personal fixture set. |
| `00234` `00234_domestic_ro_primary_capabilities.sql` | INSERT@9 → `capabilities`; INSERT@34 → `subcategory_capabilities`; INSERT@48/@56/@64 → `supplier_capabilities` | No | Mixed reference data and supplier capability associations. Split static capability definitions from supplier-specific rows; omit supplier rows. |
| `00254` `00254_individual_signup_property_owner_catalog_and_rpc.sql` | INSERT@6 → `public.user_roles` | No | Role catalog/lookup data; separate from identity rows and use only reviewed static role values. |
| `00255` `00255_restore_requirement_categories_canonical.sql` | INSERT@6 → `requirement_categories` | No | Canonical static category data; retain only as a reviewed synthetic/reference fixture if behavior validation requires it. |
| `00257` `00257_canonical_role_catalog_and_signup_provisioning.sql` | INSERT@6 → `public.user_roles` | No | Static role catalog data; separate from account provisioning and review for conflicts with earlier role rows. |
| `00265` `00265_remediate_buyer_taxonomy_and_rls_integrity.sql` | INSERT@22 → `requirement_categories`; INSERT@77 → `capabilities`; INSERT@245/@1251 → `requirement_subcategories`; UPDATE@584/@1301 → `requirement_subcategories`; INSERT@616/@1275 → `subcategory_capabilities`; INSERT@806/@1046 → `category_attribute_definitions`; INSERT@1121 → `evaluation_criteria`; INSERT@1153/@1196 → `subcategory_evaluation_suggestions`; DELETE@1189 → `subcategory_evaluation_suggestions` | No | Mixed canonical taxonomy backfill/repair plus RLS/schema. Preserve all DDL/security; static rows require reviewed data-only transformations, never blind omission if later functions require taxonomy presence. |
| `00267` `00267_authoritative_founder_and_admin_claims.sql` | UPDATE@18/@24 → `public.profiles` | No | Privileged account/claim backfill; exclude. |
| `00271` `00271_fix_supplier_messaging_channels_unique_constraint.sql` | DELETE@9 → `public.supplier_messaging_channels` | No | Existing supplier messaging record cleanup required before a uniqueness change; do not run against real data. For replay, omit data deletion and instead create an empty table with the final constraint; validate the migration's exact constraint ordering in the transformation map. |
| `00272` `00272_add_waha_to_messaging_provider_and_isolate_operator_phone.sql` | UPDATE@13/@17 → `public.suppliers`; DELETE@22 → `public.supplier_messaging_channels` | No | Supplier-specific rewrite and duplicate cleanup; exclude. Preserve DDL/check constraints separately. |
| `00273` `00273_persist_pin_coverage_in_canonical_suppliers.sql` | UPDATE@153/@161 → `public.suppliers` | No | Existing supplier location/coverage backfill; exclude. |
| `00274` `00274_location_pin_coverage_durable_recovery.sql` | UPDATE@22/@29 → `public.location_pin_coverage_generation` | No | Job-state/backfill mutation; exclude; do not execute external job dispatch. |
| `00276` `00276_server_authoritative_legal_acceptance.sql` | INSERT@129 → `public.legal_document_versions` | No | Static legal-document configuration is data, not schema. Do not invent acceptance/customer rows; use an explicitly approved non-legal synthetic fixture only if required. |
| `00279` `00279_legal_agreement_grace_and_database_enforcement.sql` | UPDATE@38 → `public.legal_document_versions`; INSERT@51 → `public.legal_enforcement_config` | No | Legal configuration backfill. Preserve DDL/functions; omit or use separately reviewed synthetic configuration, and create no customer acceptance data. |
| `00282` `00282_individual_personal_procurement_lifecycle.sql` | INSERT@405/@412 → `public.organizations`; INSERT@427 → `public.personal_buyer_accounts`; INSERT@428 → `public.personal_subscriptions`; UPDATE@435 → `public.profiles`; UPDATE@440 → `public.signup_requests` | No | Individual-ownership backfill/provisioning. Preserve ownership DDL, policies and functions; no automatic population of live-like Individual accounts. Validate the migration's empty-database path and triggers independently. |
| `00284` `00284_legal_gate_paths_and_personal_subscription_settlement.sql` | INSERT@146 → `public.subscription_payment_logs` | No | No payment/customer data in schema replay; omit. |
| `00289` `00289_pilot_simulated_purchase_entitlements.sql` | UPDATE@16 → `public.platform_environment_settings`; UPDATE@129 → `public.rfq_allowance_consumptions` | No | Pilot setting and business allowance data; omit and verify function/constraint definitions independently. |
| `00298` `00298_internal_rbac_and_portal_console_alignment.sql` | INSERT@307 → `public.internal_roles`; INSERT@315 → `public.internal_permission_groups`; INSERT@322 → `public.internal_permissions`; INSERT@333 → `public.internal_group_permissions` | No | Static authorization catalog data, but security-sensitive. Keep no users or assignments; seed only reviewed synthetic role/permission identifiers if required to test behavior. |
| `00300` `00300_internal_staff_referral_ledger.sql` | INSERT@503 → `public.internal_referral_plans` | No | Static internal business policy data; exclude or provide a separately approved synthetic fixture. |
| `00301` `00301_internal_console_role_switching_and_isolation.sql` | INSERT@5 → `public.user_roles`; INSERT@18 → `public.internal_roles`; INSERT@63 → `public.profile_roles`; UPDATE@70 → `public.profiles`; INSERT@82 → `public.internal_user_assignments` | No | Mixed role catalogs and account-specific authorization assignments. Keep DDL; omit user/profile assignments and only seed static catalogs after review. |
| `00303` `00303_password_policy_rotation_history_and_hook.sql` | UPDATE@26 → `public.profiles` | No | Account security state/backfill. Exclude; preserve password-policy schema/functions/triggers. |
| `00305` `00305_po_transition_payment_gst_milestones.sql` | UPDATE@30 → `public.suppliers` | No | Existing supplier/business data update; exclude. |
| `00306` `00306_po_transition_inspection_and_gst_backfill_fix.sql` | UPDATE@6 → `public.suppliers` | No | Existing supplier/business data update; exclude. |
| `00314` `00314_internal_invitation_acceptance.sql` | UPDATE@19/@51 → `public.internal_invitations` | No | Existing invitation lifecycle data update; exclude. |
| `00320` `00320_audit_actor_identity_registry.sql` | INSERT@167 → `public.audit_actor_identities` | No | Static actor registry data; do not seed personal identities. Use only a synthetic actor if a test requires it. |
| `00330` `00330_authoritative_pricing_and_supplier_fee_gate.sql` | INSERT@40/@84 → `public.subscription_plans`; UPDATE@91 → `public.organizations` | No | Mixed plan catalog and organization data. Preserve schema/functions; no organization rows. A synthetic static plan fixture requires review. |
| `00331` `00331_authoritative_17_category_taxonomy.sql` | INSERT@17 → `requirement_categories`; UPDATE@85 → `requirement_subcategories`; UPDATE@89 → `requirement_categories`; INSERT@99 → `capabilities`; INSERT@117/@177/@233/@264/@295 → `requirement_subcategories`; INSERT@321 → `subcategory_capabilities` | No | Authoritative taxonomy reference-data migration; no structural DDL detected in these statements. Preserve reviewed canonical taxonomy fixture only if behavior tests need it; do not merge earlier competing taxonomy seeds without analyzing ordering. |

## Schema-preserving alternatives and dependency notes

- **Pure account/password operations** (`auth.users`, `auth.identities`, and
  privileged profile creation/update/deletion): do not execute or substitute
  anonymized credential rows. Retain the required table/function/policy
  definitions from separate statements; create only minimal synthetic auth
  fixtures later if a behavior test is separately authorized.
- **Supplier, customer, organization, RFQ, quote, order, invoice, payment,
  notification, invitation and audit mutations:** exclude from schema-only
  replay. Preserve their table/function definitions. For data migrations
  that expect duplicates or existing rows, prove the empty-database path and
  manually transform only the generated copy.
- **Taxonomy/capability/role/plan/legal catalogs:** keep separate from schema
  replay. They may be necessary for realistic behavior but are not DDL. Import
  only reviewed canonical static values into a separate fixture stream;
  supplier associations, personal values and acceptance records are excluded.
- **Internal migration-ledger INSERTs:** replace with one harness-owned
  ordered ledger that records original version, original filename, source
  checksum, generated-stream checksum, transformation IDs, and applied
  outcome. Do not apply a legacy migration's hard-coded ledger insert.
- **Duplicate cleanup before unique constraints** (notably messaging
  constraints): an empty reconstructed table has no duplicates; retain the
  final DDL/constraint, but prove whether the original migration's DDL is
  ordered before or after its cleanup statement. Do not simply delete the
  cleanup from a populated database.
- **Backfills that affect later application invariants** (including
  Individual ownership and financial fields): structural schema can exist
  without historical rows, but absence of backfill may make runtime behavior
  incomplete. Record the omitted transformation and do not claim end-to-end
  behavior validation based on an empty schema.
- Each listed file is ordered after the immediately preceding numeric
  migration in the full repository chain. The precise dependency DAG is
  **not established** by lexical scanning; targets indicate likely earlier
  object dependencies only. No migration may be moved or silently skipped.

## Safety limitations

The inventory is generated from SQL statement boundaries with function
bodies excluded to distinguish migration-time writes from runtime behavior.
Statements embedded in dynamic SQL, nested procedural code, psql directives,
extensions' internal behavior, or unusual formatting may evade a lexical
scanner. Before authorizing reconstruction, every migration needs a
statement-level parse/review with source and generated checksums. The
`unknown/other` migration and any unclassified procedural/dynamic construct
remain blockers until manually understood.
