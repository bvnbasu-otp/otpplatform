# OTP Procurement State Machine

**Authority:** Level 2 — current technical truth  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

Customer-facing states are a projection, not a single database enum that uses these seven names for every row. `packages/domain/src/types/track-milestone.ts` maps backend RFQ, award, PO, and invoice facts onto:

`DRAFT → QUOTING → EVALUATING → AWARDED → PO_ISSUED → INVOICED → SETTLED`

plus exception state `STALLED`.

Labels below:

- **IMPLEMENTED** — code or SQL in this repository expresses the rule.
- **INTENDED** — described as the product rule; enforcement call site or live proof is incomplete.
- **NOT VERIFIED IN PRODUCTION** — applies to every transition. No live order was walked on 28 Sep 2026.

## DRAFT

| | |
| --- | --- |
| Entry | Buyer saves a requirement that has not been opened for quotes. |
| Exit | Publish / open moves the RFQ toward quoting. `openRfq` treats an already-OPEN row as an idempotent success (issue 07, client tests). |
| Who | Buyer organisation member with a role allowed to insert RFQs (`OWNER`, `MANAGER`, `BUYER` in the original RLS insert policy, `00004`). RWA domain gate: `evaluateRwaCommitteeRfqGate` refuses when there is no active President or Secretary, or fewer than two active assignments. |
| Evidence | Requirement text and address. |
| Database | `rfqs` status values including `DRAFT`. Exact status enum members vary across migrations; the projection treats unpublished work as DRAFT. |
| Audit | Publish path writes audit events in later migrations (`00180` and follow-ons). Completeness of every draft save: NOT VERIFIED IN PRODUCTION. |
| Cancellation | Abandoning a draft is a local buyer action. A full cancel-and-notify rule for every participant: NOT VERIFIED IN PRODUCTION. |
| Limitation | The RWA gate function is implemented and unit-tested. A search of `apps/web/src` found calls only in `rwa-governance-experience.test.ts`, not on the publish page. **INTENDED. Server enforcement of this gate: NOT FOUND in this pass.** |

## QUOTING

| | |
| --- | --- |
| Entry | Projection: RFQ status `PUBLISHED`, `QUOTING`, or `OPEN` (`track-milestone.ts`). |
| Exit | Buyer moves the request into evaluation, or the quoting window ends. Deadline extension UI exists (`ActiveRfqExtendDeadlineModal`). |
| Who | Invited suppliers submit quotes. Buyers do not write the `quotes` base table under the original RLS (supplier insert only). |
| Evidence | Quote version snapshot: base price, GST, transport, total, delivery days, warranty. |
| Database | `quotes`, `quote_versions`, `rfq_invitations`. Draft and withdrawn quotes are excluded from `quotes_identity_protected`. |
| Audit | Quote submission notifications exist. Delivery to the supplier: NOT VERIFIED IN PRODUCTION. |
| Cancellation | Supplier withdrawal uses status `WITHDRAWN`, which drops the quote from the buyer view. Buyer cancel of an open RFQ: NOT VERIFIED IN PRODUCTION as a complete participant-notification flow. |
| Limitation | If `supplier_network_stub_enabled` is on, older discovery code could attach synthetic quotes. Migration `00198` fails that flag closed and wraps simulators. **Live flag value: UNKNOWN.** |

## EVALUATING

| | |
| --- | --- |
| Entry | Quotes exist and the buyer is comparing them. Projection uses evaluation status before award. |
| Exit | Award lock. |
| Who | Buyer members. RWA committee votes are a domain action `CAST_COMMITTEE_VOTE`. Individuals are rejected by the authorization chain. Estate managers are rejected. Residents without appointment are rejected. A declared COI recuses the voter. |
| Evidence | Masked comparison: alias, prices, delivery, warranty, coarse rating band. |
| Database | `quotes_identity_protected` (security-barrier view, `00136`). |
| Audit | Votes are described as append-only by policy absence on `committee_votes` (`00004`). A dedicated immutability trigger on every vote table: NOT RE-AUDITED line by line in this baseline. |
| Limitation | Award page copy says “Recorded Committee Consensus” for the justification text even when the buyer is an individual. That is a presentation defect, not a second state. |

## AWARDED

| | |
| --- | --- |
| Entry | Award lock. `lock_and_reveal_award_atomic` in migration `00199` requires service role, platform admin, or a non-null user who is owner/manager of the buyer org. The migration text is the evidence. |
| Exit | Reveal and PO creation. |
| Who | Authorised buyer role as above. Delegated `ISSUE_PO` holders are not honoured by the `00199` guard (fails closed). |
| Evidence | Award row, justification text, frozen quote version. |
| Database | `awards`, RFQ `reveal_status`. |
| Audit | Award events exist in the function body. Live row: NOT VERIFIED IN PRODUCTION. |
| Limitation | **IMPLEMENTED in migration text. NOT VERIFIED IN PRODUCTION.** The pre-`00199` body had no effective caller check and was granted to `anon`. If the live database has not applied `00199`, this transition is unsafe. |

## PO ISSUED

| | |
| --- | --- |
| Entry | Reveal of the selected quote creates or links a purchase order (`00136` describes PO creation on reveal). |
| Exit | Supplier acceptance and invoicing. |
| Who | Buyer issues. Supplier accepts their own PO. Accepting another supplier’s PO is denied by supplier-scoped RLS on the intended path. Live IDOR test: NOT VERIFIED IN PRODUCTION. |
| Evidence | PO document model (parties, lines, GST, TDS) in `features/reporting` and `features/fulfillment`. |
| Database | `purchase_orders`. |
| Limitation | Some report surfaces still print the screen rather than the A4 model (issue 09 deferred the comparison and decision-receipt print paths). |

## INVOICED

| | |
| --- | --- |
| Entry | Supplier invoice recorded against the PO / work order. |
| Exit | Payment recorded up to the balance, with TDS netting described in `00199`. |
| Who | Supplier submits. Buyer owner/manager applies TDS via `apply_tds_withholding_atomic` as rewritten in `00199` (server derives the base; client amount is ignored). |
| Evidence | Invoice rows, GST split fields, one live TDS deduction per invoice (partial unique index in `00199`). |
| Limitation | **IMPLEMENTED in migration text. NOT VERIFIED IN PRODUCTION.** |

## SETTLED

| | |
| --- | --- |
| Entry | Buyer records an off-platform payment (UTR). Copy in `settlement-state.ts`: pay the supplier directly; OTP does not collect, hold, or settle funds. |
| Exit | Terminal for the happy path. |
| Who | Buyer records. Supplier does not receive OTP-custodied funds in this flow. |
| Evidence | Payment record and UTR. Completion blockers are computed in `computeCompletionBlockers`. |
| Database | Invoice payment RPCs (`record_invoice_payment_atomic` and later revisions). |
| Limitation | The public pricing copy still describes a 0.50% fee deducted from supplier disbursement. That conflicts with this state. See `OTP_FINANCIAL_TRUTH.md`. Conflict is unresolved. |

## STALLED

| | |
| --- | --- |
| Entry | Projection sets `STALLED` from exception inputs in `track-milestone.ts` (blocked inspection, dispute, or explicit stall — see the function for the exact predicates). |
| Exit | INTENDED: an operator or buyer clears the blocker. A dedicated unstall tool that does not use admin force-transition: NOT VERIFIED. |
| Who | Unknown without a live case. `admin_force_transition_order_state` can move orders and, after `00199`, requires platform admin. |
| Limitation | **NOT VERIFIED IN PRODUCTION.** |

## Abandoned screens and races

What happens if the user closes the browser mid-award, double-submits, or races a second voter was not executed against a database for this baseline. Client publish de-duplicates in-flight publishes (issue 07 tests). The pilot RFQ allowance trigger in `00199` locks the organisation row. **NOT VERIFIED IN PRODUCTION.**
