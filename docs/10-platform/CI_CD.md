# CI/CD

Workflow file: `.github/workflows/ci-cd.yml`. A run of this workflow was not inspected. Success for SHA `b7fbcea22273f6045ac0fdd562a278107dcf34b1` is `UNKNOWN`.

## Triggers

Push to `main`, `master`, `release/**`, `staging`, `develop`, tags `v*` and `release-*`, pull requests to those branches, and `workflow_dispatch`.

## Jobs that the file defines

| Job | What the file runs |
| --- | --- |
| `resolve-env` | Production for `main`, `master`, `release/*`, and `v*` tags. Staging/demo otherwise. |
| `build-and-lint` | `pnpm install --frozen-lockfile`, `pnpm test:vocab`, `pnpm db:migrate:check`, `pnpm --filter @otp/web build` with placeholder `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The job comment says GitHub Actions does not publish this bundle. |
| `test-coverage-policy` | `pnpm test:policy --strict` |
| `test-suites` | `pnpm test:unit`, `pnpm test:module`, `pnpm test:functional` |
| `quality-gate` | `pnpm gate:verify` with `ALLOW_OFFLINE=true` |
| `deploy` | On non-pull-request events. Production: `supabase db push --linked` against the project ref in the file, then `supabase functions deploy location-pin-coverage`. Staging: `pnpm db:migrate:deploy`. |

## What “deploy” does not do

The step “Deploy Direct to Production” only echoes text. It does not call Vercel. Web publication is not this job. Status of that step: `NOT-IMPLEMENTED` as a deploy.

The Supabase push is in the file. Status: `IMPLEMENTED` as automation in the workflow. A successful hosted push was not observed here. The expected ceiling string is `00247`. That string is the workflow expectation, not a hosted observation.

## Local scripts

`package.json` scripts `deploy` and `deploy:prod` call `scripts/deploy.ps1` and `scripts/deploy-prod.ps1`. The production script uses `docker exec otp-prod-db`. CI uses `supabase db push --linked` against project ref `qsuvtcezffomtwzwyrso`. Those are different database targets. DEFECT-02 is labelled: the script header and banner say LOCAL DOCKER ONLY and must not be used for hosted Supabase `qsuvtcezffomtwzwyrso`. Runtime behavior of where SQL is applied is unchanged. The script was not run. See [DEPLOYMENT_RUNBOOK.md](../12-operations/DEPLOYMENT_RUNBOOK.md).

Git commit and git push are not steps in the application. A person pushes. The workflow then runs if GitHub Actions is enabled. Whether it is enabled was not checked.
