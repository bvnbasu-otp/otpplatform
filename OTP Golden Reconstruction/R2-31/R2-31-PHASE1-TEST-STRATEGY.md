# R2-31 Phase 1 — Test Strategy

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Goal:** Certify document engine honesty, visibility, immutability, and wallet regression safety (W1–W10).

---

## 1. Regression guardrails (must preserve)

| Suite | Path | Why |
|-------|------|-----|
| Wallet / award security | `tests/security/verified-remediation-00216-database.test.ts` | RPC hardening |
| Referral 00221 | `tests/security/otp-referral-00221-database.test.ts` | Matrix amounts |
| Financial settlement | `tests/security/financial-settlement-controls-redteam.test.ts` | Fee/reward segregation |
| Decide atomic award | `tests/security/decide-atomic-award-redteam.test.ts` | Award integrity |
| A4 procurement | `apps/web/src/features/reporting/procurement-document.test.tsx` | Shell + IST dates |
| PO document | `apps/web/src/features/fulfillment/po-document.test.ts` | PO input bridge |
| Decision receipt domain | `packages/domain/src/types/decision-receipt.test.ts` | Hash rules |
| Decision receipt card | `apps/web/src/features/reveal/decision-receipt-card.test.tsx`, `award/decision-receipt-card.test.tsx` | UI integrity labels |

**W1–W10:** No test changes that weaken wallet amount assertions; referral tests must continue to reject client amount override.

---

## 2. Historical immutability test (C-09 — requires 00222 in implementation)

**Name:** `issued-snapshot-reveal-unchanged`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Buyer locks award under `PRE_REVEAL` | Snapshot S1 inserted; digest D1 |
| 2 | Fetch S1 by `document_id` | Payload shows pseudonyms; D1 stable |
| 3 | Trigger identity reveal / `POST_REVEAL` | New snapshot S2 optional; **S1 unchanged** |
| 4 | Reprint using S1 id | Byte-identical model to step 2 |
| 5 | Reprint using S2 (if issued) | Shows revealed fields; digest D2 ≠ D1 |

Run in `tests/security/` with local DB + service_role fixture.

---

## 3. Persona matrix (document access)

For each document loader / snapshot RPC, table-driven tests:

| Persona | Cases |
|---------|--------|
| Individual buyer | Own org PO, receipt, wallet |
| RWA owner | + committee vote export |
| RWA committee member | Votes visible; other org ✕ |
| RWA manager / delegate | Delegation scope |
| MSME primary | Full buyer docs |
| MSME delegate | Scoped RFQs |
| Supplier (awarded) | PO/invoice; ✕ competitor quotes |
| Supplier (non-awarded) | ✕ award package |
| Founder / admin | Cross-org read via admin RPC only |

Assert HTTP/RPC **denied** for cross-supplier quote rows and committee COI.

---

## 4. Canonical receipt unification (C-01)

| Test | Assertion |
|------|-----------|
| Bridge test | `buildCanonicalDecisionReceipt` → `buildProcurementDocumentModel` includes `verification.value === cryptographicAuditHash` |
| Page integration | `AwardPage` renders digest matching `verifyDecisionReceiptIntegrity` |
| Divergence guard | Reputation-only path cannot be sole print surface when canonical present |

---

## 5. Integrity labeling (C-02, C-05)

| Test | Assertion |
|------|-----------|
| A4 footer | Contains “not a legal digital signature” (or approved phrase) |
| Card UI | No “HMAC-SHA256” string in DOM |
| `pdf-receipt.test.ts` | `computeReceiptAuditHash` remains tested but not imported by pages |

---

## 6. Report honesty (C-06)

| Test | Assertion |
|------|-----------|
| `PurchaseOrdersPage` / analytics | No `0.125` multiplier in report summary builder |
| `PrintableProcurementReport` | Still no savings/compliance fields |

---

## 7. Tax invoice (C-08)

| Test | Assertion |
|------|-----------|
| Invoice print input | Uses `tax_snapshot` from approved fixture — not live recalc |
| Label | Notes include non-statutory disclaimer |
| Mirror `po-document.test.ts` structure | Party orientation supplier → buyer |

---

## 8. Visibility (matrix doc)

Extend `procurement-document.test.tsx`:

- `QUOTE_COMPARISON` + `viewerRole: 'supplier'` + `PRE_AWARD` → no buyer legal name.  
- `POST_AWARD` PO → bilateral names.

---

## 9. Wallet statement (Phase C)

| Test | Assertion |
|------|-----------|
| Statement model | Lines ⊆ {referral, success cashback, supplier success reward, subscription debit} |
| Negative | No Supplier Cashback type; no PO GMV credits |

---

## 10. Test data & environment

- Local Docker `127.0.0.1:54322` for security DB tests (existing pattern).  
- Do not run `supabase db push` to production from R2-31.  
- Snapshot tests skipped until 00222 applied locally — mark `describe.skip` with ticket ref in implementation.

---

**End test strategy.**
