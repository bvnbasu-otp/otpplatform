# Purchase orders

Status of the tax and payment-plan functions: `IMPLEMENTED` in `00240` and `00245`. Hosted apply: `UNKNOWN`. `00245` does not backfill old rows.

## Creation

Latest `public.create_purchase_order_from_award(uuid)` is `supabase/migrations/00245_f13_po_gst_tax_accuracy.sql`. It replaces the function. It does not `UPDATE` existing `purchase_orders`.

Preconditions read from that function:

- Award status must already be `REVEALED`.
- Caller is service role, platform admin, or an org member.
- No `rfq_approval_stages` row with status other than `APPROVED`.
- Supplier `lifecycle_state` and `verification_status` are both `VERIFIED`.
- If a PO already exists for the award, the function returns that PO and ensures a work order and document snapshot.

## Tax

The awarded `quote_versions.snapshot` is the source.

| PO column | Meaning after `00245` |
| --- | --- |
| `total_amount` | Snapshot `totalCost` (else `basePrice`). GST is not added again. |
| `taxable_total` | Snapshot `basePrice` (else `totalCost`). |
| GST components | Split of snapshot `gstAmount`. Intra-state: CGST and SGST, with the remainder on SGST so they sum to the quote GST. Inter-state: IGST equals GST. `utgst_total` is 0. |
| Split basis | Snapshot `isInterState` if present (`QUOTE_SNAPSHOT`), else both state codes (`STATE_CODES`), else `UNAVAILABLE` and all components 0. The GST amount remains on `tax_snapshot.gstAmount`. |
| Transport | Stays inside `total_amount`. It is not a second taxable base. The migration states GST in the quote model is computed on `basePrice`. |

`private.issue_po_document_snapshots` is also replaced in `00245` so the issued document reads the stored tax instead of a hard-coded zero.

## Payment structure

Persisted columns from `00240`: `payment_structure`, `payment_terms_text`, `payment_schedule`.

`public.resolve_declared_payment_structure` maps the requirement’s `commercial.paymentTerms` text:

| Declared text | Structure |
| --- | --- |
| Empty | `SINGLE_PAYMENT` |
| `100%` on delivery or completion | `SINGLE_PAYMENT` |
| Percents 20, 30, and 50 | `THREE_PART_PAYMENT` (30 / 50 / 20 in `declared_payment_splits`) |
| Four 25 percents | `MILESTONE_BASED` |
| Anything else | `CUSTOM_TERMS` |

`declared_payment_splits` returns no rows for `CUSTOM_TERMS`. The PO function then creates no milestone schedule. It does not invent splits.

Domain mirror: `DECLARED_PAYMENT_PLANS` in `packages/domain/src/types/requirement-intake.ts`.

| Structure | Splits |
| --- | --- |
| `SINGLE_PAYMENT` | 100% on delivery and sign-off |
| `THREE_PART_PAYMENT` | 30% mobilization, 50% dispatch and delivery, 20% acceptance |
| `MILESTONE_BASED` | 25% × 4 |
| `CUSTOM_TERMS` | No preset splits |

These structures are records on the PO. They are not a payment gateway. See [PAYMENTS.md](./PAYMENTS.md).

## Purchase-order status enum

`PurchaseOrderStatus` in `packages/domain/src/enums/procurement.ts`: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ISSUED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

`00245` inserts new orders as `ISSUED`.
