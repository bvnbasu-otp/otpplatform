# Integration catalog

Capability status is only [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md). This page repeats that status and adds the evidence split. It is not a second registry.

| Integration | Status | Customer-facing claim allowed |
| --- | --- | --- |
| OTP supplier registry | IMPLEMENTED | Available now, as registration on OTP. |
| Direct supplier link | IMPLEMENTED | Available now, as an invite link. |
| Google Places | CONFIG-GATED, EXTERNAL-DEPENDENCY | Not “available now”. Not a live usage number. Daily application limit is 1500. Monthly limit is NOT AUTHORITATIVELY CONFIGURED. |
| WhatsApp | CONFIG-GATED (default `MOCK`) | Planned. Not “suppliers receive RFQs on WhatsApp”. |
| SMS | CONFIG-GATED (default `MOCK`) | Planned. |
| Email SMTP | CONFIG-GATED | Do not claim a verified mailbox. |
| ONDC | CONFIG-GATED (`CREDENTIAL_GATED`) | Not connected. |
| BNI | PLANNED | Planned. The stub adapter is not a network. |
| Razorpay | CONFIG-GATED | Not a live charge. Pilot charges ₹0 in policy. |
| Stripe | CONFIG-GATED | Same. |
| Payments webhook | CONFIG-GATED | Do not claim checkout is live. A missing secret fails verification in source. Hosted function deploy: NOT RE-VERIFIED. |
| Sentry | CONFIG-GATED | `VITE_SENTRY_DSN` is read in `telemetry-sentry.ts`. DSN presence in production: `UNKNOWN`. |

## Evidence split

| Integration | Implementation | Configuration | Runtime verification | Production status | Dependency | Limitation |
| --- | --- | --- | --- | --- | --- | --- |
| Google Places | Edge coverage path plus a separate library ladder. See [GOOGLE_PLACES.md](./GOOGLE_PLACES.md). | Daily 1500. Key names `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY`. | Unit tests of the guard and the library ladder passed. No live Google call. | Buyer path is the edge function. Hosted key and responses: `UNKNOWN`. | Google Places API (New). | Monthly limit NOT AUTHORITATIVELY CONFIGURED. 1500 is not usage. |
| ONDC | Signing helpers, environment gate, `on_search` ingress that NACKs unless pre-production material is complete and hosts are not production hosts. | `ONDC_ENVIRONMENT` and the pre-prod and production slot names in [ONDC.md](./ONDC.md). Hosted values `UNKNOWN`. | Domain gate and foundation tests passed. No network call. | `CONFIG-GATED`. Not live. CI does not deploy `ondc-on-search`. | ONDC registry and gateway. | Files and CSP do not make a live channel. |
| WhatsApp | `resolveProvider`, `messaging-outbound`. | `MESSAGING_PROVIDER` defaults to `MOCK`. | No handset delivery. | Not live. | Twilio or Meta, only if selected. | Mock success is not delivery. |
| SMS | Same resolver, Twilio SMS from-number when selected. | Default `MOCK`. | No send observed. | Not live. | Twilio, only if selected. | No second SMS vendor in `resolve.ts`. |
| Email | `resolveSmtpConfig`. | `SMTP_*`. Production code default host `smtp.gmail.com`. Hosted values `UNKNOWN`. | No message sent. | `UNKNOWN`. | The configured SMTP host. | A default host is not a mailbox. |
| Razorpay | Webhook HMAC branch in `payment-webhook`. | `RAZORPAY_WEBHOOK_SECRET`. | Not executed. | `CONFIG-GATED`. Checkout not shown live. | Razorpay. | An unset secret fails verification. No compiled fallback remains in source. Hosted function: NOT RE-VERIFIED. |
| Stripe | Webhook HMAC branch, including the 300-second timestamp check. | `STRIPE_WEBHOOK_SECRET`. | Not executed. | `CONFIG-GATED`. | Stripe. | An unset secret fails verification. No compiled fallback remains in source. Hosted function: NOT RE-VERIFIED. |
| BNI | `BniNetworkAdapter` is `stubAdapter` in `supplier-network-adapters.ts`. It returns a synthetic “BNI match” if `discover` is called. | `createOtpServices` sets `isLive: false`. | Not a network call. | Public copy planned. Web client does not import the adapter. | None configured. | Synthetic name must not be described as a BNI member. |
| Payments | `record_verified_payment` after verification. | Three webhook secret names. Pilot `realPaymentCharged` false. | Not executed. | `CONFIG-GATED`. Function deploy not in CI. | Razorpay, Stripe, or the generic signature. | A failed verification does not call the RPC. Local `00247` grants EXECUTE to `service_role` only. Hosted `00247` and the function deploy: NOT RE-VERIFIED. |

CSP entries in `vercel.json` for Razorpay, Stripe, Sentry, Supabase, and `*.ondc.org` allow the browser to connect. They do not activate the integration.
