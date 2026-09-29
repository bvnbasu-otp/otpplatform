# R2-31 — Canonical Document, Ledger & Reporting Architecture

**Status:** Proposed target (discovery-derived). **Not implemented.**  
**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Invariant:** Wallet economics and three accounting domains unchanged.

---

## 1. Design goal

One **canonical engine** produces many **document faces** (A4 templates, on-screen reports, ERP exports) from the same **authoritative inputs**, with explicit **identity policy**, **ledger domain**, and **verification references** — without claiming legal digital signature or statutory tax filing unless backed by existing integrations (currently **NOT FOUND** for e-invoice).

Aligns with constitution: *“OTP does the procurement work. The customer makes the decision.”* Reports surface **recorded** decisions and ledger postings, not invented savings (see **C-06**).

---

## 2. Layered architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│  Persona & authorization (existing)                              │
│  private.is_org_member, supplier PO scope, portal side BUYER/SUPPLIER│
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  ReportDefinition / DocumentKind registry                        │
│  Maps kind → domain (PROCUREMENT | OTP_REVENUE | WALLET)         │
│  → data loaders (RPC/SQL/views) → policy                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  DocumentPolicy (identity + phase)                                 │
│  viewerPersona × recordPhase × rfq_reveal_status                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  SnapshotBuilder (immutable issuance)                              │
│  At lock/settle/post: freeze JSON payload + verification digest    │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  View models (extend existing)                                     │
│  ProcurementDocumentModel, PoSettlementCertificate, exports      │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   PrintableProcurementDocument      Tally/Zoho/ERP exporters
   (A4 shell)                         (already in @otp/domain)
```

**Naming:** Reuse existing OTP names where they exist:

| Proposed role | Existing anchor |
|---------------|-----------------|
| View model | `ProcurementDocumentModel`, `buildProcurementDocumentModel` |
| Kinds | `ProcurementDocumentKind` |
| Integrity | `CanonicalDecisionReceipt`, `verifyDecisionReceiptIntegrity`, `computeContractDocumentHash`, `digitalSealSha256` on settlement cert |
| Ledger events | `procurement_stage_events`, `wallet_transactions`, `journal_entries` |
| Authorization | RLS + privileged RPCs (`00199`, `00216`) |

Add only where missing: **`DocumentPolicy`**, **`IssuedDocumentSnapshot`** (persistence), **`ReportDefinition`** registry.

---

## 3. Identity states

Map product language to enforcement:

| State | Meaning | Document rule |
|-------|---------|---------------|
| **PRE_REVEAL** | Award may exist; `rfq.reveal_status` ≠ `REVEALED` or supplier onboarding incomplete | Supplier names → pseudonym; buyer identity hidden from supplier on pre-award docs (`PROTECTED_BUYER_LABEL` — already CODE) |
| **POST_REVEAL** | `rfq.reveal_status = REVEALED` and award `REVEALED` | Full bilateral party blocks on PO, invoice, settlement |
| **POST_AWARD (alias)** | Align `ProcurementDocumentPhase.POST_AWARD` with **POST_REVEAL** for fulfillment docs; pre-reveal award docs use **PRE_REVEAL** policy even if `POST_AWARD` phase for buyer-only internal summaries |

**Historical snapshot rule:** When a document is **issued** (award lock, PO issue, invoice approve, settlement reconcile, wallet credit), store `IssuedDocumentSnapshot { kind, issuedAt, payloadJson, verificationDigest, identityPhase }`. Renderers read snapshot for reprint; **live identity reveal must not mutate** prior PDFs (addresses **C-09**).

---

## 4. Three ledgers (separate engines, shared reporting shell)

| Domain | System of record | Document examples | Must not mix |
|--------|------------------|-------------------|--------------|
| **Procurement / GMV** | `purchase_orders`, `invoices`, `payments`, `journal_entries` (buyer org) | PO, tax invoice summary, settlement certificate, Tally/Zoho payment exports | Wallet credits |
| **OTP revenue** | `platform_fee_transactions`, subscription billing tables | Platform fee statement, OTP revenue period report | GMV payable to supplier |
| **Wallet / incentives** | `wallet_transactions`, `buyer_reward_allocations`, referral RPCs | Wallet statement, cashback/referral credit notices | Supplier invoice settlement |

**Reconciliation checks (batch/report):**

1. Σ PO settled amounts (buyer org) ↔ journal entries sourced to PO/invoice IDs  
2. Σ `platform_fee_transactions` SETTLED ↔ OTP revenue journal accounts  
3. Σ wallet `REWARD_CREDIT` − redemptions ↔ `organization_wallets.balance_credits`  
4. Idempotency: duplicate `idempotency_key` / unique source_entity indexes (`00220`, `00221`)

---

## 5. Persona access matrix (high level)

| Document kind | Buyer org member | Supplier (awarded) | Platform admin |
|---------------|------------------|--------------------|----------------|
| Pre-award quote comparison | yes (masked) | no (or masked self only via quote token) | yes |
| Canonical decision receipt | yes | awarded supplier post-reveal | yes |
| PO / invoice / settlement | buyer org | supplier on PO | yes |
| Wallet statement | org wallet (persona-resolved) | supplier org wallet | yes |
| OTP fee / revenue | buyer sees own fee lines | supplier sees own fee | admin all |

Use existing `resolveWalletOrganizationId` (CODE) — no parallel identity model.

---

## 6. A4 document shell (single renderer)

Extend `PrintableProcurementDocument` conventions:

- **Header:** OTP logo block, `PRODUCT_NAME` / `PRODUCT_FULL_NAME` (`@/lib/brand`)  
- **Title + document type label** (`documentType` field)  
- **Reference:** business ref (`referenceNumber`) + optional `recordId`  
- **Parties:** From/To blocks with policy-filtered names/GSTIN  
- **Body:** paginated tables (`paginateRows`, `FIRST_PAGE_ROWS`)  
- **Totals:** GST split, TDS line (only if authoritative amount present — no fake ₹0)  
- **Verification block:** `verification.label` + digest — wording **“Integrity reference (not a legal signature)”**  
- **Footer:** `PLATFORM_DISCLAIMER_LINES`, page **X of Y**  
- **Timestamps:** `formatDateTimeIST` only (existing tests enforce)

---

## 7. Verification model

| Layer | Mechanism | User-facing claim |
|-------|-----------|-------------------|
| Decision / governance | `cryptographicAuditHash` (HMAC) | Tamper-evident digest of recorded fields |
| Contracts | `computeContractDocumentHash` | Document checksum |
| Settlement | `digitalSealSha256` on `AuthoritativeSettlementCertificate` | Reconciliation seal |
| ERP export | manifest checksum in `erp_export_manifests` | Export batch integrity |

Optional future: `GET /verify?digest=` read-only lookup — **not in repo today**.

---

## 8. Reporting engine (not 40 screens)

- **Template:** A4 kinds (PO, invoice, decision receipt, quote comparison)  
- **Report view:** Analytics cards, drill-down, committee tally, evaluation cockpit  
- **Statement:** Wallet tx list, settlement cert, fee lines, credit/debit notes  
- **Export:** Tally XML, Zoho JSON, ERP manifest, journal extract  
- **NOT IN PRODUCT / GAP:** e-invoice, Form 16A, fabricated savings

Orchestration: `ReportDefinition` → loader → policy → snapshot (if issued) → renderer.

---

## 9. Integration with existing services

- **Award lock:** `lock_and_reveal_award_atomic` should eventually call snapshot writer (service_role) with canonical receipt payload from same path as `award-service.ts`  
- **PO issue:** `create_purchase_order_from_award` — snapshot PO document input  
- **Settlement:** `generatePoSettlementCertificate` — already domain-rich; add A4 wrapper  
- **Wallet credits:** RPCs in `00216`/`00220`/`00221` — append-only tx is authoritative; statement = projection of `get_wallet_transactions`

---

## 10. Non-goals (this architecture)

- No wallet economics redesign  
- No statutory e-invoice or DSC unless new compliance project  
- No server PDF library requirement (print-to-PDF acceptable)  
- No single merged “total money” dashboard across the three domains  

---

**Architecture proposal only — implementation in a later pass.**
