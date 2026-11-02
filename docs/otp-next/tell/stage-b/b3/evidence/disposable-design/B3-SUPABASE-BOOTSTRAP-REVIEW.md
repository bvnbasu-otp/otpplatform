# Supabase Bootstrap Review

## Scope and verdict

This is repository and local-image metadata evidence only. No container was
created or started, no database was queried, and no extension was installed.
The available evidence does **not** establish a complete, exact, executable
Supabase bootstrap contract for the 331-migration chain. Bootstrap remains a
replay blocker.

## Verified from repository

| Area | Verified evidence | What it establishes |
|---|---|---|
| PostgreSQL version | `supabase/config.toml` sets `db.major_version = 15`. | Repository intends PostgreSQL major 15; it does not prove a specific image can replay the chain. |
| Migration order | Numeric migration files currently run from `00001` through `00331`, with 331 files. | Source order is established; object-level dependencies are not. |
| API roles | `anon`, `authenticated`, and `service_role` are granted privileges, e.g. `00003_auth_helpers.sql:6` and `00005_blind_views.sql:130`. | These role names are required by the SQL. The migrations do not create the roles or establish their attributes/memberships. |
| Additional principal | `postgres` is used by default-privilege statements in `00194_supabase_data_api_table_grants_and_default_privileges.sql:58-67` and grants in `00152_immutable_platform_admin_role.sql:88`. | The chain expects this principal to exist in the migration environment. |
| Application schemas | `private` is created and revoked from `PUBLIC` in `00002_core_tables.sql:397-398`; `private_security` is created in `00152_immutable_platform_admin_role.sql:11`. | These two application schemas are explicitly managed by migrations. `public` is also used throughout. |
| Extensions | `pgcrypto` is declared in `00001_enums.sql:3` and `00002_core_tables.sql:3`; `pg_cron` is attempted in `00041_phase_engine.sql:607-614` and `00177_phase6_group1_database_hardening.sql:125-132`; `pg_net` is declared in `00109_real_outbound_supplier_notifications.sql:16` and `00112_attachment_metadata_protection.sql:12`. | These are chain dependencies or optional guarded dependencies; installed/available versions are not established. |
| Auth dependencies | References include `auth.users` (`00002_core_tables.sql:19`), `auth.identities` (e.g. `00078_seed_solar_cctv_furniture_water_filter_suppliers.sql:291`), `auth.sessions` and `auth.refresh_tokens` (`00264_remediate_privileged_lifecycle_and_audit_contracts.sql:79,82`), and `auth.uid()`, `auth.role()`, `auth.jwt()` (`00003_auth_helpers.sql:19`, `00070_super_admin_ops_console.sql:27`, `00161_fix_admin_review_signup_request_robustness.sql:58`). | These names are referenced; they do not prove a given bootstrap provides compatible definitions or semantics. |
| Storage dependencies | `storage.buckets` is written in `00018_attachments.sql:28`; `storage.objects` is referenced by policies in `00018_attachments.sql:428-456` and `00032_attachment_rfq_link.sql:102-108`. | Storage catalog relations are required for those statements. A running Storage API is not proven necessary for catalog creation. |
| Private helpers | `00003_auth_helpers.sql` creates helpers such as `private.get_profile_id()` and grants helper execution to API roles at lines 192-204. | Helpers are application migration objects, not a substitute for Supabase Auth semantics. Their transitive dependencies still need resolution. |
| Default privileges | `00194_supabase_data_api_table_grants_and_default_privileges.sql:45-70` applies public-schema default grants and conditionally applies `postgres` defaults if that role exists. | Grant targets and some conditions are visible; effective privileges, role attributes, memberships, and Supabase platform defaults remain unverified. |
| Seed configuration | `supabase/config.toml` sets PostgreSQL 15 and lists local demo seed files under `[db.seed]`. | Those configured seed paths are not part of a schema-only replay and must not be used. |

### Exact external namespace references found

The read-only migration text scan found these qualified names:

- `auth.identities`, `auth.jwt`, `auth.refresh_tokens`, `auth.role`,
  `auth.sessions`, `auth.uid`, `auth.users`.
- `storage.buckets`, `storage.objects`. No qualified `storage.*` path-helper
  function name was found in the migration SQL scan.
- `extensions.crypt`, `extensions.digest`, `extensions.gen_random_bytes`,
  `extensions.gen_salt`.
- `net.http_post`; `cron.job`, `cron.schedule`, `cron.unschedule`.

The scan found no `CREATE ROLE` statement and no `CREATE SCHEMA auth` or
`CREATE SCHEMA storage` statement in the migration chain. The migrations
therefore depend on these roles/namespaces being supplied externally by the
bootstrap. The scan does not prove that the names above form a complete
transitive dependency closure; dynamic SQL and dependencies reached through
function bodies remain open.

## Verified local image metadata

Read-only local Docker image metadata reports:

- `supabase/postgres:15.1.1.78`, image ID
  `sha256:881ac26a02870c6784d9fbec67a6a9c5026905216bbd7dfbfa289ecc48073387`,
  Linux/amd64, created 2024-07-15.
- `public.ecr.aws/supabase/postgres:17.6.1.166` is also cached, but is the
  wrong PostgreSQL major version for the repository configuration.

The PostgreSQL 15 image's cached identity is not proof of package contents,
Supabase service compatibility, role creation, Auth/Storage catalog version,
extension availability, bootstrap command, or safe operation. Local image
metadata does not expose a trustworthy complete initialization contract.

## Critical unresolved bootstrap dependencies

1. **Supabase principals and access semantics:** the chain grants to
   `anon`, `authenticated`, and `service_role`, and uses `postgres` for
   default privileges. No migration creates these roles. Exact attributes,
   membership, ownership, and RLS-bypass behavior must match the approved
   PG15 Supabase bootstrap; role names alone are insufficient.
2. **Auth and Storage catalog contract:** no migration creates `auth` or
   `storage`. The bootstrap must supply compatible `auth.users`,
   `auth.identities`, `auth.sessions`, `auth.refresh_tokens`,
   `auth.uid()`, `auth.role()`, `auth.jwt()`, `storage.buckets`, and
   `storage.objects` definitions. Do not substitute permissive Auth/RLS
   stubs.
3. **Extension availability and scheduler suppression:** `pgcrypto` is
   required by early schema definitions; `pg_cron` is attempted and schedules
   work in `00041:607-624` and `00177:125-134`; `00274:236-275` can schedule
   retry work. `pg_net` supports the deferred `net.http_post` function calls
   described below. Exact PG15 image extension versions, preload settings,
   and a safe way to prevent active schedules remain unverified.
4. **Security-definer, RLS, and ownership DDL:** catalog-driven changes in
   `00177:385-414`, `00178:478-496`, `00199:831-865`, `00212:130-175`,
   `00281:31-44`, and `00282:547-580` depend on the exact ordered schema
   and catalog contents. Their final function grants, RLS/search paths,
   ownership constraints, and buyer-scope policies must not be silently
   omitted or replaced with permissive behavior.

These are the critical unresolved items for reconstruction. Other
application-level settings matter only where a retained migration executes
them; no secret setting should be supplied for schema-only work.

## Deferred external calls

`net.http_post` is defined in functions/triggers, including
`00109:48-49`, `00112:39-42`, `00110:302-303`, `00266:207-208`,
`00271:99`, and `00272:124`. These are potential runtime network effects,
not evidence that requests run merely by creating the function. The critical
risk is enabling cron or invoking migration-time DML/functions in a way that
dispatches them. Do not configure endpoint/service credentials or schedule
jobs in a sanitized schema reconstruction.

## Decision

The current image cache and repository evidence establish an intended
PostgreSQL 15/Supabase context but **do not establish an exact bootstrap that
can safely run the chain**. Do not create a disposable database based on
this evidence alone. Before a separate authorization request, approve a
versioned, fail-closed bootstrap contract and generated-stream treatment
that suppresses schedules while preserving function, trigger, grant, and
policy definitions.

## Phase 0D addendum — proposed disposable bootstrap contract

**Assessment date:** 2026-11-01  
**Disposition:** **BLOCKED** for reconstruction. This section defines the
contract a future disposable replay must satisfy; it does not certify that an
available image or bootstrap implements it.

### Required contract

| Component | Proposed requirement | Evidence status |
|---|---|---|
| Database engine | PostgreSQL major version 15. Pin an exact Supabase PostgreSQL image/build by immutable digest before replay; `supabase/config.toml` establishes only `db.major_version = 15`. | Major version verified from repository; exact build/digest and contents not verified. |
| Migration principal | A dedicated disposable migration principal with authority to create the required extensions and schemas, alter the migration-owned objects, perform the source's `ALTER ... OWNER` operations, and set default privileges for `postgres`. No application login or reusable hosted credentials. | Required operations verified in migrations; exact bootstrap role and privileges not verified. |
| API roles | `anon`, `authenticated`, and `service_role` must exist before migrations. Proposed security invariants: `anon`/`authenticated` cannot bypass RLS; `service_role` is not directly exposed as a login and its bypass capability is confined to the isolated disposable environment. `00194` grants to all three. | Role names/grant targets verified. Attributes, memberships, and exact Supabase semantics are not established by repository evidence. |
| API authenticator | If the disposable stack includes PostgREST, provide its platform authenticator principal and only the memberships/role-switching required for the API roles. It is not a migration target in the reviewed SQL. | Full API principal contract not verified and not needed for a database-only schema replay. |
| Application schemas | `public`, `private`, and `private_security`; migrations create/manage the latter two. Provide `extensions` for `pgcrypto`. | Verified from migration definitions. |
| Supabase schemas and objects | Bootstrap compatible `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.uid()`, `auth.role()`, `auth.jwt()`, `storage.buckets`, and `storage.objects` before dependent migrations. Preserve their platform semantics; do not substitute permissive stubs. No Auth/Storage service or seed data is required for catalog replay. | Names and usages verified from source; exact DDL, versions, helper behavior, and grants are not verified. |
| Extensions | `pgcrypto` is required (`00001:3`). `pg_net` is required by function definitions using `net.http_post` (`00109:16,48`; `00112:12,39`). Do not install `pg_cron` in the sanitized stream: remove the three migration-time scheduler blocks described in the stream specification. | Extension names and source references verified. Availability, version, schema placement, and execution compatibility in a pinned PG15 image are not verified. |
| Scheduler and outbound access | No cron jobs; no endpoint/service-key settings; no network egress from the disposable database. Preserve `pg_net`-backed function/trigger definitions but do not invoke them. | Source shows scheduled SQL and deferred HTTP functions. Enforcement by a future disposable runtime is not verified. |
| Grants/default privileges | Preserve source grants and `00194` default privileges after all required roles exist. Require `postgres` to exist; transform the conditional `00194` branch into a fail-closed assertion rather than silently skipping the role-specific defaults. Do not replace source grants with broader bootstrap grants. | Grant statements verified; actual effective grants and principal membership remain unverified. |
| Seeds and settings | Disable all configured `[db.seed]` paths. Do not provide production-like secrets, Supabase URL/service-role settings, SMTP credentials, JWT signing material, or customer/supplier records. | Seed paths and settings references verified in repository; runtime configuration is not inspected. |

### Security and catalog transformation requirements

1. Retain the security, ownership, policy, and grant definitions from
   `00177`, `00178`, `00199`, `00212`, and `00281`–`00283`; do not remove a
   block merely because it uses catalog-driven SQL.
2. Replace exception handlers that only emit `NOTICE` in the RLS/search-path
   loops (`00177:385-435`, `00178:478-496`) with fail-closed errors. Add
   explicit postconditions: every in-scope security-definer routine has the
   intended fixed search path, and every in-scope public base table has RLS
   enabled with the source-prescribed `NO FORCE` state. A failed alteration
   must abort replay.
3. Preserve the target selection and privilege expressions in `00199`.
   Assert that the expected routine identities and RFQ column set exist;
   preserve column-level SELECT exclusions and grants exactly. Never replace
   a failed lookup with a table-wide grant.
4. Preserve `00281`/`00282` ownership checks, owner/profile constraints,
   helper functions, and additive buyer-scope policies. For the catalog
   rewrites in `00282` and `00283`, compare before/after policy expressions,
   require every intended rewrite to match, and abort on unmatched legacy
   expressions or unexpected policy targets.
5. In `00212`, preserve captured view definitions, options, owners, and ACLs.
   The recreation must fail if an owner/grantee is absent or if the recreated
   view differs; do not silently substitute the migration principal or drop
   an ACL. Keep data backfills individually classified by the DML register.
6. Require the exact `postgres`, API-role, view-owner, and ACL grantee roles
   before replay. Do not create same-named substitute roles with guessed
   attributes.

These are transformation requirements, not completed generated SQL. The
exact role contract, Supabase Auth/Storage bootstrap, extension build, and
resulting security catalog remain unresolved. No database or image was
inspected during Phase 0D; the previously recorded local image metadata is
not sufficient to close these items.

## Phase 0E addendum — locally cached image evidence and catalog gates

**Inspection method:** read-only `docker image ls` and `docker image inspect`
metadata for already-cached images only. No container was inspected, started,
stopped, or created. No database connection or SQL was used.

### Concrete local image metadata

| Component | Cached tag | Immutable image/repository digest | Created / platform | What this verifies |
|---|---|---|---|---|
| Supabase PostgreSQL | `supabase/postgres:15.1.1.78` | `sha256:881ac26a02870c6784d9fbec67a6a9c5026905216bbd7dfbfa289ecc48073387` | 2024-07-15; linux/amd64 | A PG15-tagged Supabase image exists locally. This is a candidate identity, not proof of package contents or replay compatibility. |
| Supabase PostgreSQL | `public.ecr.aws/supabase/postgres:17.6.1.166` | `sha256:b3bfedb107413abb3b8cb0d0874b0414a1dceb3d55bc0c778de6ad22d1f7dc86` | 2026-08-25; linux/amd64 | Cached image is major 17 by tag and does not satisfy the repository's PG15 setting. |
| Supabase Auth (GoTrue) | `public.ecr.aws/supabase/gotrue:v2.197.0` | `sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b` | 2026-09-09; linux/amd64 | Tag/digest metadata only; no Auth SQL schema or compatibility verified. |
| Supabase Auth (GoTrue) | `supabase/gotrue:v2.158.1` | `sha256:202c16530f2f29c886de963ab18b369074c49655480a463ce881169019f2bda7` | Cached tag/digest metadata only; no Auth SQL schema or compatibility verified. |
| Supabase Storage API | `public.ecr.aws/supabase/storage-api:v1.80.2` | `sha256:95b217a9c59e0ac06c6dcb539df3189a1668a2445fb43dbf29660d6968ffd7d2` | 2026-10-08; linux/amd64 | Tag/digest metadata only; no Storage SQL schema or compatibility verified. |
| Supabase Storage API | `public.ecr.aws/supabase/storage-api:v1.77.5` | `sha256:4ae1890ba0c6fd24d975c34f3aa201a01d410171c8ba6eddeb675ef92341a62d` | Cached tag/digest metadata only; no Storage SQL schema or compatibility verified. |
| Supabase PostgREST | `public.ecr.aws/supabase/postgrest:v14.5` | `sha256:b574528fe109c8343c1247155734d03df8c34b462f342dca0ccc20244fc36ef9` | 2025-07-10; linux/amd64 | Tag/digest metadata only; no database authenticator or role-switching behavior verified. |
| PostgREST | `postgrest/postgrest:v12.0.1` | `sha256:1201a178615539c57d9d0458b1ca516b1e031abbb6baf9c2959557d99625cdd0` | Cached tag/digest metadata only; no authenticator compatibility verified. |

`supabase/config.toml` pins only PostgreSQL major version `15`, not a patch
image. Cached tags do not establish which exact image is intended for the
disposable replay. Image labels and digests do not expose catalog contents,
extension package versions, entrypoint-created roles, bootstrap SQL, or
service compatibility. Therefore **the exact PG15/Supabase bootstrap is
still NOT VERIFIED**. The cached v17 image must not be used for a PG15 replay.

### Source-established object contract (still not runtime-verified)

The migration text establishes names and required operations, not the
platform's object definitions:

- Roles referenced by source: `anon`, `authenticated`, `service_role`, and
  `postgres`; role grants/membership and attributes are not created by this
  migration chain. `00194` sets defaults for the migration role and
  conditionally `postgres`; `00152:88` also references `postgres`.
- Application schemas: `private` (`00002:397`) and `private_security`
  (`00152:11`); `public` is used throughout. An `extensions` namespace is
  required for the declared extension resolution/search paths. Supabase
  namespaces `auth` and `storage` are assumed to be bootstrap-provided, not
  created by this migration chain.
- Auth relations/functions referenced: `auth.users`, `auth.identities`,
  `auth.sessions`, `auth.refresh_tokens`, `auth.uid()`, `auth.role()`, and
  `auth.jwt()`. Required runtime semantics and exact grants are not proven by
  image metadata.
- Storage relations referenced: `storage.buckets`, `storage.objects`.
  `00018` writes bucket configuration, so its data insert must remain omitted
  or be separately approved; schema-only replay needs compatible catalogs,
  not customer files or a running Storage API.
- Extensions: `pgcrypto` (00001/00002) and `pg_net` (00109/00112) are source
  dependencies. No cached image metadata verifies their installed versions
  or schema placement. `pg_cron` is not a bootstrap requirement for this
  sanitized stream because all three migration-time scheduler blocks are
  removed.
- Source grants/default privileges: preserve `00194` grants and defaults
  exactly after source role requirements are met. Do not emulate these by
  granting broader bootstrap access.

### Required catalog postconditions for transformed security/ownership DDL

These are explicit checks for a future generated replay; current values cannot
be asserted without a disposable catalog. Verify by stable object identity
and semantic expressions, not by success notices or aggregate counts alone.

| Migration(s) | Required postcondition |
|---|---|
| `00177` | For every `SECURITY DEFINER` routine in `public`/`private` selected by the source loop, `proconfig` contains the exact source `search_path` (`public, private, auth, extensions`). No selected routine is skipped. For every public base table selected, `relrowsecurity=true` and `relforcerowsecurity=false`. Any failed alteration aborts. |
| `00178` | Every public base table in its source selection has RLS enabled and is not forced; target set agrees with 00177 at that point in the ordered stream. Any failed alteration aborts. |
| `00199` | Source-target routine identities have the intended effective EXECUTE ACLs (no unintended PUBLIC/anon/authenticated access where revoked; required grants remain). `authenticated` SELECT on `rfqs` excludes both address snapshot columns while preserving the exact source-derived remaining column list. No table-wide SELECT fallback. |
| `00212` | Recreated `quotes_identity_protected` and `quotes_blind` match the captured pre-change view definition, options, owner, and ACL. Required owners/grantees must exist; any missing role or mismatch aborts. Separately validate the intended type/constraint state and classify its row backfills. |
| `00281` | `requirements`, `rfqs`, and `purchase_orders` have `owner_profile_id` references to `profiles`; `organization_id` is nullable; each `*_single_owner` check enforces exactly one non-null owner; partial owner indexes exist; source personal policies and immutable-ownership triggers are present with source predicates. |
| `00282`/`00283` | Every source-intended policy rewrite has the exact owner-aware expression in both `USING`/`WITH CHECK` where applicable. Expected match counts are recorded; no legacy target expression remains in scope; no unrelated policy changes occur. |
| `00194` | Effective schema/table/sequence/routine grants and `pg_default_acl` entries equal the source intent for the exact owner/role set, including `postgres`. Missing required roles abort rather than skip. Notification removal does not change grants. |

The role attribute contract itself must be resolved from an approved,
versioned Supabase bootstrap artifact before these checks can be evaluated.
Do not guess `rolsuper`, `rolbypassrls`, `rolcanlogin`, or memberships from
role names or image tags.

## Phase 0E disposition

The image investigation improves version evidence but does not close
bootstrap compatibility. `00020` and `00194` now have precise
**TRANSFORM** classifications in the manifest; they remain subject to the
bootstrap and generated-stream gates above. The remaining 242
**BLOCKED** migrations have not been proven safe to promote. Phase 0E remains
**BLOCKED** pending an exact bootstrap contract, full migration-time
side-effect/call-graph closure, and later generated-stream catalog
postconditions. No database, SQL, migration, test, build, or hosted resource
was accessed.
