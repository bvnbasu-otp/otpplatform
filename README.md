# OTP — Open Trade & Procurement

Identity-protected competitive sourcing.

A buyer describes a need. Invited suppliers quote under an alias. The buyer, or a committee when the buyer model requires one, decides. The supplier’s legal name is shown after that decision. The buyer pays the supplier directly, and OTP records the payment reference.

**TELL → REVIEW → DECIDE → TRACK**

OTP does the procurement work. The customer makes the decision.

This README is an entry point. It is not a certification. The canonical pilot-freeze documentation is [docs/README.md](docs/README.md). Files under `OTP Golden Reconstruction/` and the older `docs/00`–`docs/15` suite are historical evidence. They do not override `docs/13-truth/CAPABILITY_STATUS.md`.

## Who it serves

- **Individual** buyers, without a committee
- **RWA / housing society** buyers, with committee roles and a non-voting estate manager
- **MSME** buyers, with organisation membership and delegation
- **Suppliers**, as participants who quote under an alias until award

## Repository identity

| | |
| --- | --- |
| Branch inspected | `main` |
| HEAD inspected | `472be38671da0f408b2c80bda06f9c531d15e209` |
| Working tree | Dirty. This reconstruction did not commit. |
| Migration files on disk | `00001`–`00250` on disk. Local applied ceiling is `00245`. Hosted applied ceiling is NOT YET VERIFIED. `00246` through `00250` are pending migration, not applied, not deployed, not production. |
| Hosted database migration | HOSTED DATABASE CEILING NOT RE-VERIFIED. Prior manual verification was `00245`. |
| Public URL named in config and scripts | `https://otpplatform-theta.vercel.app` |
| Deployed git SHA | DEPLOYED REVISION NOT RE-VERIFIED |

Product facts, statuses, and limits are in [docs/13-truth/CAPABILITY_STATUS.md](docs/13-truth/CAPABILITY_STATUS.md). Do not treat this README as a second status table.

## Architecture

Monorepo (`pnpm` workspaces: `apps/*`, `packages/*`):

- `apps/web` — React + Vite client
- `packages/domain` — types, tax, entitlement, governance
- `packages/services` — application services and provider adapters
- `packages/database` — database access
- `supabase/migrations` — SQL files `00001` through `00250` on disk. Local applied ceiling is `00245`. Hosted applied ceiling is NOT YET VERIFIED. `00246` through `00250` are pending migration, not applied, not deployed, not production.
- `supabase/functions` — edge functions

Rules that must hold against a hostile client belong in database functions and row-level security, not only in React. A migration file on disk is not proof the hosted database has applied it.

## Local development

Node.js 22 or newer (`package.json` `engines`), pnpm 9.15.0. Use the Supabase CLI only when a person is deliberately operating a database.

```bash
pnpm install
pnpm db:start
pnpm db:reset
pnpm dev
```

The Vite dev server is configured for port 3000 (`apps/web/vite.config.ts`). `pnpm db:reset` applies the migration files in `supabase/migrations`.

Tests live under `tests/` and beside the packages. A green local suite does not prove the hosted database or the public site.

## Engineering constraints

- TypeScript strict mode
- Do not describe ONDC, BNI, WhatsApp, or SMS supplier outreach as live
- Do not show GST verified, distance, or availability unless the value came from stored data
- Do not treat Enterprise as a customer type
- Supplier cashback is not part of the supplier wallet
- Do not mark a security fix verified because the migration file exists

## Ownership

Baskar Loganathan — author and product owner.
