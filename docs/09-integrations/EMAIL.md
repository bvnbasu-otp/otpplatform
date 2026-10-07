# Email

Status: `CONFIG-GATED`. Delivery `UNKNOWN`.

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
