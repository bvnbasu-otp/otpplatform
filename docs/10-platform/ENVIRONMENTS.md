# Environments

Names only. No values.

| Name | Where it is read | Status if unset |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `apps/web/src/lib/supabase.ts`. CI build uses placeholders. | Client cannot reach a real project. Production values: `UNKNOWN`. |
| `VITE_DEMO_MODE` | `demo-config.ts`, `synthetic-quote-guard.ts` | Not demo unless the string is `true`. |
| `VITE_FOUNDER_EMAIL` | `user-role.ts` | Behaviour when empty was not traced. |
| `VITE_SUPPORT_ADMIN_EMAIL` | `SupportHelpButtonModal.tsx` | Fallback address is in source. |
| `VITE_SENTRY_DSN` | `telemetry-sentry.ts` | Sentry stays off if empty. `CONFIG-GATED`. |
| `GOOGLE_PLACES_API_KEY`, `GOOGLE_MAPS_API_KEY` | Places adapter constructor | `CREDENTIAL_GATED`. |
| `MESSAGING_PROVIDER` | `resolveProvider` | Defaults to `MOCK`. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WEBHOOK_URL` | Twilio provider | Required sid and token when provider is `TWILIO`. |
| `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`, `META_APP_SECRET` | Meta provider | Required when provider is `META`. |
| `MESSAGING_MOCK_SECRET` | Mock provider | Optional shared secret argument. |
| `APP_URL` | `messaging-outbound` | Default in that file is a localhost-style product host string. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_SENDER_NAME`, `SMTP_ADMIN_EMAIL` | `resolveSmtpConfig` | Defaults described in [EMAIL.md](../09-integrations/EMAIL.md). |
| `RAZORPAY_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`, `PAYMENT_WEBHOOK_SECRET` | `verifyAndExtractWebhook` | Unset: verification fails. SECURITY-01 remediated in source, not redeployed. Values are not listed here. |
| `ONDC_ENVIRONMENT`, `ONDC_PROVIDER_ENABLED`, `ONDC_NETWORK_ENABLED`, `ONDC_PRODUCTION_ENABLED`, `ONDC_PREPROD_*`, `ONDC_PRODUCTION_*` | `resolveOndcEnvironmentGate` via `ondc-on-search` | Incomplete slot: real client denied. Legacy `ONDC_ENABLED` does not open a slot. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Edge function service clients | Required for those functions to call the database. |
| `SUPABASE_ACCESS_TOKEN` | CI production migration job | Job exits if missing. |

Billing mode is a function argument (`resolveBillingMode`), not a `VITE_` variable that was found. Default `PILOT_FREE`.

There is no checked-in proof of which of these are set on the hosted project.
