# B2-10 — Implementation Roadmap and Decision Register

## Roadmap (proposed; no phase is authorized by this document)

| Phase | Scope and dependencies | Surfaces | Security/acceptance gate | Containment |
|---|---|---|---|---|
| B1 | Freeze parser, item, group, state and supplier contracts. Product rules approved; owner resolved conflicting category/RFQ wording for this review. | Domain parser/types, intake types, docs | Single-category child; explicit states and child confirm | No runtime changes |
| B2 | Resolve `requirement_specifications`; approve additive schema/RLS, immutable child version, idempotency, confirmation gate, accepted-only supplier view. | Proposed migration, generated types, security tests | Full-chain disposable schema/RLS validation | Disable TELL; preserve additive data |
| B3 | Multi-scope parser and curated approved recommendations; active DB taxonomy; debounce/stale-result guard. | Existing domain parser/extractors/taxonomy loader | Approved corpus, no fabricated data, ambiguity blocks | Disable parser suggestions |
| B4 | Parent/group, child, item API/persistence/recovery; profile+owner cache isolation and concurrency conflicts. | Existing draft/storage/hook/page; proposed API | Owner-safe server recovery, tombstones, legacy null-parent compatibility | Stop new groups; retain server data |
| B5 | Single atomic confirm/publish RPC around existing protected function; idempotent retry. | Proposed DB wrapper, draft API | rollback, quota/audit exactly once, timeout retry | Disable confirmation; never direct-insert RFQ |
| B6 | Sequential mobile review and parent progress. | Intake page/components; proposed review UI | One child at a time; access and accessibility | Hide TELL entry, retain drafts |
| B7 | Supplier accepted-item view/API/UI integration. View contract is designed in B2. | Masked view migration, supplier APIs/types/UI | Exact invitation/RFQ, no leakage, whole-RFQ quote regressions | Hide item display |
| B8 | Evidence consolidation; no deployment. | Test evidence, migration review, docs | All accepted criteria demonstrated | Keep disabled pending separate deploy authorization |

## Decision register

| ID | Question / evidence | Options and recommendation | Risk / approver |
|---|---|---|---|
| D1 | Does `requirement_specifications` exist and what does it mean? Tracked only in cleanup/admin references; no DDL/type/API. | Provide authoritative DDL/history; if unavailable, authorize metadata-only inspection on named disposable DB. Do not guess or create competing schema yet. | **BLOCKING B2**; database owner/security |
| D2 | Parent semantics? Prior frozen rule and owner response define orchestration-only group, not publishable parent requirement. | Keep parent buyer-only and children as requirements. | Resolved for this review; product owner |
| D3 | Child/category/RFQ relationship? Earlier B2 wording conflicted with frozen B1; the evidence-closure prompt reaffirms single-category children and one RFQ per child. | Retain frozen rule: each independently reviewable child is single-category and independently published as its own RFQ. | Resolved; frozen B1 |
| D4 | Effective publish function/runtime behavior? Tracked 00180 body patched by 00282; deployment unknown. | Validate full chain on authorized disposable DB before implementation approval. | **BLOCKING B2/B5**; database/release |
| D5 | Child version storage and amendments? No requirement version table found. | Add immutable snapshot/version only after schema review; do not mutate published version. RFQ handling for amendment needs lifecycle review. | B2/B5; database/product |
| D6 | Atomic operation identity/key and audit schema? Existing `audit_events`; payment atomic/idempotent examples, no RFQ-specific pattern. | Child+owner scoped idempotency and expected version in one transaction; fingerprint request. | Engineering/security |
| D7 | Discovery status persistence/retry? Current invitations/audit and explicit UI; provider details runtime unverified. | Reuse existing per-RFQ process; only add status storage if source evidence needs durable progress. | Engineering/operations |
| D8 | Tombstone retention/restoration policy? No item model. | No restore transition; create new identity on explicit re-add; align statutory retention. | Product/legal/privacy |
| D9 | Parent cancellation / child discard? No frozen lifecycle found. | Do not implement parent-wide cancellation; keep draft recoverable until explicit lifecycle approval. | Product owner |
| D10 | Hosted taxonomy IDs? Seed preserves codes/UUIDs but deployed values unknown. | Resolve at runtime from active snapshot; no hard-coded IDs. | Runtime evidence **NOT VERIFIED** |

## Frozen versus implementation details
Frozen: scope boundaries (as owner resolved), item initial states/actions, child-specific atomic publication, explicit per-child discovery, supplier visibility, quote model, persona/ownership limits. Implementation details requiring engineering approval: exact table reuse, keys/constraints/indexes, RLS expression, status encoding, snapshot storage, retry records, discovery-progress representation, and UI mapping. No implementation detail may weaken a frozen rule.

## Status
Roadmap proposed. B2 implementation readiness remains blocked by D1 and D4 evidence.
