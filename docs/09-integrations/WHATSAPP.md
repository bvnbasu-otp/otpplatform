# WhatsApp

Status: `CONFIG-GATED`. Not a live supplier channel. Public copy: planned, not yet live (`site-content.ts`, `AboutPage.tsx`).

| Layer | Evidence |
| --- | --- |
| Implementation | `resolveProvider` and `messaging-outbound`. |
| Configuration | `MESSAGING_PROVIDER` unset or `MOCK` selects the mock. `TWILIO_*` or `META_*` are required only when that provider is selected. Hosted values: `UNKNOWN`. |
| Runtime verification | No handset delivery was observed. |
| Production status | Default mock. Not a live channel. |
| Dependency | Twilio or Meta, only if selected. |
| Limitation | A successful function response under `MOCK` is not a WhatsApp message. |

## Code that exists

`supabase/functions/_shared/messaging/providers/resolve.ts` function `resolveProvider`:

| `MESSAGING_PROVIDER` | Behaviour |
| --- | --- |
| unset or `MOCK` | `MockMessagingProvider` |
| `TWILIO` | Requires `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, else throws |
| `META` | Requires `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, and `META_APP_SECRET`, else throws |
| anything else | Throws |

`supabase/functions/messaging-outbound/index.ts` sends one RFQ notification through that provider and logs it. The header says a buyer invite previously created `rfq_invitations` and did not message the phone, and that this function is the call. Default provider remains mock, so the call can “succeed” without a handset.

`onboarding-notify` uses the same resolver for registration received and approval activation. That is also not proof of WhatsApp delivery.

## What not to write

Do not write that suppliers receive RFQs on WhatsApp. Do not write that the route `/q/:token` is reached from a WhatsApp message in production. The route exists so a token can be opened. The transport that delivers the token is `CONFIG-GATED`.

`scripts/whatsapp-bridge/package.json` exists. It was not treated as a live gateway.
