# B2-11 — Evidence Gap Register

## Status
Read-only repository evidence review. No database or hosted environment was accessed. **B2 is not evidence-closed; B3 remains blocked.**

| ID | Evidence question | Repository evidence | What remains unknown | Gate / required evidence |
|---|---|---|---|---|
| E01 | What is `requirement_specifications`? | Twelve tracked cleanup/admin/historical references; no tracked defining DDL, generated type, feature API, or tests. Generated types include `requirements`, not this object. | Whether it exists outside tracked migrations; schema, ownership, purpose, constraints, RLS/grants, and consumers. | **Critical:** authoritative schema/history and API evidence, or separately authorized metadata-only inspection of a named disposable database. Do not infer absence or repurpose it. |
| E02 | What publication function/policies are effective? | Tracked `publish_requirement` body in `00180`, patched by `00282`; policies/helpers in `00281`, `00282`, and internal hard-deny in `00299`. | Deployed function definition, grants, effective policy composition, role behavior, and transactional effects. | **Critical:** authorized full-chain disposable migration/RLS/publication validation. No hosted access within this review. |
| E03 | Is confirmation plus publication atomic and retry-safe? | Client saves draft and then separately invokes publication; static DB function changes requirement/RFQ/credit/audit in a transaction. | Runtime rollback behavior, safe operation key, timeout/retry behavior, and exact allowance/audit effects. | Disposable integration/fault-injection evidence before B3 authorization. |
| E04 | What can invited suppliers see? | Migration `00329` defines the latest tracked `rfqs_supplier_masked`; invitation-scoped view includes full requirement description and JSON `attributes`, `quality`, `commercial`, with no explicit RFQ lifecycle predicate. | Effective grants/view result, private-field content, and desired accepted-item filtering. | Supplier-role RLS/leakage validation and an explicit field/lifecycle allowlist. |
| E05 | Is taxonomy identity stable at runtime? | Tracked authoritative taxonomy migration defines canonical taxonomy; seed/source evidence is not hosted-state evidence. | Deployed active IDs and taxonomy version. | Runtime snapshot evidence before binding parser output to IDs; never hard-code assumed hosted IDs. |
| E06 | Is local recovery isolated by buyer identity? | Production intake call sites omit profile ID; storage permits organization-only/generic fallback keys. | Cross-tab/account-switch behavior in supported browsers and current server-draft behavior. | **Verified local isolation defect:** correct identity-scoped design must be included in implementation planning; test account-switch/logout recovery before release. |
| E07 | What audit and reset behavior applies to new data? | `audit_events` exists; cleanup scripts reference `requirement_specifications`. No TELL item/version audit contract found. | Effective audit schema/retention, reset ordering, and new-table ownership. | Resolve with schema owner/security before migration design; no normal purge may remove protected audit evidence. |

## Evidence classification
- **Verified:** directly supported by tracked source or call sites cited in B2-01 through B2-10.
- **Not verified:** repository evidence does not establish deployed behavior or external schema.
- **Requires runtime validation:** answer depends on database execution, effective grants/policies, or hosted configuration; validation must be separately authorized and disposable.

## Closure rule
E01 is a critical architecture dependency because it determines whether a buyer-side item/specification store already exists. E02–E04 are critical publication/security gates. Until the required evidence is supplied and reconciled, no final item-store migration or B3 implementation authorization is supported.
