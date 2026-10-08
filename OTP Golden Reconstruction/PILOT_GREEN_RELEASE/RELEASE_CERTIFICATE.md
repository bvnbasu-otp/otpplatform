# Release certificate

## 2026-10-08 decision

AMBER — MATERIAL PILOT GAPS REMAIN

`HEAD` and `origin/main` are still `9594a951e5e4fe0431e3b052d15e96b30dc3a07b`. Not committed. Not pushed. Not hosted-migrated. Not deployed.

Local Docker ceiling is `00251`. Hosted ceiling was not read (`SUPABASE_ACCESS_TOKEN` NOT_SET, `AccessTokenRequiredError`). `payment-webhook` and `otp-dispatch` are still HTTP 404. The live site still serves Form 16A TAN `BLR0998811` in `/assets/index-BaBAprvQ.js`. A local production build of the working tree does not contain that TAN. Root vitest: 437 files, 4640 tests, passed. `scripts/test-functions.ts`: 43 passed. Those are local results, not hosted proof.

The 2026-10-07 text below is the baseline this pass started from.

Date: 2026-10-07  
Repository: `github.com/bvnbasu-otp/otpplatform`  
SHA inspected: `9594a951e5e4fe0431e3b052d15e96b30dc3a07b`  
Public host: `https://otpplatform-theta.vercel.app`  
Hosted project ref: `qsuvtcezffomtwzwyrso`

## Decision

AMBER — MATERIAL PILOT GAPS REMAIN

P0 is not zero. P1 is not zero. No commit, push, or hosted deploy was made.

## Why this is not green

- Hosted migration ceiling was not read. Access token NOT_SET. Actions run 206 succeeded and its log was not retrieved. That is not independent proof.
- `payment-webhook` is HTTP 404. Webhook security was not certified.
- `otp-dispatch` is HTTP 404. Signup, password reset, and profile OTP call that function.
- Google discovery was not executed. ONDC routes are the SPA shell, so the gap is not external-only.
- The live bundle still contains a Form 16A download with placeholder TAN `BLR0998811`.
- The deployed admin path still writes `subscription_status` from the client. The working-tree RPC fix is not deployed.

## Local proof that does not certify production

| Run | Result |
| --- | --- |
| `supabase migration up --local` for `00246` through `00250` | Applied. Local ceiling `00250`. `00248` file hash matches `a5faa3b32719eccc5de18acf7dac9cbed721a4bb07bc31015b568a02bf69df9f`. |
| `vitest run` of the three financial-authority security files | PASS. 3 files, 25 tests. |
| `vitest run` of the three dirty web files (admin verify, TDS panel, pilot allowance) | PASS. 3 files, 22 tests. |
| `vitest run tests/integration tests/security tests/demo tests/functional` | PASS. 79 files, 1150 tests. Duration 504.89s. |
| `vitest run tests/unit tests/certification apps/web/src packages/domain/src packages/services/src packages/database/src` | FAIL. 355 files passed, 1 file failed. 3481 tests passed, 1 failed. |

The single failure is `tests/certification/gap01/postgres-00225-rfq-coverage-bridge.test.ts`, case `FRESH coverage without phone does not create a supplier, identity, or invitation`. It expected an invitation count greater than 0 because the local database has 120 `ACTIVE` suppliers. Migration `00236` does not fall through from fresh pin coverage to OTP-registered suppliers, and `00246`–`00250` do not replace `discover_and_invite_for_rfq`. The phone-less place was not turned into a supplier. This failure was not patched and the Supplier Network Engine was not redesigned.

## Not done

Commit. Push. Hosted `db push`. Edge deploy. Browser login journey. `pnpm test` as the package-script wrapper (the vitest paths above cover that script's file sets except `scripts/test-functions.ts`, which was not run).

Evidence: the other files in this directory and `OTP_PILOT_AMBER_GREEN_MASTER_REGISTER.md`.
