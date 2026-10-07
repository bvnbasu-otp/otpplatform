# System architecture

Status of the repository layout: `IMPLEMENTED`. Status of the running production topology: `UNKNOWN`.

## Shape

```
apps/web (Vite SPA)
    → Supabase client (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
        → Postgres + RLS + SECURITY DEFINER RPCs (supabase/migrations)
        → Edge functions (supabase/functions)
packages/domain   pure rules (personas, entitlement, tax, plans)
packages/services adapters (Places, email, ONDC foundation consumers)
packages/database client access
```

`pnpm-workspace.yaml` includes `apps/*` and `packages/*`.

The browser is not the authority for award, vote, reveal, approval stages, or purchase-order tax. Those are SQL functions named in [RPC_CATALOG.md](../06-wiring/RPC_CATALOG.md). Domain TypeScript can disagree with SQL until a migration replaces the function. The winning SQL is the latest `CREATE OR REPLACE`.

## Request path for a procurement

1. Authenticated web route (`RequireAuth`, `RequireRole` in `App.tsx`).
2. Client calls an RPC or table allowed by RLS.
3. Triggers in `00238` and `00242` reject direct client writes that skip the RPC.
4. Edge functions run only where a trigger or the client invokes them (messaging, onboarding notice, Places coverage, payment webhook, ONDC callback). Invocation of each in production is `UNKNOWN` unless the status table says otherwise.

## What is not the architecture

- A production Docker Compose stack is described in older `docs/02-ARCHITECTURE.md`. That file is historical. `scripts/deploy-prod.ps1` writes `otp-prod-db` and is labelled LOCAL DOCKER ONLY. CI writes hosted project `qsuvtcezffomtwzwyrso` (DEFECT-02, labelled; script behavior unchanged).
- GitHub Actions does not serve the SPA. `vercel.json` sets the Vite build. See [VERCEL.md](../10-platform/VERCEL.md) and [CI_CD.md](../10-platform/CI_CD.md).
