# Technology stack

Versions are taken from `package.json` files, `pnpm-workspace.yaml`, and `.github/workflows/ci-cd.yml`. Ranges are ranges. A lockfile resolution was not copied. Do not treat a historical doc’s “React 19.2.8” or “Vitest 5.0.0” as this baseline.

| Piece | Declared | Source |
| --- | --- | --- |
| Product version | `0.1.0` | Root `package.json` `version` |
| Package manager | `pnpm@9.15.0` | Root `package.json` `packageManager`; CI `PNPM_VERSION` |
| Node | `>=22` | Root `engines`. CI `NODE_VERSION` `22` |
| TypeScript | `5.6.3` | Root, `apps/web`, domain, services, database `package.json`; pnpm override |
| Vitest | `^2.1.8` in package.json; pnpm override `>=3.2.6` | Root `package.json` |
| React | `^19.0.0` | `apps/web/package.json` |
| React DOM | `^19.0.0` | `apps/web/package.json` |
| React Router | `^7.1.1` | `apps/web/package.json` |
| Vite | `^6.0.6`; override `>=6.4.3` | `apps/web/package.json`; root override |
| Tailwind | `^3.4.17` | `apps/web/package.json` |
| Supabase JS | `^2.49.1` | Root, `apps/web`, `packages/database` |
| Supabase CLI in CI | `2.118.0` | `.github/workflows/ci-cd.yml` `supabase/setup-cli` |
| Workspaces | `apps/*`, `packages/*` | `pnpm-workspace.yaml` |
| Packages | `@otp/web`, `@otp/domain`, `@otp/services`, `@otp/database`, `@otp/config`, all `0.1.0` | Their `package.json` files |

`apps/web` dependencies: `@otp/domain` via `file:../../packages/domain`, `@supabase/supabase-js`.

Lint scripts in the root and packages echo a pass string (`echo 'lint: passed'`). That is not a linter run.
