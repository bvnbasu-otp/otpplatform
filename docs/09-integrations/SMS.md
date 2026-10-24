# SMS

Source reviewed 23 October 2026. Status word: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md).

**SMS is not available for the pilot.** No pilot flow sends SMS. The only SMS-capable code is the Twilio provider, and Twilio is not a pilot provider.

| Layer | Evidence |
| --- | --- |
| Implementation | `TwilioMessagingProvider` (`supabase/functions/_shared/messaging/providers/twilio.ts`) handles `SMS` and `WHATSAPP` when `MESSAGING_PROVIDER=TWILIO`, using `TWILIO_SMS_FROM`. `MockMessagingProvider` simulates both channels. |
| Configuration (names only) | `MESSAGING_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`. The pilot provider is WAHA, which handles WhatsApp only. |
| Runtime verification | No SMS send observed |
| Production status | Not available |
| Limitation | No SMS vendor other than Twilio in `resolve.ts` |

## Why no pilot flow sends SMS

- `otp-dispatch` and `onboarding-notify` always send with `channel: 'WHATSAPP'`.
- `messaging-outbound` picks a verified SMS channel when the supplier has no verified WhatsApp channel but does have a verified SMS one. Under WAHA, that send returns `FAILED`.
- `packages/services/src/notifications/notification-queue-worker.ts` registers an `SmsNotificationAdapter` that is a mock.

## Application text that still implies SMS

These strings are in application code. They are recorded as MSG-03 in [DOCUMENTATION_DISCOVERED_DEFECTS.md](../13-truth/DOCUMENTATION_DISCOVERED_DEFECTS.md) and were not changed by documentation work:

- `NotificationPreferencesModal.tsx` offers an SMS channel toggle.
- `PersonaAuditStatementModal.tsx` says "verified via OTP SMS verification".
- `AdminServiceActionsPanel.tsx` says "SMS Pings".
- `LegalPage.tsx` mentions supplier messages via SMS.

Public site copy (`site-content.ts`, `AboutPage.tsx`) says WhatsApp and SMS are planned, not yet live. For SMS that matches this page.

Do not claim that suppliers or buyers receive anything by SMS. Do not cite the historical `docs/00`–`docs/15` suite on SMS status.
