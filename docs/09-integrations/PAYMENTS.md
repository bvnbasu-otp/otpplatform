# Payments integration

Domain rules: [PAYMENTS.md](../03-domains/PAYMENTS.md). This page is the gateway code.

Status: `CONFIG-GATED`. Pilot policy does not take a real charge. Not `LIVE-VERIFIED`.

## Webhook

`supabase/functions/payment-webhook/index.ts` exports `verifyAndExtractWebhook`. It accepts a Razorpay signature header, a Stripe signature header, or `x-otp-signature`.

Environment names: `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET`.

If those variables are unset, `verifyAndExtractWebhook` fails verification. `Deno.serve` (`import.meta.main`) calls the same function. When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also missing, the handler returns a verified acknowledgement only after signature success and does not call the database. When they are present and the signature is valid, it calls `record_verified_payment`. SECURITY-01 is remediated in source. The function was not redeployed. CI does not deploy this function. Hosted deployment of the corrected function: NOT RE-VERIFIED. Secret values are not copied here.

| Layer | Evidence |
| --- | --- |
| Implementation | HMAC check for Razorpay, Stripe, and `x-otp-signature`. Settlement RPC `record_verified_payment` in `00150`. Local `00247` leaves EXECUTE with `service_role` only. |
| Configuration | The three secret names above. Hosted presence: `UNKNOWN`. |
| Runtime verification | Not executed this phase. |
| Production status | `CONFIG-GATED`. Pilot policy `realPaymentCharged` is false. That policy does not disable the verifier. |
| Dependency | Razorpay and Stripe, if a person configures them. |
| Limitation | A missing secret fails verification in source, so that path does not record a payment. The corrected function was not redeployed. `00247` was not applied to hosted. Both are NOT RE-VERIFIED. |

`vercel.json` CSP allows `checkout.razorpay.com`, `api.razorpay.com`, `js.stripe.com`, and `api.stripe.com`. Allow-list is not activation.

## Subscription UI

`SubscriptionPaymentModal.tsx` tells the user that commercial prices are displayed and that activation charges ₹0. The file is dirty relative to HEAD. The domain policy agrees that the pilot does not charge (`PILOT_COMMERCIAL_MODE_POLICY.realPaymentCharged = false`).

## Out of scope

Buyer-to-supplier settlement is not this webhook. Supplier cashback is not a payment product.
