# DEP-01 Runtime Schema Snapshot — Access Not Provided

## Result

**No authoritative runtime schema snapshot was obtained. DEP-01 remains open.**
This report records the evidence boundary; it is not a substitute for the
database/schema owner's snapshot and does not close DEP-01.

## Evidence source and environment

| Field | Status |
|---|---|
| Authoritative source | **NOT PROVIDED.** No database/schema-owner snapshot, migration ledger export, or owner confirmation was supplied or made available through an authorized process. |
| Environment identity and purpose | **NOT VERIFIED.** The relevant OTPNext pilot database was not identified by an authorized owner. |
| Snapshot timestamp | **NOT AVAILABLE.** No runtime snapshot was supplied. This report was prepared 2026-11-01; that is the report date, not a database snapshot time. |
| Current intended pilot schema | **NOT VERIFIED.** |
| Credentials/connection details | None requested, retrieved, or recorded. |

No database connection or metadata query was made. In particular,
`otp-local`, `otp-prod-db`, and any hosted database were not accessed. No
Docker operation, migration, test, build, seed script, or application workflow
was run for this request.

## Required metadata findings

### A. Tables and columns

**VERIFIED FROM RUNTIME:** None. No runtime table, column, RLS, grant, or
function metadata was obtained.

**VERIFIED FROM REPOSITORY:**

- `supabase/migrations/00002_core_tables.sql` defines `requirements` and
  `rfqs`. `rfqs.requirement_id` is a unique FK to `requirements(id)`.
- `supabase/migrations/00014_requirement_intake_columns.sql` adds the
  requirement taxonomy, scalar quantity/unit, attributes, and other intake
  fields. It describes `structured_specs` as a legacy compatibility mirror.
  `supabase/migrations/00020_taxonomy_backfill.sql` backfills legacy values;
  neither migration defines an item lifecycle.
- No defining `CREATE TABLE` or `ALTER TABLE` for
  `requirement_specifications` was found in the tracked migration history, and
  no generated table type was found in
  `packages/database/src/generated/supabase.ts`. The name appears in reset/
  cleanup references, including `apps/web/src/features/admin/api/admin-ops.ts`;
  these references do not establish runtime existence, purpose, ownership, or
  security.
- No tracked parent draft-group or buyer-side requirement-item table was
  identified. PO/invoice line items in
  `supabase/migrations/00167_phase5a_progressive_invoicing_and_line_items.sql`
  are downstream execution/accounting records, not buyer-side RFQ items.

**NOT VERIFIED:** Whether `requirement_specifications` exists in the relevant
runtime database, what it represents, whether another equivalent table
exists, and whether external/manual migrations or consumers exist.

### B. Constraints and relationships

**VERIFIED FROM RUNTIME:** None.

**VERIFIED FROM REPOSITORY:** The tracked core schema defines one RFQ per
requirement through the unique `rfqs.requirement_id` FK
(`00002_core_tables.sql`). Requirement taxonomy FKs and the normalization
trigger are added in `00014_requirement_intake_columns.sql`. The repository
does not establish runtime constraints, indexes, or delete/update behavior
beyond those migration definitions.

**NOT VERIFIED:** Effective runtime PKs, unique/check constraints, foreign-key
actions, indexes, and any schema drift.

### C. Security

**VERIFIED FROM RUNTIME:** None.

**VERIFIED FROM REPOSITORY:** `00004_rls_policies.sql` defines organization
membership and role policies for requirements/RFQs. Migration
`00281_individual_personal_ownership_foundation.sql` adds personal-owner
policies, an organization-or-profile XOR ownership constraint, and ownership
immutability for requirements/RFQs. These are checked-in definitions, not
proof of effective runtime policies or grants.

**NOT VERIFIED:** Runtime RLS enabled/forced state, effective policy
expressions and roles, table/sequence grants, role memberships, security
definer ownership/search paths, and any later manual policy changes.

### D. Publication, lifecycle, and Individual ownership

**VERIFIED FROM RUNTIME:** None.

**VERIFIED FROM REPOSITORY:**

- The tracked publication RPC history includes
  `00030_publish_requirement.sql`, `00048_market_intel_on_requirement.sql`,
  `00166_buyer_auto_approval_and_free_rfq_credits.sql`, and
  `00180_fix_signup_and_publish_audit.sql`. The checked-in `00180` definition
  uses organization membership/role checks and creates the RFQ while
  transitioning/auditing the requirement within the RPC transaction.
- The tracked RPC requires a `DRAFT` requirement and checks for an existing
  RFQ; a later call after successful publication does not return the prior
  successful result as an idempotent retry.
- `00281_individual_personal_ownership_foundation.sql` makes
  `organization_id` nullable on requirements/RFQs, adds `owner_profile_id`,
  and enforces exactly one of organization or profile ownership. Its
  migration notes warn that downstream lifecycle functions still depend on
  organizations. `00282_individual_personal_procurement_lifecycle.sql`
  provides personal-owner defaults.

**NOT VERIFIED:** The deployed RPC/function definitions and triggers,
transaction behavior under runtime conditions, effective retry/concurrency
behavior, deployed Individual publication compatibility, or runtime
dependencies on organization membership.

### E. Migration state

**VERIFIED FROM RUNTIME:** No migration ledger was obtained.

**VERIFIED FROM REPOSITORY:** The requested migration files are present in
the tracked repository:

| Concern | Repository migration evidence |
|---|---|
| Core requirements/RFQs | `00002_core_tables.sql` |
| Baseline RLS | `00004_rls_policies.sql` |
| Typed intake fields | `00014_requirement_intake_columns.sql` |
| Legacy taxonomy/specification backfill | `00020_taxonomy_backfill.sql` |
| Publication RPC | `00030_publish_requirement.sql`; later definitions include `00180_fix_signup_and_publish_audit.sql` |
| Downstream PO/invoice line items | `00167_phase5a_progressive_invoicing_and_line_items.sql` |
| Individual ownership foundation | `00281_individual_personal_ownership_foundation.sql` |
| Individual procurement lifecycle | `00282_individual_personal_procurement_lifecycle.sql` |
| `requirement_specifications` | No defining tracked migration identified; cleanup references are not a migration ledger entry. |

**NOT VERIFIED:** Which versions are applied in the relevant runtime
environment, its migration head, whether migrations were edited/applied
outside the repository, and whether its schema corresponds to the intended
pilot.

## Conclusions and limitations

1. The repository supports `requirements` as its defined child requirement
   record and `rfqs` as its one-to-one publication record. This is a
   repository conclusion only.
2. The repository does not establish a buyer-side item lifecycle or group
   relationship. It does not establish whether an equivalent exists at
   runtime.
3. Runtime existence or purpose of `requirement_specifications` is
   **NOT VERIFIED**; absence of tracked DDL is not proof of runtime absence.
4. Runtime ownership, RLS/grants, publication behavior, Individual
   compatibility, and migration state are all **NOT VERIFIED**.
5. The prior repository-only architecture assessment is in
   `B3-03-REQUIREMENT-SPECIFICATIONS-SCHEMA-DECISION.md`. It remains
   conditional until authoritative runtime evidence is reviewed.

## Missing access/evidence required

Obtain from the authorized database/schema owner, without credentials or
customer data:

- The relevant pilot database/environment identity and purpose.
- Snapshot timestamp and owner confirmation that it represents the current
  intended pilot schema.
- Applied migration versions/names and migration head.
- The scoped metadata requested in the DEP-01 brief: requirement/RFQ and
  specification/group/item tables, constraints/relationships/indexes,
  effective RLS/grants/role memberships, and publication/ownership function
  definitions and dependencies.
- Confirmation whether `requirement_specifications` exists and, if so, its
  owner, purpose, consumers, and security metadata.

No further access should be attempted until the owner supplies this evidence
through an already-authorized process. This report does not close DEP-01 and
does not authorize DEP-02 or DEP-03.
