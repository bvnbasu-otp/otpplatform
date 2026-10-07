# SMS

Status: `CONFIG-GATED`. Same resolver as WhatsApp. Public copy groups “WhatsApp and SMS” as planned, not yet live.

| Layer | Evidence |
| --- | --- |
| Implementation | `TwilioMessagingProvider` when `MESSAGING_PROVIDER` is `TWILIO`, using `TWILIO_SMS_FROM`. |
| Configuration | Default provider id is `MOCK`. Hosted Twilio values: `UNKNOWN`. |
| Runtime verification | No SMS send was observed. |
| Production status | Not a live channel. |
| Dependency | Twilio, only if selected. |
| Limitation | No second SMS vendor appears in `resolve.ts`. |

`TwilioMessagingProvider` is constructed with `TWILIO_SMS_FROM` when the provider id is `TWILIO`. Missing account credentials throw. The default id is `MOCK`.

No separate SMS vendor besides Twilio was found in `resolve.ts`.

Do not claim suppliers receive RFQs by SMS. Do not cite older documentation that says an SMS gateway is permanently disabled or that a WAHA session is working. Those sentences live in the historical `docs/00` suite and are not the status.
