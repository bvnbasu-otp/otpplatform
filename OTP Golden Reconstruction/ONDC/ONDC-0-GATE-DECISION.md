# ONDC-0 — Gate Decision

**Phase:** ONDC-0 read-only discovery & suitability gate  
**Date:** 2026-09-29  
**Repository / database / deployment changed:** **NO** (documentation only)

---

## Executive summary

OTP at certified baseline `9cb4a037418893cbaf5c90b9f108884d32a1601b` already implements a **Buyer App (BAP)–oriented** ONDC stack behind the **Supplier Network Engine** (`OndcNetworkAdapter` / `OndcSupplierProvider`) with truthful `NOT_CONFIGURED` behavior (no fabricated ONDC sellers). Registry onboarding surfaces (`ondc-site-verification.html`, `/on_subscribe`, public Beckn callbacks) are **absent** from the deployed web app. **Registry domain(s) for subscribe are not product-selected**, triggering the gate rule that unidentified domain is a **no-go for execution** until decided. Official ONDC pre-production path remains **real** (whitelist → subscribe → reference apps); staging registry is **retired**.

**Recommended gate:** proceed to ONDC-1 **only after** product locks `subscriber_id` FQDN and ONDC domain code(s); technical path is **adapter-compatible (PARTIAL)**.

---

## Evidence pointers

| Topic | Document |
|-------|----------|
| Repo map | `ONDC-0-DISCOVERY.md` |
| Official requirements | `ONDC-0-OFFICIAL-REQUIREMENTS-MATRIX.md` |
| Role / domain / use case | `ONDC-0-ROLE-DOMAIN-USECASE-MATRIX.md` |
| Engine compatibility | `ONDC-0-SUPPLIER-ENGINE-COMPATIBILITY.md` |

---

## Gate block (Section 40)

```
ROLE: Buyer Network Participant — Buyer App (BAP); ops_no 1 per official onboarding. Seller NP / Gateway / TSP: NOT IN SCOPE. subscriber_id / bap_id / participant id: UNKNOWN (not otpplatform-theta.vercel.app by default).

DOMAIN: NOT IDENTIFIED for registry subscribe — OTP uses heuristic Beckn domains in code (e.g. ONDC:B2B10, ONDC:SRV11) but no product-approved ONDC domain registration set. B2B RFQ alignment UNCERTAIN vs full OTP category taxonomy. Gate rule: domain unidentified → BLOCKED until product decision.

USE CASE: Buyer requirement → network discovery (ONDC search/on_search adapter) → existing Supplier Network Engine → OTP qualification → internal RFQ/quote/award/PO. ONDC full transaction (select/init/confirm) NOT IN REPO. Status: PARTIALLY_SUPPORTED for discovery-only adapter.

DISCOVERY: Official Beckn search/on_search supported for BAP. OTP code: OndcGatewayClient.search + OndcBapReceiver (in-memory). Missing: deployed callback routes, registry subscribe, site verification. CompositeDiscoveryService still includes MockNetworkDiscoveryService — pilot truth risk (OTP-controlled).

SUPPLIER NETWORK ENGINE: SINGLE engine (SupplierNetworkEngine) with OndcNetworkAdapter on SupplierNetworkPort. Parallel SupplierNetworkProviderEngine exists but not factory-wired to web. Compatibility: MINOR ADAPTER + INTERFACE GAP (HTTP/registry). ONDC as adapter without second engine: PARTIAL YES.

FROZEN INVARIANTS: ALL PRESERVED in intended ONDC discovery-only path — R2-31 closed; wallet matrix frozen; Buyer ≠ Supplier; no supplier cashback; SNE has no award authority; ONDC NOT_CONFIGURED returns zero candidates. RISK: stub Direct/BNI/Association adapters and mock composite discovery if not gated for pilot.

MISSING ITEMS (OTP): subscriber_id FQDN choice; ONDC domain registration choice; host ondc-site-verification.html; implement /on_subscribe; public signed BAP URI routes; wire receiver persistence; remove/gate mock/stub discovery for pilot; map theta Vercel host vs API subscriber host; ranking tuning for ONDC candidates.

MISSING ITEMS (ONDC): NP portal account; environment access / whitelist; pre-prod demo approval per ONDC process; registry subscribe ACK; live BPP on_search responses on network.

OTP-CONTROLLED: Adapter completion, HTTP surfaces, env config (no keys generated in ONDC-0), discovery truth gating, domain mapping policy, persistence design, UI truth vs integration state.

ONDC-CONTROLLED: Whitelisting, registry subscribe validation (OCSP, domain verification, encryption challenge), network participants, reference app E2E expectations, enabled domain policy.

PRODUCT DECISION GAPS: (1) subscriber_id FQDN; (2) ONDC domain code(s) for subscribe; (3) discovery-only vs future Beckn post-search flows; (4) pilot category/geography scope; (5) marketing FQDN otpplatform-theta.vercel.app vs BAP callback host.

DATABASE CHANGE: MINIMAL LIKELY for ONDC callback/supplier correlation if persisted; NO CHANGE for ONDC-0 read-only gate. Migrations through 00222 present, not applied.

REAL PRE-PROD PILOT: PARTIAL — official pre-prod registry + reference apps REAL; OTP not whitelisted/subscribed; no HTTP compliance surfaces; success must not use fake ONDC data (code supports empty path today).

FINAL DECISION: BLOCKED_PRODUCT_DECISION
```

---

## 14 success questions (ONDC-0)

| # | Question | Answer |
|---|----------|--------|
| 1 | Certified git baseline verified at HEAD? | **YES** — `9cb4a037418893cbaf5c90b9f108884d32a1601b` |
| 2 | Working tree dirty state recorded without mutation? | **YES** |
| 3 | Migrations present through `00222` (not applied)? | **YES** |
| 4 | ONDC role established from OTP behavior? | **YES** — Buyer App (BAP) |
| 5 | ONDC registry domain identified for OTP? | **NO** — **UNKNOWN** / product gap |
| 6 | Use case supported on official network (discovery adapter)? | **PARTIALLY_SUPPORTED** |
| 7 | Full ONDC commerce through award on protocol? | **NOT_SUPPORTED** in repo (by design scope) |
| 8 | ONDC without second discovery engine? | **PARTIAL** — SNE adapter path; dual interface + composite mock gap |
| 9 | subscriber_id / BAP id equals otpplatform-theta.vercel.app? | **UNKNOWN** |
| 10 | Registry crypto & on_subscribe / site verification implemented? | **NO** |
| 11 | Official pre-prod test path exists (no fake registry)? | **YES** (ONDC-controlled); OTP not on path yet |
| 12 | Frozen wallet / persona / SNE invariants preserved? | **YES** (with stub/mock pilot caveat) |
| 13 | Database impact for ONDC integration? | **MINIMAL LIKELY** |
| 14 | ONDC-0 gate decision | **BLOCKED_PRODUCT_DECISION** |

---

## Stop statement

**Repository / database / deployment changed: NO. STOP. Do not implement.**
