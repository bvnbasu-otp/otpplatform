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
| Branch | `main` (tracks `origin/main`) |
| Repository baseline | `519d424dbc35e14a7bc7a79af739fb1a69bc1367` on `main`; the worktree contains uncommitted changes and is not certified. |
| Release status | The 15 October 2026 green certificate is historical; the current local recertification is **NOT READY**. See [current evidence](docs/13-truth/PILOT_RECERTIFICATION_EVIDENCE_2026-10-25.md). |
| Historical Product Owner attestation | 15 October 2026; it does not certify the current worktree. |
| Migration files on disk | `00001`–`00328`, contiguous; `00328` repairs the canonical status-enum check in the admin test runner. |
| Hosted database migration | Current hosted ceiling is **UNKNOWN**; this run made no hosted database changes. |
| Public URL in repository | `https://otpplatform-theta.vercel.app` (not independently verified in this recertification) |
| Last CI SHA checked | `519d424dbc35e14a7bc7a79af739fb1a69bc1367`; that successful run did not include the current worktree changes. |

Product facts, statuses, and limits are in [docs/13-truth/CAPABILITY_STATUS.md](docs/13-truth/CAPABILITY_STATUS.md). Do not treat this README as a second status table.

## Architecture

Monorepo (`pnpm` workspaces: `apps/*`, `packages/*`):

- `apps/web` — React + Vite client
- `packages/domain` — types, tax, entitlement, governance
- `packages/services` — application services and provider adapters
- `packages/database` — database access
- `supabase/migrations` — SQL files `00001` through `00328` on disk; hosted application is a separate unknown.
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
