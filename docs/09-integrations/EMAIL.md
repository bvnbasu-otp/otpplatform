# Email

Status: `CONFIG-GATED`. Delivery `UNKNOWN`.

The local `00327` dispatch contract requires a non-null idempotency key, limits recipient-address length, prevents authenticated direct mutation, and limits reads to the recipient profile or platform administrators. Provider attempts retain retry/idempotency semantics. Tests use mocks or local sinks only; no real recipient was contacted. SMTP configuration and hosted delivery remain separately unverified.

| Layer | Evidence |
| --- | --- |
| Implementation | `resolveSmtpConfig` in `email-dispatcher.ts`. |
| Configuration | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_SENDER_NAME`, `SMTP_ADMIN_EMAIL`. Non-production defaults are localhost port 1025. Production defaults in code are `smtp.gmail.com` and port 587. Hosted values: `UNKNOWN`. |
| Runtime verification | No message was sent. |
| Production status | Not verified. |
| Dependency | Whatever host those variables name. |
| Limitation | A default host string is not a mailbox. |

`packages/services/src/notifications/email-dispatcher.ts` function `resolveSmtpConfig`:

| Variable | Use |
| --- | --- |
| `SMTP_HOST` | Host. Default `127.0.0.1` when `NODE_ENV` is not `production`, else `smtp.gmail.com`. |
| `SMTP_PORT` | Default `1025` in non-production, else `587`. |
| `SMTP_USER`, `SMTP_PASS` | Optional in the resolver. |
| `SMTP_SECURE` | True when set to `true` or port `465`. |
| `SMTP_SENDER_NAME` | Default `OTP Platform`. |
| `SMTP_ADMIN_EMAIL` or `SMTP_USER` | Sender address. Default `noreply@otp.trade` if both are empty. |

A default host is not a verified mailbox. This reconstruction did not send mail.

`VITE_SUPPORT_ADMIN_EMAIL` is read by `SupportHelpButtonModal.tsx`, with a fallback display address in source. That is a client address string, not proof of delivery.

Registration notices in `onboarding-notify` go through the messaging provider (phone), not through this SMTP resolver.

## Contact Us email relay

Status: implemented and unit-tested. **Not runtime-verified. Not deployed. No email has been sent.** **CONTACT US — NOT DEPLOYMENT READY.**

Path: `contact-enquiry` edge function → `createContactEmailRelayTransport` (`supabase/functions/_shared/contact/email-relay.ts`) → `POST <CONTACT_EMAIL_RELAY_URL>/contact-email` → `scripts/whatsapp-bridge/contact-email.js` → Nodemailer → SMTP server → fixed recipient `bvnbasu+otp.demo.otp.support@gmail.com`.

| Rule | Behaviour |
| --- | --- |
| Order | The enquiry is recorded first. A duplicate submission never calls the relay again. |
| Status | Relay URL or secret absent or invalid → `NOT_CONFIGURED`. Relay error, non-200, timeout (15 s) or anything but `{"status":"ACCEPTED"}` → `FAILED`. `SENT` = the SMTP server accepted the message for the fixed recipient. It is not proof of delivery. |
| Authentication | Header `X-Contact-Relay-Secret`, compared in constant time. The bridge refuses the WAHA `X-Api-Key` on this route, and the WAHA routes do not accept the relay secret. The bridge disables the relay if the secret is missing, shorter than 32 characters or equal to `WAHA_API_KEY`. |
| Body | `application/json`, at most 32 KiB, exactly `subject` (≤ 200 characters, single line), `text` (≤ 8000 characters, no CR or control characters except newline and tab) and `replyTo` (one plain address). Any other field, including `to`, `cc` or `bcc`, is refused. |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` are required; `SMTP_SECURE`, `SMTP_SENDER_NAME` are optional. The sender is `SMTP_USER`. STARTTLS is mandatory unless the host is loopback or the connection uses implicit TLS. Connection 5 s, greeting 5 s, socket 10 s, overall 12 s. |
| Logs | Event codes only (`SMTP_ACCEPTED`, `SMTP_REJECTED`, `SMTP_TIMEOUT`, `SMTP_ERROR`, `UNAUTHORIZED`, ...). No credentials, addresses or content. |

Relay origin: a dedicated `CONTACT_EMAIL_RELAY_URL`, not `WAHA_BASE_URL`. `scripts/Sync-OTP-WahaUrl.ps1` points `WAHA_BASE_URL` at a tunnel to WAHA port 3008, which bypasses the bridge. That URL therefore cannot be assumed to reach `/contact-email`.

Variable names (values are never committed or printed):

| Where | Names |
| --- | --- |
| Bridge process (environment, else `.env.otp.production.local`) | `CONTACT_EMAIL_RELAY_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_SENDER_NAME`; existing `WAHA_API_KEY`, `WAHA_TARGET_URL`, `BRIDGE_HOST` (default `127.0.0.1`), `BRIDGE_PORT` (default `3009`). Template: `scripts/whatsapp-bridge/.env.example`. |
| Hosted edge function secrets | `CONTACT_EMAIL_RELAY_URL` (HTTPS origin of the bridge, no path), `CONTACT_EMAIL_RELAY_SECRET` (same value as the bridge's). |

Start: `node scripts/whatsapp-bridge/index.js` (unchanged). The startup banner states only `ENABLED` or `DISABLED (<reason code>)` for the relay. The bridge generates no secrets and changes no tunnel or hosted setting.

Future operator actions (not done): choose and set a long random `CONTACT_EMAIL_RELAY_SECRET` on the bridge and as a hosted secret. Set the Gmail `SMTP_*` values; Gmail needs 2-Step Verification and an app password for `SMTP_PASS`. Expose bridge port 3009 (not WAHA port 3008) through an HTTPS tunnel and set `CONTACT_EMAIL_RELAY_URL` to that origin. Deploy `contact-enquiry` after the deferred proposal `supabase/public_contact_enquiries.DEFERRED.UNVERSIONED.sql` (former `00322`) is numbered and applied. Then prove one SMTP acceptance end to end.
