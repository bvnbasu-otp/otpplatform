# OTP Protected Backend Assets Catalog (F7)
**Document Identifier:** `OTP-RECON-F7-PROTECTED-ASSETS`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE FORENSIC REGISTER  
**Core Invariant:** *THESE BACKEND ASSETS ARE CRYPTOGRAPHICALLY AND ARCHITECTURALLY PROTECTED. THEY MUST NOT BE CASUALLY REWRITTEN, BYPASSED, OR MUTATED DURING RECONSTRUCTION.*

---

## 1. Executive Overview

Over 197 database migrations and extensive security hardening passes, the OTP platform developed a core set of **hardened, battle-tested backend security, governance, cryptographic, and financial assets**. These assets contain critical protections against data leakage, unauthorized spend, historical record alteration, and financial discrepancies.

This catalog details each protected asset, its physical repository location, its invariant guarantees, the catastrophe that occurs if breached, and its strict preservation rules for the reconstruction agent.

---

## 2. Master Catalog of Protected Backend Assets

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        TOPOLOGY OF PROTECTED BACKEND ASSETS                            │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [GOVERNANCE & VOTING GATES]
  ├── 00024 / 00049: `public.committee_votes` & Quorum Calculation Logic
  ├── 00160 / 00196: `lock_and_reveal_award_atomic()` PostgreSQL RPC
  ├── 00183 / 00192: `submit_rfq_tier_approval_atomic()` & Award Governance Gate
  └── 00190: `create_delegation_proxy_atomic()` & Anti-Self-Approval Guards

 [ROLE LIFECYCLE & HISTORICAL AUDIT]
  ├── 00197: `public.org_role_assignments` (Effective-Dated Term Expiry)
  ├── 00197: `public.org_governance_action_audits` & `prevent_mutation_org_governance_audits()`
  └── `DecisionReceipt` (SHA-256 Signed Institutional Proof Artifact)

 [IDENTITY PROTECTION & ANTI-LEAKAGE]
  ├── 00005 / 00117: `public.rfq_quotes_identity_protected` (PostgreSQL Masked View)
  ├── 00196: `get_identity_protected_quotes_atomic()` RPC
  └── `assertIdentityProtectedPayloadSafe()` (Domain Memory Guard in TypeScript)

 [FINANCIAL CONTROLS & TAX ENGINE]
  ├── 00156 / 00168: Bilateral GST Engine (CGST/SGST vs IGST Place-of-Supply Engine)
  ├── 00173: TDS Withholding Calculator (Income Tax Section 194C / 194Q)
  └── 00176: `public.financial_ledger_entries` (GAAP/IndAS Double-Entry Accounting Ledger)

 [SECURITY INFRASTRUCTURE & BACKUP]
  ├── `private_security.admin_whitelist` & Superadmin Immutability Trigger
  ├── PBKDF2 (100k rounds) + AES-256-CBC Encrypted Database Backup Pipeline
  └── Multi-Gateway Cryptographic HMAC-SHA256 Signature Verification (`payment-webhook`)
```

---

## 3. Detailed Forensic Specification of Protected Assets

### Asset 1: Committee Democratic Voting & Quorum Engine
- **Migration & Objects:** `00024_weighted_voting.sql`, `00049_committee_access.sql`, table `public.committee_votes`, function `public.submit_committee_vote_atomic()`.
- **Location:** `supabase/migrations/00024_weighted_voting.sql`, `packages/services/src/services/approval-service.ts`.
- **Invariant Guarantees:**
  1. Each authorized committee member casts exactly one vote per RFQ.
  2. Conflict of Interest (COI) declaration is mandatory before vote submission.
  3. Affirmative COI automatically recuses the voter and zeros out their voting weight.
  4. Quorum requirement ($\ge 2$ unconflicted votes for RWA) is enforced at the database level before award lock.
- **Failure Consequence if Mutated:** A single corrupt committee member could execute unilateral awards; housing society procurement would lose democratic legitimacy; legal exposure under Apartment Ownership Acts.
- **Preservation Instruction:** **DO NOT MODIFY.** Reconstruct frontend UI around this RPC; do not alter RPC signature or logic.

---

### Asset 2: Atomic Award Lock & Reveal Gate (`lock_and_reveal_award_atomic`)
- **Migration & Objects:** `00023_award_lock_reveal.sql`, `00160_fix_lock_and_reveal_award_atomic_rfq_status_enum.sql`, `00196_buyer_identity_address_rwa_msme_and_supplier_award_onboarding.sql`.
- **Location:** `supabase/migrations/00160_...sql`, `supabase/migrations/00196_...sql`.
- **Invariant Guarantees:**
  1. Atomic transition of RFQ status from `EVALUATING` $\rightarrow$ `AWARDED`.
  2. Locks winning quote; freezes commercial price, delivery days, and warranty.
  3. Evaluates supplier verification status: if unverified, routes to 2-stage onboarding gate and halts identity reveal until KYC/GST completion.
  4. Generates immutable Decision Receipt data.
- **Failure Consequence if Mutated:** Race conditions during concurrent awards; unverified suppliers awarded without KYC; premature unmasking of supplier identities.
- **Preservation Instruction:** **DO NOT MODIFY.** The 2-stage verification branch added in Migration 00196 is authoritative.

---

### Asset 3: Universal Role Lifecycle & Immutable Governance Audit
- **Migration & Objects:** `00197_universal_org_role_lifecycle_succession_and_audit.sql`, tables `org_role_assignments`, `org_governance_action_audits`, trigger `prevent_mutation_org_governance_audits()`.
- **Location:** `supabase/migrations/00197_...sql`, `packages/services/src/services/org-role-lifecycle-service.ts`.
- **Invariant Guarantees:**
  1. "Role $\neq$ Person": Roles are time-bound assignments with automatic 365-day term expiry.
  2. Successor appointments (`transfer_org_role_succession_atomic`) transfer future authority without mutating historical records.
  3. `org_governance_action_audits` is strictly append-only. Any attempt to `UPDATE` or `DELETE` throws a hard PostgreSQL exception.
- **Failure Consequence if Mutated:** Changing an RWA officer rewrites historical audit logs, creating false legal representations of who authorized past multi-lakh expenditures.
- **Preservation Instruction:** **PROTECT AT ALL COSTS.** Use `OrgRoleLifecycleService` methods exclusively for role mutations.

---

### Asset 4: Server-Side Supplier Identity Protection & Domain Memory Guard
- **Migration & Objects:** `00005_blind_views.sql`, `00117_canonical_identity_protected_views_and_enums.sql`, view `public.rfq_quotes_identity_protected`, TypeScript function `assertIdentityProtectedPayloadSafe()`.
- **Location:** `supabase/migrations/00117_...sql`, `packages/domain/src/errors/blind-violation.ts`, `packages/services/src/blind/blind-payload.ts`.
- **Invariant Guarantees:**
  1. Unawarded quotes returned to buyers contain strictly masked pseudonyms (`Supplier #01`), masked prices, and anonymized VMI badges.
  2. Zero supplier entity names, phone numbers, email addresses, or GSTINs are included in evaluation payloads.
  3. `assertIdentityProtectedPayloadSafe()` inspects JSON payloads in TypeScript memory and throws a hard runtime error if any unmasked contact regex is detected.
- **Failure Consequence if Mutated:** Buyers bypass the platform and contact suppliers directly off-platform; corrupt suppliers collude with buyers during open bidding.
- **Preservation Instruction:** **DO NOT BYPASS.** All evaluation queries must consume the masked view or RPC; domain memory guards must remain active in service factories.

---

### Asset 5: Bilateral GST & Place-of-Supply Engine
- **Migration & Objects:** `00156_buyer_identity_reveal_on_po_issuance.sql`, `00168_phase5b_statutory_gst_and_tax_splitting.sql`, domain calculator `packages/domain/src/tax/place-of-supply.ts`.
- **Location:** `packages/domain/src/tax/`, `packages/domain/src/gst/gstin-validator.ts`.
- **Invariant Guarantees:**
  1. Compares Supplier GSTIN State Code (first 2 digits) vs Buyer Delivery Pincode State Code.
  2. If Intra-State: Splits GST into 50% CGST + 50% SGST.
  3. If Inter-State: Applies 100% IGST.
  4. Freezes tax snapshot on Purchase Order creation.
- **Failure Consequence if Mutated:** Non-compliant tax invoices; buyers unable to claim Input Tax Credit (ITC); statutory penalties under Indian GST Act.
- **Preservation Instruction:** **DO NOT MODIFY.** Reconstruct PO summary cards using the existing domain tax engine.

---

### Asset 6: Double-Entry Financial Accounting Ledger
- **Migration & Objects:** `00176_phase5d_double_entry_financial_ledger.sql`, table `public.financial_ledger_entries`, `packages/domain/src/accounting/chart-of-accounts.ts`.
- **Location:** `supabase/migrations/00176_...sql`, `packages/services/src/services/accounting-service.ts`.
- **Invariant Guarantees:**
  1. Every financial transaction posts balanced debits and credits ($\sum \text{Debits} = \sum \text{Credits}$).
  2. Reconciles procurement transaction value, 0.50% supplier platform fee, 0.10% buyer reward, and TDS deductions.
  3. Supports automated Tally ERP and Zoho XML journal exports.
- **Failure Consequence if Mutated:** Financial reconciliation errors, unbalanced platform accounts, and broken financial auditability.
- **Preservation Instruction:** **DO NOT MODIFY.** Maintain existing double-entry journal posting rules.

---

### Asset 7: Superadmin Whitelist & Immutability Trigger
- **Migration & Objects:** `00113_seed_real_super_admin_bvnbasu.sql`, `00152_immutable_platform_admin_role.sql`, schema `private_security.admin_whitelist`, trigger `trg_protect_platform_admin`.
- **Location:** `supabase/migrations/00152_...sql`.
- **Invariant Guarantees:**
  1. Restricts Superadmin access strictly to authorized email (`bvnbasu@gmail.com`).
  2. Database trigger blocks any unauthorized user from updating `is_platform_admin = true` or tampering with admin whitelist records.
  3. Platform admins are strictly isolated from normal buyer and supplier transaction sides.
- **Failure Consequence if Mutated:** Privilege escalation attacks; unauthorized platform takeover.
- **Preservation Instruction:** **DO NOT MODIFY.** Keep Superadmin whitelist and immutability triggers strictly intact.

---

## 4. Protected Asset Summary Register

| Asset ID | Protected Backend Component | File / Migration Location | Primary Security Guarantee | Protection Level |
| :---: | :--- | :--- | :--- | :---: |
| **PA-01** | `committee_votes` & Quorum RPC | Migration `00024` / `00049` | Democratic quorum ($\ge 2$ votes) & COI recusal | 🔒 CRITICAL |
| **PA-02** | `lock_and_reveal_award_atomic` | Migration `00160` / `00196` | Atomic award lock & 2-stage onboarding gate | 🔒 CRITICAL |
| **PA-03** | `org_role_assignments` & Audits | Migration `00197` | Effective-dated 365-day roles & append-only audit | 🔒 CRITICAL |
| **PA-04** | `rfq_quotes_identity_protected` | Migration `00117` | Zero-leakage cryptographic supplier masking | 🔒 CRITICAL |
| **PA-05** | `assertIdentityProtectedSafe` | `packages/domain/src/errors/` | Runtime in-memory contact leak detection | 🔒 CRITICAL |
| **PA-06** | Bilateral GST Place-of-Supply | `packages/domain/src/tax/` | Statutory CGST/SGST vs IGST calculation | 🔒 CRITICAL |
| **PA-07** | Double-Entry Financial Ledger | Migration `00176` | GAAP/IndAS balanced debits and credits | 🔒 CRITICAL |
| **PA-08** | Admin Whitelist & Triggers | Migration `00152` | Superadmin immutability & privilege isolation | 🔒 CRITICAL |
| **PA-09** | Tokenized Invitations & Delegations | Migration `00190` | Single-use SHA-256 tokens & spend cap proxies | 🔒 CRITICAL |
| **PA-10** | PBKDF2/AES-256 Backup Pipeline | `scripts/backup-prod-db.ps1` | Encrypted disaster recovery database snapshots | 🔒 CRITICAL |

---
*End of Protected Backend Assets Catalog (F7)*
