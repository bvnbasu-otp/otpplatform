# OTP Integrated Security Certification — 2026-09-29

**Scope:** Local verification of migrations **00216–00220** and client/server guards. **Production untouched.**

## Migrations

| Migration | Production | Local Docker | Certification |
| --- | --- | --- | --- |
| 00216 P0/P1 integrity | Applied (ceiling path) | Applied | PASS — LOCALLY VERIFIED (DB + redteam) |
| 00217 PUBLIC EXECUTE revoke | Applied | Applied | PASS — LOCALLY VERIFIED |
| 00218 RFQ status whitelist | Applied | Applied | PASS — LOCALLY VERIFIED (redteam + triggers in SQL) |
| 00219 approval stage guard | Applied | Applied | PASS — LOCALLY VERIFIED |
| 00220 supplier wallet | **NOT applied** | Applied this pass | PASS — LOCALLY VERIFIED |

## 00216–00219 highlights (behavioral)

- Anon EXECUTE allowlist: eleven bootstrap RPCs (DB probe or diagnostic fallback).
- Anon blocked: wallet credit, award lock, PO create, org appoint, subscription wallet, etc.
- `deploy-migrations.ts`: dry-run safe; CI fails closed without `DATABASE_URL`.
- RFQ direct status / approval stage direct write: guarded in SQL (00218/00219).

**Classification:** SECURITY 00216–00219 → **PASS**

## 00220 supplier wallet

| Control | Mechanism | Verified |
| --- | --- | --- |
| service_role only | `REVOKE` from PUBLIC, anon, authenticated; `GRANT` service_role | Redteam + DB anon deny |
| ₹100 server amount | `CASE` in SQL; client override exception | DB test |
| No SUPPLIER_CASHBACK | Explicit `RAISE` in SQL | Redteam + domain tests |
| SETTLED fee for success reward | SQL guard on `platform_fee_transactions` | DB test (missing row / non-SETTLED) |
| Idempotency | `idempotency_key` replay | DB test |
| Concurrency / duplicate event | `uq_wallet_supplier_event_source` on `(organization_id, source_entity_type, source_entity_id)` + post-lock SELECT | SQL review; index cited below |
| Referral business rules (self/duplicate/circular/OTP verified) | `evaluateSupplierReferralBonus` (application layer; not in SQL) | Unit tests |

**Concurrency citation:** partial unique index `uq_wallet_supplier_event_source` on `wallet_transactions`; wallet row `FOR UPDATE` serializes balance updates per org.

**Classification:** 00220 → **PASS — LOCALLY VERIFIED**

## Notification / auth truthfulness (security-adjacent)

- No client-side WhatsApp send path; edge functions only.
- Email signup does not claim delivery (GoTrue queue = SUBMITTED).

## Unauthorized write

No production grants, RLS, or secrets modified. Local-only `00220` apply via Docker `psql`.

## 00221

**Not created.** No proposed migration file added.
