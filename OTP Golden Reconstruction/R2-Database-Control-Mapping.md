# OTP Database Control & Security Mapping (R2)
**Document Identifier:** `OTP-RECON-R2-DATABASE-CONTROL-MAPPING`  
**Version:** 1.0 (Authoritative R2 Database Specification)  
**Status:** SUPREME DATABASE SECURITY & CONTROL BLUEPRINT  
**Working Root:** `G:/My Drive/otp`  
**Migration Count & Ceiling:** 197 Migrations (`00001` through `00197_universal_org_role_lifecycle_succession_and_audit.sql`)  
**Core Invariant:** *MIGRATION CEILING IS LOCKED AT 00197. ZERO HISTORICAL MIGRATION MUTATION. ZERO UNAPPROVED SCHEMA DIVERGENCE.*

---

## 1. Executive Summary & Database Invariant Declaration

The **OTP Supabase PostgreSQL Database** represents a battle-tested relational backbone comprising **197 contiguous, forward-migrating SQL scripts**. It incorporates enterprise-grade Row-Level Security (RLS), cryptographically hardened `SECURITY DEFINER` RPCs, append-only governance ledgers, and GAAP double-entry financial controls.

### Supreme Invariants for Reconstruction:
1. **Migration Ceiling Invariant:** Migration `00197` is the absolute ceiling. No new migrations (`00198+`) may be introduced during this reconstruction phase, and historical migration scripts (`00001` through `00197`) MUST NOT be modified or reordered.
2. **Protected Assets Preservation:** Protected Backend Assets **PA-01 through PA-10** are immutable. All frontend and service mutations must interface with these assets exclusively through their established public RPC signatures and views.
3. **Fail-Closed Security Gate:** Database triggers and RPCs enforce fail-closed authorization. Unauthorized mutations, self-approvals, and unverified payouts throw hard PostgreSQL exceptions (`P0001`).

---

## 2. Complete Mapping & Preservation Strategy for Protected Assets (PA-01 through PA-10)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   PROTECTED BACKEND ASSETS PRESERVATION MATRIX                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Asset ID | Protected Backend Asset | Database Object & Migration | Security Guarantee & Functionality | Strict Preservation & Invocation Contract |
| :---: | :--- | :--- | :--- | :--- |
| **PA-01** | Committee Voting & Quorum Engine | Table `public.committee_votes`<br>RPC `submit_committee_vote_atomic()`<br>*(Migrations 00024, 00049)* | • 1 vote per member per RFQ.<br>• Mandatory COI declaration (affirmative COI recuses voter & zeroes weight).<br>• Enforces RWA quorum ($\ge 2$ unconflicted votes).<br>• Rejects votes cast by `role = 'MANAGER'`. | **DO NOT MUTATE.**<br>Frontend `CommitteeVotePage.tsx` invokes `submit_committee_vote_atomic(rfq_id, quote_id, score, comments, has_coi)`. |
| **PA-02** | Atomic Award Lock & 2-Stage Verification Gate | RPC `lock_and_reveal_award_atomic()`<br>RPC `complete_supplier_award_onboarding_atomic()`<br>*(Migrations 00023, 00160, 00196)* | • Atomically transitions RFQ from `EVALUATING` $\rightarrow$ `AWARDED`.<br>• Freezes winning quote price, delivery days, warranty.<br>• 2-Stage KYC Gate: If supplier unverified, locks award but halts reveal and routes to onboarding.<br>• Generates immutable Decision Receipt. | **DO NOT MUTATE.**<br>Executed exclusively by authorized buyer/committee when award criteria are met. |
| **PA-03** | Universal Role Lifecycle & Immutable Audit | Tables `org_role_assignments`, `org_governance_action_audits`<br>Trigger `prevent_mutation_org_governance_audits()`<br>*(Migration 00197)* | • "Role $\neq$ Person": 365-day time-bound assignments.<br>• Annual succession (`transfer_org_role_succession_atomic`) transfers future authority without mutating historical signers.<br>• Audit ledger is strictly append-only (blocks `UPDATE`/`DELETE`). | **DO NOT MUTATE.**<br>All role mutations must route through `OrgRoleLifecycleService` calling Migration 00197 atomic RPCs. |
| **PA-04** | Identity-Protected PostgreSQL Masked Views | View `public.rfq_quotes_identity_protected`<br>RPC `get_identity_protected_quotes_atomic()`<br>*(Migrations 00005, 00117, 00196)* | • Masks supplier legal names with pseudonyms (`Supplier #01`).<br>• Redacts contact phone numbers, emails, and GSTINs.<br>• Prevents off-platform buyer/supplier collusion during quoting. | **DO NOT MUTATE.**<br>Buyer evaluation queries must select strictly from `rfq_quotes_identity_protected`. Direct `SELECT` on `rfq_quotes` is blocked for buyers prior to award. |
| **PA-05** | Domain In-Memory Contact Leak Detection | Guard `assertIdentityProtectedPayloadSafe()`<br>*(Location: `packages/domain/src/errors/blind-violation.ts`)* | • In-memory TypeScript regex inspection scanning for Indian phone numbers, emails, and 15-char GSTINs.<br>• Throws runtime domain error before data reaches client DOM. | **DO NOT BYPASS.**<br>Must be invoked in all evaluation and discovery API endpoints in `@otp/services`. |
| **PA-06** | Bilateral GST & Place-of-Supply Tax Engine | Domain Engine `calculateGstTaxBreakdown()`<br>*(Migrations 00156, 00168)* | • Evaluates Supplier GSTIN State Code vs Delivery Pincode State Code.<br>• Intra-State: 50% CGST + 50% SGST.<br>• Inter-State: 100% IGST.<br>• Freezes tax breakdown snapshot on PO creation. | **DO NOT MODIFY.**<br>Purchase orders render tax calculations strictly from frozen snapshots. |
| **PA-07** | GAAP Double-Entry Financial Accounting Ledger | Table `public.financial_ledger_entries`<br>RPCs `record_double_entry_ledger_atomic()`<br>*(Migration 00176)* | • Balanced debits and credits ($\sum \text{Debits} = \sum \text{Credits}$).<br>• Segregates Procurement GMV, OTP 0.50% Platform Fee, and 0.10% Buyer Reward.<br>• Supports Tally and Zoho ERP XML journal exports. | **DO NOT MUTATE.**<br>Reconciles all milestone payments, chargebacks, and platform fee deductions. |
| **PA-08** | Superadmin Whitelist & Immutability Trigger | Schema `private_security.admin_whitelist`<br>Trigger `trg_protect_platform_admin`<br>*(Migrations 00113, 00152)* | • Whitelists authorized Superadmin email (`bvnbasu@gmail.com`).<br>• Database trigger prevents unauthorized privilege escalation to `is_platform_admin = true`.<br>• Completely isolates admin ops from customer PO signing. | **DO NOT MUTATE.**<br>Gating mechanism for `/admin` operations console. |
| **PA-09** | Tokenized Invitations & MSME Delegations | Tables `organization_invitations`, `organization_delegations`<br>*(Migrations 00190, 00196)* | • Single-use SHA-256 tokens for RWA/MSME onboarding.<br>• MSME spend delegation proxies with monetary spend caps and UTC expiry.<br>• Database-enforced anti-self-approval rule. | **DO NOT MUTATE.**<br>Orchestrated by `SpendApprovalGovernanceService`. |
| **PA-10** | PBKDF2/AES-256 Encrypted Database Backup Pipeline | Scripts `scripts/backup-prod-db.ps1`, `scripts/restore-prod-db.ps1` | • Automated encrypted database snapshotting with PBKDF2 (100k rounds) key derivation and AES-256-CBC cipher.<br>• Cryptographic SHA-256 integrity checksum verification. | **PRESERVE IN SCRIPTS.**<br>Authoritative disaster recovery pipeline for live PostgreSQL databases. |

---

## 3. Row-Level Security (RLS) Policy & Tenant Isolation Matrix

Every table in the `public` schema enforces strict RLS isolating individual buyers, RWA housing societies, MSME businesses, and quoting suppliers.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ROW-LEVEL SECURITY (RLS) AUDIT MATRIX                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Table Name | SELECT Policy | INSERT Policy | UPDATE Policy | DELETE Policy | Security Guarantee |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`public.organizations`** | Members of organization (`auth.uid() IN organization_members`) | Authenticated users creating new organization | Organization `OWNER` or `PRESIDENT` only | Prohibited (Soft archive only) | Tenant boundary isolation; non-members cannot read organization details. |
| **`public.organization_members`** | Members of same organization | Organization Admin or via valid `organization_invitations` token | Organization Admin / Primary Owner | Organization Admin / Primary Owner | Prevents self-promotion or unauthorized member injection. |
| **`public.requirements`** | Creator (`created_by = auth.uid()`) OR Organization members | Authenticated buyer with active persona | Requirement creator before RFQ publication | Requirement creator while in `DRAFT` | Individual requirements (`org_id = NULL`) visible only to creator. |
| **`public.rfqs`** | Creator OR Org members OR Invited suppliers | System RPC upon requirement publish | System RPC / Creator in `DRAFT` | Prohibited | Sealed bidding; suppliers view published specifications without buyer contact. |
| **`public.rfq_quotes`** | **Restricted:** Quoting supplier (own rows only) OR Buyer AFTER post-award reveal | Quoting supplier via valid `/q/:token` or supplier portal | Quoting supplier while RFQ is `QUOTING` | Prohibited | Sealed bid privacy; buyers cannot query unmasked quotes directly prior to award. |
| **`public.buyer_addresses`** | Owner (`profile_id = auth.uid()`) OR Organization members (`organization_id`) | Address owner or Org Admin | Address owner or Org Admin | Address owner or Org Admin | Multi-tenant address book; supports Individual and Org-owned premises. |
| **`public.purchase_orders`** | Buyer Org members OR Awarded Supplier | System RPC upon award locking (`lock_and_reveal_award_atomic`) | System RPC / Buyer on milestone approval | Prohibited | Commercial contract ledger; frozen JSONB snapshots prevent tampering. |
| **`public.org_role_assignments`** | Members of same organization | Appointed via `appoint_org_role_atomic` (Org Admin) | Succession via `transfer_org_role_succession_atomic` | Prohibited (Time-bound expiry) | 365-day term governance; immutable succession audit trail. |
| **`public.org_governance_action_audits`**| Members of same organization | System RPCs only | **BLOCKED (Trigger Exception)** | **BLOCKED (Trigger Exception)** | Tamper-evident, append-only institutional governance audit trail. |
| **`public.financial_ledger_entries`** | Buyer Org / Supplier involved in transaction | System Accounting RPCs only | Prohibited | Prohibited | GAAP double-entry ledger integrity; balanced debits and credits. |

---

## 4. Hardened PostgreSQL Security DEFINER RPC Catalog

Critical business transitions execute exclusively through hardened PostgreSQL functions configured with `SECURITY DEFINER` and explicit `SET search_path = public, pg_temp;`.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SECURITY DEFINER RPC SPECIFICATIONS                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 `public.lock_and_reveal_award_atomic`
- **Migration:** `00160`, `00196`
- **Purpose:** Atomically transitions an RFQ from `EVALUATING` to `AWARDED`, locks the winning quote, freezes delivery specifications, evaluates the 2-stage supplier verification gate, and generates Decision Receipt metadata.
- **Parameters:**
  ```sql
  FUNCTION lock_and_reveal_award_atomic(
      p_rfq_id UUID,
      p_quote_id UUID,
      p_actor_id UUID,
      p_decision_notes TEXT DEFAULT NULL
  ) RETURNS JSONB
  ```
- **Execution Invariants:**
  1. Verifies that `p_actor_id` has active award authority in the RFQ's organization context.
  2. For RWA RFQs, verifies that unconflicted votes in `committee_votes` satisfy quorum ($\ge 2$). Throws `P0001: Quorum not met` if unsatisfied.
  3. Checks supplier `verification_status`:
     - If `'VERIFIED'`: Sets `identity_revealed = true`, generates PO record, and returns full mutual credentials.
     - If `'UNVERIFIED'`: Sets `identity_revealed = false`, generates onboarding token, and returns onboarding URL.

---

### 4.2 `public.submit_committee_vote_atomic`
- **Migration:** `00024`, `00049`
- **Purpose:** Records an RWA committee member's weighted vote and score on a quotation with mandatory Conflict of Interest declaration.
- **Parameters:**
  ```sql
  FUNCTION submit_committee_vote_atomic(
      p_rfq_id UUID,
      p_quote_id UUID,
      p_voter_id UUID,
      p_score NUMERIC,
      p_comments TEXT,
      p_has_conflict_of_interest BOOLEAN
  ) RETURNS JSONB
  ```
- **Execution Invariants:**
  1. Rejects vote if `p_voter_id` holds `role = 'MANAGER'`. Throws `P0001: Managers cannot vote`.
  2. If `p_has_conflict_of_interest = true`, sets `voting_weight = 0` and excludes vote from quorum numerator.
  3. Inserts immutable vote record in `public.committee_votes` and logs audit entry.

---

### 4.3 `public.transfer_org_role_succession_atomic`
- **Migration:** `00197`
- **Purpose:** Executes annual officer succession for RWA housing societies without mutating historical audit logs.
- **Parameters:**
  ```sql
  FUNCTION transfer_org_role_succession_atomic(
      p_org_id UUID,
      p_role TEXT,
      p_outgoing_profile_id UUID,
      p_incoming_profile_id UUID,
      p_actor_id UUID,
      p_succession_reason TEXT
  ) RETURNS JSONB
  ```
- **Execution Invariants:**
  1. Expires active assignment for `p_outgoing_profile_id` by setting `effective_to = NOW()`.
  2. Creates new assignment for `p_incoming_profile_id` with `effective_from = NOW()` and `effective_to = NOW() + INTERVAL '365 days'`.
  3. Inserts append-only record in `public.org_governance_action_audits`.

---

### 4.4 `public.create_delegation_proxy_atomic`
- **Migration:** `00190`
- **Purpose:** Grants MSME spend delegation proxy to a team member with custom spend cap and UTC validity.
- **Parameters:**
  ```sql
  FUNCTION create_delegation_proxy_atomic(
      p_org_id UUID,
      p_delegator_id UUID,
      p_delegatee_id UUID,
      p_spend_cap_amount NUMERIC,
      p_valid_until TIMESTAMPTZ,
      p_permissions TEXT[]
  ) RETURNS JSONB
  ```
- **Execution Invariants:**
  1. Verifies `p_delegator_id` is the Primary Owner (`role = 'OWNER'`).
  2. Inserts delegation record in `public.organization_delegations`.

---

### 4.5 `public.upsert_buyer_address_atomic`
- **Migration:** `00196`
- **Purpose:** Creates or updates a normalized buyer delivery/billing address and manages the `is_primary` flag.
- **Parameters:**
  ```sql
  FUNCTION upsert_buyer_address_atomic(
      p_address_id UUID,
      p_profile_id UUID,
      p_organization_id UUID,
      p_address_type TEXT,
      p_label TEXT,
      p_address_line1 TEXT,
      p_address_line2 TEXT,
      p_city TEXT,
      p_state TEXT,
      p_pincode TEXT,
      p_is_primary BOOLEAN
  ) RETURNS JSONB
  ```
- **Execution Invariants:**
  1. If `p_is_primary = true`, atomically unsets `is_primary` on all other addresses for that profile or organization.
  2. Inserts or updates row in `public.buyer_addresses`.

---

## 5. Database Triggers & Immutability Enforcers

1. **`prevent_mutation_org_governance_audits` (Migration 00197):**
   - Attached to: `public.org_governance_action_audits` (BEFORE UPDATE OR DELETE).
   - Action: Throws `P0001: Historical governance audit records are immutable and cannot be updated or deleted`.
2. **`trg_protect_platform_admin` (Migration 00152):**
   - Attached to: `public.profiles` (BEFORE UPDATE OF is_platform_admin).
   - Action: Throws `P0001: Unauthorized platform admin elevation attempt`.
3. **`trg_freeze_po_snapshots` (Migration 00168):**
   - Attached to: `public.purchase_orders` (BEFORE UPDATE).
   - Action: Prevents modification of `delivery_address_snapshot`, `tax_breakdown_snapshot`, and `original_quote_snapshot`.

---

## 6. Migration Ceiling & Immutability Certification

```text
========================================================================================
                  DATABASE MIGRATION IMMUTABILITY CERTIFICATION
========================================================================================

1. The migration ceiling for the OTP platform is PERMANENTLY FIXED at Migration 00197:
   `supabase/migrations/00197_universal_org_role_lifecycle_succession_and_audit.sql`

2. Historical migrations (00001 through 00197) are LOCKED against modification, 
   deletion, or reordering.

3. All 10 Protected Assets (PA-01 through PA-10) are verified present in schema 
   definitions and protected by Row-Level Security and Security DEFINER RPCs.

4. The reconstruction implementation agent is strictly prohibited from introducing 
   Migration 00198+ or altering historical SQL files.
========================================================================================
```

---
*End of OTP Database Control & Security Mapping (R2)*
