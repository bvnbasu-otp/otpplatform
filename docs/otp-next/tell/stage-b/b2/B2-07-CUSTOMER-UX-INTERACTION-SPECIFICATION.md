# B2-07 — Customer UX and Interaction Specification

## Purpose and scope
Mobile-first TELL journey; do not expose backend complexity or change Home/navigation/Profile/History. Personas remain Individual, RWA, MSME; no Enterprise or new approval/committee rights.

## Screen inventory

| Journey/screen | State | Customer experience and errors |
|---|---|---|
| TELL — Describe | Parent/group absent or active | Plain text/voice/document entry remains compatible with existing intake affordances. Show exact text; save securely. Explain OTP will organize, not decide. Upload/voice parsing must preserve provenance and error state. |
| TELL — Understand | Parser pending/proposal/uncertain | Debounced proposal after ~600 ms; explicit Analyze immediate. Show a short interpretation and ask clarification for uncertain boundary/category. Stale results never replace newer text. |
| REVIEW — Parent overview | Multiple independent scopes | Summarize progress and child count; original mixed text remains buyer-only. Explain why scopes are separate; allow return to original description. |
| REVIEW — One child | Draft/clarification/ready | One child at a time, progress “1 of N”; show one category and relevant subcategory, scope description, customer items and clearly labeled optional suggestions. |
| REVIEW — Item action | Suggested/accepted/rejected/tombstoned | Customer-stated items are already accepted into draft. OTP suggestions need Accept; Reject is retained; Delete removes from active list but keeps history. Editing a suggestion does not accept it. |
| DECIDE — Confirm child | Ready | Show child scope, accepted item summary, null quantities as “Quantity not specified,” and independent consequence. Explicit confirm action publishes only that child. |
| DECIDE — Result | Publish success/failure | Success names child and provides explicit “Find suppliers” next step. Failure says it remains unconfirmed and editable; do not navigate/discover. |
| TRACK — Parent/child status | Mixed child states | Parent progress is informational; each child has own draft/clarification/published/discovery status. Show discovery pending, no results, retryable error, invited count accurately. |

## Interaction rules
- Never ask customers to choose taxonomy codes; use human labels from authoritative taxonomy.
- Clarification blocks confirmation but does not erase existing answers.
- Save, skip, revisit, resume are child-specific. Skip changes navigation only.
- Confirming a child does not change siblings or parent authorization state.
- Any post-confirmation material change is called an amendment/new version; require clear revalidation.
- No forced second suggestion for a legitimate single-item product/repair.
- Preserve current sourcing, role governance, whole-RFQ quote process; no committee voting for Individual.
- Handle account switch/logout by clearing active in-memory state and only opening the new authenticated owner cache.

## Mobile/accessibility
Target 320–430 px; single-column layout, persistent but non-obscuring primary action, accessible progress (“Child 1 of 3”), keyboard operation, visible focus, screen-reader announcements for parser status and save/publish errors, adequate touch targets, reduced-motion support. Avoid horizontal tables in customer UI.

## Existing behavior / gaps
`UnifiedThreeTierIntake.tsx` currently has one scalar requirement and three tiers. It initializes quantity `1`, unit `UNITS`, timing defaults, and parses initial text; this does not meet TELL null/factuality contract. `RequirementIntakePage.tsx` publishes one requirement and navigates to discovery. No parent overview, sequential multi-child review, or per-item states exist.

## Dependencies and open decisions
- Depends on parser/item/group contracts and persisted statuses.
- Voice/document entry compatibility is to be preserved where existing support exists; specific ingestion architecture was not fully verified in this source review.
- Parent cancellation and post-publication amendment UX need lifecycle evidence before implementation.
- **Status:** UX contract proposed; no UI changes made.
