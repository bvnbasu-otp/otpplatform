# Sanitized Schema Reconstruction Design

## Decision

A **generated, ordered sanitized migration stream** is the preferred design;
do not edit historical migrations and do not globally delete every DML token
with a regular expression. The repository has 331 ordered migration files,
including account/password, supplier/business, demo, and historical-data
operations. A mechanically stripped migration chain is not safe unless each
statement and procedural block is classified and mapped.

Phase 0A is design only. No container, network, volume, database, migration,
or test was run.

## Reproducible pipeline proposal

1. **Freeze source identity.** Record repository HEAD
   `77888fba12c6cee441017986a663393d92d4b649`, ordered filenames, each source
   SHA-256, and the aggregate ordered-chain fingerprint
   `7e71d70976f91a8b0eb21eabe7972f54a5336326535a9f9e0e9683e1030c0961`.
2. **Parse, do not regex-strip.** Use a PostgreSQL-aware parser/lexer and
   preserve complete SQL syntax, quoted strings, comments relevant to
   semantics, dollar-quoted function bodies, transaction boundaries, and
   `DO` blocks. Each statement receives a stable source locator and kind:
   schema DDL, function/procedure, policy/grant, trigger, extension/bootstrap,
   migration-time data mutation, or unknown.
3. **Classify every executable statement.** Keep DDL, constraints, indexes,
   views, functions/procedures, policies, grants, triggers, and required
   extension declarations. Separate migration-time `INSERT`/`UPDATE`/
   `DELETE`/`TRUNCATE`/`COPY` and data-mutating procedural blocks into
   transformation records. Do not treat DML *inside a stored function body*
   as migration-time DML: it is part of the function definition and must
   remain byte-equivalent unless that definition itself is unsafe to create.
4. **Transform only a generated copy.** For every source version, emit one
   generated version entry in the same position, including an explicit
   no-op/ledger entry if all source operations are withheld. Do not renumber,
   merge, reorder, or silently omit a source migration.
5. **Map every transformation.** Machine-readable mapping fields should
   include original version/name/source hash, statement locator, original
   statement kind, disposition (`retained`, `withheld`, `synthetic-fixture`,
   `manual-rewrite`, `blocked`), reason, generated file/name/hash, reviewer,
   and transformation ID. Any statement with unresolved dynamic SQL,
   procedural execution, or unknown target remains `blocked` and prevents
   replay.
6. **Keep data fixture policy separate.** Phase schema-only should withhold
   account/password, supplier/customer/business, RFQ/quote/order/payment,
   notification/audit, demo and historical-record mutations. Canonical
   non-personal reference values (e.g. taxonomy and role/permission catalogs)
   may be provided in a separate, reviewed synthetic/reference fixture
   stream, never silently copied from an unsafe mixed migration. This phase
   has not authorized such a fixture.
7. **Preserve structural prerequisites.** Bootstrap only the exact Supabase
   roles, schemas, Auth/Storage catalog contracts, and extensions required to
   parse and create retained objects. Any placeholder must be fail-closed and
   later replaced by the migration's actual definition. Do not stub policies
   or business functions with permissive behavior.
8. **Replay sequentially.** Apply generated versions on the intended
   PostgreSQL 15 Supabase image in source order using a runner that records
   before/after status and preserves each original transaction boundary.
   Never use the repository's configured local seeds or Supabase CLI
   orchestration. Only a separate, explicit authorization may create that
   disposable environment and run the generated stream.
9. **Fail closed.** Stop on the first parse ambiguity, unresolved external
   dependency, missing required extension, failed DDL, or unexpected
   connection/resource binding. Record exact original/generated version,
   statement locator and error. Do not mark the chain reconstructed.
10. **Verify and clean.** Compare generated migration ledger to the 331-source
    map; run the validation plan; remove only verified dedicated resources;
    retain evidence and resource cleanup proof.

## Mapping and ordering invariant

The version mapping is one-to-one:

```text
source 00001 -> generated 00001 (retained bootstrap/schema statements)
source 00002 -> generated 00002 (retained DDL; classified data operations withheld)
...
source 00331 -> generated 00331 (retained schema/runtime definitions; data handling recorded)
```

For each source migration `v`, generated version `v` depends on the preceding
source-order version and on named objects established by earlier versions.
The full object dependency DAG is **not yet established**; the migration
filename sequence is the only proven ordering. The generated manifest must
record object dependencies and distinguish verified from inferred edges.

If a migration mixes DDL and required backfill (e.g. cleanup preceding a
unique constraint), the generated version may not simply omit the data
statement. It must either (a) prove the empty-schema path is valid and retain
the final constraint, (b) apply a separately approved synthetic fixture, or
(c) remain blocked. Preserve transactional order and atomicity within that
generated version.

## Data operation handling

- **Auth/account/password migrations:** withhold all data changes. Never
  substitute redacted/hashed real credentials. Retain schema/function
  definitions only if they can be separated without semantic changes.
- **Supplier/customer/business seed:** withhold all real supplier, buyer,
  organization, RFQ, invitation, quote, order, invoice, payment, notification
  and transaction rows.
- **Data cleanup/purge:** withhold destructive deletes/updates. On an empty
  generated database, remove the data mutation only from the generated
  version after proving it is not required for DDL success.
- **Reference catalogs:** do not assume seed rows are structural schema.
  Maintain separate reviewed fixture files so taxonomy-dependent behavior is
  explicitly limited when omitted.
- **Self-managed migration ledger DML:** replace with the reconstruction
  runner's own ledger. Record every original source version even when its
  generated version contains no SQL beyond the ledger record.
- **Dynamic SQL/DO blocks:** inspect branch behavior and generated SQL.
  Unknown is blocking, not implicitly safe.

## Explicit non-goals

- This does not certify or recreate hosted `otp-nxt-np`.
- This does not prove the checked-in migration chain is deployable on
  PostgreSQL 15.
- This does not provide production-like account, supplier, taxonomy, or
  procurement data.
- This does not validate customer flows or execute publication/discovery.
- This does not close DEP-01, DEP-02, or DEP-03.

## Authorization boundary

The current authorization is read-only design. Before any database creation
or migration execution, obtain explicit authorization for the generated
transformation manifest, bootstrap contract, pinned image digest, network/
volume/resource names, and data fixture policy. No original migration file
may be modified; no existing local or production resource may be reused.
