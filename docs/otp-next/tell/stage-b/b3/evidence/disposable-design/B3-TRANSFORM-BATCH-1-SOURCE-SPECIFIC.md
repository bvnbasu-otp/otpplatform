# B3 TRANSFORM Batch 1 — Source-Specific Treatment Proposal

## Status and boundaries

**PROPOSED READ-ONLY ANALYSIS — ALL TREATMENTS UNAPPROVED.**

This report covers only migrations `00018`, `00021`, `00022`, `00025`,
`00027`, `00032`, `00039`, `00056`, `00065`, and `00111`. It does not edit
source migrations, the disposition manifest, or prior B3 evidence; it does
not generate SQL or authorize replay. Existing dispositions remain unchanged:
**1 RETAIN / 67 TRANSFORM / 21 EXCLUDE / 242 BLOCKED**.

SHA-256 hashes below were computed from the current source files. Locations
refer to the original migration files. "Retain" and "withhold" describe a
proposed generated-stream action only. Proposed expected results are not
validation results.

## Summary matrix

| Version / migration | SHA-256 | Source-specific proposed treatment (UNAPPROVED) | Principal dependency / unresolved item |
|---|---|---|---|
| 00018 `00018_attachments.sql` | `56C643606464E61043D02BCA8CE43FE3CD6AF640EFFE61DF490D854EAFB2A452` | Retain attachment schema, functions, views, RLS, grants, Storage policies and the private-bucket upsert unchanged. | Exact Supabase Storage bootstrap/object contract; bucket and policy postconditions. |
| 00021 `00021_demo_foundation.sql` | `21DAE015987F3643686A71696D8D2741B78AF84932BC42FB51D9706AA424C889` | Retain schema, functions, triggers, policies and buyer-type reference rows. Block the demo-settings singleton insert pending an explicit environment/demo decision. Withhold the committee-vote historical backfill and its trigger-disable/enable wrapper as one unit. | Source insert inherits `demo_mode_enabled = true`; environment decision is not authorized. |
| 00022 `00022_identity_protection.sql` | `811717857DAAB45C5F38D66B87A6566BAD3FD57FDAE4C3F1400E5D0E8A8F6501` | Retain identity-protection columns/defaults, functions, triggers, blind views, grants and indexes. Withhold the two historical public-reference backfills. | Clean-target precondition; validate trigger-generated references and identity-safe projections. |
| 00025 `00025_demo_simulation.sql` | `F4C82AB46E93B8450833BFBFDFD1E9662E60F3AD9E7D810124AE740A2A7410DE` | Retain demo-only schema, guarded functions, RLS, policies and grants; withhold demo price-anchor rows. Do not invoke simulator functions. | Demo remains explicitly out of scope; preserve definitions required by later demo migrations and keep environment execution disabled. |
| 00027 `00027_capability_capacity_source.sql` | `D81840242FC835FCDB00E7AAFF0E05F14642D9D8CF245D9978C5C6B11FD125E7` | Retain column/function/guard definitions. Block the 23-code capability mapping update until its taxonomy input and ordering are supplied and validated. | `00019` is EXCLUDE; absence of capability/attribute rows makes the update a silent no-op and the guard insufficient to prove completeness. |
| 00032 `00032_attachment_rfq_link.sql` | `FF2D173EC8374B3846CB42EB3BD24CD685634F998E93375156C266316EF9C5CC` | Retain trigger, security-barrier view, security-definer functions and Storage policy replacement. Withhold the existing-row RFQ-link backfill for an empty disposable target. | Storage bootstrap; clean-target evidence and attachment access postconditions. |
| 00039 `00039_role_based_access.sql` | `E26B2095E4CAED8408A9E9480E5E053B15EF4BF26BF3D4895ECF4EE88DF16365` | Retain role/permission schema, both source role-catalog inserts, authorization functions, triggers, RLS, policies and grants unchanged. | Role catalog is required authorization data. Final canonical catalog is also reconciled by later `00257`; effective access still needs validation. |
| 00056 `00056_grant_all_permissions_to_buyer_leads.sql` | `E35C5B116B055805E9DD5DBA11CFB6D956B89C7A61DFDE89C3A40E9EC9EE1969` | Retain `has_role_permission` replacement unchanged. Withhold its role-array update only if the generated stream proves `00257`'s canonical upsert is retained; otherwise block. | Owner-membership bypass is persistent behavior; PROPERTY_OWNER's temporary expansion is corrected by later `00257`, but effective semantics require an approved role contract. |
| 00065 `00065_supplier_gst_verification.sql` | `677CCEEE429D9C1A4B197E96AC0A900685F01F914582C3FE09D1B6108FA94D01` | Retain supplier columns/index, verification RPC, grants, quote-view replacements and their security barriers. Withhold the seeded-supplier GST/legal-identity backfill. | Prevent generated synthetic verification values from being applied to arbitrary supplier rows; verify view privacy and exact ACLs. |
| 00111 `00111_standardize_verified_domain_suppliers_and_logins.sql` | `6E9841A7AEF4E2C2F2BE10ACB4BFB42779560199DB9BAAB2B9FF35529D530A6E` | Withhold the temporary supplier/account data block. Block the discovery-function replacement until the effective later discovery implementation is resolved; do not invoke it. | Hard-coded demo supplier selection and fallback are not a canonical supplier-discovery contract. Later `00120` is BLOCKED, so its replacement cannot be assumed. |

## Detailed statement-level evidence

### 00018 — `00018_attachments.sql`

**Source hash:** see summary matrix.

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 14–20 | Schema/object definitions: attachment scope and kind enums. | Retain unchanged. |
| 28–50 | Environment/reference configuration: upsert of Storage bucket `otp-attachments`, `public=false`, 25 MiB limit, explicit MIME allowlist; conflict updates keep the bucket private and set its limits. | Retain unchanged only with the verified Storage bootstrap contract. Do not replace it with a public bucket or a guessed Storage stub. |
| 55–89 | Schema: `attachments`, target/scope, size and voice-note constraints, and requirement/quote/RFQ indexes. | Retain unchanged. |
| 96–143 | Runtime behavior: security-definer `attachments_prepare` and BEFORE INSERT trigger generate ID-based paths and neutral display names. | Retain function and trigger unchanged. No migration-time invocation. |
| 149–216 | Runtime authorization: `can_read_attachment` and `can_write_attachment` functions. | Retain unchanged, including organization-role, supplier-membership, invitation, committee, and platform-admin checks. |
| 218–296 | Three security-barrier views: buyer requirement attachments, blind quote attachments, and revealed quote attachments. | Retain unchanged. Preserve omission of identifying fields from blind/cross-party views and reveal gating. |
| 298–352 | `create_attachment_slot`; its INSERT at 332 is inside a stored function, not executed by migration replay. Auth/profile checks, authorization, server-generated storage path, and neutral label are behavior. | Retain definition and exact EXECUTE grant; never call during schema replay. |
| 355–377 | `confirm_attachment_upload`; its UPDATE is runtime function behavior. | Retain definition and grant unchanged; do not invoke. |
| 384–426 | Metadata RLS, own-side policies and table/view grants. | Retain unchanged; verify actual RLS flags, policy expressions, roles and ACLs. |
| 428–459 | Storage INSERT/SELECT/DELETE policies on `storage.objects`, restricted to this private bucket and attachment authorization. | Retain unchanged. Do not weaken or omit these policies. |

**Dependencies and preservation:** Earlier requirements, quotes, RFQs,
profiles, supplier/organization authorization helpers, `authenticated` and
`service_role` are required. Bootstrap must supply compatible
`storage.buckets` and `storage.objects` before the bucket upsert and policy
creation, plus Auth role semantics. Preserving `public=false`, the path
construction, identity-safe views, security-definer function settings, RLS,
and grants is mandatory.

**Validation required:** generated catalog contains both enum definitions,
table constraints and all three indexes; bucket row is private with exactly
the source limit and MIME allowlist; helper signatures/owners/security/search
paths and EXECUTE ACLs match source; all three metadata policies and all three
Storage policies exist with exact commands/expressions; the attachment table
has RLS enabled; views remain security barriers and expose no forbidden
cross-party identity fields. These checks are proposed, not run.

**Unresolved:** exact Storage catalog version, object definition, policy
compatibility, and Storage bootstrap are not verified. Migration-wide
execution remains blocked on that bootstrap evidence.

### 00021 — `00021_demo_foundation.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 16–33 | Schema/demo tagging: `is_demo` columns and partial indexes on organizations, profiles, suppliers, requirements and RFQs. | Retain unchanged; later migrations and demo isolation refer to these fields. |
| 27–33 | Schema/audit tagging: `audit_events.demo_run_id`, index and explanatory comment. | Retain unchanged; preserve append-only audit behavior. |
| 40–53 | Demo configuration table. `demo_mode_enabled` has source default `true`; line 51 inserts the singleton and therefore activates that default. | Retain table/functions; **BLOCK the singleton INSERT** pending explicit environment/demo authorization. Do not treat the default or absence of a row as an approved environment setting. |
| 53–105 | Updated-at trigger and demo helper/audit-stamping functions and trigger. These are definitions, not migration-time invocation. | Retain unchanged; preserve helper behavior and trigger attachment. |
| 108–137 | `buyer_type_config` schema, five source-defined buyer-type/voting-power rows, and updated-at trigger. The INSERT at 118 is static reference/configuration data used by vote stamping and referenced by later application/test paths. | Retain table, trigger and source rows unchanged; do not suppress as generic DML. |
| 139–177 | Vote columns, comment, `stamp_vote_power` function and BEFORE INSERT trigger. | Retain unchanged; preserve server-derived buyer type and voting power. |
| 188–199 | Historical vote backfill bracketed by disabling and re-enabling user triggers. | Withhold the disable / UPDATE / enable sequence as one unit for a blank target. Never retain the trigger-disable statements without their exact pairing. |
| 209–252 | Demo account and scenario schema/indexes. These are definitions, not account/fixture rows. Later demo migrations reference the tables. | Retain schema; no demo identity or scenario rows are introduced here. |
| 255–296 | Demo status function, login-options view and grants. | Retain definitions/grants, but do not expose demo accounts because none are seeded and demo behavior remains unapproved. |
| 297–332 | RLS, policies and grants for settings/accounts/scenarios/buyer-type config. | Retain unchanged. Verify exact RLS flags, expressions and role grants. |

**Dependencies and preservation:** Existing organizations, RFQs,
committee votes, audit events and `set_updated_at` are predecessors. Later
`00026`, `00033`, `00034`, and `00235` use demo tables/functions; this supports
retaining their schema while deferring demo rows and execution. `buyer_type_config`
is not merely demo data: the source vote trigger reads it and later test/board
paths reference it. Preserve all five records as repository-defined reference
data, without claiming their business weighting has separate approval.

**Validation required:** all five `is_demo` columns and indexes and
`demo_run_id` exist; demo settings schema has the source default but no
migration-created singleton until the environment decision is closed;
`demo_mode_enabled()` behavior and setting are checked without invoking demo
functions; exactly the source buyer-type rows exist; vote trigger replaces
client-supplied values from RFQ organization type; user triggers are enabled
after replay; RLS and grants match source. Proposed only.

**Unresolved:** explicit demo setting/environment identity remains a P0
decision. Buyer-type source values are repository-defined; no separate
business approval is inferred. Whether legacy votes exist is not established;
the backfill is therefore withheld only for the authorized blank disposable
boundary, not certified safe for a populated database.

### 00022 — `00022_identity_protection.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 18–42 | Runtime helper `private.short_code`. | Retain unchanged. |
| 44–54 | Schema/default changes: salted RFQ alias, public references, and buyer-anonymity default `true`. | Retain unchanged; the default is an identity-protection behavior, not a demo setting. |
| 56–90 | Runtime `assign_public_ref` trigger function. | Retain unchanged. |
| 92–97 | RFQ and requirement BEFORE INSERT triggers. | Retain unchanged. |
| 101–104 | Two derived backfills assigning public references to existing RFQs and requirements. | Withhold for a blank target. Do not suppress trigger/function definitions. |
| 106–161 | Unique indexes and per-RFQ anonymous bidder-label function. | Retain unchanged; preserve uniqueness and unlinkability across RFQs. |
| 164–212 | Supplier-blind RFQ view and grant. | Retain unchanged; preserve identity/address omission and access predicate. |
| 223–264 | Blind quote view and grant. | Retain unchanged; preserve blind status and buyer/committee authorization. |
| 273–295 | Blind evaluation view and grant. | Retain unchanged. |
| 301–318 | Authorized public-reference lookup function and grant. | Retain unchanged, including authorization checks. |

**Dependencies and preservation:** Requires earlier RFQ/requirement fields,
`extensions.gen_random_bytes`, profile/quote/invitation/supplier relations,
authorization helpers and compatible extension schema. Later migrations may
replace these views/functions; migration order and final definitions must be
verified, not inferred from this file alone.

**Validation required:** RFQs receive non-null salts and the default
`buyer_anonymous_to_suppliers=true`; triggers populate unique `RFQ-`/`REQ-`
references for synthetic rows; generated stream starts with no historical
rows for the withheld updates; bidder aliases are per-RFQ and unique;
security-barrier view definitions, projected columns, grants and lookup
authorization match source. Proposed only.

**Unresolved:** the clean-target precondition must be evidenced before
withholding historical updates. Extension and later-view replacement
postconditions remain part of the bootstrap/generated-stream checks.

### 00025 — `00025_demo_simulation.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 23–58 | Demo-only deterministic random helper functions. | Retain definitions to preserve the ordered schema chain; never invoke. |
| 62–80 | Demo price-anchor schema, constraint and unique index. | Retain; later demo functions/migrations depend on this object. |
| 84–107 | Anchor-validation function and trigger. | Retain unchanged. |
| 109–122 | RLS, policies and grants for demo price anchors. | Retain unchanged; demo-only access remains disabled by the unresolved environment gate. |
| 124–273 | Static price-anchor seed catalog. | Withhold: demo-only simulated pricing, not an authoritative procurement price catalog. Do not copy its values into fixtures. |
| 274–303 | Anchor-resolution function. | Retain definition; do not invoke. |
| 306–467 | Demo quote-generation function. Its runtime writes include quote, quote-version, invitation and audit mutations (404–438). | Retain definition/grant to satisfy later references, but never invoke; preserve the demo-mode, demo-RFQ and authorization guards. |
| 475–551 | Demo vote-generation function; runtime vote insert is inside the function body. | Retain definition/grant to satisfy later references, but never invoke. |

**Dependencies and preservation:** `00026`, `00034`, and `00235` call the
demo-generation functions from stored procedure bodies. Retaining those
definitions avoids silently breaking later demo definitions while demo
workflows remain explicitly deferred. `demo_mode_enabled()` from `00021`
must not be enabled by an unapproved setting. No scheduler or migration-time
simulator invocation is identified in this file.

**Validation required:** table/index/trigger/RLS/policies/grants and function
signatures match source; no anchor data is loaded; no generated migration
invokes either simulator; demo setting does not enable execution; later
function definitions resolve their referenced signatures. Proposed only.

**Unresolved:** the environment decision must keep demo execution outside
scope. No generated-stream replay or later function-resolution check has
occurred.

### 00027 — `00027_capability_capacity_source.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 18–25 | Schema column and comment for `capabilities.capacity_attribute_code`. | Retain unchanged. |
| 28–64 | Static capability-to-attribute reference mapping UPDATE. Source maps 23 capability codes: motor/pump capabilities to `motor_hp`; borewell capabilities to `depth_ft`; generator/transformer/UPS to `capacity_kva`; automation/gearbox to `capacity_kw`; solar to `system_kw`; water/sewage plant to `capacity_lph`; tank cleaning to `tank_capacity`; area services to `built_up_area` or `area`. | **Block pending an evidenced reference-data sequencing decision.** Do not treat a zero-row UPDATE as successful mapping. |
| 67–89 | Executable DO integrity check for existing non-null mappings pointing to unknown attribute codes. | Retain unchanged. It detects invalid references that exist, but does not detect absent capability rows or missing expected mappings. |
| 95–150 | Runtime unit normalizer. | Retain unchanged. |
| 152–163 | Runtime unit-comparison function. | Retain unchanged. |
| 165–225 | Runtime capacity-need function, including attribute, quantity/unit, and legacy HP fallbacks. | Retain unchanged; no migration-time invocation. |

**Dependencies and preservation:** Requires the `capabilities` catalog and
`category_attribute_definitions`; `private.requirement_capacity_need` is
consumed by earlier/later discovery ranking, including `00028` and later
discovery definitions. The current manifest excludes `00019` taxonomy data,
which provides early capability/attribute rows; the DO block does not fail
when no target capability rows exist. This is a concrete dependency, not a
reason to restore `00019` or alter its disposition here.

**Validation required:** before considering the mapping applied, verify all
23 source capability codes exist at the relevant point in the stream and
each `capacity_attribute_code` equals the source mapping; each referenced
attribute code resolves; unit normalization and capacity selection preserve
the source fallback order; the DO check raises on an invalid non-null target.
The expected mapping row count is 23, not merely a successful DO block.

**Unresolved:** no approved catalog fixture/order exists that ensures the
target rows are present before this UPDATE. Keep this statement BLOCKED until
that dependency is closed.

### 00032 — `00032_attachment_rfq_link.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 14–35 | Runtime security-definer RFQ attachment-link function and AFTER INSERT trigger on RFQs. | Retain unchanged; it links existing requirement attachments when an RFQ is created. |
| 38–43 | Derived backfill of requirement attachments already associated with RFQs. | Withhold for the verified blank disposable target. |
| 48–72 | Replacement security-barrier shared-attachment view, resolving RFQ through the requirement when needed, and authenticated SELECT grant. | Retain unchanged. |
| 83–109 | Security-definer path lookup and replacement SELECT policy on `storage.objects`. | Retain unchanged; preserve `bucket_id` restriction and delegated attachment authorization. |
| 111–153 | Replacement security-definer attachment authorization function. | Retain unchanged, including buyer organization, invited supplier, quote owner, committee and admin paths. |

**Dependencies and preservation:** Requires `00018` attachment schema and
Storage objects, RFQs/requirements, invitation/access helpers, and the same
Storage bootstrap. It fixes pre-publish attachment timing; it is not merely
historical cleanup. Preserve the trigger and the view fallback even if the
historical UPDATE is withheld.

**Validation required:** migration precondition proves no historical
attachment/RFQ rows are present when the backfill is withheld; trigger
definition is attached AFTER INSERT to RFQs; shared view uses the fallback
join and keeps its security barrier; the replacement Storage SELECT policy
is the only expected policy name and retains bucket and permission checks;
function security/search path and grants are preserved. Later synthetic
workflow checks should verify a requirement attachment linked before RFQ
creation becomes available only to the invited supplier and authorized buyer.
Proposed only.

**Unresolved:** exact Storage bootstrap is unverified. Attachment upload and
cross-party file-read behavior are optional Gate B coverage, but migration
DDL still depends on Storage catalogs.

### 00039 — `00039_role_based_access.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 45–89 | Authorization schema: `role_permission`, role catalog constraints/table. | Retain unchanged. |
| 91–149 | Two static role-catalog INSERTs: seven buyer roles and five supplier roles with labels, sides, descriptions, permission arrays and sort order. | Retain unchanged as required authorization/reference data; do not suppress as generic DML. |
| 152–177 | `profile_roles`, uniqueness/index, profile active-role FK. | Retain unchanged. |
| 179–335 | Active-role-held trigger and side/permission/demo-window/enforcement functions. | Retain unchanged, including role narrowing, structural membership checks and their source-defined exceptions. |
| 337–356 | Role-catalog function and public EXECUTE grant. | Retain unchanged. |
| 359–612 | Role context, self-assignment, switching and admin assignment RPCs with their grants. | Retain unchanged; preserve side checks, held-role checks and audit behavior. |
| 613–633 | RLS, select policies and service-role grants for role tables. | Retain unchanged. |
| 648–676 | Write-permission enforcement triggers for requirements, RFQs, quotes, committee votes, awards, POs and payments. | Retain unchanged; preserve event and permission arguments. |

**Dependencies and preservation:** Requires earlier `signup_side`,
profiles, organization/supplier membership, committee and audit structures,
and private helpers. `00056` later replaces `has_role_permission`;
`00257_canonical_role_catalog_and_signup_provisioning.sql` later upserts the
canonical 12-role catalog. The current evidence identifies
`PROPERTY_OWNER` as READ-only in that canonical catalog; role catalog
population is not optional for signup/authorization.

**Validation required:** exact 12 role codes, sides and permission arrays
after the canonical role upsert; `READ` constraint; unique profile-role
pairing and active-role-held trigger; exact RLS/policies/grants; each listed
write trigger and its required permission; source function security mode,
owner and search path. Confirm no real-person profile-role assignments are
created by this migration. Proposed only.

**Unresolved:** effective permission results also depend on `00056` and later
catalog updates. Verify the approved buyer/supplier role contract rather
than inferring it from the table seed alone.

### 00056 — `00056_grant_all_permissions_to_buyer_leads.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 2–4 | Authorization data UPDATE widening permissions for three buyer-role codes, including `PROPERTY_OWNER`. | Withhold only if the generated stream proves the later `00257` canonical upsert is included and restores all three exact role arrays; otherwise BLOCK. |
| 7–36 | Persistent security-definer `private.has_role_permission` replacement. It allows service/no-profile and platform-admin callers, grants all permissions to organization members with role `OWNER`, otherwise checks active-role permissions. | Retain unchanged pending explicit authorization semantics. Do not remove the owner branch as a shortcut. |

**Dependencies and preservation:** `user_roles`, `role_permission`,
`organization_members`, active-role helper and platform-admin helper come
from earlier migrations. The later `00257` source upserts all 12 role rows,
including `PROPERTY_OWNER` with `[READ]`; however, its manifest disposition
is TRANSFORM with generic treatment, so inclusion of that canonical upsert
must be evidenced in the eventual statement map before withholding this
UPDATE.

**Validation required:** post-00257 role arrays for `PROCUREMENT_LEAD`,
`FACILITY_MANAGER`, and `PROPERTY_OWNER` equal the canonical source values;
`has_role_permission` matches this source definition and preserves its owner
branch; table-write triggers still enforce the function result; effective
Individual buyer behavior is tested against approved organization-role and
active-role semantics. Proposed only.

**Unresolved:** product/security approval is needed on whether organization
`OWNER` membership intentionally overrides a read-only active job role.
Source review establishes what the function does, not whether that effective
permission combination is approved.

### 00065 — `00065_supplier_gst_verification.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 5–15 | Supplier schema columns/defaults and partial GSTIN index. | Retain unchanged. |
| 18–70 | `verify_supplier_gstin` security-definer RPC; runtime supplier UPDATE and audit INSERT are inside the function body. | Retain function behavior/signature unchanged and do not invoke during replay. |
| 72 | EXECUTE grant to authenticated and service role. | Retain unchanged; compare exact ACL. |
| 75–76 | Drops prior quote views with CASCADE. | Retain only with dependency diff showing the expected dependent objects; fail if unexpected dependencies would be removed. |
| 79–164 | Replacement blind and revealed security-barrier quote views and SELECT grants. | Retain unchanged; blind projection must not disclose GSTIN/PAN/legal identity; revealed view remains gated by reveal state and buyer authorization. |
| 167–182 | Migration-time UPDATE synthesizes GSTIN/PAN/legal names from supplier rows and marks rows verified/platform-verified. | Withhold. It is seeded-supplier backfill behavior, not proof of actual verification, and must not be applied to arbitrary or synthetic test suppliers. |

**Dependencies and preservation:** Requires supplier, quotes,
invitations, RFQs, quote-version and audit structures plus `authenticated`,
`service_role`, `anon`, and helper functions. The `CASCADE` operations create
a dependency-sensitive replacement boundary.

**Validation required:** exact columns/defaults/index predicate; RPC
signature, security-definer metadata, search path, owner and grants; dependency
inventory before and after each CASCADE matches the approved view replacement
set; blind/revealed view definitions and grants match source; no migration-time
supplier GST update occurs; no supplier row is treated as verified because
of this withheld seed backfill. Proposed only.

**Unresolved:** prove the expected view dependency set in the generated
catalog. The runtime RPC's source behavior is retained but its invocation
and business verification accuracy are outside this batch's migration replay.

### 00111 — `00111_standardize_verified_domain_suppliers_and_logins.sql`

| Source lines | Classification | Proposed treatment (UNAPPROVED) |
|---|---|---|
| 6–25 | Transaction and temporary staging table for seeded suppliers/accounts. | Withhold with the associated seed-data block; temporary staging is not needed for schema construction. |
| 27–364 | Static demo/test supplier and account source records, including contact data and authentication material. | Withhold entirely. No record values, account credentials, or personal details are reproduced here. |
| 366–385 | Migration-time supplier INSERT/UPSERT of demo supplier catalog and verification flags. | Withhold. Do not seed supplier/customer/business records. |
| 387–404 | Migration-time Auth user INSERT/UPSERT, including source-provided credential material. | Withhold entirely; do not reproduce or use credentials. |
| 406–415 | Auth identity INSERT. | Withhold entirely. |
| 417–423 | Profile INSERT/UPSERT. | Withhold entirely. |
| 425–432 | Supplier-user ownership/link INSERT. | Withhold entirely; no real or demo user assignment. |
| 434–578 | Runtime `discover_and_invite_for_rfq` replacement. It selects by hard-coded demo email patterns, falls back to arbitrary active suppliers, writes invitations at 510/538, changes RFQ/requirement lifecycle at 550/556, and may call pilot quote submission. These writes are in a stored function body, not migration-time calls. The function is SECURITY DEFINER and has no explicit `SET search_path` clause in this source. | **Block this function replacement** until the effective discovery implementation is resolved. Do not invoke it. Do not treat the embedded statements as migration-time DML or silently use it as canonical buyer-to-supplier discovery. |
| 579 | Transaction commit. | Preserve source transaction boundary if and when an approved generated-copy mapping is created. |

**Dependencies and preservation:** The seed block depends on compatible
`auth.users`, `auth.identities`, extension password helpers, profiles,
suppliers, supplier users and their constraints; those are not a reason to
load the records. Later source `00120` drops/replaces this UUID discovery
overload, and subsequent migrations replace discovery behavior again.
However, `00120` is currently **BLOCKED** in the disposition manifest, so
the stream cannot assume that the intended replacement is applied. The
migration also hard-codes supplier selection behavior tied to its withheld
seed identities; without the seed, that first pass cannot implement its
declared domain selection.

**Validation required:** no temporary table or seed-derived supplier,
Auth, identity, profile, or supplier-user rows are created; no discovery
function is invoked during replay; effective final discovery function
signature/body/grants/security metadata are source-mapped to an approved
later migration; supplier discovery uses the approved taxonomy/capability
contract, not the withheld hard-coded seed identity list; no invitation,
RFQ lifecycle or pilot quote writes occur during schema replay. Proposed
only.

**Unresolved:** final discovery definition and security properties cannot
be determined while `00120` and later replacement migrations remain
unresolved in the stream. This blocks Gate B supplier-discovery validation;
it does not by itself establish that the migration's schema DDL is needed.

## Closure assessment

### Entries with source-specific proposed evidence

This report now identifies statement groups, source locations, categories,
proposed actions, dependencies and measurable postconditions for all ten
entries. That improves their **migration-specific design evidence** but
does not approve treatments or close Gate A1–A4.

At statement level:

- The structural/security treatment is relatively determinate for
  `00022`, `00025`, `00032`, and `00065`, subject to their stated clean-target,
  dependency and bootstrap checks.
- `00018` has a specific privacy-preserving treatment, but cannot replay
  until the Supabase Storage bootstrap is verified.
- `00021` remains blocked at the singleton demo setting; the source insert
  would enable demo mode by default.
- `00027` remains blocked at its reference update until the 23 target
  capability rows and required attributes are available at the correct
  stream point.
- `00039` role data must be retained. Final effective authorization requires
  the later role upsert and exact 00056 function behavior.
- `00056`'s data update is conditionally withholdable only after the
  canonical `00257` upsert is present in the generated statement map. Its
  owner bypass remains a product/security decision.
- `00111` seed data can be specifically withheld, but its discovery-function
  replacement remains blocked because its later canonical replacement is
  not established as included.

### Exact validation work still required

1. Incorporate each source file hash and each statement action into the
   future one-to-one statement mapping; no current dispositions change.
2. Verify the exact Storage/Auth/bootstrap objects and role semantics needed
   by `00018`, `00032`, `00039`, `00065`, and `00111`.
3. Decide the explicit demo setting before treating `00021`'s singleton.
4. Provide an approved taxonomy/reference-data ordering so `00027` updates
   exactly 23 rows and validates the expected mapping, rather than passing
   with zero matches.
5. Confirm `00257` canonical role upsert treatment; validate final role
   arrays and approve the effective `OWNER` bypass behavior from `00056`.
6. Resolve the effective discovery-function replacement chain before
   treating `00111` as complete for supplier discovery.
7. After separate execution authorization, compare generated catalog
   postconditions, policies, grants, ownership, trigger states and absence
   of migration-time external effects. No such checks have been executed.

### Minimum reconstruction boundary impact

This batch **does not change** the previously proposed minimum boundary, but
sharpens two dependencies:

- **Gate A:** full replay of `00018` and `00032` requires a verified
  Supabase Storage catalog/bootstrap even if attachment workflows are
  excluded from Gate B.
- **Gate B:** authorization requires the buyer/supplier role catalog;
  supplier discovery requires a resolved effective function chain and
  capability/taxonomy data. `00027` cannot prove its capacity behavior
  without its reference rows.

Demo identities, simulated prices, simulated quotes/votes, seeded suppliers
and GST backfills remain outside the minimum boundary. Their definitions
may remain in the ordered stream when downstream definitions depend on
them, but they must not be populated or invoked without separate
authorization.

## Recommendation

**NO-GO for replay; proposed evidence only.** All ten files now have
source-specific proposed treatment records, but unresolved bootstrap,
environment, taxonomy-ordering, authorization, and discovery-chain decisions
remain. The original manifest dispositions and counts are unchanged.

No source migration or prior evidence document was edited. No SQL, fixture,
database, Docker resource, test, build, network/hosted access, commit, or
deployment was used. Existing worktree changes were preserved.
