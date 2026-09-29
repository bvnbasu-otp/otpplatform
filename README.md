# OTP — Open Trade & Procurement

Identity-protected competitive sourcing.

A buyer describes a need. Invited suppliers quote under an alias. The buyer, or a committee when the buyer model requires one, decides. The supplier’s legal name is shown after that decision. The buyer pays the supplier directly, and OTP records the payment reference.

**TELL → REVIEW → DECIDE → TRACK**

OTP does the procurement work. The customer makes the decision.

This README is an entry point. It is not a certification. Authoritative documents live in [OTP Golden Reconstruction/OTP_GOLDEN_DOCUMENT_INDEX.md](OTP%20Golden%20Reconstruction/OTP_GOLDEN_DOCUMENT_INDEX.md).

## Who it serves

- **Individual** buyers, without a committee
- **RWA / housing society** buyers, with committee roles and a non-voting estate manager
- **MSME** buyers, with organisation membership and delegation
- **Suppliers**, as participants who quote under an alias until award

## What is true in this repository

| Topic | Current repository fact |
| --- | --- |
| Journey | Request, compare, decide, purchase, track |
| Lifecycle labels | `DRAFT` → `QUOTING` → `EVALUATING` → `AWARDED` → `PO_ISSUED` → `INVOICED` → `SETTLED`, plus `STALLED` |
| Quotes | Buyer comparison uses a masked view (alias, price, GST, delivery, warranty). Legal identity is on the reveal view after award |
| Suppliers | OTP registrations and invitations. Not a live ONDC or BNI network |
| Money | Settlement UI records an off-platform UTR. A 0.50% supplier fee is also described as deducted from disbursement. Those statements conflict. See the financial truth. Do not pick one in code until a product decision is recorded |
| Pilot flags | Domain policy: no real charge and no commercial supplier fee during the pilot. Public pages do not all say this the same way |
| Security | Migrations through `00215` contain later admin-guard fixes. Whether the hosted database has them is unknown. One wallet-credit function is an open finding |
| Legal pages | Shipped text says it is not final. That is a legal decision, not a resolved fact |

## What is not implemented

- Live ONDC participation
- Live BNI participation
- A verified “suppliers ready in your area” search (the signup banner for some PIN prefixes is a prefix check)
- GST-verified discovery cards (the card currently hard-codes the badge)
- A production-verified database at migration `00215`

## Architecture

Monorepo (`pnpm` workspaces):

- `apps/web` — React + Vite client
- `packages/domain` — types, tax, authorization chain, state projection
- `packages/services` — application services and network adapters
- `packages/database` — database access
- `supabase/migrations` — SQL files `00001` through `00215`
- `supabase/functions` — edge functions

Business rules that must hold under a hostile client belong in the database functions and RLS, not only in React. Several rules exist only as domain functions or migration text. Read the security baseline before assuming they run in production.

## Repository identity

| | |
| --- | --- |
| HEAD when this entry point was written | `7b1afc12ac7761efc206c70db80486612a34d146` |
| Migration files on disk | `00215` |
| Hosted database migration | Unknown. Requires verification |
| Public site observed logged-out | `https://otpplatform-theta.vercel.app` |
| Deployed git SHA | Unknown. Requires verification |

`docs/00` through `docs/15` are an older documentation suite (they still mention 185 migrations and a certified pilot gate). They are preserved. Do not treat them as the current baseline.

## Pilot status

No readiness gate is PASS. See [OTP_PILOT_READINESS.md](OTP%20Golden%20Reconstruction/OTP_PILOT_READINESS.md).

## Local development

Node.js 20 or newer, pnpm 9.15, Supabase CLI.

```bash
pnpm install
pnpm db:start
pnpm db:reset
pnpm dev
```

The dev server uses port 3000. `pnpm db:reset` applies the migration files in `supabase/migrations`, including files after `00185`.

Tests live under `tests/` and beside the packages. A green local suite does not prove the hosted database or the public copy.

## Engineering constraints

- TypeScript strict mode
- Do not describe ONDC or BNI as live
- Do not show GST verified, distance, or availability unless the value came from stored data
- Do not resolve the fee-versus-direct-payment conflict, or the draft legal text, without an explicit product or legal decision
- Do not mark a security fix verified because the migration file exists

## Ownership

Baskar Loganathan — author and product owner.
