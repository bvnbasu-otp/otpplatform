# OTP Production — Migration 00220 Applied (Operator) — 2026-09-29

**Supabase project ref:** `qsuvtcezffomtwzwyrso`  
**Target release SHA (not deployed by this pass):** `10a4a1291ee3ed2db7200e7c2badcec3e5a01114`  
**Supabase CLI (operator):** v2.116.0  
**Agent shell:** PowerShell — `supabase migration list --project-ref qsuvtcezffomtwzwyrso` attempted once

---

## FINAL STATUS

**PRODUCTION RELEASE BLOCKED — 00220 APPLIED BY OPERATOR; CATALOG POSTFLIGHT AND DEPLOY NOT DONE IN THIS SHELL**

| Field | Value |
| --- | --- |
| **00220 applied (production DB)** | **YES — operator evidence** (`db push` applied only `00220_supplier_wallet_ledger_events.sql`; `migration list` shows `00220 \| 00220 \| 00220` paired) |
| **00220 confirmed by agent CLI** | **NO** — `AccessTokenRequiredError` (no session in this shell) |
| **Agent catalog postflight** | **NOT RUN** |
| **Vercel deploy of `10a4a129`** | **NOT PERFORMED** |
| **DEPLOYMENT IDENTITY** | **INSUFFICIENT EVIDENCE** (deploy not attempted) |
| **PRODUCTION RELEASE CERTIFIED** | **NO** |

---

## Migration state

| | Version | Source |
| --- | --- | --- |
| **Before apply** | `00219` (remote ceiling per operator) | Operator |
| **After apply** | `00220` | Operator `supabase db push` + `migration list` (local \| remote paired through `00220`) |
| **Who applied `00220`** | **Operator** (authenticated PowerShell on their machine) | **Not this agent** — agent did not run `db push` and could not re-list remote |

Operator-reported push summary: only `00220_supplier_wallet_ledger_events.sql` was applied; finished successfully. Versions `00001`–`00219` were already paired local \| remote before this apply.

---

## Agent auth attempt (single try)

```text
supabase migration list --project-ref qsuvtcezffomtwzwyrso
→ AccessTokenRequiredError — access token not provided
```

**Actions forbidden in this pass (honoured):** no `db push`, no re-apply of `00220`, no repair/reset/`00221`, no production GRANT/ALTER, no deploy, no app code changes.

---

## Release contract (for follow-up — not executed here)

| Item | State |
| --- | --- |
| Certified app SHA | `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` |
| Local `git rev-parse HEAD` (agent workspace) | `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` |
| Five UI paths excluded from release commit | `AwardPage.tsx`, `organization-charter.ts`, `DecisionReceiptCard.tsx`, `SiteLayout.tsx`, `PricingPage.tsx` — do not commit as part of deploy |
| Dirty worktree / SHA `7b1afc12` | **Not deployed** |

Deploy and smoke may proceed only after **authenticated** catalog postflight passes and hosted deploy SHA is proven equal to `10a4a129` (not dirty tree).

---

## Operator SELECT-only postflight checklist

Run in **your** authenticated Supabase SQL editor or `psql` linked to production. **Read-only** — no writes, no wallet credits, no OTP/password material.

### A — Migration version (CLI, optional cross-check)

```powershell
supabase migration list --project-ref qsuvtcezffomtwzwyrso
```

Expect remote column `00220` paired with local `00220`.

### B — RFQ guard triggers (00218 / 00219 must remain)

```sql
SELECT t.tgname AS trigger_name, c.relname AS table_name, NOT t.tgisinternal AS user_trigger
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND t.tgname IN ('trg_guard_rfq_status', 'trg_guard_rfq_approval_stage_write');
```

**Pass:** two rows — `trg_guard_rfq_status` on `rfqs`, `trg_guard_rfq_approval_stage_write` on `rfq_approval_stages`.

### C — `credit_supplier_wallet_event_atomic` exists; anon / PUBLIC must NOT have EXECUTE

```sql
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'credit_supplier_wallet_event_atomic';
```

**Pass:** exactly one function (five-arg signature including `numeric` for client amount).

```sql
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name = 'credit_supplier_wallet_event_atomic'
ORDER BY grantee, privilege_type;
```

**Pass:** `EXECUTE` for `service_role` only; **no** `EXECUTE` rows for `anon` or `PUBLIC`. (`authenticated` should also lack `EXECUTE` per migration `00220`.)

### D — Function body: server-derived amount; cashback rejected

```sql
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'credit_supplier_wallet_event_atomic';
```

**Pass (manual review of definition text):**

- Amount from `CASE` on event type (e.g. `100.00` for `SUPPLIER_REFERRAL_BONUS` / `SUPPLIER_SUCCESS_REWARD`), not from unchecked client input.
- `p_client_amount` rejected when it does not match server amount.
- Explicit rejection of `SUPPLIER_CASHBACK` / `%CASHBACK%` (no cashback credit path).
- Caller gate: `service_role` or platform admin.

### E — No new broad PUBLIC execute on sensitive RPCs (spot check)

```sql
SELECT routine_name, grantee
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND privilege_type = 'EXECUTE'
  AND grantee = 'PUBLIC'
ORDER BY routine_name;
```

**Pass:** review list — `credit_supplier_wallet_event_atomic` must **not** appear; no unexpected expansion vs pre-`00220` baseline.

---

## Postflight decision tree (operator / next release pass)

| Outcome | Action |
| --- | --- |
| Any check in **B–E** fails | **PRODUCTION RELEASE BLOCKED AFTER MIGRATION** — do **not** hotfix grants from an unauthenticated agent shell; do **not** deploy until remediated under change control |
| All checks pass | Eligible to deploy **exactly** `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` (exclude five UI files from commit); prove Vercel/hosted SHA; then run smoke only (no wallet mint, no passwords on disk; ONDC remains `NOT_CONFIGURED` unless real connectivity observed) |

---

## Safety assertions (this agent pass)

| Assertion | Value |
| --- | --- |
| Agent ran `supabase db push` | **NO** |
| Agent re-applied `00220` | **NO** |
| Agent mutated production catalog | **NO** |
| Agent deployed to Vercel | **NO** |
| Secrets written to this report | **NO** |

---

*Gate pass — operator applied `00220`; agent blocked at auth — 2026-09-29.*
