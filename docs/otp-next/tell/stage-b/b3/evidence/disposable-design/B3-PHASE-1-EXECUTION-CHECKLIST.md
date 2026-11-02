# Proposed Phase 1 Execution Checklist

## Authorization boundary

**PROPOSAL ONLY — NOT AUTHORIZED.** Phase 1 would create an isolated
disposable environment and execute a generated sanitized migration stream.
This checklist is not permission to do so. Phase 0E remains BLOCKED until the
blocker register is closed and the project decision owner explicitly
authorizes Phase 1.

## Gate 0 — evidence and authorization

- [ ] Resolve every Phase 0E blocker with source-backed or approved immutable
  local bootstrap evidence.
- [ ] Pin one exact PostgreSQL 15/Supabase image by tag and digest and prove
  its startup/bootstrap contract without starting it during Phase 0E.
- [ ] Record exact role attributes/memberships, Auth/Storage object
  definitions, extension versions/placement, and source grant/default
  privilege expectations.
- [ ] Review the complete migration-time DML/procedural/dynamic SQL/trigger
  inventory. Reconcile all 331 migration files to source statement actions.
- [ ] Review and sign off the 331-row source-to-output transformation plan,
  including the corrected 00020 and 00194 transforms and all 242 currently
  BLOCKED rows.
- [ ] Obtain separate, explicit Phase 1 authorization. If any gate is open,
  STOP.

## Gate 1 — immutable inputs and isolation design

- [ ] Confirm source HEAD and verify all migration source hashes against the
  reviewed manifest.
- [ ] Create an isolated disposable target only after authorization; use no
  existing `otp-local`, production, staging, hosted, or customer database.
- [ ] Ensure no network egress, no secrets/service keys, no Auth/customer/
  supplier/transaction seeds, no cron jobs, and no configured demo seed
  paths.
- [ ] Use only reviewed bootstrap artifacts and an explicitly disposable
  migration principal.
- [ ] Record environment identity, image digest, bootstrap artifact hashes,
  migration-stream hash, timestamp, and operator authorization without
  storing credentials.

## Gate 2 — generate and statically validate stream

- [ ] Generate to a separate output location; never edit original migration
  files.
- [ ] Produce a complete version/path/hash/action mapping for 331 sources.
- [ ] Require every output statement to carry source provenance and a
  reviewed transformation ID.
- [ ] Remove the full scheduler blocks from `00041`, `00177`, `00274`.
- [ ] Remove the explicit backfill invocation from `00020`; retain the
  function definition.
- [ ] Remove the PostgREST notification block from `00194`; make the required
  `postgres` default-privilege branch fail closed.
- [ ] Apply reviewed fail-closed security/catalog rewrites; reject any
  missing, ambiguous, or unmatched target.
- [ ] Parse generated SQL and procedural bodies using the pinned PG15
  dialect/toolchain. Reject unknown syntax or unclassified statements.
- [ ] Confirm no executable `cron.schedule`, `cron.unschedule`, migration-time
  `net.http_post`, seed operation, account/password operation, or
  unapproved DML remains.
- [ ] Independently compare source/output migration counts, hashes, ordering,
  and transformation records.

## Gate 3 — replay only after Gate 2 acceptance

- [ ] Confirm target is isolated, empty, disposable, and no egress before
  replay.
- [ ] Apply the generated stream in exact source order; abort on first error.
- [ ] Do not retry by skipping migrations or relaxing roles, RLS, grants,
  constraints, or extension requirements.
- [ ] Capture sanitized command output and migration ledger evidence; exclude
  secrets and data rows.
- [ ] Confirm no scheduled jobs and no outbound HTTP dispatch occurred.

## Gate 4 — post-replay catalog validation

- [ ] Validate all expected schemas, tables, columns, types, sequences,
  indexes, constraints, FKs, and triggers.
- [ ] Validate every source policy and RLS enabled/forced flag; compare
  security-definer search paths and effective function/table/column ACLs.
- [ ] Validate captured view definitions/options/owners/ACLs and fail on any
  mismatch.
- [ ] Validate `requirements`, `rfqs`, `purchase_orders` personal ownership
  constraints, indexes, policies and ownership-immutability triggers.
- [ ] Validate all 00282/00283 owner-aware policy rewrites and expected
  match counts.
- [ ] Validate publication RPC/function/trigger dependency definitions and
  grants without invoking publication or discovery workflows.
- [ ] Confirm no demo, auth account, supplier, customer, RFQ/quote, or
  transaction seed rows exist. Do not dump row contents.
- [ ] Compare final schema objects and security catalog state against the
  approved manifest and postcondition set.

## Gate 5 — result and stop

- [ ] Produce a metadata-only validation report with environment/image
  identity, stream/source hashes, migration ledger, object counts, security
  postcondition results, and explicit limitations.
- [ ] Preserve the disposable environment only as explicitly authorized;
  otherwise stop and remove only resources covered by the authorization.
- [ ] Do not use the reconstructed database for application workflows,
  publication, supplier discovery, or customer/supplier data loading without
  a separate approval.
- [ ] Stop after the authorized Phase 1 deliverable. DEP-01 closure and later
  phases require their own evidence and decisions.

**Phase 1 readiness at Phase 0E: BLOCKED.** Several Gate 0 evidence items
remain unresolved; no checklist action above has been executed.
