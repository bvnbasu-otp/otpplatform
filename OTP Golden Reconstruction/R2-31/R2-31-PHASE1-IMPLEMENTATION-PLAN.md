# R2-31 Phase 1 — Implementation Plan (Post-Design)

**Prerequisite:** Phase 1 design docs in `OTP Golden Reconstruction/R2-31/`.  
**This document:** Sequenced work for a **future** implementation pass — **not executed** at `c444df6`.

**Constraints carry forward:** No wallet matrix change, no Supplier Cashback, no ONDC, no `00221` edits.

---

## Phase A — Engine wiring (no 00222)

| Step | Work | Evidence / files |
|------|------|------------------|
| A.1 | `DocumentPolicy` helper: map `rfq.reveal_status`, award status, `viewerRole` → `ProcurementDocumentPhase` | `procurement-document.ts`; gap C-07 |
| A.2 | Bridge `CanonicalDecisionReceipt` → `ProcurementDocumentInput` (`DECISION_RECEIPT` + verification) | `decision-receipt.ts`, `procurement-document.ts` |
| A.3 | Mount `DecisionReceiptCard` + A4 print on `AwardPage`, `SupplierRevealPage`, `EvaluationDecisionCockpit` | `AwardPage.tsx` today uses `DecisionReceipt` only |
| A.4 | Demote reputation block to appendix; fix integrity copy (C-05) | `DecisionReceipt.tsx`, `DecisionReceiptCard.tsx` |
| A.5 | Wire invoice print: approved invoice → `buildTaxInvoiceDocumentInput` (new sibling of `po-document.ts`) → `PrintableProcurementDocument` | `invoices.ts`, `PurchaseOrderDetailPage` pattern |
| A.6 | Remove fabricated `estimatedSavings` / `complianceScorePercent` | `PurchaseOrdersPage.tsx`, `reporting.ts`, `AnalyticsCards.tsx` |
| A.7 | Gate `computeReceiptAuditHash` from user paths | `pdf-generator.ts` |
| A.8 | Referral 10% cleanup (docs/comments/exports only — no 00221) | `referral-incentive.ts` header, `DashboardPage.tsx` comments, `subscription/types.ts` re-export note |
| A.9 | C-10 copy: subscription-only wallet spend where fee RPC absent | `OtpWalletCreditsWidget.tsx`, `organization-charter.ts` |

**Migration:** None.

**Tests:** Extend `procurement-document.test.tsx`, `decision-receipt-card.test.tsx`, new invoice print test; regression W1–W10 wallet tests unchanged.

---

## Phase B — Issued snapshots (00222)

| Step | Work |
|------|------|
| B.1 | Apply migration per `R2-31-PHASE1-SCHEMA-DESIGN.md` (operator release — not discovery) |
| B.2 | `issue_document_snapshot_atomic` SECURITY DEFINER + immutability triggers |
| B.3 | Hook award lock, PO create, invoice approve |
| B.4 | `fetchIssuedSnapshot` API; reprint loads snapshot by `document_id` |
| B.5 | Historical test: issue PRE_REVEAL → reveal → original snapshot unchanged; POST_REVEAL is new row |

**Tests:** New `tests/security/issued-document-snapshot-rls.test.ts`; persona matrix from test strategy doc.

---

## Phase C — Statements & founder reports

| Deliverable | Source |
|-------------|--------|
| Buyer/supplier wallet statement A4 or CSV | `get_wallet_transactions`, `resolveWalletOrganizationId` |
| OTP revenue period (founder/admin) | `platform_fee_transactions` |
| GMV ledger extract | `get_ledger_balance_summary` (`00176`) |
| Settlement A4 wrapper | `generatePoSettlementCertificate` + same shell |

**No cross-domain “total money” dashboard.**

---

## Phase D — Certification

1. All `ProcurementDocumentKind` values wired or explicitly labeled non-statutory.  
2. Canonical receipt on screen matches `verifyDecisionReceiptIntegrity`.  
3. Reprint after reveal uses snapshot (Phase B).  
4. No fabricated savings/compliance.  
5. Self-audit in `R2-31-PHASE1-DECISIONS.md` still passes.

---

## Dependency graph

```text
Phase A (wiring) ──► can ship with “reprint may vary” disclaimer
Phase B (00222) ──► required for C-09 certification
Phase C ──► parallel after A.5 invoice print
C-10 fee RPC ──► OUT OF R2-31 (copy defer)
```

---

**End implementation plan — no work performed in Phase 1.**
