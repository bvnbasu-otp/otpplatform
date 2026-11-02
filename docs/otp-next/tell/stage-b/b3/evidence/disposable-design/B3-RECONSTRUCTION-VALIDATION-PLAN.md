# Sanitized Reconstruction Validation Plan

## Status

Plan only. No database, migrations, tests, builds, or Docker resources were
used or created in Phase 0A.

## Preconditions

Do not execute validation until all are satisfied:

1. The schema-only generated migration stream and one-to-one source mapping
   have been reviewed and authorized.
2. All 331 files have a complete statement-level classification, including
   procedural/dynamic SQL, transaction boundaries, seed/backfill behavior,
   and explicit withheld-statement records.
3. PostgreSQL 15 image digest, Supabase bootstrap roles/schemas/Auth/Storage
   objects, extension availability, session settings, and external-call
   suppression are verified without production configuration.
4. A separately authorized disposable target is created with one container,
   one dedicated network/volume, a dynamically selected loopback-only port,
   and no Supabase companion services.
5. Before any SQL query, independently verify exact resource identities,
   image digest/version, network/volume ownership, `127.0.0.1` binding, and
   that protected containers/networks/volumes are unchanged.

## Validation stages

### 1. Provenance and replay ledger

- Record source HEAD, clean/dirty/staged status, migration count/order,
  per-file hashes, aggregate fingerprint, generated stream hash, and
  transformation-manifest hash.
- Require exactly 331 source-version mappings in numeric order, with no
  duplicate/missing versions.
- Each generated entry records retained, transformed, withheld, or blocked
  statements and a reason. Any blocked statement fails preflight.
- After replay, compare actual applied ledger against all 331 generated
  versions; a failed/no-op migration must still have an explicit outcome.

### 2. Schema object completeness

Compare catalog inventory to the generated retained-DDL manifest:

- Schemas, base/partitioned tables, columns/types/nullability/defaults.
- Primary/unique/check/exclusion constraints.
- Foreign keys and actions; indexes, sequences and ownership.
- Views/materialized views and definitions.
- Enums, domains, composites and extensions.
- Functions/procedures: identity arguments, return types, language,
  volatility, security mode, owner, `search_path`, definition hash, and
  execute grants.
- Triggers: table, timing, event, enabled state, function target and
  definition hash.
- No unexpected extra tables/types/functions or unexplained missing object.
- Treat explicit bootstrap objects separately from migration-created
  application objects.

Acceptance: every retained object maps to a source statement or bootstrap
entry; every omitted object has an approved reason.

### 3. Constraint and relationship integrity

- Enumerate all PK/FK/unique/check constraints and compare by normalized
  definition to expected retained DDL.
- Verify FK targets/actions, including requirements↔RFQ one-to-one
  uniqueness and ownership FKs.
- Run catalog-level validation for invalid/unvalidated constraints and
  duplicate indexes.
- Do not insert customer/supplier/transaction data to test constraints;
  use synthetic isolated fixtures only after separate authorization.

Acceptance: no missing, invalid, unexpectedly disabled, or unvalidated
constraint; all differences are explained by the transform manifest.

### 4. RLS and grants

- Compare every table/view's RLS enabled and forced flags to source intent.
- Enumerate each policy's table, command, roles, `USING`, and `WITH CHECK`.
- Enumerate table/sequence/schema/function grants and default privileges.
- Verify role names and membership/attributes against the approved bootstrap.
- Verify no direct `anon`/supplier grant bypasses the intended policy boundary.
- Confirm every policy helper resolves to the retained function and that no
  permissive placeholder remains active.
- Preserve `SECURITY DEFINER` owner and `search_path`; inspect grants for
  public RPCs.

Acceptance: all source policies/grants map to actual catalog rows, and each
transformation difference is explicit. No “frontend-only” security inference.

### 5. TELL parent/child/item model check

The current repository has no tracked parent group or buyer-item model.
Validate the reconstructed state does not accidentally invent or omit a
claimed existing one:

- Search catalogs for `requirement_specifications` and semantic equivalents.
- Verify `requirements` category/subcategory fields and subcategory-to-
  category consistency trigger/function.
- Verify RFQ's unique requirement FK and delete action.
- Verify ownership fields/check constraints for organization XOR
  owner-profile, with nullability and profile FK.
- Verify PO/invoice line tables remain downstream and are not interpreted as
  buyer-side RFQ items.
- Record “not present in reconstructed repository schema” separately from
  any hosted/runtime claim.

Acceptance: report exact object presence from the disposable reconstruction;
do not use it to claim hosted schema absence.

### 6. Publication function-chain completeness

Without invoking any business publication:

- Extract catalog definitions and hashes for every active
  `publish_requirement` overload.
- Compare against the last intended source definition and list overridden
  historical versions.
- Trace called functions, triggers, constraints, entitlement/credit writes,
  audit writes, and grants using static definition/catalog inspection.
- Verify one-requirement/one-RFQ uniqueness and that DRAFT guards are present.
- Record that a second call after success is rejected if the effective
  function has that behavior; do not call it with fixture or real rows.
- Identify discovery/invitation side effects in the definition chain;
  confirm there is no invocation against real suppliers and no service/network
  dispatch.
- Explicitly distinguish transactional atomicity from retry idempotency and
  post-commit asynchronous side effects.
- Establish whether any actual child-confirmation RPC exists; do not infer
  one from B1 design.

Acceptance: every effective function/trigger path is source-mapped; any
missing confirmation transaction, unscoped discovery call, non-idempotent
retry, or unexplained alternate publication route is a reported discrepancy,
not a pass.

### 7. Data safety and external effects

- Assert the disposable DB contains only schemas/objects and explicitly
  approved synthetic/static fixtures; no real supplier/customer/account/
  transaction records.
- Inspect generated SQL for remaining account/password, supplier/business,
  network/HTTP, mail, WhatsApp, and dynamic SQL operations before execution.
- Use a network-isolated database container; do not attach to application
  networks or enable external service containers.
- A static function definition that could call an external service is retained
  as code but never invoked. Verify no migration runs it during definition.

Acceptance: zero external requests and zero real-data statements executed.

## Failure handling and evidence

- Stop on the first unclassified statement, parse error, missing bootstrap
  dependency, DDL error, external-service dependency, or resource-binding
  mismatch.
- Preserve the exact source file/version, source line, generated statement
  locator, error, and resource ID in non-secret evidence.
- Do not skip a failed migration, manually patch the database, or declare a
  later migration successful.
- Cleanup only resource IDs verified as created for that attempt. Verify the
  database/container/network/volume/port are absent and protected resources
  are unchanged.
- Hash each final evidence file and include source/migration fingerprints.

## Acceptance status rules

- **PASS:** All scoped generated-schema, constraints, RLS, function/trigger,
  mapping, and cleanup criteria pass.
- **OPEN:** Evidence is incomplete, a dependency is unresolved, or a mismatch
  has not been explained.
- **BLOCKED:** Safety preconditions cannot be established or an unsafe
  migration cannot be transformed without losing semantics.

A passing reconstruction validates only the generated repository schema on
the identified disposable PostgreSQL 15 Supabase-compatible image. It does
not certify hosted `otp-nxt-np`, production schema, customer behavior, or
supplier visibility. DEP-01 closure still requires decision-owner review of
the evidence and its provenance.
