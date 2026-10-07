# Security architecture

Status of the controls below: `IMPLEMENTED` in the cited files. Hosted grants and the hosted migration version: `UNKNOWN`.

## Open security defect

SECURITY-01 is remediated in source and not redeployed. `verifyAndExtractWebhook` in `supabase/functions/payment-webhook/verify-webhook.ts` fails when `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, or `PAYMENT_WEBHOOK_SECRET` is absent. `Deno.serve` still calls that function and, after a valid signature, `record_verified_payment`. CI does not deploy this function. Hosted deployment of the corrected function is NOT RE-VERIFIED. Values are not copied here. Detail: [DOCUMENTATION_DISCOVERED_DEFECTS.md](../13-truth/DOCUMENTATION_DISCOVERED_DEFECTS.md) and [WRITE_BOUNDARIES.md](../08-security/WRITE_BOUNDARIES.md).

DEFECT-01 is remediated in local SQL `00246` and hosted NOT applied. DEFECT-02 is labelled LOCAL DOCKER ONLY. The script still writes Docker `otp-prod-db`.

## Session

The web client uses the Supabase anon key (`apps/web/src/lib/supabase.ts`). Service-role keys are edge and server environment variables. They are not documented as values.

`RequireAuth` and `RequireRole` wrap the workspace. Admin routes use `ProtectedRoute requireAdmin`. Founder routes allow `FOUNDER`.

Enterprise persona checks fail closed in `apps/web/src/features/auth/canonical-auth.ts`. That is an application gate. The database vote and award rules are separate and are the ones that hold if the client is hostile.

## Database

| Control | Where |
| --- | --- |
| Row-level security | Introduced early (`00004_rls_policies.sql` and later replacements). This reconstruction did not re-audit every policy. |
| Vote insert trigger | `00238` `private.enforce_committee_vote_authority` |
| No client write of awards | `00242` revoke plus `private.guard_award_client_write` |
| Purchase orders, quotes, conflict rows, organisation members | `00242` header F-02 through F-05 |
| Approval stages | `00237` `private.guard_rfq_approval_stage_direct_write` |
| Reveal and PO | `00244` / `00245` security definer, `search_path` set, execute granted to `authenticated` and `service_role`, revoked from `PUBLIC` and `anon` |

`00242` states that `authenticated` had table-level insert/update from earlier migrations, and that the new triggers treat `current_user` of `anon` or `authenticated` as a client write. Security-definer RPCs run as the owner and are the intended writers.

## Identity

Supplier legal name, phone, and email are selected inside `reveal_award` only after the verified-supplier predicate. Comparison before that is an alias (`anonymous_label`).

## Secrets in functions

`payment-webhook` is SECURITY-01, remediated in source and not redeployed. Names only: `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET`.

Messaging fails closed when Twilio or Meta is selected without credentials (`resolveProvider`). The default provider name is `MOCK`, which does not fail closed; it returns a mock provider.

## Headers

`vercel.json` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, and a `Content-Security-Policy` that allows the Supabase host, Sentry, Razorpay, Stripe, and `*.ondc.org`. Presence of a CSP host is not proof that integration is live.
