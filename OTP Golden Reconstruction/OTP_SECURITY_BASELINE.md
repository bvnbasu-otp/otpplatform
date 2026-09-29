# OTP Security Baseline

**Authority:** Level 3 — current security truth  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146` (implementation uncommitted; see `00216`)  
**Live database grants:** UNKNOWN / REQUIRES VERIFICATION

Code in the repository is not production evidence. Static tests that read SQL files are not execution on the live database.

## How to read the table

| Evidence column | Means |
| --- | --- |
| Code | The mechanism is in a source or migration file at this HEAD. |
| Test | An automated test in the repo asserts the source text or a pure function. “Static” means the test does not run Postgres. |
| Production | Observed on the deployed app or the live database. |

## Controls

| Control | Code evidence | Test evidence | Production evidence |
| --- | --- | --- | --- |
| Authentication | Supabase Auth. Signup creates a PENDING request (`submit_signup_request`). Password and email-code sign-in exist on `/login`. | Registration and password-reset copy tests. | Login page seen on 28 Sep. Pending-account behaviour: earlier pre-login pass only. This baseline did not re-submit credentials. |
| Session | Supabase session in the web client. | Protected-route tests. | UNKNOWN. |
| Authorization | RLS from `00004` onward, plus `SECURITY DEFINER` RPCs. | Many static red-team tests (`tests/security/*00199*` through later files). | UNKNOWN. |
| Organisation isolation | `private.is_org_member` checks `organization_members`. It also returns true for `private.is_platform_admin()`. | RLS tests exist and skip when local Supabase is down (recorded in the 26 Sep R2-31 report). | UNKNOWN. |
| Platform admin | `private.is_platform_admin()` in migration `00179`: service-role JWT, a hardcoded email allowlist (test domains and one personal mailbox), or `profiles.is_platform_admin`. | Static tests still expect the allowlist email to be present. | UNKNOWN which of those emails have accounts. |
| Quote confidentiality | Buyers have no SELECT policy on base `quotes` in `00004` (supplier-only). Buyers use `quotes_identity_protected`. | Static view tests; client payload guards. | UNKNOWN. |
| Supplier identity protection | Reveal view (`00178`) returns legal name, GSTIN, phone, and email only for a `SELECTED` quote on a `REVEALED` RFQ, and only to a buyer member. | Static. | UNKNOWN. |
| Buyer identity protection | Migration `00199` rewrites `rfqs_supplier_masked` and `supplier_rfq_message_payload` so the buyer name appears only after reveal to that supplier. Address snapshot columns are revoked from the API column grant. | Static test `privileged-rpc-hardening-00199-redteam.test.ts`. | UNKNOWN. |
| Award authorization | `00199` adds a caller guard to `lock_and_reveal_award_atomic` and revokes anon. | Static. | UNKNOWN. If live DB is still at or before `00195`, the old body is the one described in `PROD_CONTAINMENT/README.md`: the guard was not effective and anon could call it. |
| Admin RPC sweep | `00199` strips always-true `auth.role()` disjuncts from a listed set of admin functions and revokes anon. | Static emulation of the regex. The migration itself has not been shown to have run on production. | UNKNOWN. |
| Wallet protection | Ledger append-only trigger. Redemption RPC checks membership. | Domain tests for fee math. | UNKNOWN. |
| Wallet credit RPC | Migration `00216` rewrites `credit_buyer_settlement_reward_atomic` (caller membership, non-null fee tx, derived amounts). Anon revoked. | Static test `verified-remediation-00216-redteam.test.ts`. | NOT VERIFIED on live DB. |
| Pilot RFQ cap | `00199` trigger, 3 per org per UTC month, row lock. | Static, message matched to the domain constant. | UNKNOWN. |
| TDS server base | `00199` ignores client taxable amount. | Static plus domain calculator tests. | UNKNOWN. |
| Synthetic quotes | `00198` wrappers require `assert_synthetic_quotes_allowed` (admin or service role, and `rfqs.is_demo`). | Static. | Stub flag on the live database: UNKNOWN. |
| Signup self-approval | `00210` closes the self-approval path described in that migration’s header. | Signup review tests. | UNKNOWN. |
| OTP codes in API responses | `00208` revokes the older “return the code” functions from anon and authenticated and hashes codes. | Credential OTP tests. | UNKNOWN. |
| Storage | Quote attachment masked view includes `storage_path` before reveal (`00136`). | Not a bucket-policy test in this baseline. | UNKNOWN. |
| Notifications | App code distinguishes submitted from delivered. | Outbound dispatch tests. | Provider delivery: UNKNOWN. |
| Audit logging | `audit_events` writes from several RPCs. Client audit insert paths were narrowed in `00201`–`00202`. | Static tests in those migration red-team files. | UNKNOWN. |

## Wallet reward credit (AUD-SEC-001)

**Status:** FIXED-UNVERIFIED in repository (migration `00216`).  
**Production:** UNKNOWN until `00216` is applied and RPC grants are read from the live catalog.

Remediation summary: mandatory `platform_fee_tx_id` owned by the org; amounts derived from the fee row; caller must be org member (or service role / platform admin); anon `EXECUTE` revoked. See `OTP_REMEDIATION_CERTIFICATION_2026-09-28.md`.

## OPEN VERIFICATION — live admin surface

**ID:** AUD-SEC-002  
**Status:** PRODUCTION-VERIFICATION

`OTP Golden Reconstruction/PROD_CONTAINMENT/README.md` states that those scripts are not migrations. They were written because production might still be at or before migration `00195`, where admin functions were granted to `anon` and several guards treated any authenticated (and in some functions any anonymous) caller as admin. The note names `admin_run_diagnostic_query` as able to run a SELECT as the database owner.

Migrations `00198`–`00215` close that class **in the repository**. Whether they are applied on the hosted project is UNKNOWN / REQUIRES VERIFICATION.

Do not mark AUD-SEC-002 fixed because `00199` exists on disk.

## Platform-admin allowlist

**ID:** AUD-SEC-003  
**Status:** OPEN

Admin authority is partly a hardcoded email list inside `private.is_platform_admin()` (`00179`), including `*.test` addresses. That is privilege configuration in git. Replacing it is a security change, not a documentation choice. MFA on those accounts: UNKNOWN.

## Anonymous select on masked views

**ID:** AUD-SEC-004  
**Status:** OPEN (defence in depth)

`quotes_identity_protected` and `quotes_revealed` are granted to `anon`. The views call `can_access_rfq_as_buyer`, which should return false without a profile. Impact if that helper fails open: a full commercial leak. The helper’s current definition requires membership. Live confirmation: UNKNOWN.
