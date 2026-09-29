# R2-31 Phase 1 — Canonical Document, Ledger & Reporting Architecture

**Status:** Design only — no implementation.  
**Baseline commit (verified):** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Production migration ceiling (external):** `00221` — not modified in this pass.  
**Scope:** Document engine, integrity labeling, reporting honesty, issued snapshots (proposal), visibility policy. **Out of scope:** ONDC, wallet economics redesign, new referral matrix, Supplier Cashback, statutory e-invoice/GSP.

**Inputs read:** `R2-31-00-FORENSIC-DISCOVERY.md`, `R2-31-01-GAP-AND-CONTRADICTION-REGISTER.md`, `R2-31-02-CANONICAL-ARCHITECTURE.md`, `R2-31-03-IMPLEMENTATION-PLAN.md`, `R2-31-05-CONTRADICTION-RECONCILIATION.md`, `R2-31-05-SOURCE-OF-TRUTH-MATRIX.md`. Where those docs conflict with code, **code wins** (noted in `R2-31-PHASE1-DECISIONS.md`).

---

## 1. Design goal

One **canonical document pipeline** turns **authoritative database records** into **persona- and phase-correct** printable outputs (browser print / save-as-PDF) and on-screen reports, without inventing KPIs, without mixing procurement GMV with wallet or OTP revenue, and without claiming legal digital signatures.

Product alignment: procurement journey **TELL → REVIEW → DECIDE → TRACK**; documents support review and proof, not full accounting software.

---

## 2. Single engine (no second renderer)

```text
Authoritative Records (SQL / RPC / domain loaders)
        │
        ▼
DocumentPolicy (persona × rfq.reveal_status × document kind × viewer role)
        │
        ▼
IssuedDocumentSnapshot (persist at issuance — proposed 00222; absent today)
        │
        ▼
ProcurementDocumentInput / domain view models
        │
        ▼
buildProcurementDocumentModel()  ──►  PrintableProcurementDocument
        │                                      │
        └──────── same business logic ─────────┘
                    print + PDF-via-print
```

**Existing anchors (must reuse):**

| Role | Path |
|------|------|
| Kinds & model builder | `apps/web/src/features/reporting/lib/procurement-document.ts` |
| A4 renderer | `apps/web/src/features/reporting/components/PrintableProcurementDocument.tsx` |
| PO bridge | `apps/web/src/features/fulfillment/lib/po-document.ts`, `PurchaseOrderDetailPage.tsx` |
| Print trigger | `apps/web/src/features/reporting/lib/pdf-generator.ts` (`triggerPrintDialog` only) |
| Canonical receipt domain | `packages/domain/src/types/decision-receipt.ts` |
| Receipt assembly (service) | `packages/services/src/services/award-service.ts` |

**Explicit non-goal:** A parallel PDF server, a second A4 component, or a separate “report PDF engine.” ERP exports (Tally/Zoho) remain sibling **export** faces from the same loaders, not a second procurement print stack.

---

## 3. Canonical Decision Receipt (C-01)

| Artifact | Location | Role after R2-31 |
|----------|----------|------------------|
| **`CanonicalDecisionReceipt`** | `packages/domain/src/types/decision-receipt.ts` | **Canonical** institutional proof (governance fields + integrity digest) |
| Reputation narrative `DecisionReceipt` | `apps/web/src/features/reveal/types/decision-receipt.ts`, `DecisionReceipt.tsx` | **Optional appendix** inside snapshot payload or secondary panel — not the integrity root |
| `ProcurementDocumentKind.DECISION_RECEIPT` | `procurement-document.ts` | **Presentation** face of canonical payload + digest on A4 |
| `DecisionReceiptCard` | `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx` | **User-facing** integrity UI when wired; today unused on pages (`AwardPage.tsx` imports `DecisionReceipt` only — verified at baseline) |

**Third model:** None. Do not introduce a new receipt type.

**Historical rows:** Pre-00222 awards have **no** persisted receipt JSON. Reprints may use live builders with documented limitation until backfill policy is chosen; **no migration of wallet or award amounts**. Optional read-only reconstruction from `awards`, votes, and `quotes_revealed` for display-only “reconstructed summary” (not verifiable) if product requires.

**Required canonical fields:** As defined on `CanonicalDecisionReceipt` / `buildCanonicalDecisionReceipt` — buyer context, requirement snapshot, selected offer (with `maskedSupplierLabel` + conditional `businessName`), merit evaluation, authority attribution, governance attestations, `receiptGeneratedAt`, `cryptographicAuditHash` from `computeDecisionReceiptHash`.

**Migration for C-01 alone:** Not required if 00222 stores full snapshot JSON. No change to `00221`.

---

## 4. Integrity terminology (C-02, C-05)

| Term | Meaning in OTP code | User-facing claim |
|------|---------------------|-------------------|
| **SHA-256 (Web Crypto)** | `computeReceiptAuditHash` in `pdf-generator.ts` | **Do not** expose on production documents; test/legacy only |
| **Integrity digest** | `computeDecisionReceiptHash` → `computeDeterministicHmac(canonicalJson, DECISION_RECEIPT_SALT)` in `decision-receipt.ts` | “Tamper-evident integrity digest (OTP internal algorithm)” |
| **“HMAC” in comments** | Custom 128-hex digest in `packages/domain/src/types/procurement-communications.ts` — **not** HMAC-SHA256 | Do not label “HMAC-SHA256” on UI/PDF |
| **Digital / legal signature** | Not implemented (no DSC/eSign) | **Never** on OTP PDFs |

**Authoritative function names:** `computeDecisionReceiptHash`, `verifyDecisionReceiptIntegrity`, `computeDeterministicHmac`.

**Proposed A4 footer block (all template kinds):**

- Powered by OTP — Open Trade & Procurement  
- Identity-Protected Competitive Sourcing (when `identityProtected`)  
- Document ID: `{issued_document_id or referenceNumber}`  
- Verification reference: `{digest}` — integrity check only; **not a legal digital signature**  
- Page X of Y  

Extend `PLATFORM_DISCLAIMER_LINES` usage in `buildProcurementDocumentModel` footer; align `DecisionReceiptCard` labels in implementation phase.

---

## 5. Referral 10% inventory (C-03) — summary

Authoritative wallet referral: **`credit_otp_referral_bonus_atomic`** + `private.otp_referral_bonus_inr` in `supabase/migrations/00221_otp_referral_bonus_profile_matrix.sql` (Individual ₹10, RWA ₹25, MSME ₹50, Supplier ₹100). **`referral-incentive.ts` 10% does not credit wallets** (no app path to RPC with `calculateReferralReward`).

Full classification and cleanup plan: `R2-31-PHASE1-DOCUMENT-TAXONOMY.md` § Referral references. **Do not edit 00221.**

---

## 6. Savings and compliance (C-06)

**Authoritative formula:** **NOT FOUND** for period procurement analytics.

Evidence: `PurchaseOrdersPage.tsx` sets `estimatedSavings: Math.round(totalAmount * 0.125)` and `complianceScorePercent: 100`; consumed by `AnalyticsCards.tsx`. `PrintableProcurementReport.tsx` does **not** include these fields.

**Design:** Remove both KPIs from canonical buyer/supplier reports unless later bound to `procurement_performance_records` or a defined RPC. Do not invent a replacement formula. `MarketIntelligencePanel.tsx` heuristic savings remain explicitly **non-authoritative** UI copy if kept.

---

## 7. Tax invoice (C-08)

**Authoritative data:** `invoices`, `invoice_line_items`, aggregates and `tax_snapshot` (frozen on approve per `00168_phase5b_statutory_gst_and_tax_splitting.sql`), loaded in `apps/web/src/features/fulfillment/api/invoices.ts` via `buildTaxSnapshot` / domain tax helpers.

**Gap:** `TAX_INVOICE` kind exists in `procurement-document.ts` but **no** invoice detail page mounts `PrintableProcurementDocument` (unlike `PurchaseOrderDetailPage.tsx`).

**Design path:** Approved invoice → read frozen `tax_snapshot` + line items → `ProcurementDocumentInput` → same engine. Label: **“Bilateral tax summary for procurement records — not a statutory e-invoice.”** No GSP/IRN claims.

Field-level GAP list: `R2-31-PHASE1-SCHEMA-DESIGN.md` § Invoice snapshot payload.

---

## 8. Issued snapshots (C-09)

Today **no** `issued_document_snapshots` table (grep NOT FOUND). Dynamic reprint changes winner identity and digest when `AwardService.buildReceiptForAward` sets `receiptGeneratedAt: now` (Phase 0.5 verified).

**Rule:** Documents issued under protected identity must **not** change when identity is later revealed. **New state → new snapshot version** (`supersedes_document_id`).

Frozen fields (design contract): `document_id`, transaction refs (`source_entity_type`, `source_entity_id`), `document_kind`, `document_number`, `generated_at`, `generated_by`, `persona`, `perspective`, `identity_state`, `visibility_context`, `template_version`, `schema_version`, source refs, `payload_json` (frozen), `verification_digest`, `verification_algorithm`, `status`, `supersedes_document_id`, `verification_ref` (public lookup code optional).

**Mutability:** INSERT-only for authenticated issuance RPCs; no UPDATE/DELETE for non-admin; ordinary clients SELECT only within RLS.

Detail: `R2-31-PHASE1-SCHEMA-DESIGN.md` (00222 proposal).

---

## 9. Three ledgers (locked)

| Domain | System of record | Document examples | Exclusions |
|--------|------------------|-------------------|------------|
| Procurement / GMV | `purchase_orders`, `invoices`, `payments`, `journal_entries` (`00176`) | PO, tax summary, settlement cert, Tally/Zoho payment exports | Wallet credits, referral |
| OTP revenue | `platform_fee_transactions` (`00174`) | Fee assessment statements (founder/admin) | GMV payable, wallet |
| Wallet / incentives | `organization_wallets`, `wallet_transactions` (`00181`, `00220`, `00221`) | Wallet statement, referral/success reward notices | **No Supplier Cashback**; no procurement amounts as wallet credits |

Buyer wallet: Success Cashback + Referral Bonus. Supplier wallet: Referral Bonus + ₹100 Success Reward only.

Wallet statements list: referral credits, success cashback (buyer), supplier success reward, subscription debits — never Supplier Cashback, never GMV lines.

---

## 10. Wallet platform-fee spend (C-10)

SQL: only `apply_wallet_credits_to_subscription_atomic` (`00181`, hardened `00216`). **No** `apply_wallet_credits_to_platform_fee_atomic`.

Copy mentions platform fees: `OtpWalletCreditsWidget.tsx`, `organization-charter.ts`.

**Phase 1 decision:** **DEFER WITH COPY/CONTRACT CLARIFICATION** (see DECISIONS). R2-31 may document wallet **statements** but must not implement fee debit without explicit wallet phase.

---

## 11. Reporting personas

| Persona | Reports | Visibility |
|---------|---------|------------|
| Buyer (Individual / RWA / MSME) | Period procurement (PO-derived), wallet statement, own fee lines | No founder-only KPIs |
| Supplier | PO/WO/invoice views, own wallet, own platform fees | No other suppliers’ quotes; no buyer committee internals |
| RWA committee / delegate / manager | Governance-weighted views per existing RLS | Same snapshot rules |
| Founder / platform admin | Cross-org reconciliation, OTP revenue, audit extracts | Not exposed to buyer/supplier routes |

Period filters: IST (`formatDateTimeIST`), inclusion rules per report definition, cancelled PO treatment = exclude from “active spend” totals unless report explicitly “includes cancelled,” opening/credits/debits/closing **only** where ledger RPC provides them (wallet: `get_wallet_transactions`).

---

## 12. A4 shell requirements (requirement 9)

Implemented largely in `PrintableProcurementDocument.tsx` + `buildProcurementDocumentModel`. Phase 1 design additions:

- Standardize footer lines: “Powered by OTP — Open Trade & Procurement,” identity protection line, Document ID, verification reference wording (§4).  
- Ensure `print:` hidden block only (no browser chrome) — existing PO pattern.  
- Tax invoice and decision receipt use **same** shell as PO.

---

## 13. ONDC

**Out of scope.** Canonical domain models may be consumed later; no ONDC adapters, files, or migrations in R2-31.

---

## 14. UX principles

- Few clicks: print from existing detail pages (`?print=1` optional).  
- No accounting-app scope creep; wallet statement is a **list**, not a general ledger UI.  
- Documents support decision tracking, not replace Tally/Zoho for statutory books.

---

## 15. Phase 1 deliverables map

| Topic | Document |
|-------|----------|
| Sequencing | `R2-31-PHASE1-IMPLEMENTATION-PLAN.md` |
| 00222 proposal | `R2-31-PHASE1-SCHEMA-DESIGN.md` |
| Document catalog | `R2-31-PHASE1-DOCUMENT-TAXONOMY.md` |
| Visibility | `R2-31-PHASE1-VISIBILITY-MATRIX.md` |
| Tests | `R2-31-PHASE1-TEST-STRATEGY.md` |
| Files | `R2-31-PHASE1-FILE-IMPACT.md` |
| Decisions & audit | `R2-31-PHASE1-DECISIONS.md` |

---

**End Phase 1 architecture — no code changes.**
