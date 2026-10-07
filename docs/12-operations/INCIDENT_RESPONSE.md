# Incident response

There is no on-call rota, status page, or pager id in the repository that this reconstruction verified. Inventing one would be false. The following are the controls that do exist.

## Who can see operational counters

`/founder` is limited to role `FOUNDER`. `get_founder_executive_metrics` and `get_founder_google_places_budget_today` check `private.is_founder()`.

`/admin` requires an admin route guard. Tabs are redirected in `App.tsx` (`transactions`, `seller-orders`, troubleshooters). What those tabs do at runtime was not exercised.

## If procurement data looks wrong

| Symptom | First place to read | Do not |
| --- | --- | --- |
| Identity visible without a PO | Which RPC ran: `reveal_award` (`00244`) versus `lock_and_reveal_award_atomic` (`00222`) | Assume they are the same transaction |
| Vote accepted for an estate manager | Whether `00238` is applied on that database | Trust the hidden button |
| PO GST is zero on an old order | `00245` does not backfill | Write an update as if the migration did |
| Supplier got a WhatsApp | `MESSAGING_PROVIDER` on the edge function | Assume the default `MOCK` sent it |
| Places result looks like a Hoodi electrical business for a `560*` PIN | Whether the caller used the library adapter (`getStaticReferenceCandidates`) rather than edge `location-pin-coverage` | Call a fixture a live Google, OTP-registered, or GST-verified supplier |

## If the site is down

The public URL is `https://otpplatform-theta.vercel.app`. The Actions workflow does not roll it back. Vercel’s own rollback, if the project uses it, was not confirmed. See [ROLLBACK.md](./ROLLBACK.md).

## Communication

No incident template is stored as a product feature. A person writes the note. Do not include secrets.
