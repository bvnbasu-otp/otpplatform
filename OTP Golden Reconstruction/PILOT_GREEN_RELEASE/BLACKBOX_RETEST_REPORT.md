# Black-box retest report

Date: 2026-10-07. Target: `https://otpplatform-theta.vercel.app` and `https://qsuvtcezffomtwzwyrso.supabase.co`. No account login. No payment. No secret. No fabricated supplier.

| Case | Result | Evidence |
| --- | --- | --- |
| Public homepage | PASS as reachability only | HTTP 200, SPA, asset `index-CbHugk-1.js` |
| Pricing sentence on the deployed JS | PASS | Chunk `index-C-tWaO3v.js` contains `3 requests a month` |
| Form 16A placeholder on the deployed JS | FAIL | Chunk `index-BaBAprvQ.js` contains `Form 16A` and `BLR0998811` |
| ONDC subscriber paths | FAIL | `/ondc`, `/ondc-site-verification.html`, `/ondc/on_subscribe` HTTP 200 as the 2838-byte SPA shell |
| `ondc-on-search` | FAIL | HTTP 404 |
| `payment-webhook` missing, malformed, bad signature, valid, duplicate, replay | BLOCKED | HTTP 404. The function is not deployed, so none of those cases ran. |
| `otp-dispatch` | FAIL | POST HTTP 404 |
| Google discovery PIN `560048` without a user | PASS as a rejection | HTTP 401 `Authentication required for discovery`. No suppliers returned. |
| Google discovery read-only PIN `560048` | PASS as an empty honest read | HTTP 200 `NEVER_DISCOVERED`, 0 external calls, 0 suppliers |
| Authenticated Google `places:searchText` | BLOCKED | No user session. Edge API key NOT_SET in this environment and not read from the function. |
| Buyer RFQ through settlement | NOT RUN | No login and no hosted financial read. |
| Hosted migration ceiling | BLOCKED | `SUPABASE_ACCESS_TOKEN` NOT_SET |

This is not a DOM-only pass. It is also not a full journey. Black-box result: **FAIL**.

Local tests are in the certificate. They are not this black-box.
