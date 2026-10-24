# WhatsApp

Source reviewed 23 October 2026. Status word: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md). SMS is a separate page: [SMS.md](./SMS.md).

**WAHA (self-hosted WhatsApp HTTP API) is the WhatsApp provider currently working for the demo. The owner has confirmed its demo status.** A successful demo send shows that the outbound path to one handset worked at that time. It does not prove every inbound and outbound path, production reliability, delivery receipts, or monitoring. Meta and Twilio code exists but they are not pilot providers.

| Layer | Evidence |
| --- | --- |
| Implementation | `WahaMessagingProvider` in `supabase/functions/_shared/messaging/providers/waha.ts`, selected by `resolveProvider` in `.../providers/resolve.ts` |
| Configuration (names only) | `MESSAGING_PROVIDER=WAHA`, `WAHA_BASE_URL` (an origin only: no path, query, or credentials), `WAHA_SESSION` (`[A-Za-z0-9_-]{1,64}`), optional `WAHA_API_KEY`. Hosted values: not read for this page. |
| Runtime verification | Owner-confirmed demo sends. Historical evidence files: `OTP Golden Reconstruction/WAHA_CONTROLLED_PILOT_DISPATCH_EVIDENCE.json`, `WAHA_E2E_RCA_CERTIFICATION_2026-10-11.json`. Not re-observed for this page. |
| Production status | Demo provider. Not proven as a production-grade channel. |
| Dependency | The WAHA container, the operator's workstation, and a tunnel (see below) |
| Limitation | `SENT` means the gateway accepted the message, not that it was delivered. No delivery receipts. Inbound refused (see below). |

## How a message travels

Hosted edge function → `WAHA_BASE_URL` (an HTTPS tunnel origin) → `scripts/whatsapp-bridge/index.js` (API-key proxy, reads `WAHA_API_KEY`) → local WAHA container on port `3008` (`docker-compose.prod.yml`, image `otp-waha-paired`). `scripts/Sync-OTP-WahaUrl.ps1` looks for exactly one HTTPS tunnel to port 3008. It then sets the `WAHA_BASE_URL` Supabase secret. It does not print the secret.

Before each send, the provider:
1. checks `GET /api/sessions/{session}` and requires status `WORKING`;
2. resolves the chat id with `GET /api/contacts/check-exists`, falling back to `<digits>@c.us`;
3. sends with `POST /api/sendText`.

## Which flows use WhatsApp, SMS, or neither (per source)

| Flow | Function | Channel | Notes |
| --- | --- | --- | --- |
| Signup verification, password reset, and profile phone-credential codes | `supabase/functions/otp-dispatch/index.ts` | WhatsApp only (`channel: 'WHATSAPP'`) | A `MOCK` provider is refused (503). A failed send invalidates the code. An email credential code is not sent in the pilot unless the server-side `OTP_DEBUG_REVEAL_CODE` flag is on. |
| Registration received / approval activation code | `supabase/functions/onboarding-notify/index.ts` | WhatsApp only | Sent to the applicant's phone for both legs |
| Supplier RFQ invitation | `supabase/functions/messaging-outbound/index.ts` (called by the `rfq_invitations` trigger through `pg_net`) | Prefers a verified WhatsApp channel. Falls back to a verified SMS channel, then to the supplier's `contact_phone` as WhatsApp | Under WAHA, an SMS-only supplier gets `FAILED` ("WAHA provider handles WhatsApp only"). Skips demo RFQs, the gateway operator handset, and the buyer's own phone (00272 guard) |
| Inbound supplier replies | `supabase/functions/messaging-inbound/index.ts` | **Neither in WAHA mode.** The webhook is refused. | See MSG-01 below |
| Browser-side WhatsApp sends | `apps/web/src/features/notifications/lib/outbound-dispatch.ts` | Neither | Removed. Sends happen only on the server. |
| `packages/services/src/notifications/notification-queue-worker.ts` | Library | Mock adapters (`waha-…` / `sms-…` ids) | Not a provider call |

## Failure modes

- The workstation, the WAHA container, the bridge, or the tunnel is down, or the tunnel URL changed without a sync. The send returns `FAILED`: session check failed, timed out, returned an HTTP status, or returned HTML from the tunnel.
- The session is not `WORKING`. The phone was unpaired or logged out.
- A configuration error (`MessagingConfigError`). The function answers 500 or 503. It does not fall back to the mock.
- An HTTP 201 with an empty body is treated as `SENT`. An `@c.us` id can be accepted without delivery. `check-exists` reduces but does not remove this risk.
- `parseStatus` returns nothing, so no delivery receipt reaches `record_notification_delivery`.

## Still to verify

- Each flow above, end to end, on the hosted functions.
- Behaviour when the tunnel rotates.
- Monitoring or alerting for session loss. None was found in source.
- Inbound replies.
- Delivery confirmation. `scripts/verify-waha-e2e-delivery.mjs` requires a message id and a status read-back, but live dispatch is disabled in that utility.

## Public Contact Us WhatsApp link is a different thing

The public Contact Us page (`/contact-us`, `apps/web/src/features/contact/`) shows a plain link: "Contact us on WhatsApp", +91 9972967530, `https://wa.me/919972967530` (`CONTACT_WHATSAPP_HREF` in `contact-details.ts`). It opens in a new tab with `rel="noopener noreferrer"`. Tapping it is a direct action in the visitor's own WhatsApp. It does not call OTP, WAHA, `messaging-inbound`, `contact-enquiry`, or any other edge function, and OTP records nothing. The Contact Us form stores enquiries through `contact-enquiry` and does not use WhatsApp or WAHA. That number is also the WAHA gateway operator handset named in [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md), and `messaging-outbound` refuses to send to it (MSG-05).

## What not to write

- Do not write that inbound WhatsApp quoting works.
- Do not write that a `SENT` status means delivered.
- Do not write that WAHA is a production-grade or monitored channel.
- Public copy in `apps/web/src/features/site/content/site-content.ts` still says WhatsApp is not yet live. That differs from the capability table. It is a product decision (see [DOCUMENTATION_DISCOVERED_DEFECTS.md](../13-truth/DOCUMENTATION_DISCOVERED_DEFECTS.md) MSG-04), not a reason to edit this page.
