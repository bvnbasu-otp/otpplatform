# B3-09 — Customer Review and Acceptance UX

## Governing journey

`TELL → REVIEW → DECIDE → TRACK`

“OTP does the procurement work. The customer makes the decision.” Keep supplier-network and internal procurement-intelligence details out of customer-facing screens unless needed for a clear, truthful decision.

## Proposed screens and behavior

| Stage | Customer view | State/error behavior |
|---|---|---|
| TELL — Describe | One ordinary-language text/voice entry; preserve source wording and currently supported voice/transcription affordances | Save status explicit; offline remains private local draft and cannot publish until server sync/ownership revalidation |
| Interpret | Debounced proposal after typing pause; visible summary, source facts and category confidence/uncertainty | Stale response ignored; no fabricated facts; targeted clarification preserves all existing answers |
| Parent overview | Original request privately retained; list of independently reviewable child scopes and progress | Parent summary is informational only; no group-wide confirm/publish action |
| Child review | “Scope i of N”, one category and relevant subcategory, plain-language description, location/timing, own accepted items and optional suggestions | Child-specific draft, clarification, conflict, failed-save or ready states; siblings unaffected |
| Item acceptance | Customer-stated items shown as accepted; OTP additions labeled suggestions with explicit Accept/Reject; edits retain suggestion state until accepted | Delete from active review creates tombstone; no suggestion reappears after reparse |
| Confirm child | Review accepted procurement scope, missing/unspecified facts, and clear consequence | One explicit confirmation action publishes only this child; accepted items and child version are frozen |
| Result | RFQ reference/status and explicit next action “Find suppliers” | Show success only after committed RFQ response; failed confirmation remains editable and never routes into discovery |
| Track | Parent progress plus each child’s independent RFQ/discovery status | Distinguish published, discovery pending, no matches, provider failure, invitation sent; retries target same RFQ |

## No fabricated/default facts

Existing `UnifiedThreeTierIntake.tsx` initializes quantity to `1`, unit to `UNITS`, timing to within seven days and includes other commercial/quality defaults. TELL must show unstated quantity/unit/timing as “Not specified” and must not silently persist these defaults as customer intent. Any recommended value is labeled OTP suggestion, separate from customer-stated and accepted facts. Existing legacy intake behavior must not be changed outside the separately approved TELL path.

## Address/profile integration

Reuse existing buyer profile/address retrieval and prefill capabilities. Display the source of prefilled location and permit correction. Ask the customer to confirm only if needed for supplier matching, a stored address is stale/ambiguous, or the customer changed it; do not make them repeat known details by default. A private delivery line/site note is excluded from supplier payload until explicitly approved for disclosure.

## Confirmation, navigation and recoverability

- Review, save, confirm and recovery are child-specific. Parent child navigation cannot mutate status.
- Customer can return to prior child; show saved/unsaved state and conflict resolution if server version changed.
- Explicit confirmation binds to the displayed child/item version; stale version refreshes and asks buyer to review changes again.
- Confirming Child A does not confirm/publish/discover Child B.
- After successful publication, supplier discovery is a distinct, explicit action. Do not imply suppliers were contacted until the existing process records it.
- Published content is immutable from the supplier's perspective; any material amendment requires an approved version/amendment lifecycle.
- Account/persona switch clears active in-memory state before rendering another user's context and does not restore unscoped legacy cache.

## Accessibility and device coverage

Mobile-first 320/375/430 px; keyboard-complete interactions, focus order, visible focus, screen-reader announcements for parser/save/conflict/publish states, accessible “Scope 1 of N” progress, reduced motion and adequate touch targets. Do not rely on color to distinguish accepted/suggested/rejected states.

## Product decisions still needed

No new product decision is requested on frozen B1. Product owner must approve calibrated confidence bands after evaluation, offline legacy-draft recovery choices, parent/child cancellation semantics, and how amendments affect an existing RFQ before those features are implemented.
