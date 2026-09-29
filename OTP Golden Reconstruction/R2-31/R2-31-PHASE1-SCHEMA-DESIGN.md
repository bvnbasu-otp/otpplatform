# R2-31 Phase 1 — Schema Design (00222 Proposal Only)

**Status:** Markdown proposal — **no** `supabase/migrations/00222_*.sql` file.  
**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`

---

## 1. Why 00222 is required

| Finding | Code evidence |
|---------|---------------|
| No issuance registry | Grep: no `issued_document_snapshots` / award receipt JSON column |
| Dynamic reprint | `PurchaseOrderDetailPage.tsx` builds live `printModel`; `AwardService` regenerates receipt with moving `receiptGeneratedAt` |
| C-09 | Protected-identity documents can change after reveal without frozen payload |

**Alternative without new table:** Add JSONB columns on `awards`, `purchase_orders`, `invoices` — rejected for design because **one engine** needs uniform versioning, supersession, and verification refs across kinds. A generic snapshot table matches `R2-31-02` layered model.

**Existing tables remain authoritative** for business facts; snapshots are **issued views**, not replacements for `awards` / PO / invoice rows.

---

## 2. Proposed table: `public.issued_document_snapshots`

```sql
-- PROPOSAL ONLY — NOT TO BE APPLIED IN PHASE 1

CREATE TABLE public.issued_document_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id                 text NOT NULL UNIQUE,  -- human-facing Document ID on PDF
  organization_id               uuid NOT NULL REFERENCES public.organizations(id),
  document_kind               text NOT NULL,  -- maps to ProcurementDocumentKind + extensions
  document_number             text NOT NULL,  -- business number (PO no, invoice no, receipt ref)
  source_entity_type          text NOT NULL,  -- e.g. AWARD, PURCHASE_ORDER, INVOICE, SETTLEMENT
  source_entity_id            uuid NOT NULL,
  transaction_refs            jsonb NOT NULL DEFAULT '{}',  -- rfq_id, po_id, award_id, etc.

  persona                     text NOT NULL,  -- INDIVIDUAL, RWA, MSME, SUPPLIER, FOUNDER, ...
  perspective                 text NOT NULL CHECK (perspective IN ('BUYER', 'SUPPLIER', 'PLATFORM')),
  identity_state              text NOT NULL CHECK (identity_state IN ('PRE_REVEAL', 'POST_REVEAL')),
  visibility_context          jsonb NOT NULL DEFAULT '{}',  -- viewerRole, redaction flags

  template_version            text NOT NULL,
  schema_version              text NOT NULL DEFAULT '1',
  payload_json                jsonb NOT NULL,  -- frozen ProcurementDocumentInput or canonical receipt + appendix
  verification_digest         text NOT NULL,
  verification_algorithm      text NOT NULL DEFAULT 'OTP_DECISION_RECEIPT_V1',  -- kind-specific registry
  verification_ref            text UNIQUE,  -- optional short public ref for support lookup

  generated_at                timestamptz NOT NULL,
  generated_by                uuid REFERENCES public.profiles(id),
  status                      text NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED', 'SUPERSEDED', 'VOID')),
  supersedes_document_id      uuid REFERENCES public.issued_document_snapshots(id),

  created_at                  timestamptz NOT NULL DEFAULT now()
);
```

### Indexes (proposal)

- `(organization_id, document_kind, generated_at DESC)`  
- `(source_entity_type, source_entity_id, identity_state, document_kind)` — uniqueness for “one active issued row per phase per kind” via partial unique index on `status = 'ISSUED'`  
- `(verification_ref)` where not null  

### Immutability (proposal)

- `BEFORE UPDATE OR DELETE` trigger: deny unless `private.is_platform_admin()` and `status` transition only to `SUPERSEDED`/`VOID` with audit row — **payload_json and verification_digest never change** after insert.  
- Prefer **no DELETE** for authenticated non-admin.

---

## 3. RLS (proposal)

| Operation | Who |
|-----------|-----|
| **INSERT** | `service_role` + privileged RPCs (`SECURITY DEFINER`) called from award lock, PO issue, invoice approve — not direct client insert |
| **SELECT** | Org members for `organization_id`; supplier members when `perspective = 'SUPPLIER'` and `source_entity_id` matches supplier-scoped PO/invoice; `private.is_platform_admin()` all |
| **UPDATE** | Platform admin only — status supersede/void |
| **DELETE** | Denied (retention) |
| **Regenerate** | New INSERT with `supersedes_document_id` — never mutate prior row |
| **Verify** | Read-only RPC `verify_issued_document_digest(p_document_id)` — returns boolean + algorithm id |
| **Export** | Same as SELECT + existing ERP export auth |

Align with `wallet_transactions` immutability pattern (`00181`).

---

## 4. RPC hooks (implementation phase — names illustrative)

| Event | Existing RPC / trigger | Snapshot action |
|-------|------------------------|-----------------|
| Award lock | `lock_and_reveal_award_atomic` (`00216`) | INSERT `DECISION_RECEIPT`, `PRE_REVEAL`, payload from `buildCanonicalDecisionReceipt` + policy |
| Reveal complete | `reveal_award` / status transition | INSERT new version `POST_REVEAL` **or** supersede per product rule |
| PO issued | `create_purchase_order_from_award` | INSERT `PURCHASE_ORDER` |
| Invoice approved | GST freeze trigger (`00168`) | INSERT `TAX_INVOICE` from `tax_snapshot` |
| Settlement cert | `generatePoSettlementCertificate` (domain) | INSERT `SETTLEMENT_CERTIFICATE` (kind extension) |

---

## 5. Invoice / tax snapshot payload — fields

### Present in code/DB (authoritative at approve)

| Field | Source |
|-------|--------|
| Invoice header | `invoices.invoice_number`, `status`, `approved_at`, `currency`, `amount`, `balance_due` |
| POS | `place_of_supply_state_code`, `place_of_supply_basis` |
| Tax aggregates | `taxable_total`, `cgst_total`, `sgst_total`, `utgst_total`, `igst_total` |
| Frozen JSON | `tax_snapshot` |
| Lines | `invoice_line_items` — HSN, CGST/SGST/IGST splits (`00168`) |
| Parties | `supplier_id`, buyer `organization_id` — resolved via org/supplier tables at issue time |

### GAP for A4 (must resolve in loader, not invent)

| Gap | Notes |
|-----|-------|
| Buyer/supplier postal addresses on invoice print | PO path has addresses; invoice API may need same join as `buildPurchaseOrderDocumentInput` |
| PAN on invoice face | Not always on invoice row — show only if present in org profile |
| IRN / e-invoice QR | **NOT IN PRODUCT** — do not add |
| Digital signature image | **NOT IN PRODUCT** |
| Logo/branding | From `@/lib/brand` in renderer — not DB |

---

## 6. Decision receipt snapshot payload

Store full `CanonicalDecisionReceipt` JSON at lock time plus:

- `reputationAppendix` optional (subset of web `DecisionReceipt` fields)  
- `procurementDocumentInput` precomputed for A4  
- `verification_digest` = `cryptographicAuditHash` at issue time  

---

## 7. Wallet / report tables — no 00222 change

`organization_wallets`, `wallet_transactions`, `00221` referral RPC — **no schema change** in R2-31 proposal.

Wallet **statements** are read models over `get_wallet_transactions` — optional materialized export manifest later (Phase 3), not 00222.

---

## 8. If 00222 were declined (not recommended)

Would require per-entity JSONB on `awards`, `purchase_orders`, `invoices` without unified versioning — **rejected** for C-09 certification and visibility matrix consistency.

---

**End schema proposal — no SQL file created.**
