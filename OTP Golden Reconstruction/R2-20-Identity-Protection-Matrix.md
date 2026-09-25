# OTP Stage R2-20 — Canonical Identity Protection Matrix

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-20 — Human Black-Box Product Audit & Golden-Path Gap Discovery  
**Audit Baseline Commit:** `32334aae872c98ddc13d326985723c560534823b`  
**Ceiling Migration:** `00197_universal_org_role_lifecycle_succession_and_audit.sql`  
**Standard:** Canonical Procurement Vocabulary & Anti-De-anonymization Protocol  

---

## 1. Executive Identity Protection Overview

A core founding tenet of the OTP Platform is **truthful, non-leaking, identity-protected procurement**. Until a binding commercial decision is cryptographically locked and unmasked, neither side possesses information that could compromise competitive fairness, invite off-platform collusion, or reveal personal private information (PII).

The audit verified five orthogonal privacy boundaries:
1. **Buyer Privacy:** Legal entity, resident names, contact phone, contact email, apartment/villa numbers, and financial details are strictly sealed from prospective suppliers.
2. **Supplier Privacy:** Real business name, contact channels, statutory GSTIN, PAN, and bank accounts are masked behind anonymous candidate aliases (e.g., `Supplier Alpha`, `Candidate Gamma`).
3. **Location Granularity:** Only macro fulfillment regions (e.g., `Whitefield, Bengaluru — 560066`, `Tiruppur — 641602`) are disclosed for quoting purposes; micro premises snapshots are locked until award reveal.
4. **Discussion Channels:** Buyer-supplier clarification threads pass through deterministic PII scrubbing (`scrubClarificationPii`) preventing exchange of contact phone numbers, URLs, or registration numbers.
5. **Closeout Confidentiality:** Upon award reveal, the winning supplier and buyer exchange identities; losing candidates are notified of round closure without revealing winning identity, prices, or buyer details.

---

## 2. Canonical Identity-Protection Lifecycle Matrix

The following authoritative matrix evaluates identity visibility across every milestone of the procurement lifecycle.

| Lifecycle Stage | Buyer Identity Visible to Supplier | Supplier Identity Visible to Buyer | Exact Location Visible | Financial Identity Visible | Expected Protocol Standard | Audited Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Pre-RFQ / Requirement Draft** | ❌ NO (Supplier has no access to draft) | ❌ NO (Only aggregated supplier network counts) | ❌ NO (Private to buyer account) | ❌ NO | Complete isolation | **VERIFIED PASS** |
| **2. Supplier Discovery & Invitation** | ❌ NO (Invitation shows only category & city) | ❌ NO (Buyer sees network capability counts) | ❌ NO (City/Area macro radius only) | ❌ NO | Zero PII transmission | **VERIFIED PASS** |
| **3. RFQ Quoting Window** | ❌ NO (Masked org label: e.g. "Residential Community in Whitefield") | ❌ NO (Sealed quotation with anonymous alias) | ❌ NO (Fulfillment Pincode & City only) | ❌ NO | Anonymized quoting | **VERIFIED PASS** |
| **4. Clarification / Q&A Thread** | ❌ NO (PII scrubber redacts phone, email, URLs) | ❌ NO (Anonymous supplier thread handle) | ❌ NO | ❌ NO | Sanitized communication | **VERIFIED PASS** |
| **5. 4-Pillar Evaluation & Scoring** | ❌ NO | ❌ NO (Ranked by Price, TAT, Warranty, Score) | ❌ NO | ❌ NO | Pure merit comparison | **VERIFIED PASS** |
| **6. Committee Voting / Governance** | ❌ NO | ❌ NO (Voters ballot on Candidate Aliases) | ❌ NO | ❌ NO | Blinded consensus | **VERIFIED PASS** |
| **7. Award Decision Lock** | ❌ NO (Award locked in database transaction) | ❌ NO (Winner remains Candidate Alias) | ❌ NO | ❌ NO | Tamper-evident lock | **VERIFIED PASS** |
| **8. Authoritative Reveal Point** | ✅ **YES (Winner Only)**<br>❌ NO to losing candidates | ✅ **YES (Winner Only)**<br>❌ NO to losing candidates | ✅ **YES** (Operational address unmasked) | ✅ **YES** (Winner GSTIN & Bank details) | Dual unmasking of winner only | **VERIFIED PASS** |
| **9. Purchase Order (PO) Execution** | ✅ YES (Full bilateral contract) | ✅ YES (Full bilateral contract) | ✅ YES (Immutable transaction snapshot) | ✅ YES (Tax & remittance details) | Legal commercial binding | **VERIFIED PASS** |
| **10. Fulfillment & Inspection** | ✅ YES (On-site coordination) | ✅ YES (On-site execution) | ✅ YES (Premises inspection) | ✅ YES | Operational transparency | **VERIFIED PASS** |
| **11. Invoicing & Settlement** | ✅ YES | ✅ YES | ✅ YES | ✅ YES (Disbursement remittance) | Statutory accounting | **VERIFIED PASS** |

---

## 3. Boundary Penetration & Red-Team Verification Results

Authoritative automated and forensic inspection verified the following security guarantees:

### 3.1 Buyer PII Redaction in Sourcing Feeds
* **PostgreSQL RLS Assertion:** Discovered in `supabase/migrations/00196_*.sql` and `tests/security/award-closeout.test.ts`. Unauthenticated or uninvited suppliers querying `rfqs` receive zero rows. Invited suppliers querying `rfqs_supplier_masked` receive strictly `id`, `category_code`, `city`, `pincode`, and `submission_deadline`.
* **Zero Leakage of Private Fields:** `created_by`, `organization_id`, `delivery_street_address`, `phone`, and `email` are never projected in public or supplier-facing views.

### 3.2 Clarification PII Scrubber
* Evaluated against 19 automated attack vectors in `apps/web/src/features/clarification/utils/pii-scrubber.test.ts`.
* Successfully neutralizes:
  - Raw Indian mobile numbers: `+91 9876543210`, `98765 43210`, `98765-43210` $\rightarrow$ `[phone removed]`.
  - Email addresses: `vendor@domain.co.in` $\rightarrow$ `[email removed]`.
  - External links: `https://wa.me/919876543210`, `bit.ly/my-quote` $\rightarrow$ `[link removed]`.
  - Statutory numbers: GSTIN (`33AAAAA0000A1Z5`), PAN (`ABCDE1234F`) $\rightarrow$ `[registration removed]`.

### 3.3 Closeout Isolation (Losing Candidates)
* Verified in `tests/security/award-closeout.test.ts`:
  - Losing suppliers receive an automated round conclusion notice: *"Round decided — thank you for participating."*
  - Losing suppliers CANNOT query the winning supplier's identity, the winning commercial price, or the buyer's contact details (`shows a loser nothing about who won or for how much` — **PASS**).
  - Uninvited suppliers have zero visibility into round existence.

### 3.4 Address Book vs Transaction Snapshot Immutability
* Verified in `tests/security/address-location-snapshots-redteam.test.ts`:
  - Changing an address book entry (e.g. renaming *"Home"* to *"Summer Villa"*) creates a new version; existing RFQs and POs retain the original cryptographic transaction snapshot.
  - Deleting an address book entry does not cascade or alter historical PO delivery addresses.

---

## 4. Residual Observations

1. **Client-Side Notification Payloads:** Notification triggers for `"QUOTE_SUBMITTED"` transmit the candidate alias (e.g. *"New quote received from Candidate Beta"*), preserving supplier privacy in desktop and mobile push notifications.
2. **Public RFQ Inspection:** Public exploration routes (`/requirements/:id`) require authentication and active context to view anything beyond high-level title, ensuring casual scrapers cannot harvest procurement intents.
