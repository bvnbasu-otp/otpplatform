# Edge function runtime proof

## 2026-10-08 re-probe

Host: `https://qsuvtcezffomtwzwyrso.supabase.co/functions/v1/`. No bearer. No secret.

| Function | Method | HTTP | Meaning |
| --- | --- | --- | --- |
| `location-pin-coverage` | GET | 405 | Function exists. |
| `payment-webhook` | GET and POST | 404 | `Requested function was not found`. |
| `otp-dispatch` | GET and POST | 404 | `Requested function was not found`. |
| `ondc-on-search` | GET and POST | 404 | `Requested function was not found`. |

`otp-dispatch` source is the OTP-platform code dispatcher for signup verification, password reset, and profile credential OTP. It is not proof that WhatsApp or SMS is live. Messaging secrets in this environment are NOT_SET. The function returns a code only when `OTP_DEBUG_REVEAL_CODE` is set. Hosted duplicate and replay cases were not run because the functions are not deployed.

`scripts/test-functions.ts` on 2026-10-08: 43 passed, 0 failed. That is a local Deno run of `_shared/` and `payment-webhook/`, not a hosted HTTP call.

## Baseline 2026-10-07

Host: `https://qsuvtcezffomtwzwyrso.supabase.co/functions/v1/`. Date: 2026-10-07. No Authorization bearer was sent. No secret was sent. Response bodies below are the function or gateway error strings only.

| Function | Method | HTTP | Body observed |
| --- | --- | --- | --- |
| `location-pin-coverage` | GET | 405 | `{"error":"Method not allowed"}` |
| `location-pin-coverage` | POST discovery, PIN `560048`, category `electrical`, `executeDiscovery` true, no bearer | 401 | `{"error":"Authentication required for discovery"}` |
| `location-pin-coverage` | POST same scope, `executeDiscovery` false | 200 | `ok` true, `status` `NEVER_DISCOVERED`, `externalCallsExecuted` 0, `knownSuppliersCount` 0, `suppliers` empty |
| `payment-webhook` | GET | 404 | `{"code":"NOT_FOUND","message":"Requested function was not found"}` |
| `payment-webhook` | OPTIONS | 404 | same NOT_FOUND |
| `otp-dispatch` | POST JSON purpose signup, example identifier | 404 | same NOT_FOUND |
| `ondc-on-search` | GET | 404 | same NOT_FOUND |
| `onboarding-notify` | POST `{}` | 404 | same NOT_FOUND |
| `messaging-outbound` | POST `{}` | 404 | same NOT_FOUND |
| `messaging-inbound` | POST `{}` | 404 | same NOT_FOUND |
| `demo-reset` | POST `{}` | 404 | same NOT_FOUND |
| `supplier-magic-link` | POST `{}` | 404 | same NOT_FOUND |

`location-pin-coverage` is deployed. The read-only call did not execute an external Google request and did not return suppliers.

`payment-webhook` and `otp-dispatch` are not deployed. CI run 206's deploy step is only `location-pin-coverage`, and that step succeeded. The 404s after that run show the other functions were not part of the deploy.

Invalid, missing, malformed, duplicate, valid, and replay webhook cases were not executed on the hosted project because the function is absent. A 404 is not an acceptance and is not an idempotent settlement.
