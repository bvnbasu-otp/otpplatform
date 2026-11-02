# Phase 0C Blocker Closure — Design Review Update

## Status

**BLOCKED — DISPOSABLE RECONSTRUCTION NOT READY.** Phase 0C resolved the DML
count and migration 00328. Critical bootstrap, scheduling-control, and
catalog-driven security/ownership dependencies still prevent authorization.

## Starting evidence and current-state check

At current repository HEAD
`77888fba12c6cee441017986a663393d92d4b649`, the migration directory contains
331 numeric SQL files. The existing five Phase 0A design documents are
present. Their SHA-256 values at the start of this review were:

| Phase 0A document | SHA-256 |
|---|---|
| `B3-SANITIZED-MIGRATION-CLASSIFICATION.md` | `f96216f806339d6e3111af7593799cf8486979fee65147645046b68ceef20748` |
| `B3-UNSAFE-MIGRATION-STATEMENT-REGISTER.md` | `3db03b3bf8371cfc1cc5239b350799fa9c996e5f836d43d8c192eb719c255d47` |
| `B3-SUPABASE-BOOTSTRAP-REQUIREMENTS.md` | `c4915c98e6adf8050a79c715e0724278147657999cf4388bce460ab8f49aa5c0` |
| `B3-SCHEMA-RECONSTRUCTION-DESIGN.md` | `8baa61fa7ae530fffafbd136a3b33d47707308f34e9090882f91fc4bdb8c7277` |
| `B3-RECONSTRUCTION-VALIDATION-PLAN.md` | `09033370189746b0f8018b5680e19303cb138c492fcdc0ba8e6347c9203f6fcb` |

These are historical hashes captured during Phase 0B, not assertions that
the files remain unchanged after Phase 0C. Evidence corrections are recorded
in-place and in the Phase 0C reconciliation below.

## Corrections to Phase 0A evidence

1. **DML count discrepancy resolved.** The 295 raw register locations include
   two INSERTs at `00138:228,247` inside the stored function
   `private.notify_suppliers_of_outcome(uuid)`. They are deferred runtime
   writes, not migration-time DML. Excluding them yields the scanner's
   **293 migration-time statements**: 148 INSERT, 123 UPDATE, 22 DELETE.
   The 79 operations inside `DO` blocks remain migration-time.
2. **00328 resolved against the ordered source.** Current 00261 defines the
   function with `rfq_phase`; 00328 replaces it with `rfq_status`, and no
   migration through 00331 redefines the function. Its comments are
   inaccurate; its source behavior is not ambiguous. The manifest now marks
   00328 RETAIN.
3. **Critical procedural blockers narrowed.** The unresolved work is
   migration-time cron scheduling in 00041/00177 and conditional scheduling
   in 00274, plus dynamic security/ownership DDL whose targets derive from
   catalogs (`00177`, `00178`, `00199`, `00212`, `00281-00283`). These must
   be preserved or explicitly controlled in a generated replay; blanket
   removal would alter security or ownership behavior.
4. **Bootstrap evidence remains incomplete.** The local cached Supabase PostgreSQL
   15 image identity is verified, but its runtime bootstrap, roles, Auth and
   Storage definitions, extension versions, and exact role/extension
   contracts are not. Image metadata is not a substitute for the documented
   image bootstrap contract.

## Review of the five Phase 0A documents

| Document | Review finding |
|---|---|
| `B3-SANITIZED-MIGRATION-CLASSIFICATION.md` | Useful file inventory and multi-label screening only. Counts overlap, `mixed` is not a replay disposition, and source-order predecessor edges do not establish object dependencies. The 293/148 DML count is reconciled by distinguishing two deferred function-body writes in the register. |
| `B3-UNSAFE-MIGRATION-STATEMENT-REGISTER.md` | Useful value-redacted source locator register for 86 files. It now labels two `00138` function-body INSERTs as deferred, not migration-time DML. It is not a transformation map or proof that all unsafe statements were found. |
| `B3-SUPABASE-BOOTSTRAP-REQUIREMENTS.md` | Correctly distinguishes several repository references from assumptions, and identifies important roles/schemas/extensions. It does not establish exact Supabase object definitions, role attributes, extension versions, or transitive helper dependencies. Local image metadata cannot close those gaps. |
| `B3-SCHEMA-RECONSTRUCTION-DESIGN.md` | Generated ordered stream is the safer design than modifying history or regex-stripping. It remains conceptual: parser choice, per-statement disposition, exact transformations, and external/scheduled side-effect suppression are not proven. |
| `B3-RECONSTRUCTION-VALIDATION-PLAN.md` | The acceptance areas are appropriate but are future validation gates, not evidence that schema, constraints, RLS, functions, triggers, or TELL relationships have been validated. |

## Disposition result

`B3-MIGRATION-DISPOSITION-MANIFEST.md` assigns exactly one primary
disposition to each of the 331 current migrations. It distinguishes
candidate data exclusion and source-preserving transformation from
unresolved blockers. The manifest is conservative: absent a verified
dependency and procedural-effect review, it does not mark a migration
RETAIN simply because it contains DDL or function definitions.

The manifest is not proof of safe replay. A transformation disposition is a
design decision for a future generated copy; no transformation was generated
or executed here. It contains 1 RETAIN (00328), 65 TRANSFORM, 21 EXCLUDE,
and 244 BLOCKED entries. The blocked count reflects critical chain-level
bootstrap, security/ownership DDL, and scheduling-control gaps.

## Readiness decision

**Not ready for authorization to create a database or replay migrations.**
The DML discrepancy and 00328 chain behavior are resolved. Critical
blockers remain: the exact PG15 Supabase bootstrap contract, external role
and Auth/Storage definitions, extension availability, and a fail-closed
approach to cron scheduling and catalog-driven security/ownership DDL.
Disposable reconstruction should not proceed until these are documented and
reviewed. The next step is a separate repository-only design decision that
approves the precise bootstrap contract and generated-stream transformations
for those blockers; it is not runtime execution authorization.

## Safety and preservation

This review did not create or alter any database, container, network, volume,
or migration. It did not execute SQL, Supabase commands, tests, or builds, and
did not access hosted databases. Only evidence documents under
`evidence/disposable-design/` were edited. Existing tracked and untracked
worktree changes were preserved; no files were staged, committed, pushed, or
deployed.

## Phase 0E superseding evidence addendum

Phase 0E reviewed repository migration/configuration text and read-only local
Docker image tag/digest metadata. It did not connect to a database or inspect
or alter a container.

1. **DML reconciliation corrected.** The previous 293 migration-time total
   counted direct DML but missed the explicit `00020:342` call to
   `public.backfill_taxonomy()`. That call executes 13 DML statement sites.
   The effective count is now 306 (152 INSERT, 132 UPDATE, 22 DELETE);
   the two `00138` function-body INSERTs remain deferred.
2. **Local PG15 image identity established, compatibility not established.**
   The cache contains `supabase/postgres:15.1.1.78` with image digest
   `sha256:881ac26a02870c6784d9fbec67a6a9c5026905216bbd7dfbfa289ecc48073387`.
   Repository config pins only major version 15. The tag/digest does not
   prove role/bootstrap objects, Auth/Storage compatibility, extension
   versions, or migration replay compatibility. A cached PG17 image is not
   a valid PG15 substitute.
3. **Disposition actions resolved, blockers remain.** `00020` and `00194`
   are now TRANSFORM with exact source-based rules; manifest totals are 1
   RETAIN, 67 TRANSFORM, 21 EXCLUDE, 242 BLOCKED. `00177` remains BLOCKED
   pending exact catalog postconditions for dynamic search-path and RLS
   changes. The other blocked rows need their per-migration dependency and
   effect review; image metadata does not make them safe.
4. **Side-effect controls specified, not validated.** The whole scheduler
   blocks for `00041`, `00177`, and `00274` are excluded from a proposed
   generated copy; the 00020 backfill invocation and 00194 notification
   block are also removed. Catalog security/ownership postconditions and
   full DML-trigger/function closure remain unresolved.

**Current Phase 0E decision: BLOCKED.** The updated bootstrap review,
procedural review, disposition manifest, DML reconciliation, blocker
register, stream specification, and proposed Phase 1 checklist supersede
earlier counts and readiness statements where they differ. No database,
Docker resource, migration, test, build, network operation, staging,
commit, push, or deployment occurred; pre-existing worktree changes were
preserved.
