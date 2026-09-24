# OTP Reconstruction Gaps and Ambiguities (F8)
**Document Identifier:** `OTP-RECON-F8-GAPS-AMBIGUITIES`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE FORENSIC REGISTER  
**Core Invariant:** *An implementation agent must NEVER silently invent product behavior to resolve documentation gaps or code contradictions (Constitution v1.0, Section 43).*

---

## 1. Executive Summary

During our forensic audit of the OTP codebase, database migrations (00001–00197), and documentation suite, several contradictions between existing code implementation and the target Product Constitution v1.0 were identified.

This document formally records each gap, contradiction, and open product ambiguity. It provides recommended architectural resolutions for human product owner review and decision before code changes are executed.

---

## 2. Master Register of Gaps, Contradictions & Ambiguities

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MASTER GAPS & AMBIGUITIES REGISTER                              │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [GAP 1] Individual Buyer Data Model: NULL Organization vs. Personal Organization Record
 [GAP 2] Canonical Subscription Plan Pricing & Feature Entitlements
 [GAP 3] MSME Spend Delegation Hierarchy & Default Threshold Amounts
 [GAP 4] Multi-Item Line Item RFQ Intake vs. Single-Requirement Turnkey Flow
 [GAP 5] WhatsApp Inbound Sourcing: Text Parser Ingestion vs. Magic Link Web Form
 [GAP 6] Navigation Visibility for Platform Roles (Superadmin & Founder Cockpits)
 [GAP 7] Pilot / Demo Data Purge Policy on Production Environments
```

---

### Gap 1: Individual Buyer Data Model — NULL Organization vs. Personal Org Record
- **Contradiction Description:**
  - *Constitution v1.0 (Section 3):* "The Individual experience is self-contained, personal, simple, independent of organizations."
  - *Legacy Backend Implementation (`requirements.ts`, `00187_dual_persona_portal_switching.sql`):* The helper function `ensure_buyer_organization()` auto-provisions a dummy organization for every registered buyer and inserts an `organization_members` row with `role = 'OWNER'`.
  - *Migration 00196 (`buyer_addresses`):* Correctly supports both models (`profile_id UUID NULL`, `organization_id UUID NULL`, `CHECK (profile_id IS NOT NULL OR organization_id IS NOT NULL)`).
- **Architectural Risk:** If an Individual is forced into an organization record, frontend UI may mistakenly render team management tabs, delegation menus, and quorum voting cards.
- **Recommended Resolution:**
  - Standardize the database model so that for pure Individual buyers, `requirements.organization_id` is set to `NULL` and `rfqs.organization_id` is set to `NULL`.
  - The user's personal identity is represented strictly by `profile_id`.
  - Organization records (`public.organizations`) are created *only* when a user registers as or creates an **RWA** or **MSME**.
- **Human Decision Required:** Confirm whether Individual buyers should have `organization_id = NULL` exclusively or whether an invisible background "Personal Org" is permissible.

---

### Gap 2: Canonical Subscription Plan Pricing & Feature Entitlements
- **Contradiction Description:**
  - *Current Code (`pricing-entitlement.ts`, `PricingPage.tsx`):* Displays 4 plans: Individual (₹0), RWA Society (₹499/mo), MSME Business (₹999/mo), and Enterprise (₹4,999/mo).
  - *Constitution v1.0 (Section 2 & 40):* Enterprise is explicitly out of product scope.
  - *Migration 00144 / 00145 / 00166:* Implements a prepaid subscription model giving newly registered buyers 1 month free and 3 free RFQ credits before requiring subscription payment.
- **Architectural Risk:** Inconsistent pricing displays across marketing pages, modal checkout sheets, and database plan codes.
- **Recommended Resolution:**
  - Remove the Enterprise plan from domain constants, pricing pages, and checkout modals.
  - Standardize on 3 canonical tiers:
    1. **Individual Buyer:** Free tier (₹0/mo, 1 active RFQ at a time, personal addresses).
    2. **RWA Housing Society:** ₹499/mo (or ₹4,999/yr) with unlimited committee members, voting quorum room, and annual role succession.
    3. **MSME Business:** ₹999/mo (or ₹9,999/yr) with team invitations, spend delegation proxies, and GST/TDS tax invoicing.
- **Human Decision Required:** Confirm exact monthly and yearly subscription pricing figures for RWA and MSME plans.

---

### Gap 3: MSME Spend Delegation Hierarchy & Default Threshold Amounts
- **Contradiction Description:**
  - *Current Code (`EnterpriseApprovalMatrixService.ts`, `00183`, `00191`):* Uses hardcoded 3-tier thresholds (<₹5,00,000 Tier 1 Manager, ₹5,00,000–₹25,00,000 Tier 2 VP, >₹25,00,000 Tier 3 CFO).
  - *Constitution v1.0 (Section 14):* MSME delegation is granted explicitly by the Primary owner with custom spend caps and time bounds.
- **Architectural Risk:** MSME buyers with small purchases (e.g., ₹25,000) might be forced through an overly rigid 3-tier corporate approval hierarchy.
- **Recommended Resolution:**
  - For MSME organizations, make delegation threshold routing optional and configurable by the Primary owner.
  - If no delegation is configured, the Primary owner has direct 1-click approval authority for any amount.
  - If a delegation proxy exists in `public.organization_delegations`, allow the delegatee to approve RFQs up to their specific `spend_cap_amount`.
- **Human Decision Required:** Confirm whether default delegation tiers should exist or whether all MSME spend limits must be explicitly set by the Primary owner.

---

### Gap 4: Multi-Item Line-Item RFQ Intake vs. Single-Requirement Turnkey Flow
- **Contradiction Description:**
  - *Database Schema (`00167_phase5a_progressive_invoicing.sql`):* Supports multi-item purchase orders via `purchase_order_line_items` (line number, description, HSN/SAC, unit quantity, unit price, GST rate).
  - *Frontend Intake (`UnifiedThreeTierIntake.tsx`):* Currently captures a single requirement title, category, quantity, unit, and attribute set per RFQ.
- **Architectural Risk:** Buyers procuring multiple related items (e.g., 50 LED Streetlights + 10 Floodlights + 200m Cable) must create separate RFQs or combine them into a single lump-sum turnkey description.
- **Recommended Resolution:**
  - For Phase 1 Golden Reconstruction, retain the simple, single-specification turnkey intake model (which handles 90%+ of RWA and MSME jobs like motor winding, painting, solar installation).
  - Allow line items to be detailed in the structured attribute notes or progressive milestone deliverables.
  - Defer full multi-line shopping cart intake to a future milestone.
- **Human Decision Required:** Confirm single-requirement turnkey intake as the golden baseline for Phase 1 reconstruction.

---

### Gap 5: WhatsApp Inbound Sourcing — Text Parser vs. Magic Link Web Form
- **Contradiction Description:**
  - *Edge Function (`supabase/functions/messaging-inbound`):* Contains experimental NLP regex to parse quote responses sent as raw WhatsApp text messages (e.g., "Quoting 8500 with 12 months warranty").
  - *Production Quick Quote (`/q/:token`):* Uses a secure mobile-optimized web form where the supplier enters price, delivery timeline, warranty, and GST rate explicitly.
- **Architectural Risk:** Unstructured WhatsApp text replies frequently fail regex parsing, miss GST/warranty breakdowns, and create unverified quotation records.
- **Recommended Resolution:**
  - The outbound WhatsApp invitation sent via WAHA/Twilio will contain a short magic link: `https://otpplatform-theta.vercel.app/q/<token>`.
  - Suppliers tap the link and submit via the mobile web form (`QuickQuotePage.tsx`).
  - The inbound WhatsApp webhook is configured to reply with a polite prompt: *"Please submit your quote securely using your direct link: https://otpplatform-theta.vercel.app/q/<token>"*.
- **Human Decision Required:** Confirm whether suppliers must use the magic link form or whether raw WhatsApp text parsing should be actively supported.

---

### Gap 6: Navigation Visibility for Platform Roles (Superadmin & Founder)
- **Contradiction Description:**
  - *Current Navigation (`WorkspaceHeaderMenu.tsx`, `AccountMenu.tsx`):* Displays direct links to `/admin` and `/founder` in the user avatar dropdown if `is_platform_admin = true` or `role = 'FOUNDER'`.
  - *Security Standards (Doc 07 & Doc 14):* Platform administration should be strictly separated from customer buyer/supplier workflows to prevent UI confusion.
- **Architectural Risk:** A platform admin testing buyer workflows might accidentally trigger administrative purges from customer screens.
- **Recommended Resolution:**
  - Maintain the single authoritative header menu (`WorkspaceHeaderMenu.tsx`).
  - Gated tabs for Admin (`/admin`) and Founder (`/founder`) render *only* when the authenticated profile possesses verified server-side credentials.
  - Platform Admins operating on buyer routes are clearly badged with an "Admin Sandbox" indicator.
- **Human Decision Required:** Confirm header menu placement for Superadmin and Founder navigation.

---

### Gap 7: Pilot / Demo Data Purge Policy on Production Environments
- **Contradiction Description:**
  - *Migration 00125 & 00184:* Implements `admin_purge_test_transactions()` RPC to wipe test RFQs while protecting genuine customer accounts in `profiles`.
  - *Production Baseline:* Contains benchmark seed organizations ("Greenview Apartments", "Precision Tools Coimbatore") used for regression testing.
- **Architectural Risk:** Accidental execution of purge scripts could delete active pilot evaluation records.
- **Recommended Resolution:**
  - Formalize test organization naming convention: all test/demo organizations must have IDs matching `d1000000-*` through `d4000000-*` or names prefixed with `[TEST]`.
  - The purge script must explicitly filter `WHERE organization_id LIKE 'd%' OR is_demo = true` and never touch production customer records.
- **Human Decision Required:** Confirm test organization ID convention and purge safety threshold.

---

## 3. Summary of Action Items for Human Sign-Off

| Gap # | Subject Area | Proposed Default Architectural Decision | Impact on Codebase | Sign-off Status |
| :---: | :--- | :--- | :--- | :---: |
| **G-01** | Individual Org Model | `organization_id = NULL` for Individual buyers | Clean persona isolation; no dummy orgs | ⏳ PENDING OWNER REVIEW |
| **G-02** | Subscription Pricing | 3 Plans: Individual (₹0), RWA (₹499/mo), MSME (₹999/mo) | Remove Enterprise pricing card | ⏳ PENDING OWNER REVIEW |
| **G-03** | MSME Spend Delegation | Configurable spend caps per delegate; Primary has full authority | Flexible delegation for business owners | ⏳ PENDING OWNER REVIEW |
| **G-04** | RFQ Line Items | Single-requirement turnkey intake for Phase 1 | Simple 1-screen intake UX | ⏳ PENDING OWNER REVIEW |
| **G-05** | WhatsApp Sourcing | Outbound WA message with `/q/:token` magic link web form | 100% structured quote data capture | ⏳ PENDING OWNER REVIEW |
| **G-06** | Admin Navigation | Gated avatar menu links for verified platform roles | Clean separation of admin & buyer UX | ⏳ PENDING OWNER REVIEW |
| **G-07** | Test Data Purging | Strict ID prefix isolation (`d1000000-*`) during purges | Zero risk to production customer data | ⏳ PENDING OWNER REVIEW |

---
*End of Reconstruction Gaps and Ambiguities (F8)*
