# Migration proof

## 2026-10-08

| Surface | Before | Applied this pass | After |
| --- | --- | --- | --- |
| Local Docker `127.0.0.1:54322` | `00250` | `00251_fresh_pin_coverage_otp_registered_fallback.sql` via `supabase migration up --local` only | `00251` |
| Hosted `qsuvtcezffomtwzwyrso` | NOT_INDEPENDENTLY_VERIFIED | None. No `db push`. No dry-run. Token NOT_SET. | NOT_INDEPENDENTLY_VERIFIED |

`00248`, `00249`, and `00250` were not edited. `00248` SHA-256 remains `a5faa3b32719eccc5de18acf7dac9cbed721a4bb07bc31015b568a02bf69df9f`. CLI pin remains `2.118.0`. A local ceiling is not a hosted ceiling. CI success from 2026-10-07 is not a hosted reading.

## Local Docker (`127.0.0.1:54322`, container `supabase_db_otp-local`)

| Point | Ceiling |
| --- | --- |
| HOSTED_MIGRATION_CEILING_BEFORE | NOT_INDEPENDENTLY_VERIFIED |
| LOCAL before | `00245` |
| MIGRATIONS_APPLIED this session | `00246_buyer_signup_allowlist_and_reveal_po_guard.sql`, `00247_revoke_record_verified_payment_client_execute.sql`, `00248_yearly_plan_quarterly_rfq_bonus.sql`, `00249_freeze_organization_subscription_entitlement_fields.sql`, `00250_financial_authority_client_grant_boundary.sql` |
| Command | `supabase migration up --local --yes` (not `--linked`) |
| Result | CLI reported `Migrations applied` for those five files |
| LOCAL after | `00250`, `00249`, `00248` are the top three versions in `supabase_migrations.schema_migrations` |
| HOSTED_MIGRATION_CEILING_AFTER | NOT_INDEPENDENTLY_VERIFIED |
| Hosted push | Not run. `db push --dry-run` was not run because the access token is NOT_SET. |

`00248` SHA-256 of the file on disk: `a5faa3b32719eccc5de18acf7dac9cbed721a4bb07bc31015b568a02bf69df9f`. The file was not edited.

## Local grant check after `00247`

`information_schema.routine_privileges` for `public.record_verified_payment` shows EXECUTE for `postgres` and `service_role` only. `anon` and `authenticated` are absent. EXECUTE was not re-granted to make tests pass.

## Hosted

Production project ref `qsuvtcezffomtwzwyrso` is the linked ref in `supabase/.temp/project-ref`. No access token was available. No credential file was read for a token. No hosted SQL was executed.

GitHub Actions run 206, step `Synchronize Supabase Database Migrations (Production)`, conclusion `success`, on SHA `9594a951e5e4fe0431e3b052d15e96b30dc3a07b`. That workflow's `EXPECTED_CEILING` is `00250` and it fails the job if the post-push remote chain does not match. The log text was not retrieved (HTTP 403). This paragraph is a CI outcome, not a database reading.

Apply order used locally was `00246` then `00247` then `00248` then `00249` then `00250`. `00248` was not applied alone.
