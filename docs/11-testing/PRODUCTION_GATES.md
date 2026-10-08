# Production gates

Status of the gate scripts: `IMPLEMENTED` as files. Last gate result: `UNKNOWN` (not run in Phase 2). Phase 1’s 5 files / 78 tests are not this gate.

| Gate | Where |
| --- | --- |
| Vocabulary | `pnpm test:vocab` in CI `build-and-lint` |
| Migration file continuity | `pnpm db:migrate:check` in CI. CI production job also checks that the file count equals ceiling `00250` before `supabase db push`. That check was not executed here. `00248`, `00249`, and `00250` were not applied to hosted. |
| Web build | `pnpm --filter @otp/web build` with non-secret placeholder env |
| Coverage append | `pnpm test:policy --strict` |
| Unit, module, functional | `test-suites` job |
| Staging gate script | `pnpm gate:verify` with `ALLOW_OFFLINE=true` in CI |
| Hosted migration match | The production job compares `supabase migration list` to local files, then pushes. Not observed. |

`scripts/deploy-prod.ps1` synopsis says it requires a green staging suite before production. The synopsis also cites a test count. That count is not repeated here because it was not measured. The script was not run.

A gate file passing does not prove the Vercel deployment SHA or the hosted migration version.
