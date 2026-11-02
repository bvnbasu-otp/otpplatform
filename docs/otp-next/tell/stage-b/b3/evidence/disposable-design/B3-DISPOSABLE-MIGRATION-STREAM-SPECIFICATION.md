# Proposed Disposable Migration-Stream Specification

## Status

**PROPOSAL ONLY — BLOCKED; NOT AUTHORIZED FOR GENERATION OR EXECUTION.**

This specification defines a fail-closed design for a future sanitized
PostgreSQL 15/Supabase migration stream. It does not create transformed SQL,
certify the 331-migration chain, or authorize a database/container. Source
files remain immutable.

Evidence basis: current repository migrations, `supabase/config.toml`, and
the Phase 0C/0D/0E evidence in this directory. A cached PG15 image identity
is now recorded, but the repository requests only PostgreSQL major version
15 and does not establish that image's bootstrap, extension package set,
role attributes, or Auth/Storage catalog contract.

## Inputs and immutable mapping

1. Enumerate the 331 numeric migrations in source order and require exactly
   one mapping row for each source version.
2. For every source, record its repository-relative path, SHA-256, source
   version, disposition, generated-copy path, and a transformation record.
   A missing source, duplicate version, changed hash, absent mapping, or
   unclassified statement is a hard error.
3. Never edit or execute the original migration files. Generate into a
   separate, disposable output directory from a clean source revision.
4. Every output statement must map to source statement(s) and a documented
   transformation rule. Do not use filename-only allowlists or regex-only
   SQL rewriting.
5. Preserve order and transaction boundaries unless a transformation record
   identifies an intentional boundary change and its justification.

## Stream generation gates

Generation may begin only after an approved, versioned bootstrap contract
provides a pinned PostgreSQL 15 Supabase build and verifies:

- Migration principal authority, `postgres`, `anon`, `authenticated`,
  `service_role`, role attributes/memberships, and view-owner/grantee roles.
- Compatible Auth and Storage schemas, tables, functions, grants, and
  semantics used by source migrations.
- Required `pgcrypto` and `pg_net` extension builds and schema placement.
- No active `pg_cron` extension or scheduled jobs in the generated stream.
- Network egress denial, no secrets/settings, disabled seeds, and no
  externally hosted target.
- Required Supabase grants and default privileges from source migrations.

Unverified bootstrap inputs must not be mocked with permissive stubs or
same-named roles with guessed attributes. If an input cannot be proven,
generation/replay remains blocked.

## Required transformation rules

### Scheduled work

Apply only statement-boundary-aware transformations to these source blocks:

| Migration | Generated-copy transformation |
|---|---|
| `00041:607-624` | Remove the complete `DO` block that creates `pg_cron`, unschedules `otp-advance-rfq-phases`, and schedules the five-minute phase worker. Preserve preceding phase functions, triggers, grants, and other DDL. |
| `00177:125-142` | Remove the complete `DO` block that creates `pg_cron`, unschedules, and reschedules the phase worker. Preserve function definitions and all security/RLS work. |
| `00274:236-273` | Remove the complete `DO` block that creates `pg_cron`/`pg_net`, reads URL/service-key settings or `private.platform_secrets`, unschedules, and schedules `net.http_post`. Preserve retry/recovery functions, grants, tables, and indexes. |

Do not install `pg_cron` for this stream. `pg_net` remains required by
function definitions in earlier migrations, but the replay must have no
endpoint/service key and no outbound network. Validation must find no
`cron.schedule`, `cron.unschedule`, or migration-time `net.http_post`
invocation in executable SQL, including dynamic strings. Function/trigger
definitions that defer these calls are retained.

### Migration-time function/data and notification effects

| Migration | Generated-copy transformation |
|---|---|
| `00020:342` | Remove the explicit `SELECT public.backfill_taxonomy()` call. Retain the function definition and its grants. The invoked body contains 13 DML statement sites against existing requirements/supplier data; the call must not execute in a schema-only replay. |
| `00194:73-79` | Remove the complete PostgREST `pg_notify` DO block. Preserve all explicit grants/default privileges. Replace the conditional `postgres` role-existence skip with a fail-closed assertion. Never broaden privileges to compensate for a missing role. |

The two `00138:228,247` function-body INSERTs are not invoked by that
migration; do not treat them as migration-time DML. All other direct DML
remains controlled by the 331-row disposition and statement register.

### RLS, function security, ownership, and grants

1. Keep security and ownership DDL. Never omit or replace catalog-driven
   blocks with weaker static policies.
2. In `00177:385-435` and `00178:478-496`, preserve the source catalog
   predicates, target set, `search_path`, `ENABLE ROW LEVEL SECURITY`, and
   `NO FORCE ROW LEVEL SECURITY` behavior. Transform catch-and-`NOTICE`
   handlers into errors that abort the migration. Add catalog postconditions
   that enumerate every target and assert the resulting values.
3. In `00199:831-865`, preserve exact routine target sets and RFQ
   column-level grant exclusions. Assert expected signatures and columns;
   fail on missing/duplicate/unexpected targets. Never fall back to a
   table-wide SELECT grant.
4. In `00212:130-199`, preserve each captured view definition, options,
   owner, and ACL. Require all owners/grantees before the migration; compare
   reconstructed catalog state to the captured state and abort on mismatch.
5. Preserve `00281` owner-profile references, XOR ownership checks, indexes,
   policies, and immutable-ownership triggers. Preserve `00282`/`00283`
   policy-expression rewrites, but require a complete expected-match count,
   verify resulting expressions, and abort on any unrecognized policy state.
6. Require `postgres` before `00194`; replace its conditional role-existence
   skip with an explicit failure if absent. Preserve the source's grant and
   default-privilege statements; do not broaden them.
7. Any DDL or security statement that cannot be parsed, matched, executed, or
   verified fails the whole replay. No `WHEN OTHERS THEN NULL/NOTICE` may
   convert a required security change into apparent success.

Required catalog postconditions are specified in
`B3-SUPABASE-BOOTSTRAP-REVIEW.md` Phase 0E addendum. At minimum, the generated
replay must verify exact routine search paths, table RLS flags, routine and
column ACLs, view definitions/options/owners/ACLs, owner-profile constraints
and indexes, and owner-aware policy expressions. Role attributes and
memberships must come from the approved bootstrap contract, not guesses.

### Data and side-effect rules

Retain the existing per-migration DML classification and transformation
register; do not delete all DML by keyword. A statement may be transformed
only when its source behavior, dependencies, and schema necessity are
documented. Preserve required static taxonomy/schema reference behavior only
under its own reviewed policy. All account, password, identity, supplier,
customer, transaction, and operational row operations remain excluded or
blocked unless their safe disposition is individually documented.

No configured seed path may enter the generated stream. No migration-time
function call, DML-triggered request, cron job, or network request may run.
Because a migration DML/trigger call graph is not yet complete, the stream
also requires external network egress denial and a clean, empty target. These
controls are not substitutes for statement-level review.

## Validation required before any separate execution authorization

- Exactly 331 unique source-to-output mapping entries; hashes match the
  reviewed source revision.
- Every generated statement has source provenance and a recorded action:
  copied, transformed, or excluded. No unclassified statement is accepted.
- SQL and procedural bodies parse under the pinned PG15/Supabase bootstrap.
- No cron scheduler or direct migration-time HTTP invocation remains.
- Required functions, triggers, grants, policies, and ownership constraints
  exist; effective ACL/RLS/search-path postconditions match the source
  security intent.
- Catalog rewrites report expected counts and fail if the counts or resulting
  expressions differ.
- Foreign keys and constraints are valid; no seed/customer/supplier/
  transaction rows exist.
- TELL and publication dependency objects are complete, while publication
  workflows and external services are not invoked.
- A second independent manifest check confirms no missing/duplicate source
  versions and that every `BLOCKED` disposition remains a hard stop.

These validation steps require a separate explicit authorization. They were
not run in Phase 0E.

## Unresolved blockers

1. Exact PG15 Supabase image/build and bootstrap artifacts are not pinned or
   verified. The cached `supabase/postgres:15.1.1.78` digest is evidence of
   local image identity only, not bootstrap compatibility.
2. Required role attributes/memberships and the Auth/Storage catalog contract
   are not established from current repository evidence.
3. `pgcrypto`/`pg_net` versions and behavior are not verified for the pinned
   image; a no-egress disposable runtime is not provisioned or verified.
4. Catalog-driven security and ownership postconditions cannot be established
   without the exact bootstrap and ordered catalog.
5. Full statement-level DML, trigger, function, and external-side-effect
   closure for all 331 migrations remains incomplete. Phase 0E corrected the
   migration-time DML count to 306 effective statement sites and records the
   explicit 00020 invocation; further dynamic/call-graph review remains.
6. No generated stream exists; no SQL parse/replay or schema completeness
   validation has been authorized or performed.

**Phase 0E recommendation: BLOCKED.** Complete and review the bootstrap
contract, resolve all remaining BLOCKED manifest rows, and finish the
statement/call-graph review. Then request a separate authorization decision
before generating or executing anything.
