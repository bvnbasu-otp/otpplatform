# R2-31 Phase 2A — Migration 00222 Schema & RPC Contract (Design Only)

**Status:** Frozen contract for SQL authoring — **no** `supabase/migrations/00222*.sql` in this pass.  
**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Migration ceiling:** `00221` unchanged.

**Code anchors verified at baseline:** `packages/domain/src/types/decision-receipt.ts` (`CanonicalDecisionReceipt`, `computeDecisionReceiptHash`, `buildCanonicalDecisionReceipt`), `apps/web/src/features/reporting/lib/procurement-document.ts`, `apps/web/src/features/fulfillment/lib/po-document.ts`, `supabase/migrations/00168_phase5b_statutory_gst_and_tax_splitting.sql`, `supabase/migrations/00216_verified_remediation_p0_p1_security_integrity.sql` (RLS helpers, `lock_award` → `lock_and_reveal_award_atomic`, `reveal_award`), `supabase/migrations/00181_phase6_group4_wallet_and_rewards.sql` (append-only immutability pattern).

**Known non-authoritative code (document only — do not fix in R2-31 design pass):** `AwardService.buildReceiptForAward` uses placeholder buyer/supplier/GST/quorum values and hardcoded 18% GST — **must not** feed production snapshot payloads.

---

## 1. Scope of 00222

| In scope (00222 DDL + hooks) | Out of scope (defer / other phase) |
|------------------------------|-------------------------------------|
| `DECISION_RECEIPT`, `PURCHASE_ORDER`, `TAX_INVOICE` snapshots | `QUOTE_COMPARISON` snapshot (P2 — optional later migration) |
| Issuance RPC + verify RPC + RLS | ONDC |
| Hooks: award lock, PO create, invoice approve | Wallet W1–W10 / `00221` |
| Status audit table for supersede/void | `SETTLEMENT_CERTIFICATE` snapshot (P2 — separate hook when product prioritizes) |
| | Historical backfill of pre-00222 rows (UNSUPPORTED unless explicit product program) |

---

## 2. Identity vocabulary (frozen mapping)

| Product term | DB column `identity_state` | `ProcurementDocumentInput.phase` |
|--------------|----------------------------|----------------------------------|
| **PROTECTED** | `PRE_REVEAL` | `PRE_AWARD` when document kind requires pre-reveal redaction |
| **REVEALED** | `POST_REVEAL` | `POST_AWARD` |

No third identity state in 00222 unless a future migration extends the CHECK constraint with an explicit product decision.

---

## 3. Tables

### 3.1 `public.issued_document_id_counters`

**Purpose:** Allocate monotonic, org-scoped human-facing `document_id` values inside issuance RPCs (row lock — same concurrency pattern as wallet idempotency checks in `00216` / `00221`).

**Justification vs PostgreSQL `SEQUENCE`:** Business numbers for PO/invoice today use date + random hex (`create_purchase_order_from_award`, `00196`/`00206`) — not sequences. Snapshot **Document ID** needs deterministic support lookup, per-org isolation, and rollback safety (counter advance only commits with parent transaction). A counter table with `FOR UPDATE` matches existing SECURITY DEFINER RPC style; global sequences would not isolate tenants without one sequence per org.

```sql
CREATE TABLE public.issued_document_id_counters (
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  counter_key       text NOT NULL,  -- e.g. 'DOC_ID:2026', 'VERIFY_REF:GLOBAL'
  last_value        bigint NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, counter_key)
);

ALTER TABLE public.issued_document_id_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_document_id_counters FORCE ROW LEVEL SECURITY;
-- No authenticated policies: allocation only via SECURITY DEFINER issuance RPC.
REVOKE ALL ON TABLE public.issued_document_id_counters FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.issued_document_id_counters TO service_role;
```

**Allocation (inside `issue_document_snapshot_atomic`):**

1. `counter_key := 'DOC_ID:' || to_char(p_generated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY');`
2. `INSERT ... ON CONFLICT DO NOTHING` then `SELECT ... FOR UPDATE` on `(organization_id, counter_key)`.
3. Increment `last_value`; format  
   `document_id := 'OTP-DOC-' || upper(substr(p_organization_id::text, 1, 8)) || '-' || counter_year || '-' || lpad(last_value::text, 6, '0');`
4. **Rollback:** counter increment rolls back with failed issuance transaction.
5. **Per-type numbering:** `document_number` is **not** allocated here — it mirrors source entity (`po_number`, `invoice_number`, `receiptId` inside canonical payload). Counter is only for platform Document ID + optional `verification_ref`.

**Optional short ref:** second counter on `(organization_id, 'VERIFY_REF')` → `verification_ref := 'VR-' || lpad(v, 8, '0')` (unique when not null).

---

### 3.2 `public.issued_document_snapshots`

```sql
CREATE TABLE public.issued_document_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id                 text NOT NULL,
  organization_id             uuid NOT NULL REFERENCES public.organizations(id),
  document_kind               text NOT NULL
    CHECK (document_kind IN (
      'DECISION_RECEIPT',
      'PURCHASE_ORDER',
      'TAX_INVOICE',
      'QUOTE_COMPARISON',      -- reserved; no hook in initial 00222
      'SETTLEMENT_CERTIFICATE' -- reserved; no hook in initial 00222
    )),
  document_number             text NOT NULL,
  source_entity_type          text NOT NULL
    CHECK (source_entity_type IN ('AWARD', 'PURCHASE_ORDER', 'INVOICE', 'SETTLEMENT')),
  source_entity_id            uuid NOT NULL,
  source_supplier_id          uuid REFERENCES public.suppliers(id),
  transaction_refs            jsonb NOT NULL DEFAULT '{}',

  persona                     text NOT NULL,
  perspective                 text NOT NULL
    CHECK (perspective IN ('BUYER', 'SUPPLIER', 'PLATFORM')),
  identity_state              text NOT NULL
    CHECK (identity_state IN ('PRE_REVEAL', 'POST_REVEAL')),
  visibility_context          jsonb NOT NULL DEFAULT '{}',

  template_version            text NOT NULL DEFAULT 'procurement-a4-v1',
  schema_version              text NOT NULL DEFAULT '1',
  payload_json                jsonb NOT NULL,
  verification_digest         text NOT NULL,
  verification_algorithm      text NOT NULL,
  verification_ref            text,

  idempotency_key             text NOT NULL,
  generated_at                timestamptz NOT NULL,
  generated_by                uuid REFERENCES public.profiles(id),

  status                      text NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED', 'SUPERSEDED', 'VOID')),
  supersedes_document_id      uuid REFERENCES public.issued_document_snapshots(id),

  created_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT issued_document_snapshots_document_id_key UNIQUE (document_id),
  CONSTRAINT issued_document_snapshots_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT issued_document_snapshots_verification_ref_key UNIQUE (verification_ref)
);
```

**Column notes:**

| Column | Rule |
|--------|------|
| `source_supplier_id` | Required when `perspective = 'SUPPLIER'` or kind is bilateral fulfillment doc; used for RLS (`private.is_supplier_user_for(source_supplier_id)`). Must match PO/invoice supplier — **never** buyer org id. |
| `document_number` | Business reference on PDF face: PO number, invoice number, or `canonicalDecisionReceipt.receiptId`. |
| `payload_json` | Frozen issuance bundle (§5). Immutable after INSERT. |
| `verification_digest` | Integrity reference (§6) — not a legal digital signature. |
| `generated_by` | `private.get_profile_id()` when invoked from authenticated award/approve paths; NULL only when `auth.role() = 'service_role'` and `p_actor_profile_id` absent (must log in audit). |
| `idempotency_key` | Stable key per logical issuance (§7). |

---

### 3.3 Indexes & partial unique (active ISSUED row)

```sql
CREATE INDEX idx_issued_doc_org_kind_generated
  ON public.issued_document_snapshots (organization_id, document_kind, generated_at DESC);

CREATE INDEX idx_issued_doc_source
  ON public.issued_document_snapshots (source_entity_type, source_entity_id, identity_state, document_kind);

CREATE INDEX idx_issued_doc_supplier
  ON public.issued_document_snapshots (source_supplier_id)
  WHERE source_supplier_id IS NOT NULL;

CREATE UNIQUE INDEX uq_issued_doc_one_active_per_slice
  ON public.issued_document_snapshots (
    organization_id,
    document_kind,
    source_entity_type,
    source_entity_id,
    identity_state,
    perspective
  )
  WHERE status = 'ISSUED';
```

**Document identity uniqueness rules (frozen):**

1. **`document_id`:** globally unique; allocated only via counter RPC path.
2. **`idempotency_key`:** globally unique; duplicate RPC call returns existing row (§7).
3. **At most one `ISSUED` row** per `(organization_id, document_kind, source_entity_type, source_entity_id, identity_state, perspective)` — enforced by partial unique index.
4. **POST_REVEAL is never an UPDATE** of a PRE_REVEAL row — different `identity_state` → two concurrent ISSUED rows allowed (protected + revealed versions both ISSUED).
5. **Amendment / re-issue same phase:** supersede prior ISSUED → `SUPERSEDED`, then INSERT new ISSUED row (same slice keys after supersede frees the partial unique slot).
6. **`supersedes_document_id`:** optional chain link; prior row payload **unchanged**.

---

### 3.4 `public.issued_document_status_audits`

```sql
CREATE TABLE public.issued_document_status_audits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id       uuid NOT NULL REFERENCES public.issued_document_snapshots(id),
  previous_status   text NOT NULL,
  new_status        text NOT NULL,
  changed_by        uuid REFERENCES public.profiles(id),
  changed_at        timestamptz NOT NULL DEFAULT now(),
  reason            text NOT NULL,
  audit_event_id    uuid REFERENCES public.audit_events(id)
);

CREATE INDEX idx_issued_doc_status_audit_snapshot
  ON public.issued_document_status_audits (snapshot_id, changed_at DESC);

ALTER TABLE public.issued_document_status_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_document_status_audits FORCE ROW LEVEL SECURITY;
```

Admin supersede/void writes one audit row per status transition.

---

## 4. Immutability triggers

```sql
CREATE OR REPLACE FUNCTION public.protect_issued_document_snapshot_payload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.payload_json IS DISTINCT FROM OLD.payload_json
       OR NEW.verification_digest IS DISTINCT FROM OLD.verification_digest
       OR NEW.verification_algorithm IS DISTINCT FROM OLD.verification_algorithm
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.document_number IS DISTINCT FROM OLD.document_number
       OR NEW.identity_state IS DISTINCT FROM OLD.identity_state
       OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
    THEN
      RAISE EXCEPTION 'Issued document snapshot payload is immutable (DOC-SNAPSHOT-FROZEN)';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        OLD.status = 'ISSUED' AND NEW.status IN ('SUPERSEDED', 'VOID')
        AND private.is_platform_admin()
      ) THEN
        RAISE EXCEPTION 'Issued document status may only transition ISSUED -> SUPERSEDED|VOID by platform admin (DOC-SNAPSHOT-STATUS)';
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Issued document snapshots cannot be deleted (DOC-SNAPSHOT-RETENTION)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_issued_document_snapshot
  BEFORE UPDATE OR DELETE ON public.issued_document_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_document_snapshot_payload();
```

**Ordinary clients:** no UPDATE path on frozen fields; authenticated has no INSERT on table.

Pattern aligned with `wallet_transactions` append-only trigger (`00181`) and invoice tax freeze (`00168`).

---

## 5. Frozen `payload_json` contract

Top-level shape (all kinds):

```json
{
  "schemaVersion": "1",
  "canonicalDecisionReceipt": null,
  "reputationAppendix": null,
  "procurementDocumentInput": { },
  "sourceAuditRefs": {
    "awardId": "uuid|null",
    "purchaseOrderId": "uuid|null",
    "invoiceId": "uuid|null",
    "rfqId": "uuid|null",
    "quoteId": "uuid|null",
    "quoteVersion": "number|null"
  }
}
```

### 5.1 Live relational data vs frozen snapshot

| Domain | Live (must NOT be read on reprint) | Frozen at issuance in `payload_json` |
|--------|--------------------------------------|--------------------------------------|
| Buyer identity | `organizations`, profiles, `buyer_addresses` | `buyerContext` / `procurementDocumentInput.buyer` (name, GSTIN, address text as issued) |
| Supplier identity | `suppliers` | Masked label + optional revealed name/GSTIN/state in `selectedOffer` / `suppliers[]` |
| Commercial lines | `po_line_items`, `invoice_line_items` | `lines[]` in `procurementDocumentInput` |
| Tax | live invoice columns | `tax_snapshot` copy + line splits embedded in input / appendix |
| Governance | live votes | `governanceRecord` in canonical receipt (buyer perspectives only in payload) |
| Timestamps | `now()` on reprint | `generatedAt`, `issuedAt`, `timestamps.awardedAt`, `receiptGeneratedAt` |
| Merit / evaluation | live cockpit | `meritEvaluation`, optional `reputationAppendix` (non-integrity) |

**Reprint rule:** UI/RPC loads row by `document_id` (or idempotency key), passes **only** `payload_json.procurementDocumentInput` (+ verification block) to `buildProcurementDocumentModel` — **never** re-run org/supplier joins for display fields.

### 5.2 Kind-specific required keys

| Kind | `canonicalDecisionReceipt` | `procurementDocumentInput` | `identity_state` at first issue |
|------|---------------------------|----------------------------|----------------------------------|
| `DECISION_RECEIPT` | Required (full `CanonicalDecisionReceipt` including `cryptographicAuditHash`) | Required (`kind: DECISION_RECEIPT`) | `PRE_REVEAL` at award lock; `POST_REVEAL` on reveal |
| `PURCHASE_ORDER` | null | Required (`kind: PURCHASE_ORDER`, `phase: POST_AWARD`) | `POST_REVEAL` only (PO exists post-award) |
| `TAX_INVOICE` | null | Required (`kind: TAX_INVOICE`, `phase: POST_AWARD`) | `POST_REVEAL` (bilateral invoice) |

**Loader contract (implementation phase, not 00222 SQL):** Production assembly mirrors `buildPurchaseOrderDocumentInput` / approved invoice API + `tax_snapshot` — **not** `AwardService.buildReceiptForAward`.

### 5.3 Invoice / tax field map (from `00168` + `invoices`)

Embed at invoice approve hook:

| Field | Source column / JSON |
|-------|----------------------|
| Invoice number | `invoices.invoice_number` → `referenceNumber` |
| Dates | `approved_at`, `submitted_at` |
| POS | `place_of_supply_state_code`, `place_of_supply_basis`, `tax_snapshot.placeOfSupplyStateCode` |
| Totals | `taxable_total`, `cgst_total`, `sgst_total`, `utgst_total`, `igst_total`, `amount` |
| Lines | `invoice_line_items` (HSN, qty, splits) |
| Parties GSTIN | `tax_snapshot.supplierGstin`, `tax_snapshot.buyerGstin` |
| Inter-state flags | `tax_snapshot.isInterState`, `isUnionTerritory` |

**GAP (loader work — not invented in SQL):** buyer/supplier postal addresses on invoice face — join same as PO detail path (`PurchaseOrderDetailPage` buyer address pattern). PAN optional from org profile if present. No IRN / e-invoice QR / DSC image.

---

## 6. Integrity digest (hash)

| Algorithm id | Function (TypeScript SoR) | SQL responsibility |
|--------------|---------------------------|-------------------|
| `OTP_DECISION_RECEIPT_V1` | `computeDecisionReceiptHash` on payload **without** `cryptographicAuditHash` — canonical JSON subset in `decision-receipt.ts` lines 175–199 | `public.compute_decision_receipt_digest_v1(p_payload jsonb)` must reproduce same string + `computeDeterministicHmac(..., 'OTP-DECISION-RECEIPT-INTEGRITY-SALT-2026')` |
| `OTP_PROCUREMENT_A4_V1` | HMAC of stable JSON serialization of `procurementDocumentInput` excluding `verification` field, salt `OTP-ISSUED-PROCUREMENT-A4-V1` (new domain helper in implementation — **name frozen here**) | `public.compute_procurement_a4_digest_v1(p_input jsonb)` |
| `OTP_SETTLEMENT_CERT_V1` | Reserved — `digitalSealSha256` path in domain | Not in initial 00222 hook |

**User-facing label (C-05):** “Integrity digest (OTP internal algorithm)” — **not** a statutory digital signature under IT Act eSign/DSC.

**Coverage:** digest covers **canonical snapshot JSON**, not PDF bytes (PDFs are not stored in DB at baseline).

**Per version:** any new INSERT with new `payload_json` produces a new digest; superseded rows retain old digest.

**Stored columns:** `verification_digest` duplicates `cryptographicAuditHash` for decision receipts; for PO/invoice stores `OTP_PROCUREMENT_A4_V1` output.

---

## 7. RPC: `public.issue_document_snapshot_atomic`

**Security:** `SECURITY DEFINER`, `SET search_path = public, private, auth, extensions`.  
**Grants:** `REVOKE ALL ... FROM PUBLIC, anon`; **no** `GRANT EXECUTE` to `authenticated` — callable only from other SECURITY DEFINER hooks (award lock, PO create, invoice approve) or `service_role`.

```sql
CREATE OR REPLACE FUNCTION public.issue_document_snapshot_atomic(
  p_idempotency_key           text,
  p_organization_id           uuid,
  p_document_kind             text,
  p_document_number           text,
  p_source_entity_type        text,
  p_source_entity_id          uuid,
  p_source_supplier_id        uuid,
  p_transaction_refs          jsonb,
  p_persona                   text,
  p_perspective               text,
  p_identity_state            text,
  p_visibility_context        jsonb,
  p_template_version          text,
  p_payload_json              jsonb,
  p_verification_digest       text,
  p_verification_algorithm    text,
  p_generated_at              timestamptz,
  p_actor_profile_id          uuid DEFAULT NULL,
  p_supersede_prior_active    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
-- Pseudologic (implementer fills):
-- 1. IF EXISTS (SELECT 1 FROM issued_document_snapshots WHERE idempotency_key = p_idempotency_key)
--      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'snapshot_id', ..., 'document_id', ...);
-- 2. Validate algorithm + recompute digest from p_payload_json; mismatch -> RAISE EXCEPTION
-- 3. IF p_supersede_prior_active THEN UPDATE ... SET status = 'SUPERSEDED' WHERE partial-unique slice matches AND status = 'ISSUED'
--      (admin-only path OR explicit amendment hook); INSERT audit row
-- 4. Allocate document_id (+ optional verification_ref) via counter FOR UPDATE
-- 5. INSERT snapshot; INSERT audit_events (procurement) optional via caller
-- 6. RETURN jsonb_build_object('ok', true, 'duplicate', false, 'snapshot_id', id, 'document_id', document_id, 'verification_digest', ...);
$$;
```

**Idempotency keys (frozen patterns):**

| Event | Key pattern |
|-------|-------------|
| PRE_REVEAL decision receipt (buyer) | `decision:{award_id}:PRE_REVEAL:BUYER` |
| POST_REVEAL decision receipt (buyer) | `decision:{award_id}:POST_REVEAL:BUYER` |
| POST_REVEAL decision receipt (supplier, awarded only) | `decision:{award_id}:POST_REVEAL:SUPPLIER:{supplier_id}` |
| PO (buyer / supplier) | `po:{po_id}:POST_REVEAL:{BUYER\|SUPPLIER}` |
| Tax invoice (buyer / supplier) | `invoice:{invoice_id}:POST_REVEAL:{BUYER\|SUPPLIER}` |

**Duplicate behaviour:** return existing row metadata; no second INSERT; HTTP/RPC layer treats as success.

**Transaction boundary:** issuance runs in **same transaction** as triggering event (award lock, PO insert, invoice approve). Rollback on any failure rolls back snapshot + counter.

**Authorization inside hooks (not inside issue RPC alone):** caller hook must already enforce buyer manager / approve path / supplier scope — issue RPC trusts caller is another DEFINER function in same txn.

---

## 8. RPC: `public.verify_issued_document_digest`

```sql
CREATE OR REPLACE FUNCTION public.verify_issued_document_digest(p_document_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
-- Returns: { ok, document_id, algorithm, valid, stored_digest, calculated_digest }
-- SELECT allowed by RLS; recompute using algorithm registry; no payload mutation
$$;

REVOKE ALL ON FUNCTION public.verify_issued_document_digest(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_issued_document_digest(text) TO authenticated, service_role;
```

---

## 9. Issuance hooks (00222 modifies existing functions)

| Hook point | When | Snapshots issued |
|------------|------|------------------|
| `public.lock_and_reveal_award_atomic` | After award INSERT/lock succeeds | `DECISION_RECEIPT` / `PRE_REVEAL` / `BUYER` (+ supplier slice if product requires — see lifecycle doc) |
| Same function | When `v_can_reveal` true (verified supplier + `p_auto_reveal`) | `POST_REVEAL` buyer (+ supplier if applicable) in **same transaction** |
| `public.reveal_award` | On successful reveal + PO creation path | `POST_REVEAL` rows; **do not** mutate PRE_REVEAL rows |
| `public.create_purchase_order_from_award` | After PO INSERT | `PURCHASE_ORDER` buyer + supplier perspectives (`POST_REVEAL`) |
| Invoice approve trigger / RPC path (`00168` freeze moment) | When status → `APPROVED` and `tax_snapshot` finalized | `TAX_INVOICE` buyer + supplier |

**`public.lock_award`:** at baseline (`00151`) delegates to `lock_and_reveal_award_atomic(..., false)` — **single hook implementation** inside `lock_and_reveal_award_atomic` covers AwardPage and cockpit paths.

**Audit event:** each hook inserts `audit_events` (or `procurement_stage_events`) with `document_id`, `snapshot_id`, `verification_ref` in payload — exact event type names are implementation constants (not product guesses).

---

## 10. RLS & grants (table)

```sql
ALTER TABLE public.issued_document_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issued_document_snapshots FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.issued_document_snapshots FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.issued_document_snapshots TO authenticated;
GRANT ALL ON TABLE public.issued_document_snapshots TO service_role;

-- INSERT/UPDATE/DELETE: no authenticated grants (RPC + service_role only)
```

Policies — mirror `purchase_orders_select` / `invoices_select` (`00004_rls_policies.sql`):

```sql
CREATE POLICY issued_doc_snapshots_select ON public.issued_document_snapshots
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR (
      perspective IN ('BUYER', 'PLATFORM')
      AND private.is_org_member(organization_id)
    )
    OR (
      perspective = 'SUPPLIER'
      AND source_supplier_id IS NOT NULL
      AND private.is_supplier_user_for(source_supplier_id)
    )
  );

CREATE POLICY issued_doc_snapshots_admin_update ON public.issued_document_snapshots
  FOR UPDATE TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());
```

**Supplier rule:** access is **only** via `source_supplier_id` + `is_supplier_user_for` — **never** `is_org_member(organization_id)` alone for supplier users (prevents individual buyer org conflation).

**PLATFORM perspective rows:** `is_platform_admin()` only.

Status audit SELECT: org members may read audits for snapshots they can read (implement via EXISTS join to snapshot RLS) — or admin-only; **frozen:** admin + snapshot-readable users.

---

## 11. Failure cases (RPC / hook behaviour)

| Case | Behaviour |
|------|-----------|
| Reveal during issuance (concurrent reveal + lock) | Row-level lock on `awards` / `rfqs` in award RPC; second transaction blocks or idempotently returns |
| Duplicate idempotency key | Return existing snapshot |
| Partial unique violation | Treat as duplicate or supersede path — hooks must use idempotency first |
| Missing source entity | RAISE EXCEPTION — no snapshot |
| Invoice approve without complete `tax_snapshot` | RAISE — no `TAX_INVOICE` snapshot (align `00168`) |
| Unauthorized supplier perspective | Hook must not emit supplier snapshot if `source_supplier_id` ≠ awarded supplier |
| Deactivated user | Existing auth gates on award/approve fail before issue RPC |
| Cancelled PO | No new PO snapshot; existing ISSUED rows remain historical |
| Stalled award (PENDING_REVEAL) | PRE_REVEAL ISSUED exists; POST_REVEAL absent until `reveal_award` |
| Amendment | Admin or privileged amend RPC: supersede active ISSUED slice, INSERT new ISSUED with new payload |
| Digest mismatch | RAISE EXCEPTION — transaction rollback |
| Payload built from `AwardService` placeholders | Forbidden by implementation contract — not detectable in SQL alone (Phase A loader) |

---

## 12. Historical rows

- **No backfill** that UPDATEs `awards`, wallet, PO, or invoice business amounts.
- Pre-00222 documents: live builders + disclaimer remain; optional **display-only** reconstruction flagged non-verifiable.
- New issuances only after 00222 deploy.

---

## 13. C-01 reminder

One canonical integrity model: **`CanonicalDecisionReceipt`**. Web reputation `DecisionReceipt` → optional `reputationAppendix` only. Do not delete legacy code.

---

**End 00222 schema contract — design only; no migration file.**
