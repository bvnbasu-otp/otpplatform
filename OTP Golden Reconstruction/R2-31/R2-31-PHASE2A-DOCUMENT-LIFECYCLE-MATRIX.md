# R2-31 Phase 2A — Document Lifecycle Matrix (Design Only)

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Companion:** `R2-31-PHASE2A-00222-SCHEMA-CONTRACT.md`

---

## 1. Lifecycle states (documents)

| State | Meaning | Stored in 00222 |
|-------|---------|-----------------|
| **ISSUED** | Active frozen snapshot; eligible for reprint / verify | `status = 'ISSUED'` |
| **SUPERSEDED** | Replaced by newer ISSUED row; payload immutable | `status = 'SUPERSEDED'`, `supersedes_document_id` on successor |
| **VOID** | Admin-invalidated; payload retained | `status = 'VOID'` |

Document **identity phase** (protected vs revealed) is **not** a status — it is `identity_state`:

| Identity | DB value | User term |
|----------|----------|-----------|
| Protected | `PRE_REVEAL` | Supplier/buyer masking per visibility matrix |
| Revealed | `POST_REVEAL` | Bilateral or post-reveal fields |

No other identity states unless code forces `POST_AWARD`/`PRE_AWARD` mapping only in `procurementDocumentInput.phase` (presentation).

---

## 2. Canonical vs reuse existing artifacts

| Output | Canonical persistence (00222) | Existing artifact (still SoR for facts) |
|--------|------------------------------|----------------------------------------|
| Decision receipt (integrity) | `DECISION_RECEIPT` snapshot + `CanonicalDecisionReceipt` in payload | `awards`, votes, `quote_versions.snapshot` |
| Reputation narrative | Optional `reputationAppendix` in payload only | Live `fetch-decision-receipt.ts` / `quotes_revealed` for **new** assembly only |
| Purchase order A4 | `PURCHASE_ORDER` snapshot | `purchase_orders`, `po_line_items` |
| Tax invoice A4 | `TAX_INVOICE` snapshot | `invoices`, `invoice_line_items`, `tax_snapshot` |
| Period procurement report | Not required (optional later) | Live PO list queries |
| Wallet statement | **No** 00222 row | `wallet_transactions` via `get_wallet_transactions` |
| Platform fee statement | **No** 00222 row | `platform_fee_transactions` |
| Quote comparison A4 | Deferred P2 | Live quotes + `procurement-document` redaction |
| Settlement certificate | Deferred P2 | Domain generator in memory |
| Procurement contract | Existing `procurement_contracts` hashes | Not merged into 00222 in initial migration |

---

## 3. Scenarios A–E (frozen behaviour)

| ID | Scenario | Required behaviour |
|----|----------|-------------------|
| **A** | Protected issue at award lock | INSERT `DECISION_RECEIPT`, `identity_state = PRE_REVEAL`, `perspective = BUYER`, `status = ISSUED`. Payload uses masked supplier label; `selectedOffer.supplierId` null in hash inputs per `computeDecisionReceiptHash`. |
| **B** | Later reveal (`reveal_award` or lock with verified supplier + `p_auto_reveal = true`) | INSERT **new** rows `identity_state = POST_REVEAL`. PRE_REVEAL rows unchanged. |
| **C** | Reprint original protected document | SELECT by `document_id` or idempotency key; render **only** `payload_json`; **never** refresh buyer/supplier from live tables. |
| **D** | Post-reveal document | **New row** (Scenario B). Reprint uses POST_REVEAL snapshot only for “revealed” face. |
| **E** | Amendment / correction | Platform admin or privileged amend flow: mark prior ISSUED **SUPERSEDED** (audit row); INSERT new ISSUED with updated payload and new digest. **No UPDATE** to `payload_json`. |

**Reprint NEVER reads current identity** for issued documents — only frozen payload.

---

## 4. Award paths → receipt pipeline

Both UI entry points converge in SQL:

| Client call | SQL entry | `p_auto_reveal` |
|-------------|-----------|-----------------|
| `AwardPage` → `lock_award` | `lock_and_reveal_award_atomic(..., false)` | false |
| `EvaluationDecisionCockpit` → `lock_and_reveal_award_atomic` | same | caller-defined |

**Single hook body:** `lock_and_reveal_award_atomic` (`00216`).

### 4.1 Flow diagram (award → issuance)

```text
lock_and_reveal_award_atomic (or lock_award wrapper)
  │
  ├─► Authoritative loaders (NOT AwardService placeholders)
  │     awards, rfqs, quotes, quote_versions.snapshot, votes, stages,
  │     organizations, buyer_addresses, suppliers (masked fields)
  │
  ├─► buildCanonicalDecisionReceipt (TS in hook implementation / edge worker)
  │     receiptId, timestamps.awardedAt, receiptGeneratedAt fixed at lock
  │     computeDecisionReceiptHash → cryptographicAuditHash
  │
  ├─► buildProcurementDocumentInput (DECISION_RECEIPT, phase PRE_AWARD or POST_AWARD)
  │
  ├─► issue_document_snapshot_atomic
  │     PRE_REVEAL BUYER (always on new award lock)
  │
  ├─► IF v_can_reveal (verified supplier AND p_auto_reveal)
  │     ├─► create_purchase_order_from_award
  │     └─► issue POST_REVEAL decision receipt (+ PO snapshots per §4.2)
  │
  └─► audit_events / procurement_stage_events (refs: snapshot_id, document_id)

reveal_award (later)
  │
  ├─► Reveal + PO creation (existing RPC)
  ├─► issue POST_REVEAL decision receipt(s)
  ├─► issue PURCHASE_ORDER snapshots (if not already issued in lock path)
  └─► audit
```

### 4.2 PO issuance path

```text
create_purchase_order_from_award
  ├─► buildPurchaseOrderDocumentInput-equivalent payload from PO + lines + address snapshots
  ├─► issue_document_snapshot_atomic ×2 (BUYER + SUPPLIER perspectives, POST_REVEAL)
  └─► OTP_PROCUREMENT_A4_V1 digest on procurementDocumentInput
```

### 4.3 Invoice approve path

```text
Invoice status → APPROVED (tax_snapshot frozen, 00168)
  ├─► Loader from invoices + invoice_line_items + tax_snapshot (+ address joins)
  ├─► issue_document_snapshot_atomic ×2 (BUYER + SUPPLIER, POST_REVEAL)
  └─► audit
```

---

## 5. Identity state by document kind (initial 00222)

| Kind | First issuance trigger | Typical `identity_state` | Perspectives |
|------|------------------------|--------------------------|--------------|
| `DECISION_RECEIPT` | Award lock | `PRE_REVEAL` then `POST_REVEAL` | BUYER; SUPPLIER optional POST_REVEAL for awarded supplier only |
| `PURCHASE_ORDER` | PO create | `POST_REVEAL` | BUYER + SUPPLIER |
| `TAX_INVOICE` | Invoice approve | `POST_REVEAL` | BUYER + SUPPLIER |

**PO note:** `po-document.ts` always uses `phase: POST_AWARD` — consistent with `POST_REVEAL` identity for bilateral PO print.

---

## 6. UI / screen vs issued document

| Surface | Role after R2-31 |
|---------|------------------|
| `DecisionReceipt.tsx` | Narrative appendix; not integrity root |
| `DecisionReceiptCard.tsx` | Shows `CanonicalDecisionReceipt` from snapshot or live loader pre-00222 |
| `PrintableProcurementDocument` | Renders frozen `ProcurementDocumentModel` from snapshot input only (post-B) |

---

## 7. Failure & edge alignment

See schema contract §11. Lifecycle-specific rules:

- **Cancelled PO:** ISSUED PO snapshots remain; status VOID only via admin policy.
- **Unlock award (`unlock_award_decision`):** Does not DELETE snapshots; new award cycle gets new `award_id` / keys — old snapshots remain historical evidence.
- **Existing award on re-lock:** Idempotency on `decision:{award_id}:PRE_REVEAL:BUYER` prevents duplicate PRE_REVEAL rows.

---

## 8. Code observations (document only)

| Observation | Impact |
|-------------|--------|
| `lock_award` wraps atomic RPC | One SQL hook sufficient |
| `AwardService.buildReceiptForAward` placeholders | Production loader must bypass |
| No receipt columns on `awards` | 00222 is first persistence |
| `reveal_award` separate from lock | POST_REVEAL issuance on reveal path mandatory |

---

**End lifecycle matrix — design only.**
