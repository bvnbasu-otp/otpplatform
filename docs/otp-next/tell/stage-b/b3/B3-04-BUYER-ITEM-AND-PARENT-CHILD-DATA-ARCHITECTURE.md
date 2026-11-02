# B3-04 — Buyer Item and Parent/Child Data Architecture

## Recommendation

Reuse the existing requirement/RFQ lifecycle for each child. Add an orchestration-only parent and a durable buyer-item lifecycle only after DEP-01 resolves whether a suitable existing item/specification store exists.

The model below is a target relationship, not selected DDL. Entity/table names other than existing `requirements`, `rfqs`, `rfq_invitations`, and `quotes` are conceptual.

## Relationship diagram

```text
Authenticated buyer (existing organization owner scope OR Individual profile scope)
                         |
                         v
            Parent / request group (buyer-only)
             - exact source revisions (private)
             - owner scope, creator, version
             - parser/taxonomy provenance
             - derived progress only; no RFQ
                    | 1
                    | 0..N
                    v
       Child = existing requirements row
       - exactly one category and valid subcategory
       - stable child identity / expected version
       - its own review and confirmation snapshot
       - legacy group-null requirements remain valid
                    | 1                       |
                    | 0..N buyer items        | 0..1 existing RFQ
                    v                         v
     Existing compatible item store     rfqs(requirement_id UNIQUE)
     OR approved additive item model       | 1
                                            | 0..N
                                            v
                                  rfq_invitations (unique RFQ/supplier)
                                            | 1
                                            v
                                  whole-RFQ quote/version
```

The parent never aggregates supplier-visible content, grants child access, confirms siblings, consumes RFQ allowance, creates an RFQ, or launches discovery.

## Logical entities and invariants

### Parent/group — proposed, buyer-only

- Stable ID; exactly one owner scope: organization **or** individual profile, matching existing owner-XOR convention.
- Creator, source revisions (exact customer wording), timestamps, optimistic version, parser/taxonomy/rule versions, and derived progress.
- Parent ID is an organizational grouping key, not an authorization credential.
- Each source revision is private and linked to proposals/children for reconciliation; never copied wholesale into a supplier view.

### Child — reuse `requirements`

- One child is one independently reviewable procurement scope with exactly one category; selected subcategory must belong to that category in the active taxonomy.
- Each child has stable identity independent of parser output order, own items/review/confirmation state, own expected version, and own publication outcome.
- A nullable parent/group relationship preserves existing group-null rows and existing workflows.
- Existing unique `rfqs.requirement_id` is the natural one-child/one-RFQ integrity constraint; do not create a second RFQ lifecycle.
- Owner pair on child must match parent owner pair; existing buyer scope authorization remains authoritative.

### Buyer item — store undecided (DEP-01)

Required logical fields regardless of physical store:

- Stable item UUID; child ID; item version; order/position.
- `PRODUCT`, `SERVICE`, or `REPAIR` kind; item description; quantity and unit nullable unless customer stated or accepted from a source.
- Typed specifications/attributes and evidence; origin (`CUSTOMER_STATED` or `OTP_SUGGESTED`); source text span/rule/parser revision.
- State: `ACCEPTED`, `SUGGESTED`, `REJECTED`, or `TOMBSTONED`; state actor/time/reason; customer edit history; stable suggestion key.
- No silent suggestion acceptance. Editing an OTP suggestion retains `SUGGESTED`; customer-stated items start `ACCEPTED`.
- Reparse reconciles by stable identity/key; it cannot overwrite buyer edits or revive rejected/tombstoned suggestions.
- Tombstones/rejections persist to suppress recurrence; normal buyer deletion is a state change, not physical delete.
- The exact snapshot used for confirmation/publication must be immutable and independently attributable.

If existing `requirement_specifications` is unsuitable or absent in the authoritative schema, an additive normalized model is the leading option because state transitions, identity, actor/version history, and supplier allowlisting are relational integrity/security concerns. This is conditional, not a final table decision.

## Lifecycle and supplier projection

```text
source revision → parser proposal → child/item draft
  customer-stated item: ACCEPTED
  OTP suggestion: SUGGESTED → buyer ACCEPTED or REJECTED
  active item → TOMBSTONED on buyer removal
child review → immutable confirmed child version
  └─ atomic existing protected publication → exactly one RFQ
       └─ explicit buyer discovery → exact RFQ invitation(s)
            └─ supplier sees only allowed accepted scope for own valid invitation
```

Supplier projection is computed from the confirmed/published child snapshot and current permitted RFQ lifecycle. It excludes parent metadata/source, siblings, draft state, rejected/tombstoned/unaccepted items, internal confidence/recommendation rationale, buyer-only notes, and other suppliers' quotes. Existing whole-RFQ quotation behavior remains unchanged.

## Persistence/security design gates

- Evaluate the complete `requirement_specifications` definition before selecting storage.
- Preserve Individual/RWA/MSME owner XOR, buyer-scope membership/role helpers, and internal hard-deny behavior. Parent membership alone grants nothing.
- RLS must scope parent and child by existing owner rules. Item reads/writes derive from authorized child access; supplier reads use a narrow view/RPC with exact invitation and lifecycle checks.
- Client cannot set confirmed/published version, actor, owner, or audit evidence.
- Use FK/unique/index/check constraints for ownership, parent/child relation, stable item key, operation identity and RFQ uniqueness. Exact constraints depend on schema review.
- Additive rollback disables TELL paths and retains any committed business/audit history; do not cascade-delete published RFQs/quotes or statutory evidence.
- Reset/cleanup inventories must be updated only after table ownership and deletion ordering are reviewed.

## Unresolved design choices

DEP-01 blocks item-store selection. Version/snapshot representation, amendment semantics, audit retention, parent cancellation, suggestion-key scope, and database function/grant changes require schema/security and product review. No DDL has been authored.
