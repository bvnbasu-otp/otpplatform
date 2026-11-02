# B3-03 — Authoritative Requirement Specification Schema Decision

## Current DEP-01 conclusion

**DEP-01 verdict: EVIDENCE COMPLETE — RUNTIME VALIDATION REQUIRED.**

The checked-in migration history and generated database types establish
`requirements` as the current repository-defined source of truth for a
single-scope buyer requirement and `rfqs` as its independently published,
one-to-one RFQ. They do **not** define a buyer-side requirement-item model or
a parent draft-group relationship. No tracked migration or generated type
defines `requirement_specifications`.

The name does occur in reset/admin cleanup code. Those references do not
establish that a table exists, what it means, who owns it, or how it is
secured. Its presence in a deployed or externally managed database therefore
remains unverified. Do not reuse, create, or alter a table with that name based
only on those references.

The smallest safe architecture for the frozen B1 model is additive:

1. Keep each child in the existing `requirements` table and retain its existing
   one-to-one `rfqs` publication relationship.
2. Add a parent draft-group record solely for orchestration and recovery, with
   an optional parent link from each child requirement. A group is not an RFQ
   and does not own publication status or a combined transaction.
3. If authoritative schema-owner evidence does not reveal a suitable existing
   item model, add a normalized buyer-side item table linked to a child
   `requirements` row. Do not use PO/invoice items or make an undocumented JSON
   convention authoritative.
4. Derive access to items through the parent requirement's established
   organization or personal-profile ownership. Preserve Individual, RWA and
   MSME access rules.
5. Continue publishing each confirmed child through the protected
   `publish_requirement` lifecycle, one child at a time; do not let the group
   bypass its checks.

This is an evidence-backed architecture decision, not a claim that the
proposed group/item schema is implemented. No authoritative project database
or hosted metadata was inspected. The temporary bootstrap attempt did not
apply the project migration chain and cannot establish the project's runtime
schema or effective access rules.

## Scope and frozen B1 constraints

This record resolves only DEP-01's repository evidence and schema direction.
It does not reopen B1 product decisions, authorize implementation, close
DEP-02/DEP-03, or declare B2 technically closed.

The design below preserves the frozen decisions:

- The parent is an organizing/recovery container, never a combined RFQ.
- Each independently reviewable child has one category and is published as
  its own RFQ.
- Customer-stated items start `ACCEPTED`; OTP-suggested items start
  `SUGGESTED`.
- The customer confirms a child before it can publish.
- Each child's publication is atomic and retry-safe; discovery begins only
  after that child's successful publication.
- Supplier quotations remain whole-RFQ; no per-child-item quotation model is
  introduced.
- Deletion retains immutable history and audit evidence.

## Executive evidence summary

| Question | Repository evidence | Decision |
|---|---|---|
| Current source of truth? | `requirements` stores the buyer's requirement, taxonomy, scalar intake fields, attributes, and lifecycle; `rfqs.requirement_id` is unique. | Retain `requirements` as the child/RFQ source of truth. |
| Does `requirement_specifications` exist? | No defining tracked migration or generated table type was found. There are reset/admin cleanup references, including one admin delete call. | Its runtime existence and meaning are unknown; cleanup references are not schema evidence. |
| Can existing scalar/JSON fields model B1 item state? | They do not define stable item identity, origin, item status, tombstones, or item-level history. | Do not treat them as the authoritative buyer-item lifecycle. |
| Can PO/invoice lines be reused? | They are downstream financial/execution records linked to purchase orders and invoices. | No. |
| What ownership model applies? | Organization-owned records use organization membership/roles; Individual records use nullable `organization_id` plus `owner_profile_id`. | Preserve the XOR organization-or-personal-profile ownership model. |
| Is a separate buyer-side item table required? | No suitable item-level contract appears in tracked schema; the live/external schema is unverified. | Conditionally add a normalized item table only after schema-owner/runtime evidence rules out an existing suitable model. |
| Is a draft-group relationship present? | No group/parent relation for requirements was found in the tracked schema or intake model. | A separate orchestration group and optional child link are needed for persisted multi-draft recovery. |

## Repository evidence boundary

This assessment covers the checked-in migrations, generated database types,
relevant application/domain models, intake data flow, RLS/ownership migrations,
publication RPC history, and line-item schema. Git history was also searched
for a migration defining `requirement_specifications`; no such definition was
found.

This is not a live-schema inspection. The repository alone cannot prove that
an external migration, manual database change, or deployed schema object does
not exist. Likewise, policy files show intended checked-in policy evolution,
not the effective grants/policies in a deployed environment.

## Existing schema inventory

| Object | Repository-defined role and relationships | Relevance to TELL |
|---|---|---|
| `requirements` | Buyer requirement row. Initially created with `organization_id`, `created_by`, `status`, title, description, and legacy `structured_specs`. Later migrations add taxonomy, scalar quantity/unit, typed attributes, quality/commercial data, delivery fields, and Individual ownership. | Current durable buyer draft and child scope. It has no item collection or group parent in the tracked schema. |
| `requirement_categories`, `requirement_subcategories` | Taxonomy records. Requirements hold `category_id` and `subcategory_id`; the normalization trigger derives/validates category consistency from the selected subcategory. | Supports one category/subcategory per child, not multiple procurement intents in one row. |
| `rfqs` | RFQ has a `requirement_id` FK with a unique constraint, plus its own lifecycle, sourcing, and ownership fields. | Existing one-requirement/one-RFQ basis for independent publication. |
| `rfq_invitations`, `quotes`, `quote_versions` | Invitations and quotes reference an RFQ; quotes are unique per `(rfq_id, supplier_id)` and versions snapshot the quote. | Existing quote lifecycle is RFQ-wide. Do not convert it to per-item quotation. |
| `requirement_attachments` and shared attachment view | Attachments are associated with requirements; the generated type includes a shared view. | Supporting requirement evidence, not an item acceptance/state model. |
| `procurement_stage_events` | Lifecycle events reference a requirement and optionally an RFQ/order. | Requirement/RFQ process history, not buyer-item storage. |
| `audit_events` | Generic actor/entity/payload event log; the core schema and later repository policy/reset references protect audit retention. | Can record item-level events if a trusted write path supplies stable item IDs and snapshots. Verify effective RLS/grants before relying on it. |
| `purchase_order_line_items` | Linked to a purchase order; includes quantity, unit, prices, tax and financial totals. | Created in downstream execution after award; not a buyer draft/RFQ-item substitute. |
| `invoice_line_items` | Linked to an invoice, optionally a PO line item and milestone; includes financial amounts. | Accounting records, not buyer requirement specifications. |
| `requirement_specifications` | No tracked DDL/type/API contract found. It appears in reset/purge references and an admin cleanup deletion call. | Unknown object and semantics; not an established buyer-side source of truth. |
| Parent draft group / requirement items | No corresponding tracked table or relationship found. | These are concrete gaps against the frozen multi-child/item lifecycle. |

### Relevant migration chronology

| Migration | Evidence and architectural effect |
|---|---|
| `supabase/migrations/00001_enums.sql` (requirement status lines 7–17; organization type lines 87–93) | Requirement lifecycle statuses are `DRAFT`, `SUBMITTED`, `RFQ_CREATED`, and later procurement states; there is no item-level `ACCEPTED`/`SUGGESTED` status. Organization enum includes `INDIVIDUAL`, `MSME`, and `COMMUNITY`, but not a literal `RWA` value. |
| `supabase/migrations/00002_core_tables.sql` (requirements/RFQs lines 74–111) | Creates `requirements` and `rfqs`; `rfqs.requirement_id` is unique and references `requirements(id)`. RFQ invitations and quotes reference the RFQ. |
| `supabase/migrations/00004_rls_policies.sql` (requirements/RFQ lines 151–194) | Establishes organization membership/role policies for requirements and RFQs. These are historical baseline policies, later extended for personal ownership. |
| `supabase/migrations/00014_requirement_intake_columns.sql` (typed fields lines 41–80; normalization/mirror logic lines 89–189) | Adds taxonomy, scalar quantity/unit, JSON attributes/quality/commercial fields, and constraints/indexes. Documents `structured_specs` as a legacy compatibility mirror and directs new code to typed fields/attributes. |
| `supabase/migrations/00020_taxonomy_backfill.sql` (lines 137–188) | Backfills legacy `structured_specs` values into typed scalar fields and taxonomy attributes. It does not create item identities or lifecycle state. |
| `supabase/migrations/00030_publish_requirement.sql`, `00048_market_intel_on_requirement.sql`, `00166_buyer_auto_approval_and_free_rfq_credits.sql`, `00180_fix_signup_and_publish_audit.sql` | Chronological `publish_requirement` definitions. The tracked final definition performs requirement transition, RFQ creation, credit handling, and publication audit in the protected RPC transaction. It contains organization-role access checks. |
| `supabase/migrations/00148_strict_linear_15_step_procurement_pipeline.sql` | Adds lifecycle stage events referencing requirements/RFQs; no buyer-item table. |
| `supabase/migrations/00167_phase5a_progressive_invoicing_and_line_items.sql` | Adds PO and invoice line items with prices/tax/financial validation and backfill. These are downstream accounting/execution records. |
| `supabase/migrations/00281_individual_personal_ownership_foundation.sql` (lines 1–112) | Adds `owner_profile_id`, makes `organization_id` nullable on requirements/RFQs, enforces exactly one of organization or profile ownership, adds personal-row RLS, and makes ownership scope immutable. Its header explicitly cautions that several downstream lifecycle functions still read organizations. |
| `supabase/migrations/00282_individual_personal_procurement_lifecycle.sql` (personal-owner helper/trigger lines 146–175) | Defaults personal ownership on Individual procurement records. It does not establish a buyer-item/group schema. |
| Reset/cleanup migrations `00077`, `00124`, `00125`, `00129`, `00133`, and `00184` | Contain cleanup references to `requirement_specifications`, but no defining table migration was found. |

### Ownership and RLS evidence

The base schema was organization-owned. Individual ownership was added
additively:

- Organization-owned requirements/RFQs have `organization_id` and no
  `owner_profile_id`; RWA and MSME personas use this organization scope.
- The database's organization enum has `COMMUNITY` rather than `RWA`.
  `packages/domain/src/types/buyer-persona.ts` resolves `COMMUNITY` and RWA-like
  organization strings to the product persona `RWA` (resolver around lines
  99–139).
- Individual requirements/RFQs use `organization_id = NULL` and a non-null
  `owner_profile_id`. Migration `00281` enforces exactly one owner using
  `num_nonnulls(organization_id, owner_profile_id) = 1`, adds owner indexes,
  and makes ownership immutable after creation.
- Organization access is membership/role based. Individual row policies
  constrain personal rows to the owning profile (or platform admin for reads).
  For new group/item rows, access should be inherited through the parent
  requirement rather than trusting a client-supplied owner or duplicating
  unverified ownership.
- Proposed group rows must have the same single ownership scope as their
  children. Enforce that invariant in the database, not only in the client.
  Proposed item rows should be protected by policies that join through the
  owning requirement and apply the same organization-role or personal-profile
  checks.

**Important compatibility caveat:** `00281` explicitly says downstream
lifecycle functions still read organizations. The tracked final
`publish_requirement` definition in `00180` checks organization membership and
role. The repository evidence therefore does not prove that protected
publication is Individual-compatible for `organization_id = NULL`. This
must be resolved and tested in the relevant later lifecycle dependency; it is
not a reason to weaken B1 ownership or bypass publication checks.

### Application models and current data flow

1. The intake page/hook stores a scoped local recovery copy through
   `apps/web/src/features/intake/lib/intake-storage.ts`; the hook hydrates and
   saves through that helper in
   `apps/web/src/features/intake/hooks/use-intake-draft.ts`. The scoped local
   copy is recovery, not a second server source of truth.
2. `apps/web/src/features/intake/api/draft.ts` creates, reads, and updates a
   row in `requirements`. The server draft is a real `DRAFT` requirement, and
   `toDraft` maps requirement columns into the intake model.
3. `apps/web/src/features/intake/types/intake-draft.ts` models one
   `requirementId`, one category/subcategory, one quantity/unit and a
   requirement-level attribute record. It has no child item list, item
   provenance/status, or parent group reference.
4. `packages/domain/src/parser/requirement-parser-port.ts` exposes one
   `ParsedRequirement` with one category/subcategory, one quantity/unit,
   attributes, missing required attributes and one confidence value. It has
   no multi-intent collection, item origin/status, or separate
   category/subcategory confidence.
5. The generated Supabase table types include `requirements` and `rfqs`, but
   not `requirement_specifications` or a requirement-item/group table.
6. No relevant intake/requirement Zod schema or active buyer-side
   `requirement_specifications` read/write API was found. The admin cleanup
   call in `apps/web/src/features/admin/api/admin-ops.ts` (around line 658)
   attempts to delete rows from that name as part of broad reset behavior;
   this is not evidence of an item API or table contract.

There is an application/database nullability mismatch to carry into later
implementation review: the generated database type and `00281` allow a null
`requirements.organization_id`, while `RequirementRow`/`IntakeDraft` in the
intake API/type currently model `organizationId` as a non-null string. The
create path can insert `organization_id: null`; the mapped draft should be
made type-correct before relying on it for Individual group/item ownership.

### Duplicate and compatibility representations

- `requirements.structured_specs` is explicitly retained as a legacy JSON
  mirror; `00020` backfills legacy values into typed fields and attributes.
  Existing consumers and compatibility behavior mean it should not be
  repurposed as an undocumented authoritative multi-item lifecycle store.
- `requirements.attributes` is taxonomy/category-attribute data attached to
  one requirement. It does not identify independent items or item state.
- `requirements.quantity` and `unit` are scalar fields for the current
  requirement scope. They cannot represent a collection of independently
  accepted/deleted items.
- PO/invoice lines are downstream commercial records with prices/taxes and
  must not be used to represent buyer input.
- `audit_events` and `procurement_stage_events` describe events/lifecycle;
  neither is a mutable item collection.

These are related representations, but the repository does not establish
duplicate active buyer-item stores.

## B1 consistency assessment

| Frozen requirement | Existing support | Gap / consequence |
|---|---|---|
| One category per child | `requirements.category_id`/`subcategory_id`, taxonomy FK, consistency normalization. | Parser and intake currently represent one requirement only; multi-intent splitting is not in this model. |
| Independent RFQ per child | Unique `rfqs.requirement_id` FK to `requirements`. | Parent group relation is absent; each child must continue using its own requirement/RFQ lifecycle. |
| Customer-stated `ACCEPTED`, OTP-suggested `SUGGESTED` | Requirement-level status is a procurement lifecycle enum; parser result is a proposal. | There is no persisted item-level origin/state contract. Do not overload requirement or RFQ status. |
| Confirmation before publication | Existing requirement draft/update and protected publish API exist. | No tracked per-child confirmation record/guard is evident in the item/group model; later implementation must enforce confirmation for that child. |
| Atomic, retry-safe child publication | Protected publication RPC creates the RFQ and transitions/audits the requirement within the RPC transaction; RFQ uniqueness and the DRAFT guard prevent duplicate publication. | The tracked RPC rejects a second call after the requirement leaves DRAFT; it does not itself return the prior successful result as an idempotent retry. Client recovery/read-after-retry and a per-child confirmation guard need explicit design. It has no group or accepted-item confirmation input. Preserve quotas and role/ownership guards; do not publish a group atomically. Individual compatibility is unresolved as above. |
| Discovery after successful child publication | Existing publication lifecycle has a protected server boundary. | The exact discovery sequencing integration is outside this schema finding and must be checked in the publication dependency; a group must not trigger discovery itself. |
| Whole-RFQ supplier quotation | Quotes and invitations are keyed to RFQ; quote uniqueness is per RFQ/supplier. | Proposed buyer items must not introduce quote-per-item behavior. Supplier projections/quotation compatibility require later contract tests. |
| Deletion keeps history | Generic audit event model and requirement/RFQ lifecycle events exist. | No item tombstone/history contract exists. Future delete must be a state transition plus immutable audit, not a physical item delete or parser-driven resurrection. |
| Multiple drafts and recovery | Local scoped draft recovery and server-side single requirement draft exist. | No persisted group or parent-child draft navigation/recovery relationship exists. |

## Selected architecture decision

### Current source of truth

Keep `requirements` as the durable, independently reviewable child scope and
keep its existing one-to-one `rfqs` relationship as the publication boundary.
Do not introduce a combined RFQ or replace the existing RFQ/quote lifecycle.

### Parent and item relationships (proposed, not implemented)

```text
Buyer owner scope
  └── requirement_draft_groups (orchestration only; no RFQ/publication)
        ├── requirements (child A; one category) ── 0..1 rfqs
        │     ├── requirement_items (buyer-stated/suggested items)
        │     └── audit_events (append-only item/group events)
        └── requirements (child B; one category) ── 0..1 rfqs
              ├── requirement_items
              └── audit_events

Each rfq ── invitations / whole-RFQ quotes / quote versions
```

The parent stores the original customer description and owner scope needed for
recovery/orchestration. Each child retains independent requirement/RFQ status,
category, confirmation, publication and recovery. No parent-level publication
transaction or combined quote is introduced.

### Buyer item contract (proposed, not implemented)

If authoritative runtime/schema-owner evidence does not reveal a suitable
existing object, a normalized table (candidate name
`requirement_items`) should be linked by FK to exactly one child
`requirements` row. Candidate fields/constraints:

- Stable UUID primary key; child `requirement_id`; stable client/parser
  idempotency key and position.
- Description and item classification (`PRODUCT`, `SERVICE`, or `REPAIR`).
- Nullable quantity/unit and typed or taxonomy-validated specification
  attributes; nullable values remain unknown rather than being fabricated.
- Origin (`CUSTOMER_STATED` or `OTP_SUGGESTED`) kept separate from workflow
  status (`ACCEPTED`, `SUGGESTED`, or `DELETED`).
- Initial status derived/enforced from origin: customer-stated items are
  `ACCEPTED`; OTP suggestions are `SUGGESTED`.
- Version/updated timestamp and actor metadata for optimistic concurrency and
  preservation of buyer edits.
- A stable identity that lets parser refreshes update only untouched
  suggestions, never overwrite customer edits, and never recreate a deleted
  suggestion. Do not rely on array order or description text as identity.
- A soft-delete transition to `DELETED`, with an immutable audit event
  containing the actor, item ID, and sufficient before/after snapshot. Do not
  cascade-delete historical item rows when a child is removed; use a
  restrictive FK or a separately retained history strategy.

The item table should reference the child requirement, not the parent group:
items belong to one independently reviewable category scope and therefore
remain attached to the same RFQ child throughout recovery/publication. A
parser refresh must not move an existing item across child scopes.

### Why not extend current fields or reuse `requirement_specifications`?

1. Adding another JSON convention to `structured_specs` would not provide
   database-enforced stable item identity, origin/state consistency,
   tombstones, item ownership, or a reliable concurrent-edit contract. It
   would also conflict with the explicitly documented legacy-mirror role.
2. Scalar fields can represent only one requirement-level quantity/unit and
   cannot independently accept/delete multiple items.
3. The existing taxonomy attributes are requirement-level and do not have
   item identity/state.
4. `requirement_specifications` has no verified repository DDL, generated
   type, or buyer API contract. Reusing an unknown object would be speculation,
   not the smallest safe change.
5. PO/invoice line tables have the wrong lifecycle, ownership parent, and
   financial semantics.

Therefore the smallest safe **repository-defined** extension is one group
orchestration table/link plus one normalized buyer-item table, subject to the
runtime/schema-owner evidence gate. Do not add a separate item event table
unless review proves the existing append-only audit log cannot safely persist
and expose the required item history.

## Migration and compatibility proposal (not authorized or executed)

If the schema-owner/runtime evidence confirms the gaps above:

1. Add an owner-scoped `requirement_draft_groups` table with a stable ID,
   original text, timestamps, and exactly one of `organization_id` or
   `owner_profile_id`. Apply the same XOR ownership invariant as requirements.
2. Add a nullable FK from `requirements` to the group, with an index. Existing
   requirements remain valid standalone drafts/RFQs. Ensure child/group owner
   scopes match using a database-enforced constraint/trigger; do not trust a
   client-provided group ID.
3. Add `requirement_items` with FK to `requirements`, stable item ID,
   position/idempotency key, description/classification, quantity/unit,
   attributes, origin, state, version and actor/timestamps. Add checks for
   supported values and valid quantity; unique constraints for stable
   idempotency within a child and item order as appropriate; indexes on
   `(requirement_id, status)` and stable item identity.
4. Enable RLS. Item select/insert/update must be authorized through the parent
   requirement: organization membership and allowed buyer role for RWA/MSME;
   matching `owner_profile_id` for Individual. Validate group ownership and
   child ownership in the database. Preserve existing platform-admin and
   service-role conventions, and do not grant suppliers access to buyer-only
   edit/acceptance metadata.
5. Record item accept/edit/delete and child confirmation/publication through
   trusted server/RPC paths. Append immutable audit events; ensure item state
   changes and their audit records are atomic. Ensure soft deletion and
   parser retries cannot resurrect deleted items.
6. Update application/domain parser contracts, generated DB types, server
   draft API, scoped local recovery payload and intake UI only after separate
   implementation authorization. Keep supplier quotation keyed to RFQ, not
   item.

### Data migration and existing RFQ compatibility

- Existing `requirements`, RFQs, invitations, quotes, and downstream records
  are not re-parented or re-keyed. New group links are nullable so existing
  workflows and RFQs remain valid.
- Do not auto-convert every scalar requirement into an item: a scalar may
  describe the whole service/project scope. Only backfill when its meaning is
  unambiguous and separately reviewed; otherwise leave the child item's
  collection empty and preserve the original requirement fields.
- Do not infer customer-stated versus suggested origin, quantities, prices,
  brands, or specifications from ambiguous legacy JSON.
- New child requirements keep existing taxonomy constraints and the unique
  requirement-to-RFQ relationship. Each publication uses the existing
  protected lifecycle independently.
- Do not change supplier quote cardinality or make suppliers quote each
  buyer item. Supplier-facing display compatibility must be validated without
  exposing buyer-only metadata.
- A rollback plan for any future implementation must preserve existing
  requirement/RFQ data and audit history. If groups/items have been used,
  rollback must stop new writes and retain/export those records rather than
  dropping them or cascading them away.

## Remaining uncertainties and closure evidence

### Unresolved technical uncertainties

1. Whether `requirement_specifications` or an equivalent object exists in the
   deployed/disposable schema, who owns it, and whether it has consumers not
   represented in this repository.
2. Whether the authoritative environment has migrations or manual changes
   beyond this checked-in migration history.
3. Effective deployed RLS, grants, triggers, and RPC definitions.
4. How the existing publication/entitlement lifecycle handles personal
   ownership. The tracked `00180` organization checks and `00281` lifecycle
   warning make this a concrete compatibility concern, not a presumed
   supported behavior.
5. The exact supplier-facing requirement projection and discovery trigger
   sequencing after publication; these must remain whole-RFQ and post-success.
6. The intake `organizationId` non-null application type versus the nullable
   Individual database ownership field.
7. Whether existing `audit_events` policies and write paths can enforce
   immutable item history for all three personas without a dedicated event
   relation.

### Exact evidence needed to close DEP-01 fully

Obtain from the database/schema owner:

- A versioned schema snapshot or migration ledger for the authoritative
  environment, naming the environment and migration head.
- DDL and metadata for `requirement_specifications` and any equivalent
  requirement item/group tables, including columns, constraints, FKs, indexes,
  triggers, ownership, grants, RLS policies and views.
- The authoritative definitions/consumers for any existing specification
  object, including application/API and RPC references outside this checkout.
- Confirmation whether the object is current, legacy, optional, externally
  managed, or absent.
- Evidence for the effective requirement/RFQ publication RPC and RLS behavior
  for Individual, RWA, and MSME ownership.

If owner-provided evidence is unavailable, a separate authorization must name
a disposable, isolated environment that reproduces the relevant schema and
permit metadata-only inspection. A blank local database built from this
repository can confirm only the tracked migrations; it cannot establish an
external deployment's state. No such inspection is authorized by this task.

## Original assessment history

The original B3-03 assessment concluded **“Outcome D — unresolved because
authoritative schema evidence is unavailable.”** It correctly declined to
assume that `requirement_specifications` was present or absent and listed the
needed external evidence. The present revision preserves that decision's
historical rationale while adding the repository-wide schema, ownership,
application-flow, and B1 compatibility evidence now inspected.

The original caution remains valid for runtime state. The repository evidence
now supports a conditional architecture decision: keep `requirements`/`rfqs`
as the child/publication source of truth; do not use the unverified
`requirement_specifications` name; and add normalized group/item persistence
only if authoritative schema evidence confirms those capabilities are absent.

## Phase 0 — read-only environment baseline

Captured before creating any inspection resource:

- Workspace: `G:\My Drive\otp`; branch `main`; HEAD
  `77888fba12c6cee441017986a663393d92d4b649`.
- Staged changes: none.
- Existing worktree: 4 modified tracked files, 4 untracked intake source/test
  files, and 35 untracked TELL evidence documents. These were present before
  this inspection and are preserved; no cleanup/reset/stash operation was run.
- Docker Engine is reachable (`29.9.2`); Supabase CLI is available
  (`2.116.0`). Host `psql` and `pg_isready` are unavailable.
- Existing database containers were running at inventory time:
  `supabase_db_otp-local` (`public.ecr.aws/supabase/postgres:17.6.1.166`,
  container `836abf82fd06`, database `postgres`, published on host port
  `54322`) and `otp-prod-db` (`supabase/postgres:15.1.1.78`, container
  `8460dce3daed`, database `postgres`, loopback port `5432`). The former is
  **not assumed disposable**; the latter is explicitly excluded from this
  task. Neither database was connected to or queried.
- Existing project resources observed: `supabase_network_otp-local` with
  volume `supabase_db_otp-local`, and `otp_default` with volume `otp_db-data`.
  The existing WAHA container `otp_whatsapp_gateway`
  (`d4e3a95a869c`, image `otp-waha-paired:latest`) was running on
  `otp_default`; its state and network were not changed.
- Other running containers included the existing Supabase local stack and
  `otp-prod-auth`, `otp-prod-gateway`, `otp-prod-realtime`, and
  `otp-prod-rest`. No container was stopped, restarted, removed, or recreated.
- The repository Supabase config identifies project `otp-local`; its database
  port is `54322` and configured major version is `15`. No credentials or
  secret values were read. The candidate loopback port `15432` had no listener.
- `supabase/migrations` contains 331 SQL files. No schema dump/snapshot
  candidate was found in the inspected `docs`, `supabase`, or `packages`
  paths. No existing database was designated an approved disposable target.

### Complete pre-existing Docker inventory

All containers below were running before temporary inspection attempts.
Published ports are written as host-to-container; ports without a host
binding are container-internal. No listed resource was stopped, restarted,
removed, or recreated.

| Container (short ID) | Image | Status / published ports | Mounts | Network |
|---|---|---|---|---|
| `supabase_db_otp-local` (`836abf82fd06`) | `public.ecr.aws/supabase/postgres:17.6.1.166` | healthy; `0.0.0.0:54322->5432` | volume `supabase_db_otp-local:/var/lib/postgresql/data` | `supabase_network_otp-local` |
| `supabase_storage_otp-local` (`496ff689f2a9`) | `public.ecr.aws/supabase/storage-api:v1.77.5` | healthy; internal `5000` | volume `supabase_storage_otp-local:/mnt` | `supabase_network_otp-local` |
| `supabase_rest_otp-local` (`df896d999dec`) | `public.ecr.aws/supabase/postgrest:v14.5` | running; internal `3000` | none | `supabase_network_otp-local` |
| `supabase_realtime_otp-local` (`e8041a4e1f14`) | `public.ecr.aws/supabase/realtime:v2.129.3` | healthy; internal `4000` | none | `supabase_network_otp-local` |
| `supabase_inbucket_otp-local` (`79bf3de437a3`) | `public.ecr.aws/supabase/mailpit:v1.30.2` | healthy; `0.0.0.0:54325->1025`, `54326->1110`, `54324->8025` | none | `supabase_network_otp-local` |
| `supabase_auth_otp-local` (`f39ad7e3be68`) | `public.ecr.aws/supabase/gotrue:v2.197.0` | healthy; internal `9999` | none | `supabase_network_otp-local` |
| `supabase_kong_otp-local` (`9522ef762076`) | `public.ecr.aws/supabase/kong:2.8.1` | running; `0.0.0.0:54321->8000` | three email-template bind mounts under `/home/kong/templates/email/` | `supabase_network_otp-local` |
| `otp-prod-auth` (`5852fe86c528`) | `supabase/gotrue:v2.158.1` | running; `127.0.0.1:9999->9999` | none | `otp_default` |
| `otp-prod-gateway` (`28109f931522`) | `public.ecr.aws/supabase/kong:2.8.1` | healthy; `127.0.0.1:8000->8000` | bind mount to `/etc/kong/kong.yml` | `otp_default` |
| `otp_whatsapp_gateway` (`d4e3a95a869c`) | `otp-waha-paired:latest` | running; `127.0.0.1:3008->3000` | none | `otp_default` |
| `otp-prod-realtime` (`609da4ef71fc`) | `public.ecr.aws/supabase/realtime:v2.129.3` | running; internal `4000` | none | `otp_default` |
| `otp-prod-rest` (`7c84820a89ba`) | `postgrest/postgrest:v12.0.1` | running; internal `3000` | none | `otp_default` |
| `otp-prod-db` (`8460dce3daed`) | `supabase/postgres:15.1.1.78` | healthy; `127.0.0.1:5432->5432` | volume `otp_db-data:/var/lib/postgresql/data` | `otp_default` |

Other observed networks were Docker `bridge` (`b73229f6c51a`), `host`
(`602d33108704`), and `none` (`7effd781433f`).
`otp_default` (`7d06aa875a29`) contains the existing auth/gateway/realtime/
rest/database containers above; `supabase_network_otp-local`
(`ce42f637521e`) contains the local stack above.

| Existing volume | Created | Existing owner/project label |
|---|---|---|
| `otp_db-data` | `2026-09-03T01:48:04Z` | Docker Compose project `otp` |
| `supabase_db_otp-local` | `2026-10-20T06:48:32Z` | Compose/Supabase project `otp-local` |
| `supabase_edge_runtime_otp-local` | `2026-09-30T13:46:27Z` | Compose/Supabase project `otp-local` |
| `supabase_storage_otp-local` | `2026-08-30T02:14:20Z` | Compose/Supabase project `otp-local` |

No connection strings or credential values were printed.

The local snapshot and current database containers cannot answer the runtime
question without violating the target restrictions. Any permitted runtime
inspection must therefore use a separately named, isolated temporary target
only; it cannot establish the state of a hosted/production deployment.

## Phase 1 — disposable-target attempt and stop

No schema migrations were applied and DEP-02/DEP-03 were not started.

1. A direct disposable PostgreSQL attempt used a unique internal Docker
   network, dedicated volume, and Supabase PostgreSQL image. The container
   exited with code `2` because the image bootstrap expected the
   `supabase_admin` role; the attempt's only SQL query inspected that empty
   container's database/version, schemas, and standard roles. It read no
   application or user data. Its exact container, volume, and network were
   inspected and removed. An attempted migration-copy directory under the
   synced workspace was stopped before migrations were run and was removed.
   Sanitized creation commands were:

   ```text
   docker network create --driver bridge --internal otp_dep_inspect_net_20261101_1707
   docker volume create otp_dep_inspect_vol_20261101_1707
   docker run --detach --name otp_dep_inspect_db_20261101_1707 --network otp_dep_inspect_net_20261101_1707 --mount type=volume,source=otp_dep_inspect_vol_20261101_1707,target=/var/lib/postgresql/data --publish 127.0.0.1:15432:5432 --env POSTGRES_USER=postgres --env POSTGRES_DB=postgres --env POSTGRES_PASSWORD=[generated-value-omitted] --health-cmd "pg_isready -U postgres -d postgres" --health-interval 5s --health-timeout 5s --health-retries 30 public.ecr.aws/supabase/postgres:17.6.1.166
   ```

   Its only connection target was the disposable container itself via
   `docker exec ... psql -U postgres -d postgres`; no host/existing DB
   connection was made.
2. A fresh CLI-generated Supabase project was then created under the local
   Windows temporary directory with unique project ID
   `otp_dep_inspect_20261101_1707` and candidate ports `15423`–`15432`.
   `supabase start` did not honor the requested service exclusions: it created
   a database container with host binding `0.0.0.0:15432` and began pulling
   storage service resources. The start process was cancelled immediately.
   No `supabase db reset`, schema inspection, migration, or application query
   was run against this target.
   Sanitized CLI commands were `supabase init --workdir
   %LOCALAPPDATA%\Temp\otp_dep_inspect_20261101_1707` and
   `supabase start --workdir
   %LOCALAPPDATA%\Temp\otp_dep_inspect_20261101_1707 --exclude
   gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`.
   The observed database target was
   `supabase_db_otp_dep_inspect_20261101_1707` on host port `15432`, but the
   actual binding was `0.0.0.0:15432`; no connection was made.
3. Before cleanup, the CLI-created container, project-specific volume, and
   network were verified as uniquely named and attached only to that
   temporary project. The container ID was
   `0dcc690c5fb2f7022981d9b526fe3629191ecc2f93fa70b96ca78c29bd9fbadd`;
   its volume was `supabase_db_otp_dep_inspect_20261101_1707` and network was
   `supabase_network_otp_dep_inspect_20261101_1707`. All three were removed.
   The newly pulled, unused image
   `public.ecr.aws/supabase/postgres:17.6.1.165` (image ID
   `28f0e16a019e648089fc1a6d333549a55548f6019c15ae4bd7cd58b989027518`)
   had no dependent containers and was removed. The temporary config,
   generated local credentials, and startup log were also deleted.

**Stop condition:** the available Supabase CLI did not provide the required
localhost-only binding for its temporary database, and no existing approved
disposable database or authoritative schema snapshot was available. No
workaround against `otp-local`, `otp-prod-db`, or a hosted environment was
attempted. The DEP-01 runtime question therefore remains open; per the
required sequence, DEP-02 and DEP-03 were not inspected.

Cleanup verification found no temporary project container, volume, network,
config directory, or startup log. The image pulled only by the failed CLI
attempt was removed. The pre-existing local database, `otp-prod-db`, WAHA,
their networks, and their volumes remained running/unchanged.

### Follow-up target identification

The proposed follow-up target was `otp-local` at `127.0.0.1:15432`. That
identity does not match the inventory: the existing
`supabase_db_otp-local` container (`836abf82fd06f77302fa7dfded7209aa9ada52b22a184ccdc684e2ff2fdb063a`)
is an existing, protected local project database published on host port
`54322` on all interfaces. It was not designated disposable and was not
queried. Port `15432` had no listener after temporary cleanup. This target
therefore fails both the disposable-ownership and endpoint verification gates;
no connection was attempted. A distinct, pre-created, positively identified
disposable target or owner-provided schema snapshot is still required.

## Execution record

Only this DEP-01 evidence/decision document was updated. No application
source, migration, existing database, tests, builds, hosted environment,
supplier operation, stage, commit, push, or deployment was touched. Temporary
Docker/database resources were created only for the authorized disposable
inspection attempt described above and were removed after the isolation
failure.
