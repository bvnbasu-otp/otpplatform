# OTP Production Certification — Migration 00221 + Wallet/Referral

**Date:** 2026-09-29  
**Workspace:** `G:\My Drive\otp`  
**GitHub:** github.com/bvnbasu-otp/otpplatform  
**Site:** https://otpplatform-theta.vercel.app  
**Supabase project ref:** `qsuvtcezffomtwzwyrso` (ap-northeast-1)  
**Certified app commit (user / operator):** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` — feat(wallet): finalize buyer supplier wallet and referral model  
**Supabase CLI (agent shell):** v2.118.0 at `C:\Users\bloganat\AppData\Local\OtpTools\supabase.exe`  
**Agent:** production certification pass (read-only where blocked)

---

## G — Final status

**BLOCKED — evidence required**

**BLOCKED — authenticated Supabase session is available outside the agent shell; no production mutation performed.**

00221 was **not** applied by this agent. Hosted migration ceiling, `schema_migrations`, catalog grants/signatures, and production matrix amounts were **not** verified against live `qsuvtcezffomtwzwyrso`. Mandatory production financial / security behavioral tests were **NOT RUN** (no safe service-role or QA session in this shell without reading secrets). **Do not treat as CERTIFIED.**

| Pass metadata | Value |
| --- | --- |
| Production mutation performed | **NO** |
| Git commit this pass | **NO** |
| Git push this pass | **NO** |

---

## A — Git

| Check | Result | Evidence class |
| --- | --- | --- |
| `git rev-parse HEAD` | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` | AGENT |
| `git log -1` | `c444df6 feat(wallet): finalize buyer supplier wallet and referral model` | AGENT |
| `git fetch origin` + `git rev-parse origin/main` | `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5` | AGENT |
| Expected certified SHA | `c444df6…` | **MATCH** (HEAD = origin/main = expected) |
| Working tree | Dirty: modified `AwardPage.tsx`, `DecisionReceiptCard.tsx`, `SiteHeader.tsx`, `SiteLayout.tsx`; untracked OTP Golden Reconstruction / scripts artifacts | AGENT — **not** part of certified push per scope |

**Deployed commit on Vercel:** **INSUFFICIENT EVIDENCE** for live deploy SHA. Public `HEAD`/GET to https://otpplatform-theta.vercel.app returned Vercel headers (`Server: Vercel`, `Last-Modified: Tue, 29 Sep 2026 07:29:35 GMT`, `X-Vercel-Cache: HIT`) but **no** git SHA, `dpl_` id, or build metadata tying the edge response to `c444df6`. User/operator statement that push and deploy occurred is recorded; agent did not independently prove deploy identity.

---

## B — Application (Vercel)

| Check | Result | Evidence class |
| --- | --- | --- |
| Public site reachable | HTTP 200-class response; HTML served | AGENT (read-only HTTP) |
| Deploy SHA = `c444df6` | Not proven | **INSUFFICIENT EVIDENCE** |
| Supplier/buyer wallet UI smoke (5 PO checks) | **PASS** | **USER/OPERATOR** — not re-tested by agent |
| Browser wallet re-check (login required) | **NOT RUN** | Agent did not log in; PO smoke already PASS per operator |

No frontend, wallet UX, persona, pricing, or unrelated files were modified in this pass.

---

## C — Database (hosted `qsuvtcezffomtwzwyrso`)

### Migration file contract (pre-apply review)

**File read in full:** `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql`

| Contract item | File review |
| --- | --- |
| Referral credit path | `public.credit_otp_referral_bonus_atomic` — **MATCH** |
| Authoritative profile | `private.otp_referred_profile_kind_authoritative` — **MATCH** (not client-trusted kind for amounts) |
| Matrix amounts | `private.otp_referral_bonus_inr`: Individual 10, RWA 25, MSME 50, Supplier/VENDOR 100 — **MATCH** |
| Client tamper | Mismatch on `p_referred_profile_kind` or `p_client_amount` → EXCEPTION — **MATCH** |
| Self-referral | `p_referrer_org_id = p_referred_org_id` rejected — **MATCH** |
| Idempotency / duplicate | `idempotency_key` + unique index on `(organization_id, source_entity_type, source_entity_id)` for `OTP_REFERRAL_BONUS` — **MATCH** |
| Supplier referrer gate | `private.supplier_referrer_has_settled_otp_tx` only when `p_referrer_persona = 'SUPPLIER'` — **MATCH** |
| PostgREST overload | `DROP FUNCTION` 5-arg `credit_supplier_wallet_event_atomic`; 6-arg replacement — **MATCH** |
| Grants | REVOKE PUBLIC, anon, authenticated; GRANT service_role on typed signatures — **MATCH** |
| SECURITY DEFINER + search_path | Set on referral + supplier RPCs and private helpers — **MATCH** |
| Supplier Cashback | Explicit rejection in supplier RPC (`SUPPLIER_CASHBACK` / `%CASHBACK%`) — **MATCH** (removed, not product path) |

**Pre-apply decision:** File **matches** certified contract. Agent **did not** run `supabase db push` (auth blocked).

### Hosted migration state

| | Version | Evidence |
| --- | --- | --- |
| **Before (expected)** | `00220` ceiling | Prior operator/integration docs; **not** re-confirmed by agent CLI |
| **After (agent apply)** | N/A — no apply | Agent blocked |
| **00221 applied on hosted** | **UNKNOWN / NOT VERIFIED** | `supabase migration list` failed |

**CLI attempt (single try, from `supabase/` workdir):**

```text
AccessTokenRequiredError — access token not provided. Supply an access token by running `supabase login` or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

`SUPABASE_ACCESS_TOKEN` in agent environment: **not set**. No `--db-url` used. No migration repair. No edits to `00220` or `00221`.

### Catalog postflight (after apply)

| Check | Result |
| --- | --- |
| `schema_migrations` contains `00221` | **NOT RUN** |
| Functions: `private.otp_referral_bonus_inr`, `private.otp_referred_profile_kind_authoritative`, `public.credit_otp_referral_bonus_atomic` | **NOT RUN** |
| Single `credit_supplier_wallet_event_atomic` signature (5-arg gone) | **NOT RUN** |
| Grants: PUBLIC/anon/authenticated execute false; service_role true | **NOT RUN** |
| SECURITY DEFINER / search_path | **NOT RUN** |

Hosted read-only script evidence (`_hosted_readonly_evidence.json`, 2026-09-28): **HOSTED VERIFICATION BLOCKED** — local Gotrue-only credentials, not production pooler/ref.

**00221 apply result:** **NOT PERFORMED** (agent). **PASS/FAIL on hosted apply:** **INSUFFICIENT EVIDENCE** for current production state in this pass.

---

## D — Referral matrix (production)

Immutable helper checks on production (`SELECT private.otp_referral_bonus_inr(...)`): **NOT RUN** — no authenticated hosted DB session in agent shell.

| Referred profile | Expected (INR) | Actual (production DB) | Result |
| --- | ---: | --- | --- |
| INDIVIDUAL | 10 | Not queried | **NOT RUN** |
| RWA | 25 | Not queried | **NOT RUN** |
| MSME | 50 | Not queried | **NOT RUN** |
| SUPPLIER | 100 | Not queried | **NOT RUN** |

### Behavioral reward / security tests (Section 23)

| Test area | Result |
| --- | --- |
| Matrix credits by profile | **NOT RUN** — no safe production QA fixture in agent shell |
| Client amount / profile tamper | **NOT RUN** |
| Self-referral | **NOT RUN** |
| Duplicate / idempotency | **NOT RUN** |
| Supplier settled-tx gate (supplier persona only) | **NOT RUN** |
| Buyer not under supplier gate | **NOT RUN** |

No production wallet rows were created or credited by this agent.

---

## E — Security

| Control | File contract (00221) | Production catalog | Result |
| --- | --- | --- | --- |
| Referral RPC service_role-only execute | REVOKE + GRANT documented | Not queried | **NOT VERIFIED** |
| Supplier wallet RPC service_role-only execute | REVOKE + GRANT documented | Not queried | **NOT VERIFIED** |
| SECURITY DEFINER + fixed search_path | Present in SQL | Not queried | **NOT VERIFIED** |
| No ambiguous PostgREST overload | 5-arg DROP | Not queried | **NOT VERIFIED** |
| Auth gate inside RPC (service_role / platform admin) | Present | Not queried | **NOT VERIFIED** |

Grants were **not** weakened for testing.

---

## F — Wallet persona & Supplier Cashback

### Persona (`resolveWalletOrganizationId` at `c444df6`)

Read-only `git show c444df6:packages/domain/src/types/persona-wallet.ts`:

- For `portalSide === 'SUPPLIER'`, function returns a non-INDIVIDUAL org from candidates or **`null`** — it does **not** fall back to `input.organizationId` when only personal INDIVIDUAL orgs remain.
- For `BUYER`, returns `input.organizationId`.

**Supplier null fallback removed:** **CONFIRMED** at certified commit (source review only).

### Supplier Cashback

| Location | Classification |
| --- | --- |
| Active TS types (`packages/domain/src/types/supplier-wallet.ts`) | Only `SUPPLIER_REFERRAL_BONUS` + `SUPPLIER_SUCCESS_REWARD`; `REMOVED_SUPPLIER_CASHBACK_LEDGER_TYPE` documents removal |
| Active UI (`apps/web/src`) | No "Supplier Cashback" in source; only tests assert absence |
| SQL `00221` / `00220` | Rejects cashback event types — **guard**, not product path |
| Migrations `00220`/`00221` historical text | Mentions removed cashback — **historical / guard** |

**Supplier Cashback on active business path:** **ABSENT / NOT IMPLEMENTED**

---

## Summary for release owner

1. **Git** at `origin/main` aligns with certified **`c444df6`**; local dirty files remain outside that SHA.
2. **00221 SQL** in repo matches the certification contract; agent was cleared to apply **only** via authenticated `supabase db push` when hosted ceiling is `00220`.
3. **This agent shell cannot authenticate to Supabase** — no `migration list`, no push, no catalog SQL, no production matrix proof.
4. **Full CERTIFIED — 00221 + WALLET/REFERRAL** requires operator-authenticated hosted postflight (00221 in `schema_migrations`, grants, single supplier RPC signature, four matrix amounts from DB) plus safe QA behavioral tests if required by release policy.

---

*End of report.*
