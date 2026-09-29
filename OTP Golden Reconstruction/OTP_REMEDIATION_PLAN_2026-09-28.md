# OTP Verified Remediation Plan — 28 September 2026

**Authority:** Engineering remediation phase (P0/P1 security + core integrity)  
**Repository HEAD at plan:** `7b1afc12ac7761efc206c70db80486612a34d146`  
**Migration ceiling before work:** `00215`  
**Next migration:** `00216`–`00217` (additive, non-destructive; `00217` revokes PUBLIC EXECUTE after `00194`)

This plan was written **before** code changes in this phase. Product/legal rows are recorded but not implemented in code.

| Finding | Severity | Root Cause | Planned Fix | Files | Migration | Tests | Product Decision? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUD-SEC-001 wallet mint | Critical | `credit_buyer_settlement_reward_atomic` (00181): SECURITY DEFINER, no caller/membership check; nullable `platform_fee_tx_id` bypasses uniqueness | Require non-null fee tx owned by org; derive amounts from fee row; member or service_role only; idempotent replay | `supabase/migrations/00216_*` | 00216 | `tests/security/verified-remediation-00216-redteam.test.ts` + DB when available | No |
| N1 / SEC-1 reveal & PO | Critical | 00194 blanket `GRANT EXECUTE ON ALL ROUTINES TO anon`; 00206 re-grants `create_purchase_order_from_award` to anon; award path can return identity when authorized | Reconcile anon EXECUTE allowlist; revoke anon from award/PO/wallet paths; keep 00199 caller guards on `lock_and_reveal_award_atomic` | 00216, existing 00199 body preserved | 00216 | Static + DB red-team | No |
| N8 subscription / wallet redeem | High | `apply_wallet_credits_to_subscription_atomic` accepts client tier and credit amount; `process_subscription_payment` accepts arbitrary amount | Server-side tier allowlist and catalog credit amounts (existing `pricing-entitlement` numbers); reject mismatch and non-positive; membership unchanged | 00216 | 00216 | Static + DB | No (uses existing list prices in repo) |
| N5 approval identity | High | `submit_rfq_tier_approval_atomic` uses `COALESCE(auth.uid(), get_profile_id())` — auth user id ≠ profile id | Use `private.get_profile_id()` only for caller, delegatee, creator checks | 00216 | 00216 | Static + DB | No |
| N4 org role takeover | High | `appoint_org_role_atomic` allows MANAGER to appoint OWNER/PRESIDENT and upsert membership | OWNER-only for executive roles; MANAGER limited; block demoting sole OWNER without succession RPC | 00216 | 00216 | Static + DB | No |
| N6 quorum + COI on award | High | `lock_and_reveal_award_atomic` does not enforce RWA committee vote quorum / COI before lock | For COMMUNITY orgs: require ≥2 unconflicted votes for winning quote; block OPEN-only award path violations | 00216 | 00216 | Static + DB | No |
| N7 milestone inspection hash | High | `approve_milestone_inspection_atomic` accepts any hash ≥16 chars without auth or stored digest | Require buyer org member; verify hash matches inspection record digest from submit path | 00216 | 00216 | Static + DB | No |
| N3 supplier invoice self-approval | High | `invoices_update` RLS lets suppliers UPDATE status without blocking APPROVED/PAID | Trigger: suppliers cannot transition to APPROVED/PAID; buyers retain approval path | 00216 | 00216 | Static + DB | No |
| N12 RFQ/PO status writes | High | Direct table UPDATE grants allow arbitrary status regression | BEFORE UPDATE triggers on `rfqs` and `purchase_orders` for API roles | 00216 | 00216 | Static + DB | No |
| N13 unverified supplier reveal | High | Reveal/PO paths inconsistent if caller bypasses UI | Align `lock_and_reveal_award_atomic` quote/invitation checks with PO verification gate (WITHDRAWN/DECLINED blocked) | 00216 | 00216 | Static | No |
| N2 payment recording | High | Duplicate RPC signatures / `audit_events.action` column; `balance_due` default 0; `p_allocated_by` bypass | Single `record_invoice_payment_atomic`; `event_type` audit; init `balance_due` on insert; actor from profile only | 00216 | 00216 | Static + DB | No |
| N11 decline_reason | Medium | `rfq_invitations_manager` view omits `decline_reason` column | Recreate view with `ri.decline_reason` | 00216 | 00216 | Static + client tests | No |
| SUP-1 fabricated discovery | High | `rfq-lifecycle.ts` sets `gstVerified: true`, fake distance, availability, default match reasons | Map only DB fields; neutral unverified UI when evidence absent | `apps/web/.../rfq-lifecycle.ts`, `SupplierCard.tsx`, tests | — | Update unit tests | No |
| AUD-GST-001 GSTIN UI | Medium | Client presents checksum lookup as “Live Verified GSTIN” | Format/checksum only unless registry evidence; no synthetic legal name as verification | `GstinAutofillField.tsx`, `gstin-lookup.ts` copy | — | Domain test expectations | No |
| AUD-UX-002 PIN banner | Medium | PIN prefix heuristics claim suppliers ready | Remove false availability copy | `BuyerRegisterForm.tsx` | — | — | No |
| N14 deploy dry-run push | High | `isDeploy` defaults true; no DB falls through to `supabase db push`; dry-run without DB still pushes | `--deploy` explicit only; dry-run/status never push; failures exit non-zero | `scripts/deploy-migrations.ts` | — | Extend 00203-style static test | No |
| N15 CI green on failure | High | CI without `DATABASE_URL` exits 0 after “verified contiguous” | CI requires credentials for deploy or exits 1 | `scripts/deploy-migrations.ts`, CI if present | — | Script unit test | No |
| AUD-SEC-003 admin allowlist | High | Hardcoded emails in `is_platform_admin` | **Document only — DO NOT remove** until production identities known | `OTP_REMEDIATION_CERTIFICATION_*`, security baseline | — | — | Security design |
| AUD-SEC-004 anon on masked views | Medium | Defence in depth | Document; optional REVOKE in later phase if signup unaffected | Certification | — | — | No |
| FIN-1 / fabricated payments | High | Historical rows may exist | Stop new fabricated success paths; **no row deletes** | Code paths + certification | — | — | PRODUCT-DECISION (economics) |
| AUD-UX-005 `/register` | Medium | No `/register` route; `*` → home | Add `/register` → `/signup` | `App.tsx` | — | Route test if exists | No |
| AUD-UX-006 simulator frame | Medium | `MobileSimulatorFrame` on public `SiteLayout` | Remove from `SiteLayout`; keep on `AppLayout` / showcase | `SiteLayout.tsx` | — | — | No |
| AUD-UX-004 LaTeX pricing | Low | Raw `$\ge 2$` on pricing | Plain language “at least 2” | `PricingPage.tsx` | — | — | No |
| GOV-1 / PA-09 / canVote copy | Low | Internal codes visible | Plain language; rules unchanged | `organization-charter.ts`, `PricingPage`, `DecisionReceiptCard`, tests | — | Update copy tests | No |
| AUD-UX-003 committee consensus label | Low | Award page always says committee | Show committee wording only when `rfqOrgId`/votes exist | `AwardPage.tsx` | — | — | No |
| LEG-1 / FIN-1 pricing & fees | High | Conflicting public/legal copy | **Not implemented** — LEGAL/PRODUCT | — | — | — | LEGAL / PRODUCT |
| ONDC/BNI activation | — | Stubs only | **Not implemented** — DEFERRED | — | — | — | DEFERRED |
