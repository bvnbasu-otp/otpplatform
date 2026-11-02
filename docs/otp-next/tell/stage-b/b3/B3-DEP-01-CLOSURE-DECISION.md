# DEP-01 Evidence Reconciliation and Closure Decision

## Verdict

**OPEN — SPECIFIC EVIDENCE MISSING**

The supplied runtime snapshot contains no authoritative runtime schema
metadata, migration ledger, or database-owner confirmation. Repository
evidence supports a conditional architecture direction but cannot establish
runtime schema identity, object existence, effective security, or Individual
publication compatibility. The DEP-01 closure criteria are therefore not met.

## Evidence reviewed

- `B3-03-REQUIREMENT-SPECIFICATIONS-SCHEMA-DECISION.md` — repository
  investigation and conditional architecture recommendation.
- `B3-DEP-01-RUNTIME-SCHEMA-SNAPSHOT.md` — explicitly reports that no
  authoritative runtime snapshot or owner confirmation was provided and that
  no runtime metadata was inspected.
- `B2-DEPENDENCY-01-SCHEMA-DECISION.md` — prior repository-only evidence
  boundary and unresolved status.
- Repository migrations:
  - `supabase/migrations/00002_core_tables.sql`
  - `supabase/migrations/00004_rls_policies.sql`
  - `supabase/migrations/00014_requirement_intake_columns.sql`
  - `supabase/migrations/00020_taxonomy_backfill.sql`
  - `supabase/migrations/00030_publish_requirement.sql`
  - `supabase/migrations/00167_phase5a_progressive_invoicing_and_line_items.sql`
  - `supabase/migrations/00180_fix_signup_and_publish_audit.sql`
  - `supabase/migrations/00281_individual_personal_ownership_foundation.sql`
  - `supabase/migrations/00282_individual_personal_procurement_lifecycle.sql`
- Relevant repository model/type evidence:
  `packages/database/src/generated/supabase.ts` and
  `packages/domain/src/types/buyer-persona.ts`.

No Docker, database commands, migrations, tests, builds, or application
workflows were run for this reconciliation.

## Runtime/repository reconciliation

| Question | Verified from repository | Verified from runtime |
|---|---|---|
| `requirements` source of truth for one child scope | Yes. `00002` defines requirements; `00014` adds typed category/subcategory, scalar quantity/unit, and attributes. | **No.** Runtime table/column metadata and intended schema identity were not provided. |
| Requirement-to-RFQ relationship | `00002` defines a unique FK from `rfqs.requirement_id` to `requirements(id)`, making the tracked relationship one-to-one. | **No.** Runtime constraints and FK actions are unknown. |
| Existing buyer-item persistence | No tracked buyer item/group model was identified. `structured_specs` is a compatibility mirror; typed attributes and scalar quantity are requirement-level. | **No.** Runtime item-equivalent tables were not enumerated. |
| `requirement_specifications` existence and purpose | No defining tracked DDL or generated type found. Cleanup/admin references do not establish its meaning or existence. | **No.** Explicitly unknown in the runtime snapshot. |
| Parent and child associations | No tracked parent-group relationship was identified. `requirements` can remain the independent child scope; the RFQ relation is child-local. | **No.** Runtime group/parent tables and constraints are unknown. |
| Individual ownership | `00281` makes `organization_id` nullable, adds `owner_profile_id`, enforces exactly one owner, and adds personal RLS. `00282` adds personal-owner defaults. | **No.** Runtime columns, constraints, policies and lifecycle behavior were not supplied. |
| RWA/MSME ownership | Repository persona resolution maps RWA-like types to `RWA`; organization procurement is governed by membership/role policies. | **No.** Runtime organization/persona records and effective membership authorization are unknown. |
| RLS and grants | `00004` and `00281` describe historical organization and personal policies. | **No.** Runtime RLS state, effective policies, grants and role memberships were not supplied. |
| Publication lifecycle | `00180` defines a transactional publication RPC with organization membership/role checks, a DRAFT guard, existing-RFQ check, RFQ creation and audit. A retry after success is not an idempotent success response. | **No.** Runtime RPC definition, triggers, transaction behavior and Individual compatibility are unknown. |
| Downstream line items | `00167` defines PO/invoice financial/execution line items; these are distinct from buyer-side draft items. | **No.** Runtime tables were not enumerated. |
| Applied migration state | Migration files are present in the repository. | **No.** No migration ledger or runtime migration head was provided. |

## Persistence and ownership decision

For repository-level design, retain `requirements` as the single-category
child requirement and its existing one-to-one `rfqs` relationship as the
independent publication boundary. Do not treat the parent group as an RFQ or
combined publication transaction. Preserve whole-RFQ supplier quotation and
do not use PO/invoice items as buyer-side requirement items.

The repository does not establish a buyer-item lifecycle for stable item
identity, customer-stated versus suggested origin, `ACCEPTED`/`SUGGESTED`/
`DELETED` state, edit preservation, tombstones, or item history. If the
authoritative runtime snapshot confirms that no suitable existing model
provides these semantics, the justified extension is a normalized
buyer-item relation linked to each child requirement. A separate
orchestration-only parent group and child link are also needed if no equivalent
runtime association exists. Derive and enforce authorization through the
child's existing organization or personal-profile owner; do not duplicate
client-supplied ownership claims.

This is conditional: it is not evidence that these tables are absent at
runtime, nor authorization to implement or migrate them. Customer-stated
items must remain initially `ACCEPTED`; OTP suggestions initially
`SUGGESTED`; child confirmation remains mandatory; deletion must preserve
immutable audit history. Each child must retain an independent publication
boundary and discovery must follow only that child's successful publication.

## Material unresolved items

1. The authoritative pilot database/environment identity, purpose, and
   confirmation that its schema is the current intended pilot schema.
2. A timestamped runtime metadata snapshot covering relevant tables/columns,
   constraints, indexes, parent/item equivalents, and the actual purpose and
   consumers of `requirement_specifications`.
3. The applied migration ledger and runtime migration head.
4. Effective RLS enabled/forced state, policy definitions, grants, relevant
   role memberships, and security-definer function metadata.
5. Runtime `publish_requirement` definition and dependencies, including
   organization-membership checks and actual Individual publication
   compatibility.
6. Runtime confirmation that ownership rules and parent/child/RFQ
   relationships can support Individual, RWA and MSME without bypassing
   existing entitlements or lifecycle controls.

The checked-in `00180` organization-member checks and the compatibility caveat
in `00281` are a concrete repository-level Individual concern; they do not
prove runtime failure or success. Runtime evidence is necessary to resolve it.

## Why the verdict remains open

Closure requires authoritative runtime schema identity, buyer-item persistence
evidence, unambiguous parent/child/RFQ relationships, persona-compatible
ownership, effective security evidence, and no material unresolved runtime
dependency. The runtime snapshot verifies none of those runtime facts. Treating
repository migrations or generated types as a substitute would improperly
convert unknown runtime state into an assumption.

## Smallest next action

Ask the authorized database/schema owner to provide a timestamped,
credential-free metadata snapshot for the identified current OTPNext pilot
environment, including its purpose and applied migration ledger. The snapshot
must specifically resolve `requirement_specifications` and any equivalent
item/group models, ownership constraints, effective RLS/grants, and deployed
publication-function definitions. No further access or inspection is
authorized by this decision.

DEP-02, DEP-03 and DEP-04 were not started. Do not declare B2 technically
closed.
