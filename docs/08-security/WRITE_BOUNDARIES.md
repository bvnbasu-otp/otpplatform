# Write boundaries

Status: `IMPLEMENTED` in `00237`, `00238`, and `00242`. Hosted apply: `UNKNOWN`.

`00242` states the root cause it closed: `authenticated` could insert or update awards, purchase orders, quotes, conflict declarations, and organisation members under older policies, skipping RPC checks. The migration revokes those client paths and adds triggers. Security-definer RPCs remain the writers because they do not run as `authenticated`.

| Object | Client write after the cited migration | Legitimate writer |
| --- | --- | --- |
| `awards` | Insert and update revoked from `anon` and `authenticated`. Trigger `guard_award_client_write` rejects `current_user` in (`anon`, `authenticated`). | `lock_and_reveal_award_atomic`, `lock_award`, `reveal_award`, `award_runner_up_quote`, and other security-definer RPCs named in the `00242` header |
| `purchase_orders` | No client insert. Client update limited to lifecycle columns (`00242` header F-02). Column list was not re-quoted. | `create_purchase_order_from_award` |
| `quotes` | Evaluation score, `SELECTED`, and identity frozen against client update (`00242` header F-03) | Award RPCs set `SELECTED` / `NOT_SELECTED` |
| `conflict_of_interest_declarations` | No client update or delete, so `DECLARED_CONFLICT` cannot be cleared by the client | Not a self-serve waiver |
| `organization_members` | No client insert (`00242` header F-05) | Membership RPCs (not re-listed) |
| `rfq_approval_stages` | No direct insert or delete. Decision-column updates rejected | `evaluate_and_stamp_approval_route_atomic`, `submit_rfq_tier_approval_atomic` |
| `committee_votes` | Insert still exists for `authenticated` (the `00238` header says so) but the trigger rejects unauthorised rows | Insert that passes `enforce_committee_vote_authority` |

Fail closed means the award or the vote raises. It does not mean the UI hides a control.

## Payment webhook

SECURITY-01. The webhook handler is not an `authenticated` table write. It uses the service role after HMAC verification. A missing secret now fails verification in source. The corrected function is not redeployed. Do not treat pilot `realPaymentCharged: false` as a disable switch for the verifier.

`00242` includes a manual rollback note (restore named policies and drop triggers). That is an emergency procedure, not an automated rollback. See [ROLLBACK.md](../12-operations/ROLLBACK.md).
