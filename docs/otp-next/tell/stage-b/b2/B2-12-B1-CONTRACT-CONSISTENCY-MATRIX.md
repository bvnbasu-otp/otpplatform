# B2-12 — Frozen B1 Contract Consistency Matrix

This matrix reconciles the B2 documents to the frozen B1 product and architecture decisions. It does not reopen product decisions.

| Frozen requirement | B2 treatment | Existing evidence / gap | Disposition |
|---|---|---|---|
| Parent/group is orchestration only, never a combined RFQ or publication transaction | Parent holds buyer-private coordination/source data; each child is a normal requirement | No tracked parent/group relation; existing `rfqs.requirement_id` is unique | Preserved; additive parent-child relationship remains proposed |
| One category per independently reviewable child | Parser partitions distinct intents into child drafts; uncertain boundaries require clarification | Existing taxonomy and one requirement taxonomy association; no multi-intent parser contract established | Preserved; earlier conflicting B2 wording is superseded |
| Each child is independently confirmed, published, recovered, and navigated | Child-level state and recovery; no group-wide transition | Existing protected publish path operates on a requirement | Preserved |
| Each confirmed child is published as its own RFQ through protected lifecycle | Child-specific atomic wrapper must invoke existing `publish_requirement`; never direct-insert RFQ | Existing unique `rfqs.requirement_id`; current UI performs save then RPC separately | Preserved; atomic wrapper/runtime behavior is unverified |
| Supplier discovery follows successful publication and is explicitly buyer initiated per RFQ | Use only the RFQ returned by successful publication; fail closed and do not call RFQ-creating fallback | Explicit discovery exists; `ensureRfqForRequirement` may create an RFQ as a page fallback | Preserved; TELL must bypass fallback |
| Supplier quote remains whole-RFQ, not per line item | Keep existing quote/version model and award lifecycle | Existing quotes are one per `(rfq_id, supplier_id)`; versions are whole-quote snapshots | Preserved |
| Customer-stated items are accepted; OTP suggestions require explicit acceptance | Persist provenance/state; unaccepted suggestion is not published supplier scope | No durable TELL item acceptance model found | Preserved; storage and supplier projection remain proposed |
| Rejection/deletion cannot be undone by parser replay | Stable item identity and durable rejection/tombstone; no suggestion revival | No tracked item state/tombstone model found | Preserved |
| Existing Individual/RWA/MSME ownership and role limits remain unchanged | Group grants no rights; child authorization derives from existing owner/buyer scope | Tracked helpers/policies exist; effective deployed policy composition is unknown | Preserved; disposable RLS/role validation required |
| Existing allowance, quota, duplicate, persona, ownership, and discovery protections remain mandatory | Atomic path calls protected publish implementation and reuses existing checks | Static function lineage identified; deployed behavior and wrapper transaction not tested | Preserved; critical runtime evidence required |
| Do not fabricate quantities, prices, brands, or specifications | Parser contract distinguishes explicit requirements from optional OTP recommendations | Existing parser contract is single-intent and does not establish this richer output contract | Preserved; parser changes are proposed only |
| At least two suggestions only where reasonably possible; no unrelated second line for a single product | Recommendation rule permits one relevant line when no safe second suggestion exists | No current recommendation contract found | Preserved |
| `requirement_specifications` must be investigated before choosing a new store | Classified as unresolved reference; neither assumed absent nor reusable | Tracked references only; no defining DDL/generated type/API | Preserved; critical architecture blocker |

## Consistency conclusion
The reconciled B2 package consistently expresses single-category child → independent RFQ publication. No group-level publish, cross-child transaction, per-line supplier quotation, silent suggestion acceptance, or discovery-before-publication path is authorized. The remaining blockers are evidence questions, not changes to frozen product requirements.
