# Executive Summary

Local certification for migrations **00216** through **00219** (disk ceiling **00219**; local `schema_migrations` tail **00214–00219**) concludes the four files are sequenced coherently, **00217** (amended) restores exactly **eleven** anon `EXECUTE` grants with **PUBLIC execute = 0**, and local security/contract runners pass. **Production remains at migration ceiling 00215**; production catalog and runtime were **not** re-verified this session.

**Decision: READY FOR CONTROLLED PRODUCTION APPLY** (apply itself is a separate authorized step; this document is not the apply).

| Evidence class | Result |
|----------------|--------|
| Vitest `verified-remediation-00216-*` | **PASS** (19/19) |
| `scripts/local-db-contract-run.mjs` (127.0.0.1) | **PASS** (00216 wallet/award/COI/payment + **00218** SM-RFQ cases) |
| `scripts/p0-gaps-contract-run.mjs` (127.0.0.1) | **PASS** (gap1–3; **00219** GAP3-DIRECT-WRITE blocked) |
| Read-only `has_function_privilege` / `information_schema` on 127.0.0.1:54322 | **PASS** (PUBLIC 0, anon 11, sensitive deny) |

---

# Authoritative Migration State

| Source | Ceiling / fact |
|--------|----------------|
| **PRODUCTION MIGRATION HISTORY** (authoritative; not re-queried) | Remote applied migrations through **00215**. **00216–00219 not applied.** |
| **LOCAL DATABASE EVIDENCE** | `supabase_migrations.schema_migrations` includes **00216, 00217, 00218, 00219**. |
| **MIGRATION FILE EVIDENCE** | On-disk files (exact names): |

1. `supabase/migrations/00216_verified_remediation_p0_p1_security_integrity.sql`
2. `supabase/migrations/00217_revoke_public_execute_default_privileges.sql`
3. `supabase/migrations/00218_rfq_status_transition_whitelist.sql`
4. `supabase/migrations/00219_guard_rfq_approval_stage_direct_write.sql`

Production behavior, live anon grants, and full production routine catalog: **not verified** this session.

---

# Final Migration Sequence

Order **00215 → 00216 → 00217 → 00218 → 00219** is required. **Never skip 00217** (closes PUBLIC blanket execute from 00194).

| Step | Role | Notes |
|------|------|--------|
| **00216** | P0/P1 integrity + partial privilege hygiene | `CREATE OR REPLACE` RPCs/triggers; **no data DELETE/TRUNCATE**. Intentional structural ops: `DROP VIEW` + recreate `rfq_invitations_manager`; `DROP FUNCTION` two `record_invoice_payment_atomic` overloads then single 8-arg function; trigger replace on invoices/RFQ/PO. Ends with `REVOKE EXECUTE ON ALL ROUTINES … FROM anon` and **six** anon grants (superseded by 00217). |
| **00217** | PUBLIC/anon execute closure + anon allowlist | `REVOKE EXECUTE … FROM PUBLIC` and `FROM anon`; `GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role`; **eleven** explicit `GRANT EXECUTE … TO anon`; **no** `GRANT ALL` to anon; **no** re-grant to PUBLIC; **`demo_status` absent**. |
| **00218** | RFQ PostgREST status regression | Replaces `private.guard_rfq_status_transition()`; adds `private.rfq_status_transition_allowed(rfq_status, rfq_status)`; trigger `BEFORE UPDATE` on `rfqs` (broader than 00216’s `BEFORE UPDATE OF status`). |
| **00219** | Approval-stage direct write block | Trigger on `rfq_approval_stages`; patches `submit_rfq_tier_approval_atomic` (both overloads) to `set_config('otp.approval_stage_internal', '1', true)` before stage `UPDATE`. |

**APPLICATION CODE EVIDENCE (spot-check only):** `apps/web/src/features/fulfillment/api/payments.ts` invokes `record_invoice_payment_atomic` with eight parameters matching the post-00216 signature (`p_invoice_id` … `p_idempotency_key`). No full app audit performed.

No forward-reference or missing dependency detected among these four files.

---

# 00216 Certification

**MIGRATION FILE EVIDENCE + LOCAL DATABASE EVIDENCE**

### `credit_buyer_settlement_reward_atomic`
- **Fee row required:** `p_platform_fee_tx_id IS NULL` → `WALLET-REWARD-FEE-REQUIRED`.
- **Caller cannot set reward from arbitrary amounts:** reward derived from `platform_fee_transactions` (`gross_amount`, `fee_rate`); `p_base_amount` / caller rates not used for minting; `v_reward_rate` fixed at `20.00` in function body.
- **Org relationship:** fee row `organization_id` must match `p_org_id`; non–service_role/non-admin requires `organization_members` membership.
- **Replay protection:** idempotency on `wallet_transactions.idempotency_key`; existing `buyer_reward_allocations` for fee tx with `CREDITED`.
- **Anon denied:** `REVOKE ALL … FROM PUBLIC, anon`; grant authenticated + service_role only.

### Other 00216 controls (selected)
- **Subscription amounts:** `private.subscription_wallet_credit_inr`; `apply_wallet_credits_to_subscription_atomic` and `process_subscription_payment` reject amounts ≠ catalog.
- **Supplier invoice self-approval:** trigger `trg_guard_invoice_supplier_status` / `INV-SUPPLIER-STATUS`.
- **Org manager takeover (executive appointments):** `appoint_org_role_atomic` — executive roles OWNER/admin only; managers limited for non-executive appointments.
- **Quorum / COI:** `lock_and_reveal_award_atomic` — COMMUNITY orgs require ≥2 unconflicted `RECOMMEND` votes; `cast_committee_vote` blocks `DECLARED_CONFLICT`.
- **Payment recording:** collapses to one `record_invoice_payment_atomic` (8 args); auth + role checks; idempotency via `payments.gateway_event_id`; audit uses `event_type`.
- **RFQ/PO guards (superseded in part by 00218):** basic AWARDED/OPEN rules in 00216 trigger.

**LOCAL DATABASE EVIDENCE:** Vitest + `local-db-contract-run.mjs` cases A1–A3, B1–B2, C1/C3, G-COI-*, F-INV-SUP, P-AUTH-ANON, P-BUYER-OK, P-OVERLOAD — **PASS**.

---

# 00217 Certification

**MIGRATION FILE EVIDENCE + LOCAL DATABASE EVIDENCE**

Confirmed in `00217_revoke_public_execute_default_privileges.sql`:

| Check | Status |
|-------|--------|
| `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC` | Present |
| `REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon` | Present |
| `GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated, service_role` | Present |
| Exactly **eleven** anon `GRANT EXECUTE ON FUNCTION … TO anon` | Present (see Anonymous Access Contract) |
| `GRANT ALL` to anon | **Absent** |
| Re-grant execute to PUBLIC | **Absent** |
| `demo_status` | **Absent** |

**LOCAL DATABASE EVIDENCE:** `information_schema.routine_privileges`: PUBLIC execute count **0**; anon execute count **11**; vitest allowlist test **PASS**.

---

# 00218 Certification

**MIGRATION FILE EVIDENCE**

- Enum used: `public.rfq_status` — edges in `private.rfq_status_transition_allowed`: DRAFT→OPEN|CANCELLED; OPEN→CLARIFICATION|EVALUATING|CLOSED|CANCELLED; CLARIFICATION→EVALUATING|CLOSED|CANCELLED; **EVALUATING→AWARDED|CANCELLED** (no OPEN from EVALUATING); AWARDED→CANCELLED|CLOSED; CLOSED→CANCELLED.
- Immutable on direct update (non-bypass): `organization_id`, `requirement_id`, `created_by` → `RFQ-IMMUTABLE`.
- Bypass: `service_role`, empty role, `pg_trigger_depth() > 1`, `private.is_platform_admin()`.

**LOCAL DATABASE EVIDENCE:** Trigger `trg_guard_rfq_status` present. `local-db-contract-run.mjs` SM-RFQ-A/B/C/D/E/F-ORG — **PASS** (e.g. EVALUATING→OPEN blocked with `RFQ-STATUS-TRANSITION`).

**NOT TESTED** in vitest suite (covered by contract runner above).

---

# 00219 Certification

**MIGRATION FILE EVIDENCE**

- Trigger `trg_guard_rfq_approval_stage_write` on `rfq_approval_stages` `BEFORE INSERT OR UPDATE`.
- Blocks client `UPDATE` of: `status`, `approver_profile_id`, `digital_signature_hash`, `delegation_id`, `delegator_profile_id`, `signature_mode` unless bypass (`service_role`, platform admin, `otp.approval_stage_internal = '1'`, `postgres`/`supabase_admin`).
- Blocks direct `INSERT` on stages.
- RPC path sets `otp.approval_stage_internal` before stage updates; caller identity via `private.get_profile_id()` (not raw `auth.uid()`).
- Delegation/expiry/spend-cap/sequential tier rules remain in `submit_rfq_tier_approval_atomic` body (00216/00219).

**Enforced:** direct PostgREST/table API mutation of approval-stage governance fields; RPC-mediated updates with session flag.

**Not enforced by 00219 alone:** full tier-approval quorum policy in separate tables; rejection overload still performs guarded `UPDATE` via internal flag (by design).

**LOCAL DATABASE EVIDENCE:** Trigger present; `p0-gaps-contract-run.mjs` **GAP3-DIRECT-WRITE** — **PASS** (`APPROVAL-STAGE-DIRECT-WRITE`, status remains PENDING).

---

# Anonymous Access Contract

**LOCAL DATABASE EVIDENCE** (read-only transaction, 127.0.0.1:54322) + vitest + contract baseline.

| Metric | Value |
|--------|--------|
| PUBLIC `EXECUTE` on `public` routines | **0** |
| anon `EXECUTE` count | **11** |

**Eleven anon functions (MIGRATION FILE 00217 + LOCAL DB match):**

1. `submit_signup_request(jsonb)`
2. `verify_profile_verification_otp(text, text)`
3. `verify_whatsapp_password_reset(text, text, text)`
4. `platform_heartbeat()`
5. `service_categories()`
6. `served_cities()`
7. `get_maintenance_status()`
8. `redeem_supplier_magic_link(text, text)`
9. `messaging_quote_context(text)`
10. `submit_messaging_quote(text, jsonb)`
11. `complete_supplier_onboarding_atomic(text, text, text, text, text, jsonb, text, text, text)`

**Sensitive anon deny (LOCAL `has_function_privilege` + vitest RPC):** `demo_status`, `credit_buyer_settlement_reward_atomic`, `lock_and_reveal_award_atomic`, `create_purchase_order_from_award`, `apply_wallet_credits_to_subscription_atomic`, `get_organization_wallet`, `reveal_award`, `appoint_org_role_atomic`, `process_subscription_payment`, `record_invoice_payment_atomic` — **denied** (permission denied / not found).

---

# Security Regression Results

| Suite | Target | Result |
|-------|--------|--------|
| `tests/security/verified-remediation-00216-database.test.ts` | 00216/00217 live DB + deploy script guards | **PASS** (7 DB tests when local up; 2 deploy unit tests) |
| `tests/security/verified-remediation-00216-redteam.test.ts` | 00216 static SQL + deploy guards | **PASS** (static; disk ceiling asserts **00219** filename) |
| **Combined vitest invocation** | Both files | **PASS 19/19** |
| `scripts/local-db-contract-run.mjs` | 127.0.0.1 only | **PASS** (28 cases PASS; SM-AWARD-PROBE **NOT TESTED**) |
| `scripts/p0-gaps-contract-run.mjs` | 127.0.0.1 only | **PASS** (s1/s2/s3) |
| Dedicated vitest for 00218/00219 only | — | **NOT TESTED** (behavior covered by contract runners above) |
| Payment idempotency replay (full double-spend) | — | **NOT TESTED** |
| Production anon grant snapshot | — | **NOT TESTED** (remote not inspected) |

---

# Public Flow Compatibility

**EXECUTE privilege only** (not full E2E quote submission or onboarding without JWT unless explicitly run).

| Function | anon `EXECUTE` (LOCAL) | Notes |
|----------|------------------------|--------|
| `get_maintenance_status()` | **true** | Privilege only |
| `redeem_supplier_magic_link(text, text)` | **true** | EXECUTE-only |
| `messaging_quote_context(text)` | **true** | EXECUTE-only |
| `submit_messaging_quote(text, jsonb)` | **true** | EXECUTE-only; not full quote-before-login E2E |
| `complete_supplier_onboarding_atomic(...)` | **true** | EXECUTE-only; not full award onboarding E2E |
| `demo_status()` | **false** | Excluded by product decision |

Vitest probes eleven allowlist RPCs for absence of `permission denied` on call (payload-minimal); does not certify business success of magic-link or messaging flows.

---

# Known Limitations

- **SM-AWARD-PROBE:** direct `awards` mutation not fully asserted (`local-db-contract-run` marks **NOT TESTED**).
- **Payment replay:** idempotency paths exist in SQL; end-to-end double-submit **NOT TESTED**.
- **Non-demo quote path:** messaging/demo flows not fully E2E without JWT.
- **Extended PO deny matrix:** beyond contract cases, not exhaustively tested.
- **EXECUTE-only** magic-link, messaging quote, supplier onboarding (not upgraded to functional PASS).
- **`demo_status`:** intentionally excluded from anon allowlist.
- **Production catalog** not re-read; post-apply verification of eleven anon executes is a **precondition**, not done here.
- **00216 file header** lists four anon RPCs; **00217** is authoritative for the eleven-function surface.
- **Tier-approval quorum** beyond COI/award lock in 00216: not introduced in 00218/00219.
- **Admin email allowlist** and other out-of-package items unchanged.

---

# Unresolved Security Findings Outside This Package

Explicitly **not** claimed fixed by 00216–00219 unless listed in Scope below:

- PIN coverage / step-up auth breadth
- Fake GSTIN “live verified” product copy
- Supplier discovery failure modes (app-layer; static redteam checks copy only)
- Fee/legal marketing copy
- Platform admin email allowlist
- Direct `awards` table mutation hardening (SM-AWARD-PROBE gap)
- Any production-only drift until migrations applied and verified

---

# Scope Honesty (what these migrations change)

| Topic | In-package? | Detail |
|-------|-------------|--------|
| **Payment recording** | **ADDRESSED BY 00216** | `record_invoice_payment_atomic` (8-arg); auth; buyer role gate; amount &gt; 0; payable statuses; idempotency key on `payments.gateway_event_id`; audit `event_type`. Replay semantics **NOT TESTED** end-to-end. |
| **Supplier invoice self-approval** | **ADDRESSED BY 00216** | `private.guard_invoice_supplier_status` / `INV-SUPPLIER-STATUS`. |
| **Org manager takeover (governance appointments)** | **ADDRESSED BY 00216** | `appoint_org_role_atomic` executive vs manager rules. |
| **Quorum / COI** | **ADDRESSED BY 00216** | `cast_committee_vote` COI recusal; `lock_and_reveal_award_atomic` COMMUNITY quorum ≥2 unconflicted recommends. |
| **Subscription amount checks** | **ADDRESSED BY 00216** | `subscription_wallet_credit_inr`, wallet redemption, `process_subscription_payment` catalog match. |
| **PUBLIC/anon RPC surface** | **ADDRESSED BY 00216 partial + 00217 definitive** | Eleven anon executes; authenticated/service_role all routines. |
| **RFQ status bypass** | **ADDRESSED BY 00218** | Whitelist + immutable identity fields. |
| **Approval stage bypass** | **ADDRESSED BY 00219** | Direct write guard + RPC session flag. |

---

# Production Apply Preconditions

1. Separate **authorized** production apply (this cert is **not** the apply).
2. Apply in strict order: **00216 → 00217 → 00218 → 00219**; **never skip 00217**.
3. Low-traffic window; monitor errors on public signup, heartbeat, messaging quote entrypoints.
4. Post-apply: confirm production anon `EXECUTE` is **only** the eleven functions; PUBLIC execute **0** (read-only privilege query or equivalent).
5. Do **not** use `migration repair` to skip or reorder.
6. Do not infer production state from this local cert alone.

---

# Final Decision

**READY FOR CONTROLLED PRODUCTION APPLY**

---

PRODUCTION MODIFIED = NO  
PRODUCTION MIGRATIONS APPLIED = NO  
PRODUCTION DATA MODIFIED = NO  
PRODUCTION SECRETS MODIFIED = NO  
REPOSITORY DEPLOYED = NO  
