# B2-03 — Item Acceptance State Model

## Purpose and evidence
Specify item provenance, customer acceptance, rejection, deletion, versioning, and supplier eligibility. **PROPOSED:** no buyer-side normalized item-state model was found. `requirements.structured_specs` is a legacy JSON mirror; clarification optionally reads JSON `line_items`/`items`. PO/invoice line tables are downstream execution data.

## State and provenance are separate

| Origin | Initial state | Meaning |
|---|---|---|
| `CUSTOMER_STATED` | `ACCEPTED` | Customer explicitly stated it; accepted into buyer draft without a second item click. Child confirmation remains mandatory. |
| `OTP_SUGGESTED` | `SUGGESTED` | OTP recommendation only; not a customer requirement and not publishable until explicitly accepted. |

Additional states:

- `REJECTED`: buyer explicitly declined an OTP suggestion. Retain decision, actor, time, reason, and source rule; do not publish or re-emit the same suggestion key.
- `TOMBSTONED`: buyer removed an item from the active draft. Retain historical record; never supplier-visible and never revived by reparse.

Customer-modified data is provenance layered over the original origin: preserve source value/evidence and current customer value/editor/version. Customer edits do not convert `OTP_SUGGESTED` into `CUSTOMER_STATED` or auto-accept it.

## Transition matrix

| Current | Action/actor | Next | Requirements |
|---|---|---|---|
| Absent | Parser extracts customer statement | `ACCEPTED` | Evidence points to customer text; new stable item ID. |
| Absent | Approved recommendation rule | `SUGGESTED` | Stable rule/suggestion key, rationale/provenance, approved wording. |
| `SUGGESTED` | Buyer edits | `SUGGESTED` | Preserve origin; increment version; edited suggestion still requires acceptance. |
| `SUGGESTED` | Buyer accepts | `ACCEPTED` | Authenticated buyer in owner scope; record actor/time/version. |
| `SUGGESTED` | Buyer rejects | `REJECTED` | Record actor/time/reason; suggestion key suppression persists. |
| `ACCEPTED` or `SUGGESTED` | Buyer removes | `TOMBSTONED` | Record actor/time/reason; retain old payload for buyer audit only. |
| `ACCEPTED` | Buyer edits before confirmation | `ACCEPTED` | Optimistic version; preserve original and current values. |
| Any active state | Parser re-run | Same state | Reconcile by stable identity/key; never overwrite customer edits or revive rejected/tombstoned key. |
| Confirmed snapshot | Material amendment | New controlled version | Original confirmed version immutable; revalidate before new publication/discovery. |
| `REJECTED` / `TOMBSTONED` | Re-accept/revive | Invalid | Reject transition. A fresh customer-stated item requires a new identity and audit link. |

## Required audit fields
At minimum: item ID; child ID; item version; origin; state before/after; actor profile or system actor; timestamp; action; reason code; source/evidence reference; recommendation rule/version where applicable; correlation/request ID; confirmed child version if applicable. Audit must distinguish customer, OTP parser/recommendation, automation, and supplier-network actions.

## Publication eligibility

```text
eligible(item, child, rfq, supplier) =
  item.state = ACCEPTED
  AND item belongs to child
  AND child has a successfully published immutable version
  AND rfq.requirement_id = child.id
  AND rfq lifecycle permits supplier view
  AND supplier has an invitation for that exact rfq
```

`REJECTED`, `TOMBSTONED`, `SUGGESTED`, stale/unconfirmed versions, other siblings, and unpublished children are excluded. State does not replace child publication state.

## Duplicates and restoration
Deduplicate only when stable identity and semantic content establish the same item; do not combine quantities or specifications automatically. Rejected/tombstoned suggestion keys are suppressed across reparses for the group history. No restore operation is approved; if a customer wants the item again, create a new item identity with a new explicit buyer action, linking prior history where useful.

## Dependencies and risks
- Recommendation rules require stable IDs, canonical taxonomy references, approved wording/rationale/provenance, and relevance/deduplication tests.
- Whether a customer-stated item’s initial state is already approved: **APPROVED by B1**, no further decision needed.
- Physical retention/erasure requirements and statutory audit policy must be reconciled before implementation.
- **Status:** state contract proposed; storage table remains conditional on `requirement_specifications` evidence.
