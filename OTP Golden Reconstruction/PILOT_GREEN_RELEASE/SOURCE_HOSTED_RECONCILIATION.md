# Source and hosted reconciliation

## 2026-10-08

| Name | Value |
| --- | --- |
| SOURCE_SHA | `9594a951e5e4fe0431e3b052d15e96b30dc3a07b` |
| ORIGIN_SHA | same |
| COMMIT | NOT COMMITTED |
| HOSTED_MIGRATION_CEILING | NOT_INDEPENDENTLY_VERIFIED |
| LOCAL_MIGRATION_CEILING | `00251` |
| DEPLOYED_WEB | Still the `9594a951` bundle. Not redeployed. |
| DEPLOYED_EDGE | `location-pin-coverage` present. `payment-webhook`, `otp-dispatch`, `ondc-on-search` HTTP 404. |
| CLI pin | `2.118.0`, unchanged |

Working-tree release fixes (migration `00251`, TDS truth, admin RPC, CI function deploy steps) are uncommitted because hosted P0s are open. Pre-existing dirty docs were not staged.

Observed 2026-10-07. No secrets are recorded here.

| Name | Value |
| --- | --- |
| SOURCE_SHA | `9594a951e5e4fe0431e3b052d15e96b30dc3a07b` |
| ORIGIN_SHA | `9594a951e5e4fe0431e3b052d15e96b30dc3a07b` |
| Branch | `main` tracking `origin/main` |
| CI_WORKFLOW_SHA | `9594a951e5e4fe0431e3b052d15e96b30dc3a07b` |
| GitHub Actions run | `37655927269` (run number 206), conclusion `success`, updated `2026-10-07T17:08:18Z` |
| DEPLOYED_VERCEL_SHA | `9594a951e5e4fe0431e3b052d15e96b30dc3a07b` |
| Vercel deployment id | GitHub deployment `6915808613`, creator `vercel[bot]`, state `success`, created `2026-10-07T17:03:39Z` |
| Public production URL | `https://otpplatform-theta.vercel.app` HTTP 200 |
| Deployment-specific URL | HTTP 302 to Vercel authentication. Body was not compared. |
| Live entry asset | `/assets/index-CbHugk-1.js` |
| HOSTED_MIGRATION_CEILING | NOT_INDEPENDENTLY_VERIFIED |
| LOCAL_MIGRATION_CEILING | `00250` after this session; `00245` before |
| DEPLOYED_EDGE_FUNCTIONS | `location-pin-coverage` only, among the functions probed |
| SUPABASE project ref | `qsuvtcezffomtwzwyrso` (from repo CI and CLI link file). Token NOT_SET. |

## What matches

Local git HEAD equals `origin/main`. The Vercel bot deployment record for Production names that same SHA. The public site is up and includes the current pricing sentence in chunk `index-C-tWaO3v.js` (`3 requests a month`).

The production workflow's "Deploy Direct to Production" step only prints text. Web publication is the Vercel Git integration, not that echo step. Run 206 still succeeded that echo step. That success is not the web deploy. The `vercel[bot]` record is the web deploy evidence.

## What does not match

Hosted database ceiling was not queried. `supabase projects list` returned `AccessTokenRequiredError`. Run 206's migration step concluded success and the workflow verifies ceiling `00250` after push, but the log download returned HTTP 403. A successful job is not an independent ceiling reading.

Edge functions required for OTP issuance and payment verification are not on the hosted project. See `EDGE_FUNCTION_RUNTIME_PROOF.md`.

## CLI pin

`.github/workflows/ci-cd.yml` pins Supabase CLI `2.118.0`. The local CLI is `2.118.0`. The pin was not changed.

## Working tree

`git status` at discovery showed committed HEAD clean of staged changes, with pre-existing unstaged docs and three feature areas, plus untracked reconstruction files. Those were not reverted and were not staged.
