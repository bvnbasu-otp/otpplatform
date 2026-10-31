# OTP Next (v2.0.0) — Release Notes

**Release Tag:** `v2.0.0-next`  
**Target Environment:** Production  
**Core Mission Statement:**  
> *"SIMPLE. SECURE. FAIR.  
> Same power. Simpler experience. All the intelligence. None of the complexity.  
> The customer makes the decision. OTP does the procurement work."*

---

## 1. Executive Summary

OTP Next represents a comprehensive, ground-up rebuild of the Open Trade & Procurement platform. The legacy monolith and bloated UI have been replaced by a decoupled, 3-layer architecture:
1. **Experience Layer (`apps/web`):** A mobile-first, responsive application shell built strictly around approved design concepts. It contains zero procurement business rules in the frontend; all state and operations communicate through typed service contracts.
2. **Application & Domain Layer (`packages/services`, `packages/domain`):** 28 independent modular backend contracts and adapters covering the entire procurement lifecycle.
3. **Infrastructure & Data Layer (`packages/database`, Supabase):** 151 PostgreSQL tables, 296 atomic database functions (RPCs), row-level security (RLS), and a verified contiguous migration chain (`00001` - `00331`).

---

## 2. Key Highlights & Major Features

### 👤 1. Canonical Personas & Enterprise Retirement
- **4 Customer-Facing Personas Supported:**
  - **Individual Homeowner:** Single-family residential procurement (`₹199/month`, 3 included RFQs, `₹149` overage). Primary identity: Baskar Loganathan (`bvnbasu@gmail.com`), Durga Rainbow, Mahadevapura, Bengaluru – 560048.
  - **RWA Apartment Association:** Multi-family society governance (`₹1,499/month`, 10 included RFQs, `₹99` overage). Canonical society: Durga Rainbow Assn (`REG/2013/1234`, 141 units).
  - **MSME Business:** Commercial enterprise procurement (`₹1,999/month`, 25 included RFQs, `₹99` overage).
  - **Supplier:** Pseudonymous quoting, certified local vendors, 0.50% platform fee acceptance.
- **Enterprise Persona Retirement:**  
  Enterprise has been permanently retired as a customer-facing persona and removed from all registration cards, pricing tiers, and navigation shells. Legacy database rows are preserved strictly as non-breaking compatibility artifacts.

---

### 🏛️ 2. RWA Governance & Anti-Corruption Engine
- **Irrevocable Conflict of Interest (`00242` Invariant):**  
  Managing Committee members who declare a personal or commercial conflict of interest are permanently locked out of evaluation voting on that RFQ.
- **Estate / Facility Manager Restriction (`00240` Invariant):**  
  Operational managers and facilities staff have read/operations access only; all award approval voting attempts by Estate Managers are strictly blocked.
- **Quorum & Weighted Committee Voting:**  
  Enforces 50% statutory quorum and multi-member approval thresholds before award notices can be generated.

---

### ⚖️ 3. Core Procurement Lifecycle (TELL → REVIEW → DECIDE → TRACK)
- **TELL Stage (Requirement Intake):**  
  Intuitive 1-tap RFQ authoring with auto-resolved primary delivery addresses and itemized budget planning.
- **REVIEW Stage (Identity-Protected Evaluation):**  
  Quotations are automatically anonymized with pseudonyms (`Supplier Alpha`, `Supplier Beta`) to prevent supplier bias. Smart Merit Engine ranks proposals on landed cost, SLAs, and technical specifications.
- **DECIDE Stage (Award Issuance):**  
  Supports single-buyer 1-tap award for Individuals/MSMEs and committee voting resolution for RWAs.
- **TRACK Stage (Atomic Counterparty Reveal & Execution):**  
  Upon award acceptance and 0.50% fee acknowledgment, the platform atomically unmasks buyer and supplier contact details and generates legal purchase orders.

---

### 🇮🇳 4. Indian Statutory Multi-State GST & SEZ Compliance
- **Intra-State Supply (e.g. Karnataka to Karnataka):**  
  Applies CGST (9%) + SGST (9%), total 18%.
- **Inter-State Supply (e.g. Tamil Nadu to Karnataka):**  
  Applies IGST (18%), CGST 0%, SGST 0%.
- **SEZ Zero-Rated Supply:**  
  Applies 0% GST for certified SEZ Units with valid Letter of Undertaking (`LUT-SEZ-2026-KA-0012`).
- **Freight Double-Taxation Prevention (`00245` Invariant):**  
  Verifies that transportation and handling fees do not experience cascaded taxation.

---

### 🛡️ 5. Commercial Rules & Entitlements
- **Quota Deduction Invariant (`00286` / `00289`):**  
  RFQs do not consume subscription quota upon draft creation or publishing; quotas decrement only upon receipt and persistence of the first comparison-eligible quotation.
- **Bonus Carry-Forward:**  
  Quarterly bonus RFQs expire at quarter boundary (`doesBonusCarryForward: false`).
- **Active Pilot Policy:**  
  `PILOT_FREE` billing mode remains active for launch verification while accurately displaying published pricing cards.

---

### 📱 6. Mobile-First UX & Vocabulary Compliance
- **6-Tile Quick Action Grid:**  
  Approved navigation order:
  1. *My Requirements*
  2. *My Quotes*
  3. *My Orders*
  4. *Create RFQ*
  5. *Notifications*
  6. *Profile*
- **Mobile Ergonomics:**  
  Touch targets verified at `≥ 44px` (`min-h-[44px]`) with offline notification banners (`navigator.onLine`).
- **Zero-Tolerance Vocabulary Compliance:**  
  Zero occurrences of reverse-auction terms (`bid`, `bids`, `bidder`, `bidding`, `blind`).
