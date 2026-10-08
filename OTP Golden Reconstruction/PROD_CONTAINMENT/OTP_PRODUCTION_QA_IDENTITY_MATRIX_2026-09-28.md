# OTP Production QA Identity Matrix — 2026-09-28

**Production app:** https://otpplatform-theta.vercel.app  
**Label prefix:** `QA-AUDIT-2026-09`  
**Migration ceiling:** `00219`  
**Agent:** Grok (controlled production QA identity pass)

---

## Live signup UI discovery (production, not inferred from repo)

| Route | Live behaviour |
|-------|----------------|
| `/signup` | Buyer/supplier toggle: *I need work to be done* / *I provide services*; default buyer registration form. |
| `/signup?side=buyer` | *Register your organisation* — buyer types: Individual, MSME, RWA; verification choice **WhatsApp** vs **Email**; no password field on form. |
| `/signup?side=supplier` | Not exercised (gate stop after IND-A). |
| `/login` | *Use a password* / *Email me a code*; password set post-registration via *Forgot password?* per success copy. |

---

## Mailbox gate

| Check | Result |
|-------|--------|
| Open Gmail for `bvnbasu@gmail.com` (plus-address delivery) | **FAILED** — Google sign-in required; agent session not authenticated. |
| Read verification / activation message for IND-A | **NOT PERFORMED** |
| Gate rule | **STOP** — remaining six identities **not** registered in this pass. |

---

## Identity matrix (7 target personas)

Password configured values are **YES/NO only** (no secrets stored in this matrix).

| ID | Email | Display name (intended) | Side | Registration attempted | Reference | Server status (UI) | Email verified | Password configured | First login | Persona (buyer/supplier) | Wallet/rewards (read-only) | Status |
|----|-------|-------------------------|------|------------------------|-----------|-------------------|----------------|---------------------|-------------|--------------------------|----------------------------|--------|
| IND-A | bvnbasu+otp.qa.inda@gmail.com | QA-AUDIT-2026-09 IND-A | Buyer (Individual) | **YES** | REG-21D626A8 | ONBOARDED | **Unknown** (inbox blocked) | **NO** | **NO** | Not observed | Not observed | **PARTIAL** — submitted only |
| IND-B | bvnbasu+otp.qa.indb@gmail.com | QA-AUDIT-2026-09 IND-B | Buyer (Individual) | NO | — | — | — | NO | NO | — | — | **BLOCKED** (gate) |
| RWA-A-ADMIN | bvnbasu+otp.qa.rwaa.admin@gmail.com | QA-AUDIT-2026-09 RWA-A-ADMIN | Buyer (RWA) | NO | — | — | — | NO | NO | — | — | **BLOCKED** (gate) |
| RWA-A-MEMBER | bvnbasu+otp.qa.rwaa.member@gmail.com | QA-AUDIT-2026-09 RWA-A-MEMBER | Buyer (RWA member) | NO | — | — | — | NO | NO | — | — | **BLOCKED** (gate) |
| RWA-B-ADMIN | bvnbasu+otp.qa.rwab.admin@gmail.com | QA-AUDIT-2026-09 RWA-B-ADMIN | Buyer (RWA) | NO | — | — | — | NO | NO | — | — | **BLOCKED** (gate) |
| SUPPLIER-A | bvnbasu+otp.qa.suppliera@gmail.com | QA-AUDIT-2026-09 SUPPLIER-A | Supplier | NO | — | — | — | NO | NO | — | — | **BLOCKED** (gate) |
| SUPPLIER-B | bvnbasu+otp.qa.supplierb@gmail.com | QA-AUDIT-2026-09 SUPPLIER-B | Supplier | NO | — | — | — | NO | NO | — | — | **BLOCKED** (gate) |

**Identities established (verified + password set + first login):** **0 / 7**  
**Registrations submitted on production:** **1 / 7** (IND-A only; persistent QA row — operator may deactivate via platform admin if needed)

**Plus-address note:** Gmail routes all plus addresses to one mailbox; application identity separation for the seven emails can only be proven after distinct logins succeed — **not demonstrated** in this pass.

---

## Organisation and fixture matrix

| Fixture | Depends on | Status | Notes |
|---------|------------|--------|-------|
| RWA-A (admin + member) | RWA-A-ADMIN, RWA-A-MEMBER | **BLOCKED** | No verified identities |
| RWA-B (admin) | RWA-B-ADMIN | **BLOCKED** | No verified identities |
| Separate supplier orgs | SUPPLIER-A, SUPPLIER-B | **BLOCKED** | Not registered |
| Individuals without org linkage | IND-A, IND-B | **BLOCKED** | IND-A unverified |
| RFQ / payment fixture | Any buyer + entitlement | **BLOCKED** | No session; real payment not attempted |

**Fixture counts:** organisations **0** · supplier profiles **0** · RFQs **0**

---

## Certification (identity scope)

| Assertion | Value |
|-----------|-------|
| Production code modified | **NO** |
| Production database modified directly (SQL) | **NO** |
| Migrations created | **NO** |
| Security configuration modified | **NO** |
| Real financial transactions performed | **NO** |

**Overall identity establishment certification:** **BLOCKED** (**0/7** established)
