# B2 DEP-01 — `requirement_specifications` Schema Decision

## Decision

**Status: D — unresolved / not verified. Do not select or create a buyer-side item/specification persistence table yet.**

The tracked repository evidence reviewed for this work contains references to `requirement_specifications` in cleanup/reset/admin paths, but no tracked defining DDL, generated database type, active buyer feature read/write contract, established ownership/keys/FKs, or RLS/grant definition. This evidence does not establish whether an object exists in an external or hosted schema.

## Evidence boundary

Repository evidence was used only. No database connection, metadata query, hosted environment, or migration execution was used. No database writes were made.

The reviewed evidence set includes tracked migration and cleanup/reset references, generated database types, and application API/source searches. Existing `requirements`, structured specification/attribute data, and purchase-order/invoice line items do not by themselves establish the intended buyer-side RFQ item store.

## Architecture disposition

- Do not treat purchase-order or invoice lines as the buyer-side draft item model.
- Do not repurpose `requirement_specifications` based on its name or cleanup references.
- Do not add a competing item table until the existing schema, ownership, and lifecycle are established.
- Preserve the B1 product contract: one category per child RFQ, independent child items and review/confirmation/publication, and no combined group publication.

## Evidence needed to resolve

The schema owner should provide authoritative evidence for:

1. Object existence and current/legacy status.
2. DDL, columns, primary/foreign keys, unique constraints, indexes, triggers, and dependent functions.
3. Ownership semantics for Individual, RWA, and MSME buyers.
4. RLS policies, grants, and API consumers.
5. Cleanup/reset behavior and data-retention implications.

If repository evidence cannot resolve this, any metadata-only inspection requires separate written approval naming the disposable environment, owner, allowed query scope, data-safety constraints, and cleanup responsibility. Production or hosted access is not requested here.

## Migration consequence

No migration proposal can be finalized safely until this dependency is resolved. Any subsequent migration design must separately define relationships, RLS, indexes, constraints, idempotency, compatibility with existing RFQs and all buyer personas, data migration, and rollback.
