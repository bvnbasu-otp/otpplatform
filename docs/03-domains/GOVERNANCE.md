# Governance

Status: vote authority and approval-route persistence are `IMPLEMENTED` in SQL. Hosted apply of `00237`, `00238`, and `00242` is `UNKNOWN`.

## RWA offices

Domain roles in `packages/domain/src/types/rwa-governance.ts`: `PRESIDENT`, `VICE_PRESIDENT`, `SECRETARY`, `JOINT_SECRETARY`, `TREASURER`, `ESTATE_MANAGER`, `COMMITTEE_MEMBER`.

`RWA_RACI_MATRIX` marks `COMMITTEE_VOTE` for `ESTATE_MANAGER` as `INFORMED`, with the comment that `canVote` is false. The database does not rely on that comment.

## Who may vote

`private.enforce_committee_vote_authority` (`supabase/migrations/00238_p1_rwa_vote_authority_write_boundary.sql`) is a `BEFORE INSERT` trigger on `committee_votes`.

| Check | Rule |
| --- | --- |
| Conflict | If a `conflict_of_interest_declarations` row exists for this RFQ and profile with status `DECLARED_CONFLICT`, the insert is rejected. This check runs for every org type. |
| Estate / facility manager | Active profile role `FACILITY_MANAGER` or `ESTATE_MANAGER`, or an active `org_role_assignments` row for `ESTATE_MANAGER` or `FACILITY_MANAGER`, cannot vote. |
| RWA (`organizations.org_type = COMMUNITY`) | The voter needs both (A) a qualifying appointment and (B) a `committee_assignments` seat on this RFQ. |
| Appointment (A) | An effective office in `PRESIDENT`, `VICE_PRESIDENT`, `SECRETARY`, `JOINT_SECRETARY`, `TREASURER`, `COMMITTEE_MEMBER`, or membership role `OWNER` / `COMMITTEE_MEMBER` when no committee-office assignment exists. |
| Not an appointment | `MANAGER`, `BUYER`, and `APPROVER` membership alone. A seat created for those roles is not enough. |
| Demo reset | `private.in_demo_reset()` returns the row unchanged. That bypass is in the function. |

An estate or facility manager is operational: intake, discovery, purchase-order handling, and inspection are `RESPONSIBLE` in the domain RACI. That responsibility is not voting authority.

`can_access_rfq_as_committee()` stays a broad read predicate. `00238` says it was not narrowed.

## MSME approval route

`public.evaluate_and_stamp_approval_route_atomic(uuid, numeric)` (`00237`) writes the route evaluation and inserts `rfq_approval_stages` in the same transaction. Direct client insert, update of decision columns, and delete of stages are rejected by `private.guard_rfq_approval_stage_direct_write` unless the caller is service role, platform admin, the internal flag, or a database owner session.

Default thresholds cited by `00237` are the `00191` amounts: tier 2 from ₹5 lakh, tier 3 above ₹25 lakh, overridable by an active `organization_approval_policies` row. This page does not restate those numbers as a customer price list.

`00242` fail-closes the award when the route applies and zero stages exist. Applicability in that migration: the organisation is not `INDIVIDUAL` or `COMMUNITY`, and either an active policy exists or the amount is at least the tier-2 minimum. Individual and RWA (`COMMUNITY`) are outside that MSME route.

## Conflict declarations

`00242` removes client `UPDATE` and `DELETE` on conflict declarations so a user cannot clear `DECLARED_CONFLICT` by writing the table. Waiver is not a self-serve insert. The exact remaining writer RPC was not re-opened beyond that migration’s header.
