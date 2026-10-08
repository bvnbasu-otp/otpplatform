# Supabase

Status of local migration files: `IMPLEMENTED` on disk through `00250` (`00001`–`00250`). Local applied ceiling is `00245`. Hosted applied ceiling is NOT YET VERIFIED. Prior manual verification was `00245`. This phase did not query the hosted database and did not run the Supabase CLI. `00246` through `00250` are pending migration, not applied, not deployed, not production.

## Project ref named in CI

`.github/workflows/ci-cd.yml` sets `PRODUCTION_PROJECT_REF` to `qsuvtcezffomtwzwyrso` for `supabase link`, `supabase db push --linked`, and `supabase functions deploy location-pin-coverage`. That is the CI database target. It is not a confirmation the ref is at `00250`. `supabase/config.toml` sets `project_id = "otp-local"`. `scripts/deploy-prod.ps1` targets Docker container `otp-prod-db` and is labelled LOCAL DOCKER ONLY (DEFECT-02). It is not the hosted project ref. Local migration files on disk are `00001`–`00250`. Local applied ceiling is `00245`. Hosted applied ceiling is NOT YET VERIFIED. Prior manual verification remains `00245`.

## Migrations

Directory `supabase/migrations`. 250 SQL files, numbers 00001 through 00250, no gaps. Milestone list: [MIGRATION_HISTORY.md](../07-database/MIGRATION_HISTORY.md). Local applied ceiling is `00245`. Hosted applied ceiling is NOT YET VERIFIED. `00246` through `00250` are pending migration, not applied, not deployed, not production.

This reconstruction did not run the Supabase CLI, `db push`, or a hosted migration.

## Edge functions present

Directories under `supabase/functions` with an `index.ts`:

| Function | Role as read |
| --- | --- |
| `location-pin-coverage` | The function CI deploys by name |
| `messaging-outbound` | RFQ notification via `resolveProvider` |
| `messaging-inbound` | Present. Body not summarised. |
| `onboarding-notify` | Registration and approval notices via `resolveProvider` |
| `payment-webhook` | Signature check. SECURITY-01 remediated in source, not redeployed. |
| `ondc-on-search` | ONDC callback entry. Not a live network. |
| `supplier-magic-link` | Present. Body not summarised. |
| `process-attachment` | Present. |
| `demo-reset` | Present. |
| `rfq-quotes-blind` | Present. Name is historical; product language is identity-protected. |
| `rfq-quotes-identity-protected` | Present. |
| `rfq-quotes-revealed` | Present. |
| `otp-dispatch` | Present. Body not summarised. |

“Present” means the file exists. It does not mean the hosted project has that function deployed, except that CI’s production job contains a deploy command for `location-pin-coverage` only. That command was not executed here.

## Config

`supabase/config.toml` is local CLI config. It is not a hosted migration receipt.
