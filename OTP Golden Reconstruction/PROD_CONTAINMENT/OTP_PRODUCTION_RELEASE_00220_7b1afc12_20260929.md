# OTP Controlled Production Release — 00220 @ 7b1afc12

**Production app:** https://otpplatform-theta.vercel.app  
**Supabase project ref:** `qsuvtcezffomtwzwyrso`  
**Target release identity:** git commit `7b1afc12ac7761efc206c70db80486612a34d146`  
**Date:** 2026-09-29  
**Shell:** PowerShell (no `&&`)  
**Agent:** Controlled release operator (read-only verification + gated apply)

---

## FINAL STATUS

**PRODUCTION RELEASE BLOCKED**

**Reason:** Release identity mismatch — certified behaviour is uncommitted; SHA `7b1afc12` is not the RC application. Do not deploy the dirty tree, do not deploy `7b1afc12` as the certified app, and do not apply `00220` in this pass.

---

## PHASE 0 — Identity (mandatory gate)

### Workspace snapshot

| Field | Value |
|--------|--------|
| `git rev-parse HEAD` | `7b1afc12ac7761efc206c70db80486612a34d146` |
| Branch | `main` |
| `git status --short` line count | **101** |
| `supabase/migrations/00220_supplier_wallet_ledger_events.sql` on disk | **YES** (present in working tree) |
| `00220` inside commit `7b1afc12` | **NO** (`git cat-file -e` exit **128**) |

### RC gate context

The RC gate approved a **dirty** worktree (~101 paths) on top of `7b1afc12`. Certified artefacts may exist only as uncommitted changes.

### Certified change verification (`git` evidence on `7b1afc12` only)

| Certified item | In `7b1afc12`? | Evidence |
|----------------|----------------|----------|
| `supabase/migrations/00220_supplier_wallet_ledger_events.sql` | **NO** | `git cat-file -e 7b1afc12:supabase/migrations/00220_supplier_wallet_ledger_events.sql` → fatal: not in tree. `git status`: `??` (untracked). |
| signInWithOtp **EMAIL verification-channel** signup path | **NO** (RC delta uncommitted) | Commit `signup.ts` uses `onboarding-notify` only on submit; `git diff 7b1afc12 -- apps/web/src/features/portal/api/signup.ts` adds `verificationChannel === 'EMAIL'` branch with `supabase.auth.signInWithOtp({ email, shouldCreateUser: false, ... })`. |
| `reconcilePortalSide` (supplier persona routing) | **NO** | `git grep reconcilePortalSide 7b1afc12` → no matches. Working tree adds function in `apps/web/src/features/roles/api/roles.ts` and wires `ProtectedRoute.tsx`. |
| PermissionChips null-safe `permissions` | **NO** | At `7b1afc12`: `permissions: RolePermission[]` and `permissions.includes(...)`. Working tree: `permissions?: RolePermission[] \| null` and `const safe = permissions ?? []`. `git status`: `M` on `PermissionChips.tsx`. |

### Additional identity notes (not overridden by gate)

- Migrations `00216`–`00219` are also **untracked** (`??`) in the working tree while `7b1afc12` tree ends at `00215` under `supabase/migrations/`. Production ceiling `00219` is **assumed** by release brief but **not re-verified** in this run because Phase 0 failed closed.
- Supplier wallet **application** surface: no `supplier_wallet` / `SupplierWallet` matches under `apps/web` in current tree (wallet release coupling cannot be certified at this SHA + dirty tree).

### Phase 0 decision

**STOP.** No production writes. No `supabase db push`. No Vercel deploy.

---

## PHASE 1 — Remote migration list (read-only)

| Result |
|--------|
| **NOT RUN** — blocked at Phase 0 |

---

## PHASE 2 — `00220` SQL static review

| Result |
|--------|
| **NOT RUN** — blocked at Phase 0 (file not part of certified commit; apply forbidden) |

---

## PHASE 3 — Production catalog preflight (read-only)

| Result |
|--------|
| **NOT RUN** — blocked at Phase 0 |

---

## PHASE 4 — Apply `00220` (`supabase db push`)

| Result |
|--------|
| **NOT EXECUTED** |

---

## PHASE 5 — Post-apply migration list + grant postflight

| Result |
|--------|
| **NOT RUN** |

---

## PHASE 6 — Vercel deploy (certified SHA only)

| Result |
|--------|
| **NOT EXECUTED** — certified SHA not proven to contain RC code |

**DEPLOYMENT IDENTITY:** INSUFFICIENT EVIDENCE (no deploy attempted)

---

## PHASE 7–9 — Smoke / QA / reward credit

| Activity | Result |
|----------|--------|
| Production smoke (7 personas) | **NOT RUN** |
| Production reward credit | **NOT EXECUTED** |
| Email delivery observability | **NOT APPLICABLE** |
| WhatsApp delivery verification | **NOT APPLICABLE** |

---

## Production migration state (this operator pass)

| | |
|--|--|
| **Before** | Not queried (Phase 1 not run) |
| **After** | Unchanged — no migration apply |

---

## Safety assertions

| Assertion | Value |
|-----------|-------|
| Application code modified by this release | **NO** |
| `00220` applied to production | **NO** |
| Production app redeployed | **NO** |
| Dirty tree deployed | **NO** |
| Supplier cashback reintroduced | **NO** (no changes) |
| Fabricated ONDC | **NO** |
| Secrets/passwords written to this report | **NO** |

---

## Operator summary

Release of migration `00220` together with application SHA `7b1afc12` **cannot proceed**. HEAD equals `7b1afc12`, but the certified RC deltas (`00220`, EMAIL `signInWithOtp` signup path, `reconcilePortalSide`, null-safe `PermissionChips`) live in the **uncommitted** working tree, not in the named commit. Applying `00220` without the matching certified app would be an identity mismatch; deploying the dirty tree would violate the controlled release protocol.

**Required remediation (out of scope for this pass):** commit (or otherwise pin) the certified RC artefacts to a single immutable SHA, then re-run this release checklist from Phase 0.
