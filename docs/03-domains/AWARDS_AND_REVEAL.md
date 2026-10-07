# Awards and reveal

Identity reveal is not the same event as a purchase order unless the transaction that reveals also creates the order and fails together with it.

## `reveal_award`

Latest definition: `public.reveal_award(uuid)` in `supabase/migrations/00244_f07_reveal_award_verified_atomic_and_f08_founder_truth.sql`.

Status: `IMPLEMENTED` in that file. Hosted apply: `UNKNOWN`.

| Step | Behaviour |
| --- | --- |
| Authorisation | Caller must be org manager-or-above or platform admin when `auth.uid()` is present. |
| Preconditions | RFQ exists. An award row exists. Awarded supplier row exists. |
| Verification | `suppliers.lifecycle_state` and `verification_status` must both be `VERIFIED` before any identity is returned and before reveal is persisted, including the already-revealed path. |
| First reveal | Sets `rfqs.reveal_status` and `awards.status` to `REVEALED`, then calls `create_purchase_order_from_award`. There is no exception handler. A PO failure rolls back the reveal updates. |
| Success | Requires a non-null `po_id`. Otherwise the function raises. |
| Already revealed | If no PO exists, it tries to create one and still raises when `po_id` is null. |

So for this function, reveal and PO creation are one transaction.

## `lock_and_reveal_award_atomic`

Latest body found: `public.lock_and_reveal_award_atomic` in `00222_otp_document_issuance_snapshots.sql`. `00244` says this function is not replaced.

Status: `IMPLEMENTED` as of `00222`.

| Path | Behaviour |
| --- | --- |
| Supplier not `VERIFIED` / `VERIFIED` | `v_can_reveal` is false. Award can be stored as `PENDING_REVEAL`. Return includes `revealed: false`. Identity is not in that return. No PO from the reveal branch. |
| Supplier verified and `p_auto_reveal` true | Award and RFQ are set `REVEALED`, then `create_purchase_order_from_award` runs in the same function. Local migration `00246` raises `Reveal failed: Purchase Order was not created` when `po_id` is null, before identity is returned. Hosted NOT applied. The function remains the lower-level lock used by `lock_award`. |
| RWA | `org_type = COMMUNITY` requires at least 2 distinct unconflicted `RECOMMEND` votes for the quote. |
| Approvals | Pending `rfq_approval_stages` block the lock. |

`lock_award` is described in `00222` as delegating to this function with auto-reveal false. That delegation body was not re-read line by line.

## What “after the decision” means

- Decision locked, supplier not yet verified: award exists, identity stays masked, no PO from the reveal path.
- Later `reveal_award`: identity and PO succeed or fail together (`00244`).
- Auto-reveal at lock time: identity is returned in the same call as the PO attempt (`00222`).

Do not document a single sentence that says “reveal always creates the PO” without naming which function.
