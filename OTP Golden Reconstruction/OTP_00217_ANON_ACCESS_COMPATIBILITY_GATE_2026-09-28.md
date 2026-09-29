# OTP 00217 Anonymous Access Compatibility Gate

**Date:** 2026-09-28  
**Scope:** Read-only impact of migration `00217_revoke_public_execute_default_privileges.sql` on six RPCs **not** on the post-00217 anon allowlist.  
**Authoritative deploy state (not re-verified here):** production migration ceiling `00215`; local `00219`; `00216`–`00219` not deployed.  
**00217 anon allowlist (MIGRATION):** `submit_signup_request`, `verify_profile_verification_otp`, `verify_whatsapp_password_reset`, `platform_heartbeat`, `service_categories`, `served_cities`.

---

## Summary table

| Function | Current Caller | Needs Anonymous? | Security Risk | Classification | Reason |
| --- | --- | --- | --- | --- | --- |
| `get_maintenance_status` | `MaintenanceContext.tsx` (app shell, all routes); `MaintenancePage.tsx` (`/maintenance`); `admin-ops.ts` + `AdminServiceActionsPanel.tsx` (admin, authenticated) | **Yes** — pre-session public shell and maintenance page health probe | Low — reads `demo_settings` maintenance flags/message only (MIGRATION `00075`) | **KEEP ANON** | No Supabase session exists when the global maintenance gate runs on `/`, `/login`, `/signup`, or `/q/:token`; authenticated callers still work after 00217 but anon revocation breaks the guard and `/maintenance` recovery probe (CODE). |
| `demo_status` | `features/demo/api/demo.ts` → `SignInForm.tsx`, `DemoModeProvider.tsx` (wraps app) | **Only when `VITE_DEMO_MODE=true`** — otherwise client skips RPC (CODE) | Low — demo on/off, run id, last reset from `demo_settings` (MIGRATION `00021`) | **NEEDS PRODUCT DECISION** | Production builds are documented to set `VITE_DEMO_MODE=false` (CODE: `demo.ts`, `qa/production-deployment-checklist.md`), so RPC may never run in prod; demo/pilot builds need pre-login demo detection for quick-login UX — product must confirm whether that remains intentional (CODE). |
| `redeem_supplier_magic_link` | `features/quick-quote/api/quick-quote.ts` → `QuickQuotePage.tsx` (`/q/:token`, public) | **Yes** — magic link is the bootstrap credential | Medium — consumes single-use link, creates `supplier_quote_sessions` (write) (MIGRATION `00037`) | **KEEP ANON** | Supplier has no OTP/session at link open; auth is established **after** redeem via session token, not Supabase JWT (CODE + MIGRATION comments). Requiring `authenticated` is circular. |
| `messaging_quote_context` | `quick-quote.ts` → `QuickQuotePage.tsx` | **Yes** — session token only, no JWT | Medium — token-scoped RFQ/quote snapshot via `supplier_rfq_message_payload` (invitation-bound) (MIGRATION `00037`, payload rules `00199`) | **KEEP ANON** | Loads quote UI before login; authorization is `p_session_token` → `private.quote_session`, not `auth.uid()` (MIGRATION). |
| `submit_messaging_quote` | `quick-quote.ts` → `QuickQuotePage.tsx` | **Yes** — same session-token model | High — inserts/updates `quotes`, `quote_versions`, invitation status (write) (MIGRATION `00037`) | **KEEP ANON** | Product requirement: supplier may submit a quote before OTP login (CODE: `quick-quote.ts` header, `App.tsx` `/q/:token` outside `RequireAuth`). No authenticated app path calls this RPC (CODE grep). |
| `complete_supplier_onboarding_atomic` | `SupplierAwardOnboardingPage.tsx` (`/supplier/award-onboarding/:token`, public) | **Yes** — onboarding claim token, not JWT | High — updates supplier statutory fields, sets `VERIFIED`/`ACTIVE` (write) (MIGRATION `00196`) | **KEEP ANON** | Post-award statutory gate uses `onboarding_claim_token_hash` match; page has no sign-in step (CODE). Authenticated role could call in theory but bootstrap link flow is token-only today. |

**MIGRATION note:** None of the six functions are redefined in `00216`–`00219`; latest definitions are at or before `00215` (`00021`, `00037`, `00075`, `00196`). `00215` references `redeem_supplier_magic_link` behavior in comments only.

---

## Per-function evidence

### 1. `get_maintenance_status`

| Aspect | Detail |
| --- | --- |
| **Purpose (MIGRATION `00075`)** | `STABLE` `SECURITY DEFINER` **read**: returns JSON `maintenanceMode`, `message`, `checkedAt` from `demo_settings`. |
| **Callers (CODE)** | `MaintenanceProvider` polls every 10s for entire app tree (`App.tsx` wraps routes). `MaintenanceGlobalGuard` redirects non–super-admin users to `/maintenance` when mode on. `MaintenancePage` polls to detect end of maintenance (anon visitor). Admin panel uses same RPC with session. |
| **Auth / route** | Unauthenticated on public routes and `/maintenance`; admin paths authenticated. Routes registered in `App.tsx` (not feature-flagged). |
| **Security** | Public operational metadata; no PII writes. |
| **Anon necessity** | **Intentionally public** for maintenance gating before any login. |

### 2. `demo_status`

| Aspect | Detail |
| --- | --- |
| **Purpose (MIGRATION `00021`)** | `STABLE` `SECURITY DEFINER` **read**: `enabled`, `run_id`, `last_reset_at` from `demo_settings`. |
| **Callers (CODE)** | `fetchDemoStatus()` only if `import.meta.env.VITE_DEMO_MODE === 'true'`; used by `SignInForm` (pre-login) and `DemoModeProvider`. `/demo` dashboard is behind `RequireAuth` but does not call this RPC directly. |
| **Auth / route** | Pre-login when demo build flag true; otherwise **no RPC**. |
| **Security** | Low sensitivity platform mode metadata. |
| **Anon necessity** | **Ambiguous by environment:** required for pre-login demo UX when demo build; likely **unused** when `VITE_DEMO_MODE=false`. |

### 3. `redeem_supplier_magic_link`

| Aspect | Detail |
| --- | --- |
| **Purpose (MIGRATION `00037`)** | **Write**: validates hashed token, marks link used, inserts `supplier_quote_sessions`, returns `sessionToken` + `publicRef`. Rate-limited. |
| **Callers (CODE)** | `redeemQuickQuoteLink` → `QuickQuotePage` on `/q/:token` (public, documented in `App.tsx`). |
| **Auth / route** | No Supabase session; SMS/WhatsApp handoff. Production route live. |
| **Security** | Consumes magic link; session minting; bounded by token + RFQ state. |
| **Anon necessity** | **Bootstrap credential** — JWT cannot precede redeem without redesign (contradicts quote-before-login). |

### 4. `messaging_quote_context`

| Aspect | Detail |
| --- | --- |
| **Purpose (MIGRATION `00037`)** | **Read** (+ `last_seen_at` touch): resolves session token; returns RFQ payload, expiry, existing quote snapshot. |
| **Callers (CODE)** | `fetchQuickQuoteContext` after redeem on `QuickQuotePage`. |
| **Auth / route** | Public quick-quote flow only. |
| **Security** | Token-scoped invitation data; `supplier_rfq_message_payload` masks buyer until reveal rules (`00199`). Client scrubs `buyerDisplay` again (CODE — UI not DB boundary). |
| **Anon necessity** | Same session-token authority model as submit; not replaceable by JWT without login-first redesign. |

### 5. `submit_messaging_quote`

| Aspect | Detail |
| --- | --- |
| **Purpose (MIGRATION `00037`)** | **Write**: validates session, RFQ open/deadline, invitation; creates/revises quote + version; audit event. |
| **Callers (CODE)** | `submitQuickQuote` on `QuickQuotePage` only. Authenticated supplier quoting uses other paths (`QuoteForm` / supplier portal — CODE grep, no `submit_messaging_quote`). |
| **Auth / route** | Public `/q/:token`; explicitly outside `RequireAuth`. |
| **Security** | High — commercial quote submission; mitigated by session + invitation binding. |
| **Anon necessity** | **Core product requirement** — quote before OTP login; token-authenticated, not anonymous in the sense of unauthenticated data access. |

### 6. `complete_supplier_onboarding_atomic`

| Aspect | Detail |
| --- | --- |
| **Purpose (MIGRATION `00196`)** | **Write**: `p_token` matched to `suppliers.onboarding_claim_token_hash`; updates legal/GST/PAN/address/contact; sets lifecycle `VERIFIED`. |
| **Callers (CODE)** | `SupplierAwardOnboardingPage` only (`apps/web`). |
| **Auth / route** | Public `/supplier/award-onboarding/:token` (and query `token`); registered in `App.tsx`. |
| **Security** | High — statutory identity mutation; gated by claim token. |
| **Anon necessity** | Token-bootstrap flow post-award; no login step on page (CODE). `MOVE BEHIND AUTH` would block winners who only have the email/SMS link unless product adds a login-first onboarding redesign. |

---

## Blocking Findings

1. **Supplier quote-before-login (product requirement):** Applying `00217` as written removes anon `EXECUTE` on `redeem_supplier_magic_link`, `messaging_quote_context`, and `submit_messaging_quote`. The live `/q/:token` flow calls all three without a Supabase session (CODE). **This breaks required quoting before OTP login** with no in-repo authenticated substitute for the magic-link path (CODE).

2. **Global maintenance mode:** `MaintenanceProvider` and `/maintenance` depend on anon `get_maintenance_status`. After `00217`, unauthenticated users cannot detect maintenance or auto-recover when mode clears, defeating the maintenance gate on public and quick-quote routes (CODE).

3. **Award onboarding gate:** Public `/supplier/award-onboarding/:token` calls `complete_supplier_onboarding_atomic` without JWT (CODE). `00217` blocks statutory completion for token-only winners.

## Non-Blocking Findings

1. **`demo_status`:** When `VITE_DEMO_MODE` is not `'true'`, the client never invokes the RPC (CODE). Production release checklist expects `VITE_DEMO_MODE=false`. Failure after `00217` affects demo/pilot builds and pre-login quick-login UX, not the documented production client path — pending product confirmation for non-prod.

2. **Authenticated redundancy:** After `00217`, signed-in admins retain `get_maintenance_status` via `authenticated` blanket grant (MIGRATION `00217`). Admin maintenance toggles are not blocked; only pre-session checks are.

3. **Security posture:** Keeping anon on the quick-quote trio is **not** “open quoting”; MIGRATION design uses capability tokens (`magic link` → `session token`) analogous to password-reset OTP allowlist functions.

4. **00216–00219:** No SQL changes to these six function bodies; impact is purely `REVOKE`/`GRANT` in `00217`.

---

## Exact Recommendation

**Primary: B** — `00217` cannot be applied as-is without breaking required flows. Deliberately add anon `EXECUTE` (names only; do not edit migration in this task) for at minimum:

- `get_maintenance_status()`
- `redeem_supplier_magic_link(text, text)`
- `messaging_quote_context(text)`
- `submit_messaging_quote(text, jsonb)`
- `complete_supplier_onboarding_atomic(text, text, text, text, text, jsonb, text, text, text)`

**Secondary: D** — for `demo_status()` only: confirm whether demo/pilot builds must keep pre-login RPC access when `VITE_DEMO_MODE=true`. If yes, add `demo_status()` to the allowlist; if production never uses demo builds, defer.

**Not A:** Application does not today offer an authenticated alternative for `/q/:token` quote submission; adapting later would contradict “supplier may submit a quote before OTP login” unless product changes the flow.

**Not C:** All six RPCs have live, registered routes or app-shell callers (CODE).

---

PRODUCTION DATA MODIFIED: NO  
PRODUCTION SCHEMA MODIFIED: NO  
MIGRATIONS APPLIED: NO  
REPOSITORY CODE MODIFIED: NO  
00217 EDITED: NO

---

## Amendment (2026-09-28 — local migration file only)

### Why original 00217 was too restrictive

Migration `00217` correctly removed blanket `PUBLIC` (and inherited anon) execute on ~173 public routines, but the anon re-grant block listed only the six signup/catalog/heartbeat RPCs carried forward from the 00216 narrative. That list omitted several **token- or shell-scoped** flows that never use a Supabase JWT at call time. Applying 00217 as originally written would block maintenance gating before login, supplier magic-link quote submission (`/q/:token`), and award onboarding claim completion (`/supplier/award-onboarding/:token`) while leaving sensitive wallet/award/org RPCs properly revoked.

### Five functions added to the anon allowlist (signatures verified ≤ 00215)

| Function | Signature (GRANT) | Why anon |
| --- | --- | --- |
| `get_maintenance_status` | `()` | App shell and `/maintenance` poll before any session exists (`00075`). |
| `redeem_supplier_magic_link` | `(text, text)` | Magic link is the bootstrap credential for quick quote (`00037`). |
| `messaging_quote_context` | `(text)` | Session-token read path after redeem, no JWT (`00037`). |
| `submit_messaging_quote` | `(text, jsonb)` | Quote-before-OTP-login write path (`00037`). |
| `complete_supplier_onboarding_atomic` | `(text, text, text, text, text, jsonb, text, text, text)` | Award claim token onboarding without login (`00196`); matches nine-parameter definition in catalog. |

Together with the original six, the intended anon surface is **eleven named functions** — no wildcards, no `GRANT EXECUTE ON ALL ROUTINES … TO anon`.

### Security posture unchanged

- Broad `PUBLIC` execute on public routines remains **removed** (`REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC`).
- `authenticated` and `service_role` still receive blanket execute after the revoke pass.
- **`demo_status()` remains excluded** pending product decision for `VITE_DEMO_MODE=true` builds (non-blocking for documented production client path).

### Local verification (this amendment)

Environment: local Supabase Docker only (`127.0.0.1:54321` / `54322`); amended `00217` replayed via `psql` against `supabase_db_otp-local` (no remote push/repair).

| Check | Result |
| --- | --- |
| `PUBLIC` execute on public routines | **0** rows in `information_schema.routine_privileges` |
| Anon execute allowlist | **11** routines (exact names in migration) |
| Sensitive RPCs denied to anon (`has_function_privilege`) | `credit_buyer_settlement_reward_atomic`, `get_organization_wallet`, `lock_and_reveal_award_atomic`, `reveal_award`, `create_purchase_order_from_award`, `appoint_org_role_atomic`, `demo_status` → **false** |
| 00216 fee guard in `credit_buyer_settlement_reward_atomic` | Body still contains `platform_fee_tx_id is required` |
| 00218 RFQ status guard | Trigger `trg_guard_rfq_status` present |
| 00219 approval-stage guard | Trigger `trg_guard_rfq_approval_stage_write` present |
| Supplier quote-before-login | **EXECUTE-only** — local DB has **0** `supplier_magic_links`; anon privilege on redeem/context/submit confirmed; no end-to-end quote row created |
| Award onboarding without login | **EXECUTE-only** — anon role call to `complete_supplier_onboarding_atomic` returns business error (invalid token), not permission denied |
| Vitest | `node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts tests/security/verified-remediation-00216-redteam.test.ts` → **19/19 passed** |

**00217 EDITED (local file): YES** — production unchanged; migration not applied to hosted project.
