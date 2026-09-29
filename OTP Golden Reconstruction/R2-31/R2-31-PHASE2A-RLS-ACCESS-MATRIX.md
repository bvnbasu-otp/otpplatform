# R2-31 Phase 2A — RLS & Access Matrix (Design Only)

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**SQL contract:** `R2-31-PHASE2A-00222-SCHEMA-CONTRACT.md` §10  
**Patterns mirrored from:** `00004_rls_policies.sql` (`purchase_orders_select`, `invoices_select`), `00216` (`private.is_supplier_user_for`, `private.is_org_member`, `private.is_platform_admin`, `private.get_profile_id`), wallet immutability `00181`.

---

## 1. Roles (columns)

| Role | Auth mechanism | Scope |
|------|----------------|-------|
| Buyer org member | `private.is_org_member(organization_id)` | Buyer org RFQ/PO/invoice |
| Supplier user | `private.is_supplier_user_for(source_supplier_id)` | **Only** rows where supplier id matches user's supplier |
| RWA committee / MSME delegate | Buyer org member + existing RFQ role gates | Same as buyer for org-scoped docs |
| Ops manager | `private.is_org_manager_or_above` | Award/approve RPCs — not direct snapshot INSERT |
| Founder / platform admin | `private.is_platform_admin()` | All snapshots; supersede/void |
| `service_role` | Bypass RLS | Issuance hooks only |

**Supplier must not fall back to individual buyer org:** supplier SELECT policies use **`source_supplier_id` + `is_supplier_user_for`** — never org membership alone for `perspective = 'SUPPLIER'`.

---

## 2. `issued_document_snapshots` — operation matrix

| Operation | Buyer org member | Supplier (awarded) | RWA / MSME delegate | Ops manager | Founder/admin | service_role |
|-----------|------------------|--------------------|---------------------|-------------|---------------|--------------|
| **Issue (INSERT)** | ✕ | ✕ | ✕ | ✕ (via RPC only) | ✕ | ✓ (via DEFINER hooks) |
| **Read protected (`PRE_REVEAL`)** | ✓ BUYER perspective | ✕ unless row issued for their supplier id with SUPPLIER perspective and awarded | ✓ if buyer org | ✓ if buyer org | ✓ | ✓ |
| **Read revealed (`POST_REVEAL`)** | ✓ BUYER rows | ✓ SUPPLIER rows for own `source_supplier_id` only | ✓ buyer org | ✓ buyer org | ✓ | ✓ |
| **Reprint** | SELECT + render payload | SELECT own supplier rows | Same as buyer | Same | ✓ | ✓ |
| **Regenerate (new version)** | ✕ client | ✕ | ✕ | ✕ | ✓ admin supersede flow | ✓ hook |
| **Supersede / void** | ✕ | ✕ | ✕ | ✕ | ✓ UPDATE status only | ✓ |
| **Verify digest** | ✓ if SELECT allowed | ✓ if SELECT allowed | ✓ | ✓ | ✓ | ✓ |
| **Export** | Same as SELECT | Same | Same | Same | ✓ | ✓ |
| **DELETE** | ✕ | ✕ | ✕ | ✕ | ✕ (trigger deny) | ✕ |

**PLATFORM perspective rows:** admin / service_role only.

---

## 3. Document kind × data leakage rules

| Data | Buyer | Supplier | Forbidden to supplier |
|------|-------|----------|------------------------|
| Committee votes / COI / weighted tally | ✓ on decision receipt BUYER snapshot | ✕ | ✓ enforced — no committee fields in SUPPLIER snapshot payload |
| Competitor quotes / comparison | ✓ buyer reports | ✕ | ✕ |
| Smart Merit vs competitors | ✓ | ✕ | ✕ |
| Own quote / PO / invoice | ✓ | ✓ | — |
| Other suppliers' sealed bids | ✓ per `quotes_revealed` policy | ✕ | ✕ |
| Wallet balance | own org | own org | other org ✕ |
| OTP revenue / trial balance | ✕ | ✕ | ✕ on buyer/supplier routes |

**Implementation note:** SUPPLIER decision receipt snapshots must be assembled with **redacted** `governanceRecord` (merit summary only, no vote table) — enforced at **issuance hook**, not RLS alone.

---

## 4. Related table RLS (unchanged by 00222 design)

| Table | Supplier access pattern |
|-------|-------------------------|
| `purchase_orders` | `is_supplier_user_for(supplier_id)` OR buyer org member |
| `invoices` | supplier via `supplier_id` OR buyer via PO join |
| `wallet_transactions` | org member for own wallet (`00181`) |
| `quotes_identity_protected` / `quotes_revealed` | view-level masking (existing migrations) |

Snapshot RLS must stay **consistent** with these joins — `source_supplier_id` denormalized for supplier policy performance and clarity.

---

## 5. RPC EXECUTE grants (00222 additions)

| Function | PUBLIC/anon | authenticated | service_role |
|----------|-------------|---------------|--------------|
| `issue_document_snapshot_atomic` | REVOKE | **no grant** | indirect via hooks |
| `verify_issued_document_digest` | REVOKE | GRANT | GRANT |
| `compute_decision_receipt_digest_v1` | REVOKE | no grant | optional |
| Existing `lock_and_reveal_award_atomic`, `reveal_award`, `create_purchase_order_from_award` | REVOKE anon (`00216`) | GRANT | GRANT |

Align with `00216` style: `SECURITY DEFINER`, explicit `search_path`, no broad anon table grants.

---

## 6. Founder vs buyer UI

Founder revenue and cross-tenant extracts: **admin RPC / routes only** — not rendered on buyer/supplier pages (policy — no new buyer-facing RLS hole).

---

**End RLS access matrix — design only.**
