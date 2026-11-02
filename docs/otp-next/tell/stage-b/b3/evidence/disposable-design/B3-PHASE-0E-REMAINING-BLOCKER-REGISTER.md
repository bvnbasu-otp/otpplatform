# Phase 0E Remaining Blocker Register

## Status

**BLOCKED — no disposable database or migration stream is authorized.**

Read-only evidence sources: migration text, repository configuration,
existing Phase 0A–0D evidence, and local Docker image tag/digest metadata.
No database connection, SQL execution, container inspection, image download,
or hosted/production access was used.

## Resolved action classifications

| Migration(s) | Phase 0E disposition | Source-backed resolution | Still not proven |
|---|---|---|---|
| `00020_taxonomy_backfill.sql` | **TRANSFORM** | Remove the top-level `SELECT public.backfill_taxonomy()` at line 342. It invokes 13 DML statement sites against existing requirements/supplier data. Preserve function definitions. | No generated copy or parser/postcondition validation exists; later callers and full call graph still require review. |
| `00194_supabase_data_api_table_grants_and_default_privileges.sql` | **TRANSFORM** | Preserve grants/default privileges, remove the `pg_notify` schema-cache signal block, and change the conditional `postgres` skip into a hard failure. | Exact role catalog, grant ownership/effective ACLs, and default ACL state are unverified. |
| `00041`, `00274` | **TRANSFORM** | Remove each complete migration-time cron scheduler block, including extension creation, unschedule, scheduling, and 00274 secret/network setup. | Generated transformation and zero-scheduler verification have not been performed. |
| `00177` | **BLOCKED** | Scheduler removal is specified. | Dynamic SECURITY DEFINER search-path and RLS loops must be transformed to fail closed and checked against the exact catalog; no compatibility evidence exists. |

These are classifications of intended generated-copy actions, not replay
authorization.

## Remaining blockers

| ID | Blocker | Scope | Evidence and closure required |
|---|---|---|---|
| B0E-01 | Exact PG15 Supabase bootstrap is not established. | All 331 migrations | `supabase/config.toml` specifies major 15. Local cache contains `supabase/postgres:15.1.1.78` with digest `sha256:881ac26a02870c6784d9fbec67a6a9c5026905216bbd7dfbfa289ecc48073387`, but image metadata does not prove bootstrap roles, SQL objects, extensions, or startup contract. Obtain an approved versioned bootstrap contract or existing image contents/evidence without starting it. |
| B0E-02 | Role attributes and memberships are unknown. | Grants, RLS, ownership and default privileges throughout chain; especially `00194`, `00152`, `00177`, `00199`, `00212`, `00281`–`00283` | Prove exact role names, `rolsuper`, `rolbypassrls`, login/inheritance/create attributes, memberships, owners and grantors for `anon`, `authenticated`, `service_role`, `postgres`, and any captured view owner/grantee. Do not infer from names. |
| B0E-03 | Auth/Storage catalog contracts are unknown. | `00002`, `00018`, `00032`, policies/functions throughout chain | Provide versioned evidence for `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.uid()`, `auth.role()`, `auth.jwt()`, `storage.buckets`, `storage.objects`, their types, keys, grants and semantics. No permissive stubs. |
| B0E-04 | Extension availability/build is unknown. | `00001`, `00002`, `00109`, `00112`; scheduler blocks being removed from `00041`, `00177`, `00274` | Verify exact PG15 `pgcrypto` and `pg_net` versions/schema placement from local image/package evidence. `pg_cron` is not required in the sanitized stream. |
| B0E-05 | Full migration-time side-effect/call graph is not closed. | All 331 migrations | Current source inventory records 306 effective DML statement sites (293 direct plus 13 reached by `00020:342`), 97 `DO` blocks in 73 migrations, schedulers, extension creation, `00194` notification, deferred HTTP function bodies and trigger definitions. Parse every SQL/procedural statement, dynamic SQL, explicit migration-time call, and DML-trigger chain; reconcile every source effect to an output action. |
| B0E-06 | Dynamic security/ownership catalog postconditions are not run or established. | `00177`, `00178`, `00199`, `00212`, `00281`–`00283`, `00194` | Use the explicit Phase 0E postcondition matrix in `B3-SUPABASE-BOOTSTRAP-REVIEW.md`. Preserve source target sets and expressions; fail closed; verify routine search paths, RLS flags, ACLs, view metadata, ownership constraints/indexes, and policy expressions against the exact ordered catalog. |
| B0E-07 | The manifest still has 242 BLOCKED migrations. | Each row marked BLOCKED in `B3-MIGRATION-DISPOSITION-MANIFEST.md` | No remaining BLOCKED entry can be promoted from image metadata or lexical screening alone. Review each row's file-level dependencies, DML/procedural effects, transformations, and required postconditions. `00177` needs dedicated security/catalog review; other rows require the source-specific review recorded in their manifest reasons. |
| B0E-08 | No generated stream or independent statement mapping exists. | All 331 migrations | Create only after separate authorization. Require one source hash/action mapping per migration and statement-level provenance; verify no missing/duplicate/unclassified source statements and no generated output from a different HEAD. |
| B0E-09 | No authorized isolated replay environment or validation exists. | Phase 1 | No database/container may be created until a separate explicit authorization. Later validation must prove schema/FK/policy/function/trigger completeness and external side-effect suppression without seeds or hosted access. |

## Which BLOCKED entries can be classified now?

`00020` and `00194` are the two BLOCKED entries whose generated-copy
actions are now sufficiently source-specific to change to **TRANSFORM**;
their manifest rows and totals have been updated. `00041` and `00274` already
had TRANSFORM dispositions and now have precise scheduler rules.

The other **242 BLOCKED entries require manual handling**. This is not a
claim that every one requires hand-editing: a future audited generator may
apply repeatable transformations. It means available repository/image
metadata does not establish a safe action and postcondition for those
migrations. Their exact file list is the BLOCKED subset of the full 331-row
manifest. No migration is made RETAIN or execution-ready by this assessment.

## Inventory correction

Phase 0E corrected the DML count: `00020:342` invokes 13 DML statements in a
stored function. The effective count is 306 statement sites, not the
previously reported 293. Two `00138` function-body INSERTs remain deferred
because their function is not invoked by that migration. See
`B3-DML-RECONCILIATION.md` and
`B3-UNSAFE-MIGRATION-STATEMENT-REGISTER.md`.

## Recommendation

**Phase 0E: BLOCKED.** The next permissible step is to close B0E-01 through
B0E-08 from approved, offline evidence and review this blocker register.
Only after that should the project decision owner consider a separate Phase
1 authorization. Do not start a disposable environment or execute migrations
as part of blocker closure.
