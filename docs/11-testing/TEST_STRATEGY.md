# Test strategy

Commands below exist in the root `package.json`. Phase 2 executed no tests.

## Phase 1 evidence (not re-run in Phase 2)

Targeted only. 5 files, 78 tests passed:

- `packages/domain/src/types/pricing-entitlement.test.ts`
- `packages/domain/src/ondc/ondc-provider-foundation.test.ts`
- `packages/domain/src/ondc/ondc-environment.test.ts`
- `packages/services/src/gis/google-gis-safety-quota.test.ts`
- `packages/services/src/gis/google-places-pilot-activation.test.ts`

That run does not prove hosted Google, ONDC, payments, deployed functions, or hosted migrations. The full suite was not run. Supabase was not run.

## Phase 3 evidence

Targeted only. Vitest 6 files, 77 tests passed: payment-webhook fail-closed, the web webhook verifier, signup SQL contract `00246`, pricing page copy, pricing entitlement, and subscription. Deno `supabase/functions/payment-webhook/index.test.ts`: 6 passed. The full database suite and Supabase were not run. `00246` was not applied locally or on hosted.

Do not read a historical “1,514 passed” sentence as a current result.

| Script | Command |
| --- | --- |
| `pnpm test` | Root vitest, then domain, services, and database configs, then `tsx scripts/test-functions.ts` |
| `pnpm test:unit` | Domain vitest config and `tests/unit/` |
| `pnpm test:module` / `pnpm test:web` | `apps/web` vitest config |
| `pnpm test:domain` | `packages/domain` vitest config |
| `pnpm test:services` | `packages/services` vitest config |
| `pnpm test:database` | `packages/database` vitest config |
| `pnpm test:db` | `tests/integration` and `tests/security` |
| `pnpm test:functional` | `tests/integration`, `tests/security`, `tests/demo`, `tests/functional` |
| `pnpm test:vocab` | `tsx scripts/verify-vocabulary.ts` |
| `pnpm test:policy` | `tsx scripts/verify-test-coverage-policy.ts` |
| `pnpm test:functions` | `tsx scripts/test-functions.ts` |
| `pnpm test:regression` | `tsx scripts/run-master-regression.ts` |
| `pnpm test:smoke` | `tsx scripts/test-live-smoke.ts` |
| `pnpm test:live` | `tsx scripts/run_live_automated_tests.ts` |
| `pnpm gate:verify` | `tsx scripts/verify-staging-gate.ts` |
| `pnpm typecheck` | `tsx scripts/typecheck.ts` |

CI runs `test:vocab`, `db:migrate:check`, the web build, `test:policy --strict`, `test:unit`, `test:module`, `test:functional`, and `gate:verify`. See [CI_CD.md](../10-platform/CI_CD.md). A green CI badge was not fetched.

`pnpm test:db` and the security suites talk to a database. They were not run. Do not run them to “finish” documentation.

Lint scripts echo a string. They are not ESLint.
