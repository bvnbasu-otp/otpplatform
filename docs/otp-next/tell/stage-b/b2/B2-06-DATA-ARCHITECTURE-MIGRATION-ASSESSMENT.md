# B2-06 — Data Architecture and Migration Impact Assessment

## Purpose and evidence
Read-only assessment; no schema changes or database access.

### Existing structures
- `requirements`: one procurement record with taxonomy, scalar quantity/unit, JSON attributes/quality/commercial, legacy `structured_specs`, owner pair, and existing lifecycle.
- `rfqs`: unique `requirement_id`; current protected publication creates one RFQ per requirement.
- `requirement_specifications`: 12 tracked references in purge/reset/admin cleanup and historical inventory, but no tracked DDL/generated type/feature contract. Classify as **D — unresolved reference**; existence and semantics are **NOT VERIFIED — EXTERNAL/SCHEMA EVIDENCE REQUIRED**.
- `purchase_order_line_items` / `invoice_line_items`: downstream financial/execution records created in migration 00167. They are not buyer draft items.
- `audit_events`: generic event/entity/payload table; no TELL child version table found.
- No tracked parent/group, buyer-item acceptance, requirement-version, or TELL outbox model found.
- The generated `supabase.ts` type defines `requirements`, including nullable `structured_specs`, but no `requirement_specifications` type. This is checked-in contract evidence, not proof that no remote/external object exists.

`requirements.structured_specs` is the current compatibility representation, maintained as a legacy JSON mirror by migration `00014`; typed columns and `attributes` are primary for current intake. Clarification optionally reads JSON `line_items`/`items`, but no tracked buyer-item persistence contract was found.

## Decision matrix

| Requirement | Existing structure | Gap | Recommended action |
|---|---|---|---|
| Parent identity/original text | `requirements.description` on one record | Cannot safely expose mixed text to supplier if reused as parent; no group relation. | **PROPOSED:** orchestration-only parent/group holding exact buyer-private source; separate child requirement descriptions. |
| Child identity | `requirements.id` | No parent/intent relation or durable parser intent key. | Reuse requirements; add nullable parent link + stable intent key, contingent on schema/RLS design. |
| Child version | `updated_at` and lifecycle status | No immutable version/snapshot or expected-version contract found. | Add explicit version/snapshot/confirmation evidence; use optimistic concurrency. |
| Buyer item | `structured_specs` JSON; unknown `requirement_specifications` | JSON lacks item state/identity/tombstone; unknown table cannot be safely repurposed. | First inspect authoritative `requirement_specifications` DDL/API. Reuse/extend only if buyer-owned and meets contract; otherwise add normalized buyer-item table. |
| Acceptance/rejection | No buyer item states found | No accept/reject actor/time or supplier filter. | Add persisted state and provenance with appendable audit evidence. |
| Tombstones | No buyer item tombstones found | Reparse can revive removed suggestions absent durable key/state. | Persist deletion/rejection state; no physical delete for normal buyer actions. |
| Confirmation | Requirement lifecycle statuses | No separate child review/confirmation evidence. | Add intake review state distinct from requirement status; gate grouped child publish server-side. |
| Publication | Existing protected function + unique RFQ per requirement | Client currently update then publish; no child confirmation gate/idempotent wrapper. | Single atomic wrapper calls existing `publish_requirement`; do not direct-insert RFQ. |
| Audit | `audit_events` | No item/child version audit contract. | Emit actor/action/version/correlation payload in same transaction; align effective audit schema. |
| Discovery linkage | RFQ + invitations + existing RPC | No published child version binding; page fallback can create RFQ. | Pass returned RFQ and version; preserve current per-RFQ discovery. |

## Conditional migration proposal (not executed)
No final migration should be authored until `requirement_specifications` is resolved. If no reusable buyer-item store exists, the minimal additive model is:

1. Parent orchestration table with owner XOR, creator, immutable source revision(s), parser/taxonomy version, idempotency, timestamps/version.
2. Nullable `requirements` parent ID and stable child intent key; enforce owner equality; legacy rows null and untouched.
3. Buyer item table (or proven compatible existing table) with child FK, stable item UUID, origin, state, kind, nullable quantity/unit, attributes/specification JSON, source evidence, suggestion key, display order, version, actor/timestamps, tombstone/rejection reason.
4. Immutable child-version/confirmation evidence if no safe existing snapshot structure is available.
5. RPC idempotency record or unique operation key, and accepted-only supplier view extension.

Relationships, FK actions, index design, grants, RLS, `SECURITY DEFINER` settings, uniqueness, and existing effective function patch must be reviewed together. Requirements include unique `(parent_id, intent_key)` where appropriate, unique stable suggestion identity within its scope, owner XOR, and no duplicate RFQ per requirement (existing constraint). Item deletion should be soft state transition; cascade deletion should not erase statutory audit.

## Compatibility, rollback, operational risk
- Additive nullable parent link preserves group-null legacy requirements; no backfill.
- Existing RFQs and quotes remain attached to existing requirement IDs.
- Rollback should disable TELL feature paths and retain additive records; do not cascade/delete published business data.
- Supplier view changes require explicit column allowlist and negative leakage tests.
- Admin reset scripts mention `requirement_specifications`; any new model must be added to reset inventories only after safe table ownership/order is decided.
- **BLOCKED:** do not create a competing buyer-item model until authoritative schema evidence and intended purpose are supplied.
- Full-chain migration validation and deployed RLS must occur only in a named authorized disposable environment.

## Status
Recommendation is conditional architecture, not final DDL. Data model selection is **BLOCKED** on `requirement_specifications` evidence.
