# Role permission matrix

Status: `IMPLEMENTED` where a row cites a function. UI hiding a button is not the control. The write path is.

## Buyer personas

| Persona | Award | Vote | Approval stages |
| --- | --- | --- | --- |
| Individual | Direct decision. No `COMMUNITY` quorum branch. | Vote trigger’s appointment rule does not run unless `org_type` is `COMMUNITY`. | Route applicability in `00242` excludes `INDIVIDUAL`. |
| RWA (`COMMUNITY`) | Lock requires manager-or-above. Quorum: 2 unconflicted recommend votes (`00222`). | Appointment and seat, not estate manager, not `DECLARED_CONFLICT` (`00238`). | Route applicability excludes `COMMUNITY`. |
| MSME | Pending stages block lock and PO. Missing stages fail closed when the route applies (`00242`). | `DECLARED_CONFLICT` still recuses if a vote row is inserted. | `evaluate_and_stamp_approval_route_atomic` (`00237`). |

## RWA offices versus operational roles

| Role | Votes? | Evidence |
| --- | --- | --- |
| President, vice president, secretary, joint secretary, treasurer, committee member | Yes, if the office is effective and the RFQ seat exists | `00238` office list |
| Owner or committee-member membership with no office assignment | Yes, if the RFQ seat exists | `00238` |
| Estate manager / facility manager | No | Trigger rejects `ESTATE_MANAGER` and `FACILITY_MANAGER` |
| Manager, buyer, approver membership alone | No for a `COMMUNITY` RFQ | Explicitly not an appointment. A seat alone is not enough |
| Platform admin | Reveal and lock paths allow platform admin | `reveal_award`, `lock_and_reveal_award_atomic` |

Domain RACI (`rwa-governance.ts`) agrees that the estate manager does not vote. The trigger is the enforcement.

## Application role gate

`canonical-auth.ts` fail-closes Enterprise. `canCreateRfq` is false for that retired persona. Database org types are still the authority for the vote trigger (`organizations.org_type`).

## Founder

`get_founder_executive_metrics` and `get_founder_google_places_budget_today` require `private.is_founder()` (`00244`). The web route `/founder` allows role `FOUNDER`.
