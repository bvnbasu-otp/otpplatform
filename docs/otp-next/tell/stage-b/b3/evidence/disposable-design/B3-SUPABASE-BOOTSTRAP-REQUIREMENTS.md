# PostgreSQL 15 / Supabase Bootstrap Requirements

## Scope

This is a static design inventory for reconstructing the repository migration
chain, not evidence that any container or database was created or that a
migration executes successfully. No database was started or queried for this
phase.

## Verified repository requirements

| Requirement | Evidence | Classification |
|---|---|---|
| PostgreSQL major version 15 | `supabase/config.toml` sets `db.major_version = 15`. | Repository configuration fact. |
| Supabase database image | Existing local image cache includes `supabase/postgres:15.1.1.78` (image digest `sha256:881ac26a02870c6784d9fbec67a6a9c5026905216bbd7dfbfa289ecc48073387`). | Cached image identity only; not verified compatible with all 331 migrations or selected as an execution target. |
| `pgcrypto` | Declared in `00001_enums.sql` and `00002_core_tables.sql`. | Explicit migration dependency; exact installed version/schema resolution must be checked in a disposable run. |
| `pg_cron` | Guarded extension setup in `00041_phase_engine.sql` and `00177_phase6_group1_database_hardening.sql`; `00274_location_pin_coverage_durable_recovery.sql` references it. | Explicit but guarded/optional in some code paths; server preload/scheduler behavior is image/config dependent. Do not assume extension can be installed from SQL alone. |
| `pg_net` | Declared/used for outbound Edge Function calls in `00109_real_outbound_supplier_notifications.sql` and `00112_attachment_metadata_protection.sql`; also referenced in `00274_location_pin_coverage_durable_recovery.sql`. | Explicit optional/operational dependency; migration definitions must be preserved while network dispatch is not executed. |
| Supabase Auth relations | `auth.users` is referenced by core FKs and seed/account migrations; `auth.identities` appears in account migrations; `auth.uid()` is used by auth/RLS helper functions. | Supabase-managed object dependency. The minimum synthetic Auth schema/functions need a reviewed bootstrap, not ad hoc fake behavior. |
| Supabase Storage relations | `00018_attachments.sql` uses `storage.buckets`; its later policies reference `storage.objects` and storage path helper(s). | Supabase-managed object dependency for storage-related migration definitions. No storage service is needed for schema catalog inspection if bootstrap is faithful. |
| Supabase roles | Migration grants/policies reference `anon`, `authenticated`, and `service_role`. | Required role names; exact role attributes and memberships should match the pinned Supabase Postgres version. |
| `private` schema | Created/referenced by `00002_core_tables.sql`, `00003_auth_helpers.sql`, and many `SECURITY DEFINER` functions. | Explicit schema dependency. |
| `extensions` schema | Extension declarations and function search paths use it. | Explicit schema dependency; ensure `pgcrypto` and other extensions resolve where expected. |
| Additional schemas | `private_security` is introduced for privileged allow-listing; `auth` and `storage` are Supabase namespaces. | Explicit application/Supabase namespace dependencies. |
| Supabase migration ordering | Repository contains 331 numeric files `00001` through `00331`, no numeric gaps or duplicate prefixes, sorted in increasing order. | Repository inventory fact. |
| Outbound-service support | `pg_net`-backed functions may call Edge Functions; location coverage includes queued retry/dispatch paths. | External URL/secret/network availability is not required for schema-only creation and must remain disabled. |

## Roles and schemas to bootstrap

### Explicitly referenced

- Roles: `anon`, `authenticated`, `service_role`.
- Schemas: `public`, `private`, `private_security`, `extensions`, `auth`,
  `storage`.
- Auth relations/functions: `auth.users`, `auth.identities`, `auth.uid()`;
  scan all retained definitions for additional `auth.*` functions before
  execution.
- Storage relations/helpers: `storage.buckets`, `storage.objects`, and
  storage path helper references used by policies.

The bounded migration review also found `auth.sessions` and
`auth.refresh_tokens` references in
`00264_remediate_privileged_lifecycle_and_audit_contracts.sql:79,82`, plus
`auth.jwt()` and `auth.role()` calls in
`00070_super_admin_ops_console.sql:27` and
`00161_fix_admin_review_signup_request_robustness.sql:58`. These are
repository references, not proof that the corresponding Auth objects or
functions exist in a particular runtime snapshot. `00078` also references
`auth.identities` at line 291.

Role evidence includes grants to `anon`, `authenticated`, and `service_role`
in `00005_blind_views.sql:130` and `00003_auth_helpers.sql:6`. The migrations
do not create these roles; `postgres` is referenced by default privileges in
`00194_supabase_data_api_table_grants_and_default_privileges.sql:58-67` and
by grants in `00152_immutable_platform_admin_role.sql:88`. `PUBLIC` is
revoked from private-schema access in `00002_core_tables.sql:398`.
`private` and `private_security` are explicitly created by `00002_core_tables.sql:397`
and `00152_immutable_platform_admin_role.sql:11`, respectively.

Storage setup writes to `storage.buckets` in
`00018_attachments.sql:28`; storage policies reference `storage.objects` in
`00018_attachments.sql:428-456` and `00032_attachment_rfq_link.sql:102-108`.
This does not establish that a Storage service is needed to create or inspect
the application schema.

### Outbound and scheduled behavior evidence

Migration-defined functions use `net.http_post` for attachment processing
(`00112_attachment_metadata_protection.sql:39-42`) and outbound notifications
(`00109_real_outbound_supplier_notifications.sql:48-49`,
`00110_supplier_network_stub_toggle.sql:302-303`, and
`00266_remediate_supplier_coverage_and_dispatch.sql:207-208`). These
definitions show possible runtime network behavior; the cited lines do not
show that the HTTP requests ran during migration application. Optional
`pg_cron` setup/scheduling appears in `00041_phase_engine.sql:609-614`.
Outbound dispatch and scheduled jobs must be suppressed in any separately
authorized reconstruction.

Migration SQL also reads deployment/session settings, including
`app.settings.supabase_url` and `app.settings.service_role_key` in
`00112_attachment_metadata_protection.sql:26-27`, and request claims in
`00041_phase_engine.sql:203-204`. No values are included here. Such references
do not establish that those settings must be populated for schema-only DDL;
their exact execution-time requirements remain to be reviewed statement by
statement.

### Image/bootstrap-specific, not yet proven

The previous direct disposable attempt with the PostgreSQL 17 Supabase image
started its wrapper but terminated when the wrapper attempted to connect as
`supabase_admin`, a role absent from the attempted bootstrap. This shows that
the image entrypoint has a bootstrap contract beyond vanilla PostgreSQL; it
does **not** establish the correct PostgreSQL 15 startup variables or role
setup. The next design must inspect the pinned PostgreSQL 15 image's documented
entrypoint/init contract offline or use a reviewed Supabase bootstrap SQL
script. Do not guess role passwords, JWT values, or production secrets.

The image may require an administrative role such as `supabase_admin` and
Supabase JWT/session settings. Those exact requirements are **NOT VERIFIED**
for the cached PostgreSQL 15 image in this phase.

## Functions referenced by application SQL

At minimum, bootstrap must faithfully provide Supabase Auth semantics needed
by retained SQL:

- `auth.uid()` for policy/helper functions.
- Auth relations referenced by FKs and function bodies.
- Any `auth.jwt()`, `auth.role()`, or additional `auth.*` reference discovered
  by a complete function/policy dependency scan.

Application helpers in the migration chain reference and define functions
such as `private.get_profile_id()`, `private.is_platform_admin()`,
`private.is_org_member(uuid)`, `private.get_org_role(uuid)`,
`private.can_access_rfq_as_buyer(uuid)`, and `private.has_rfq_invitation(uuid)`.
They must be replayed as application migrations, not replaced with always-true
stubs. Any bootstrap placeholder must have correct fail-closed semantics and
be explicitly distinguished from the authoritative function definition that
later migrations install.

The full transitive function dependencies of every policy, trigger, and
security-definer function have not been enumerated in Phase 0A; this is a
pre-execution blocker, not an assumption to silently resolve.

## Extensions and versions

| Extension | Migration evidence | PostgreSQL 15 availability/version |
|---|---|---|
| `pgcrypto` | `00001`, `00002` | **Not verified** against the selected image. |
| `pg_cron` | `00041`, `00177`, `00274` | **Not verified**; may require server preload and a supported package. Some migrations guard absence. |
| `pg_net` | `00109`, `00112`, `00274` | **Not verified** against the cached image; extension installation does not authorize or require outbound dispatch. |

Before any run, capture `pg_available_extensions` from the disposable image
after it is bootstrapped and document installed versus available versions.
Do not attempt extension installation from network/package repositories during
the migration replay; identify exact extension availability first.

## Migration-time settings and external services

### Verified

- Supabase config enables the API/Auth/Storage/Supabase local services and
  configures PostgreSQL major version 15. It also enables local seed scripts;
  these seed paths must not be used by the schema-only process.
- Migration SQL uses Supabase Auth/Storage namespaces and role names.
- `pg_net` functions can schedule Edge Function calls; migrations also contain
  optional `pg_cron` scheduling logic.
- The previous PostgreSQL image experiment showed its own entrypoint can
  require a Supabase-specific administrative role.

### Not required for the planned schema-only replay

- Starting Supabase Auth, Storage, Realtime, Kong, Studio, WAHA, Edge Runtime,
  SMTP, or other application services.
- Running `supabase start`, `supabase db reset`, the configured seed scripts,
  application server, HTTP requests, supplier invitations, email or WhatsApp.
- Loading production credentials, real user identities, supplier rows, buyer
  rows, RFQs, quotes, transaction rows, or payment data.
- Making `pg_net`/`pg_cron` network or scheduled jobs execute.

### Not verified

- Exact `POSTGRES_USER`, database ownership, JWT settings, auth bootstrap
  schema version, and initialization scripts for the cached PostgreSQL 15
  image.
- Exact `pg_cron`/`pg_net` extension versions and preload settings.
- Whether any migration invokes an external function during DDL execution
  (as distinct from defining a later runtime function). A complete function
  call/dependency scan is required.
- Required `SET`/session settings beyond standard PostgreSQL defaults and
  migration transaction boundaries.

## Bootstrap gate

Do not create a reconstruction database until a reviewed, version-controlled
bootstrap specification answers the unverified items above, contains no
secrets, starts only one PostgreSQL 15-compatible database, and passes a
preflight proving localhost-only binding, dedicated resources and no external
services. No such database was created in Phase 0A.
