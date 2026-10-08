# ONDC runtime proof

## 2026-10-08

GET `https://otpplatform-theta.vercel.app/`, `/ondc`, `/ondc-site-verification.html`, and `/ondc/on_subscribe` each returned HTTP 200, 2838 bytes, and the SPA root. Those 200s are not APIs. Edge `ondc-on-search` GET and POST returned HTTP 404. No registry call was made. No private key was printed. The live bundle says ONDC status `PLANNED` and `Not connected`. That public sentence is consistent with this probe. It does not certify pre-prod.

## Baseline identity

Subscriber identity used only as the public host name already stated for this pilot:

- Subscriber ID: `otpplatform-theta.vercel.app`
- Subscriber URL: `https://otpplatform-theta.vercel.app/ondc`
- Verification URL: `https://otpplatform-theta.vercel.app/ondc-site-verification.html`
- `on_subscribe`: `https://otpplatform-theta.vercel.app/ondc/on_subscribe`
- Intended environment: PRE_PROD, role buyer app / BAP

No signing or encryption private key was printed or requested.

## HTTP

| URL | HTTP | What came back |
| --- | --- | --- |
| `https://otpplatform-theta.vercel.app/ondc` | 200 | 2838 bytes, same size as the site homepage. SPA shell, not a Beckn handler. |
| `https://otpplatform-theta.vercel.app/ondc-site-verification.html` | 200 | 2838 bytes. Same SPA shell. The file is not in the repository. |
| `https://otpplatform-theta.vercel.app/ondc/on_subscribe` | 200 | 2838 bytes. Same SPA shell. No `answer` payload. |
| `https://qsuvtcezffomtwzwyrso.supabase.co/functions/v1/ondc-on-search` | 404 | `Requested function was not found` |

`vercel.json` rewrites unmatched paths to `index.html`. These three public paths are that rewrite.

Public site copy in the live main bundle contains `Not connected` for the ONDC channel. That matches the docs status `CONFIG-GATED` / planned. It does not match a live pre-prod network.

## Why this is not conditional-external

Registry whitelist and subscriber keys are external. The verification file, the `on_subscribe` route, and the deployed `on_search` function are OTP-owned and are absent. A missing OTP route cannot be certified as "waiting on ONDC only."

`ONDC_ENABLED`, `ONDC_ENVIRONMENT`, `ONDC_SUBSCRIBER_ID`, `ONDC_UNIQUE_KEY_ID`, `ONDC_BAP_URI`, `ONDC_SIGNING_PRIVATE_KEY_PEM`, `ONDC_GATEWAY_URL`, and `ONDC_REGISTRY_URL` are names in `.env.production.example`. Hosted values were not read. NOT_CONFIGURED is not recorded as success.

## Decision

ONDC pre-prod connectivity is **NOT CERTIFIED**.
