# OTP POST-00219 QA Identity Final Matrix — 2026-09-28

**Site:** https://otpplatform-theta.vercel.app  
**QA label:** QA-AUDIT-2026-09  
**Migration ceiling (operator claim):** 00219 — not independently verified by this pass  
**Login evidence:** Supabase Auth password grant (HTTP 200) for all seven; Playwright UI password login confirmed for IND-A and SUPPLIER-A (dashboard reached).  
**Password configured (all identities):** YES (operator-provided; not stored in this document).

---

## Executive note

All **7 / 7** QA identities achieved **successful password authentication** on production. UI and API profile reads are consistent for display names and role codes. **RWA-A-MEMBER** is on a **different** `active_organization_id` than **RWA-A-ADMIN** (fixture mismatch for same-RWA tests). **SUPPLIER-A** and **SUPPLIER-B** authenticate but **Playwright** showed **buyer cockpit** chrome (Pilot buyer dashboard), not a dedicated supplier workspace on `/supplier/quotes` direct navigation.

---

## Identity matrix

| Identity | Login | Profile | Organization | Role | Authority | Buyer/Supplier | Wallet | Subscription | Status |
|----------|-------|---------|--------------|------|-----------|----------------|--------|--------------|--------|
| IND-A | SUCCESS | full_name: IND-A QA; active_role_code: PROPERTY_OWNER | org id `61144fbe-fb03-4a52-aeae-6233a6665116`; name **Self** | PROPERTY_OWNER | UI: **OWNER** on dashboard | Buyer (buyer cockpit) | `get_organization_wallet`: ACTIVE, **0.0** credits | Commercial **Pilot** (3/3 RFQs UI) | **READY** |
| IND-B | SUCCESS | IND-B QA; PROPERTY_OWNER | org `86646de2-27c2-462e-8599-1174e6fbedfd` | PROPERTY_OWNER | Not UI-verified | Buyer (inferred) | Not RPC-probed this pass | Pilot (not UI-verified) | **READY** (login); fixtures **BLOCKED** (no RFQs) |
| RWA-A-ADMIN | SUCCESS | RWA-A ADMIN; FACILITY_MANAGER | org `92ea8a48-f6c0-48d5-9b4b-a22fb69eb856` | FACILITY_MANAGER | Not UI-verified | Buyer | ACTIVE wallet, **0.0** credits | Not UI-verified | **READY** |
| RWA-A-MEMBER | SUCCESS | RWA-A MEMBER; FACILITY_MANAGER | org **`a7f9bd7b-5d70-4e29-8598-6f848a6b4776`** (≠ RWA-A admin org) | FACILITY_MANAGER | Not UI-verified | Buyer | Not RPC-probed | Not UI-verified | **LOGIN READY**; **org fixture WRONG** for shared-RWA tests |
| RWA-B-ADMIN | SUCCESS | RWA-B ADMIN; FACILITY_MANAGER | org `e330d591-a828-4edb-9c24-a9845f8a4518` | FACILITY_MANAGER | Not UI-verified | Buyer | Not RPC-probed | Not UI-verified | **READY** |
| SUPPLIER-A | SUCCESS | SUPPLIER-A QA; active_role_code: **SUPPLIER_FOUNDER** | org `a3fdec03-8007-4071-9e19-a905ffcc71f1`; supplier **SUPPLIER-A** (`supplier_users` OWNER) | SUPPLIER_FOUNDER | UI still shows **Buyer** pilot cockpit | **Persona mismatch** (API supplier, UI buyer) | ACTIVE wallet, **0.0** credits | Pilot buyer UI | **LOGIN READY**; **supplier UX BLOCKED** for route tests |
| SUPPLIER-B | SUCCESS | SUPPLIER-B QA; SUPPLIER_FOUNDER | `active_organization_id`: **null**; supplier **SUPPLIER-B** (`supplier_users` OWNER) | SUPPLIER_FOUNDER | Not UI-verified | Supplier record present | Not RPC-probed | Not observed | **LOGIN READY**; org linkage **GAP** |

**Login successes:** **7 / 7**  
**Fully aligned QA personas for cross-org / member-admin / supplier-route suites:** **not all seven** (see RWA-A-MEMBER org, supplier UI).

---

## Certification (identity scope)

| Assertion | Value |
|-----------|-------|
| Production code modified | **NO** |
| Production DB modified directly (SQL) | **NO** |
| Migrations created | **NO** |
| Security configuration modified | **NO** |
| Real financial transactions | **NO** |
| QA data label used on new objects | **NO** new commercial objects created (no RFQs; payment not attempted) |
