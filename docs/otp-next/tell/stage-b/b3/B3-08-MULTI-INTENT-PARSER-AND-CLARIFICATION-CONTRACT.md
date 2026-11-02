# B3-08 — Multi-Intent Parser and Clarification Contract

## Existing parser to extend

- `packages/domain/src/parser/requirement-parser-port.ts` defines asynchronous `RequirementParser.parse()` returning one `ParsedRequirement`: one category/subcategory, scalar quantity/unit, attributes/evidence, location/timing, missing required attributes and one confidence value.
- `packages/domain/src/parser/rule-based-requirement-parser.ts` uses taxonomy snapshot subcategory keywords, attribute definitions and deterministic scoring. It returns one best classification, not a list of independent intents.
- `apps/web/src/features/intake/api/taxonomy.ts` loads taxonomy and maps canonical taxonomy values for the client. `00331_authoritative_17_category_taxonomy.sql` is tracked canonical taxonomy source; it does not prove active hosted IDs.
- `UnifiedThreeTierIntake.tsx` calls the parser on initial handoff and explicit parse; no text-pause debounce or stale-request sequence protection was found. Current form defaults include quantity `1`, unit `UNITS`, timing and other values; TELL must avoid presenting these defaults as customer-stated facts.

Extend this contract and preserve existing callers through an adapter/compatibility path; do not replace the parser or create an independent taxonomy.

## Proposed proposal contract

Each parse result is a proposal tied to exact input revision and taxonomy version:

```text
ParseProposal {
  inputRevision, sourceTextHash, parserVersion, taxonomyVersion,
  intents: [
    {
      stableProposalKey,
      scopeDescription,
      categoryCode, categoryConfidence,
      subcategoryCode, subcategoryConfidence,
      requirementMode,
      items: [
        { stableSuggestionKey, description, kind,
          quantity?, unit?, attributes?, provenance, evidence,
          state: ACCEPTED | SUGGESTED }
      ],
      explicitRequirements,
      optionalRecommendations,
      missingEssentialInformation,
      clarificationQuestions,
      uncertaintyReasons
    }
  ],
  unresolvedBoundaries,
  overallStatus
}
```

Exact types and field names are illustrative pending B3-01 contract review. Confidence values are not authorization. Customer text and corrections remain the source of truth.

### Extraction and provenance

- Every fact distinguishes `CUSTOMER_STATED`, `OTP_INFERRED`, `OTP_SUGGESTED`, and `CUSTOMER_ACCEPTED`.
- Customer-stated line items start `ACCEPTED`; OTP additions start `SUGGESTED`.
- Evidence for extracted facts points to source span or explicit user edit; inferred/recommended value records rule/model version and rationale.
- Never fabricate quantity, unit, prices, brands, certification, delivery timing, quality/specification or location. Missing stays null/unknown and can trigger clarification.
- Recommendation count aims for at least two relevant suggestions only where reasonably possible. A single-product scope remains one item if no relevant second item exists. Related optional accessories/specifications are separately labeled suggestions and require acceptance.

## Intent grouping and category rules

1. Identify candidate procurement scopes and their evidence without losing original wording.
2. Group only requirements that form one coherent independently reviewable procurement scope.
3. Each child has exactly one category. Do not merge unrelated scopes even when category matches; do not split coherent work solely because multiple activities or subcategories appear.
4. Preserve distinct lines/specifications. Do not sum quantities or deduplicate by wording unless equivalence is demonstrated and presented to buyer.
5. If category/scope boundary is ambiguous, emit clarification and no publishable child for that ambiguous scope.
6. A category/subcategory must resolve against active canonical taxonomy. Unknown codes/IDs are not persisted; no guessed fallback category.

## Clarification contract

### Blocking

- More than one plausible category or subcategory without sufficient evidence.
- Unclear whether text describes one coherent scope or unrelated procurements.
- Contradictory customer facts that affect matching/fulfillment.
- Missing facts required by the existing protected lifecycle or approved TELL readiness policy.
- Invalid/mismatched taxonomy relation.
- Material ambiguity in product/service/repair classification that changes procurement treatment.

### Optional

- Nonessential descriptive dimensions, preferences and useful delivery details not required to safely form a child.
- Recommendations and accessories; always skippable and never blockers solely because customer declined them.

Clarification asks only for the unresolved fact, preserves prior answers, never demands taxonomy codes, and offers “not specified/skip” where safe. Reuse authenticated profile/address data; ask to confirm only when the present workflow needs confirmation or stored data is missing/ambiguous. Customer correction supersedes the proposal while history remains.

### Confidence thresholds — provisional, requires validation

The existing parser emits a 0–1 score but the repository contains no calibration study tying scores to safe auto-classification. Do not treat any threshold as evidence-backed.

Proposed initial evaluation bands for offline corpus assessment only:

- `>= 0.80`: candidate high-confidence classification, still displayed for customer review.
- `0.60–0.79`: medium; show uncertainty and ask a targeted clarification if the category/boundary affects child formation.
- `< 0.60`, tie/near-tie, or no match: low; do not finalize category; require buyer clarification or manual selection.

These are not permission to auto-publish or an approved production threshold. Before implementation, measure per-category/subcategory precision/recall and boundary errors on a reviewed, privacy-safe corpus; product owner and procurement taxonomy owner approve thresholds. Category confidence and subcategory confidence are separately calibrated.

## Debounce and stale-response protection

- Debounce parser invocation until text is unchanged for a proposed 500–700 ms (initial UX target 600 ms); explicit Analyze bypasses debounce.
- Every text edit increments a monotonically increasing revision. Parser result applies only if its revision, source hash, taxonomy version and current component identity still match.
- Cancel where parser supports cancellation; otherwise ignore stale responses via revision token. An older response must never update form state or clear the newer parsing indicator.
- Clear/hide stale suggestions while new parse is pending or mark them visibly as proposals for the previous input; do not silently save them as current.
- Avoid reparsing unchanged text/taxonomy and batch required async lookup. Do not parse on every keystroke.

## Acceptance evidence

Test coherent and unrelated scopes; same-category splits; one-category-per-child; mixed service/product/repair; ambiguity and ties; unrecognized taxonomy; null unstated values; quantity/unit extraction; explicit vs inferred vs suggested provenance; customer edits; no unrelated second item; debounce invocation count; stale response out-of-order resolution; timeout/error visibility; exact active taxonomy version. Parser output never publishes without child review/confirmation.
