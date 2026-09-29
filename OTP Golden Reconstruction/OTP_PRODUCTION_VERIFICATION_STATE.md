# OTP Production Verification State

**Authority:** Level 4 — what is actually verified, and what is not  
**Baseline date:** 28 September 2026  
**This document does not certify production.**

## Layers

| Layer | State on 28 Sep 2026 |
| --- | --- |
| REPOSITORY VERIFIED | The files at HEAD exist and were read for the claims in the golden documents. |
| TEST VERIFIED | Automated tests exist for many of those claims. A full suite was not re-run for this documentation phase. The last suite result copied into R2-31 (26 Sep, then at migration `00198`) is historical. |
| LIVE APPLICATION VERIFIED | Public pages of `https://otpplatform-theta.vercel.app` on 28 Sep 2026, logged out. |
| LIVE DATABASE VERIFIED | Nothing in this baseline. |
| NOT VERIFIED | Everything in the tables below marked UNKNOWN. |

## Identity of the tree

| Fact | Value |
| --- | --- |
| Repository SHA | `7b1afc12ac7761efc206c70db80486612a34d146` |
| Commit subject | `release: certify OTP 00213-00215 production readiness` |
| Commit time | 2026-09-28 13:49:37 +0530 |
| Branch | `main`, tracking `origin/main` at the time of this baseline |
| What that subject does **not** prove | That production was certified. The subject is a git message. Live migration application was not queried. |
| Migration files on disk | 215 files, `supabase/migrations/00001` through `00215_withhold_direct_invite_link_for_existing_suppliers.sql` |
| Live migration ceiling | **UNKNOWN / REQUIRES VERIFICATION** |
| Deployed application SHA | **UNKNOWN / REQUIRES VERIFICATION** |
| Hosted Supabase project named in containment notes | `qsuvtcezffomtwzwyrso` — documentation only. Not queried. |
| Public URL that responded | `https://otpplatform-theta.vercel.app` |

Untracked at baseline time (not in that commit): `OTP Golden Reconstruction/OTP_BLACKBOX_AUDIT_2026-09-28_PRELOGIN.md` and `OTP Golden Reconstruction/PROD_CONTAINMENT/`. This documentation phase adds further untracked markdown. It does not change application code.

## Environment

| Item | Repository | Live |
| --- | --- | --- |
| Web app | Vite React app, `apps/web`, dev port 3000 | Vercel URL above served the public site |
| Database | Supabase migrations through `00215` | **UNKNOWN / REQUIRES VERIFICATION** |
| Auth | Supabase Auth | Login page rendered. Provider project not inspected. |
| Email | Templates and dispatch code | Delivery **UNKNOWN** |
| WhatsApp | Gateway code and a documented WAHA container in old docs | Delivery **UNKNOWN**. Old docs claim a paired session. That claim is not re-verified. |
| Google Places | Adapter and quota code | Key and quota **UNKNOWN** |
| ONDC | Flag-gated, `isTruthfulLive = false` | Must be treated as off until proven otherwise. Live flag **UNKNOWN**. |
| BNI | Stub adapter | Not a live integration. |
| Payments | No buyer-to-supplier collection in the settlement UI | **UNKNOWN** whether any gateway is configured |

## Security verification

| Item | State |
| --- | --- |
| Anonymous call to `admin_run_diagnostic_query` on production | **UNKNOWN / REQUIRES VERIFICATION** |
| Whether `00199` ran on production | **UNKNOWN / REQUIRES VERIFICATION** |
| Wallet credit RPC on production | **UNKNOWN / REQUIRES VERIFICATION** (open in the repository regardless) |
| RLS on the live database | **UNKNOWN / REQUIRES VERIFICATION** |

`PROD_CONTAINMENT/README.md` is the procedure for checking the pre-`00196` risk. It is not evidence that the procedure was run.

## What “repository verified” covers

A future agent may treat these as true of the **files**, and only the files:

- Comparison view shape in `00136`
- Reveal view shape in `00178`
- Admin-guard rewrite text in `00199`
- Wallet credit function text in `00181`
- Pilot commercial flags in `pricing-entitlement.ts`
- Fabricated discovery fields in `rfq-lifecycle.ts`
- Public copy conflicts named in `OTP_CONTRADICTION_REGISTER_CURRENT.md`

A future agent may not treat those as true of production.
