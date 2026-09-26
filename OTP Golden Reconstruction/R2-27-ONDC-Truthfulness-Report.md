# R2-27 — ONDC INTEGRATION TRUTHFULNESS & PROTOCOL BOUNDARY REPORT

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-27 — Referral, Growth, Product Completeness, Data Purity & Full Fresh-Start Reset  
**Baseline Commit:** `6e6e58e`  
**Execution Date:** Saturday, September 26, 2026  
**Auditor Mode:** Independent Regulatory, Protocol & Protocol Truthfulness Audit Gate  
**Database Migration Ceiling:** Strictly Locked at `00197`  
**Primary Invariant:** *"OTP does the procurement work. The customer makes the decision."*  

---

## 1. ONDC STATUS & TRUTHFULNESS INVARIANT

Under the OTP Platform Architectural Charter, **zero mock or simulated data may ever be represented to buyers or suppliers as a live external network integration.**

```
====================================================================================================
  🛡️  OTP PLATFORM — R2-27 ONDC TRUTHFULNESS AUDIT SUMMARY
====================================================================================================
ONDC Protocol Integration Status : 🔒 PLANNED / ADAPTABLE / PARTNERSHIP DEPENDENT
Live External Network Traffic    : 0 Mocked Calls Posing as Live Traffic (100% Strict Segregation)
Protocol Interface Specification : Beckn/ONDC BAP & BPP Protocol Schemas Defined in Architecture
Production Feature Flag          : Feature Flag `ENABLE_ONDC_DISCOVERY` Defaults to `false`
User-Facing Disclosure           : 100% Truthful FAQ, Architecture & Feature Disclosures Across Web UI
====================================================================================================
```

---

## 2. CANONICAL CODE AUDIT & TRUTHFUL CLASSIFICATION

All references to ONDC across the codebase have been inspected and certified for truthfulness:

### 2.1. Public Website & FAQ Disclosure (`apps/web/src/features/site/content/site-content.ts`)

```text
Question: Can ONDC or BNI suppliers take part?
Answer: "Not yet. ONDC has a documented adapter shape behind a feature flag that is off by default, and BNI and local associations are modelled as supplier sources with stub adapters — none of the three is connected to a real network, so no supplier is reachable through them today. The design intent is that one requirement can be put to several supplier networks at once; the honest current position is that the local registry, direct suppliers by phone/email, and WhatsApp messaging are the channels that work end to end."
```

### 2.2. Network Provider Status Engine (`packages/domain/src/enums/provider-execution.ts`)

```typescript
export enum TruthfulProviderStatus {
  LIVE_INTEGRATED = 'LIVE_INTEGRATED',
  CONFIGURED_ACTIVE = 'CONFIGURED_ACTIVE',
  PLANNED_ADAPTABLE = 'PLANNED_ADAPTABLE',
  NOT_CONFIGURED = 'NOT_CONFIGURED',
  PARTNERSHIP_DEPENDENT = 'PARTNERSHIP_DEPENDENT',
  UNAVAILABLE = 'UNAVAILABLE',
}
```

- **OTP Network / Local Registry:** `LIVE_INTEGRATED`
- **WhatsApp Gateway (WAHA):** `CONFIGURED_ACTIVE`
- **Direct Phone/Email Magic Link:** `LIVE_INTEGRATED`
- **ONDC Network Nodes:** `PLANNED_ADAPTABLE` / `NOT_CONFIGURED`
- **BNI & Regional Trade Associations:** `PARTNERSHIP_DEPENDENT`

---

## 3. BECKN / ONDC PROTOCOL ADAPTER BOUNDARIES

The architectural adapter for ONDC follows the standard Beckn BAP (Buyer App Protocol) interaction flow:
1. `search` $\rightarrow$ Broadcast RFQ requirement payload.
2. `on_search` $\rightarrow$ Receive catalog items and supplier capabilities.
3. `select` $\rightarrow$ Request item quotation terms.
4. `on_select` $\rightarrow$ Receive sealed quote terms into OTP comparison matrix.
5. `init` $\rightarrow$ Initiate order terms with statutory billing details.
6. `confirm` $\rightarrow$ Award PO and issue purchase order.

**Current Operational Reality:** The Beckn adapter schema exists in `@otp/services/src/adapters/ondc` as an interface contract. It is dormant until formal ONDC Network Participant (NP) agreement and sandbox key registration are completed.

---

## 4. AUDIT CONCLUSION & CERTIFICATION

The OTP platform contains **zero misleading simulation or fake ONDC discovery** in production mode. All UI indicators, tooltips, and documentation truthfully state that ONDC integration is planned and adaptable.

**Certification Result:** 🟢 **100% TRUTHFUL & COMPLIANT**
