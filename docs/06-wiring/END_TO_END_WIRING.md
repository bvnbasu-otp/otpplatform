# End-to-end wiring

Statuses: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md). Each chain is the files that were read. If a layer is absent, the path skips it. Hosted success of every call is `UNKNOWN`.

## Signup

`/signup` → `SignupPage` → `submitSignupRequest` in `apps/web/src/features/portal/api/signup.ts` → RPC `submit_signup_request` (latest body found: `00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql`) → `invokeEdgeFunction('onboarding-notify')`.

`sendVerificationCode` in the same file calls edge `otp-dispatch`, then `supabase.auth.signInWithOtp`.

DEFECT-01: local migration `00246` rejects buyer types other than `INDIVIDUAL`, `COMMUNITY`, and `MSME` before any signup insert. Hosted NOT applied. The `00001` enum values were not dropped.

Admin approval: `AdminUsersActivityPanel` calls `onboarding-notify` after review. The review RPC named by that flow is `admin_review_signup_request` (same `00212` file). This pass did not re-read the full function body.

## Auth

`/login` → `LoginPage`. `AuthProvider.tsx`: `supabase.auth.signInWithPassword`, `signInWithOtp`, `verifyOtp`. Workspace routes sit under `RequireAuth` and `RequireRole` in `App.tsx`. There is no separate OTP identity service in the repo. The path is the Supabase client.

## Individual, RWA, and MSME onboarding

`BuyerRegisterForm.tsx` buyer types: Individual, MSME, Community (RWA). `resolveBuyerPersona` in `packages/domain/src/types/buyer-persona.ts` accepts those families and throws on Enterprise.

After the signup RPC, organisation classification is what the RPC stored. `00243` freezes later client updates of classification fields. Persona behaviour then splits:

- Individual: no committee quorum.
- RWA: `org_type` `COMMUNITY`, vote rules in `00238`.
- MSME: approval route in `00237` / `00242`.

There is no fourth onboarding service.

## Committee

`/org/members` → `OrgMembersPage`. Conflict: `declareCoi` in `apps/web/src/features/governance/api/coi.ts`. Vote: `/rfq/:rfqId/committee` → `castVote` → RPC `cast_committee_vote` (latest function body found: `00216`). Insert is still checked by trigger `private.enforce_committee_vote_authority` (`00238`): appointment and seat for `COMMUNITY`, no estate or facility manager, no `DECLARED_CONFLICT`.

## Requirement

`/intake` → `RequirementIntakePage`. Draft writes: `apps/web/src/features/intake/api/draft.ts` inserts and updates `requirements`. `ensure_buyer_organization` is called from `apps/web/src/features/requirement/api/requirements.ts`. Speech input, when the browser exposes it, is `VoiceRequirementDictation.tsx`. No separate requirements microservice.

## Discovery

`/requirements/:requirementId/discover`. `discoverForRequirement` / `discoverAndInvite` in `rfq-lifecycle.ts` call RPC `discover_and_invite_for_rfq`. Latest `CREATE OR REPLACE` found: `00236_supplier_discovery_trust_tier.sql`.

Google coverage for that screen is a different call: `prepareGooglePlacesCoverage` invokes edge `location-pin-coverage`. See Google Places below. The library adapter ladder is not this call.

## RFQ

`ensureRfqForRequirement` reads and writes requirement and RFQ rows in `rfq-lifecycle.ts`. `openRfq` updates `rfqs.status` from `DRAFT` to `OPEN` after at least one invitation. A client call to a function named `publish_requirement` was not found. Migration `00030_publish_requirement.sql` exists. Whether that SQL function is still what opens an RFQ: `UNKNOWN`. The web path that was read is the table update in `openRfq`.

Review UI: `/requirements/:requirementId/rfq-review`.

Entitlement check before publish is domain `evaluateRfqEntitlement`. The RPC that decrements the monthly count was not named. That function name remains `UNKNOWN`.

## Invite

`inviteDirectSupplier` → RPC `invite_direct_supplier`. Latest body found: `00215_withhold_direct_invite_link_for_existing_suppliers.sql`. Public quote URL: `/q/:token` → `QuickQuotePage` (outside `RequireAuth`).

## Quote

Signed-in supplier: `submitSupplierQuote` in `apps/web/src/features/supplier/api/quote-mutations.ts` inserts `quotes` with status `SUBMITTED` while `rfqs.status` is `OPEN`, then writes a version snapshot. There is no quote microservice.

Link quote: `apps/web/src/features/quick-quote/api/quick-quote.ts` calls RPC `submit_messaging_quote`.

## Comparison

`/rfq/:rfqId/evaluation` and `/rfq/:rfqId/identity-protected-comparison` both render `EvaluationDecisionCockpitPage`. Identity stays off that screen until reveal. The page reads quotes. It does not award by itself.

## Vote

`CommitteeVoteRoute` → `castVote` → `cast_committee_vote`, then the `00238` trigger. Tally read: `rfq_voting_summary` via `fetchVotingSummary`.

## Award

`/rfq/:rfqId/award` → `apps/web/src/features/award/api/awards.ts`:

- `lock_award`
- `lock_and_reveal_award_atomic` (latest body `00222`)
- `award_runner_up_quote` (replaced in `00242`; body not re-documented)
- `confirm_intent_to_award_and_unmask`
- `unlock_award_decision`

MSME stages: `evaluate_and_stamp_approval_route_atomic` (`00237`) and `submit_rfq_tier_approval_atomic` from `apps/web/src/features/award/api/approval.ts`. `00242` fails the award closed when the route applies and no stage exists.

## Reveal

`/rfq/:rfqId/reveal` → `apps/web/src/features/reveal/api/reveal.ts` → RPC `reveal_award` (latest body `00244`). That function creates the purchase order in the same transaction for a verified supplier.

`lock_and_reveal_award_atomic` (`00222`, replaced in local `00246`) is a different RPC. It can lock without reveal. When auto-reveal is true, `00246` raises if the purchase-order id is null before identity is returned. Hosted NOT applied. `AwardPage` uses `lock_award` then `reveal_award`. `EvaluationDecisionCockpit` calls the atomic RPC with auto-reveal true. Do not describe the two RPCs as one function.

## Purchase order create

`createPurchaseOrderFromAward` in `apps/web/src/features/fulfillment/api/purchase-orders.ts` calls `create_purchase_order_from_award` (latest body `00245`). `reveal_award` also calls that creator. Tax is base + GST + transport. `00245` does not backfill existing rows. `private.issue_po_document_snapshots` runs from that function.

## Purchase order cancel before acceptance

`cancelPurchaseOrder` calls `cancel_purchase_order_atomic` (`00239`). The migration allows cancellation only in `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, or `ISSUED`, with a reason of at least 5 characters, and only for a buyer-org manager or platform admin. A direct client status write to `CANCELLED` is rejected by `private.guard_po_cancellation_write`. No later `CREATE OR REPLACE` of this function was found.

## Milestones

Projection: `deriveFivePointMilestoneProjection` in `packages/domain/src/types/track-milestone.ts`, used by track UI tests and `packages/services/src/services/track-service.ts`. Route `/rfq/:rfqId/track`.

Inspection submit: `submit_milestone_inspection_atomic` from `MilestoneInspectionChecklist.tsx`. That is a checklist RPC, not the five-point projection.

## Invoice

`submitInvoice` in `apps/web/src/features/fulfillment/api/invoices.ts` inserts `invoices` and line items after `calculateOrderTaxBreakdown` / `buildTaxSnapshot` from `@otp/domain`. Reads: `fetchInvoicesByPurchaseOrder`. Approval helpers `approveInvoice` and `rejectInvoice` live in the same file. There is no invoice vendor service. Whether RLS allows the insert on the hosted project: `UNKNOWN`.

## GST

Three different things:

- PO tax math: `00245` `create_purchase_order_from_award`.
- Format check: `validateGstin` and `lookupGstinBusinessDetails` in `packages/domain/src/gst/`. The lookup comment says it does not call the GSTN registry and does not set `GST_VERIFIED`. `KNOWN_GSTIN_REGISTRY` is an empty map.
- Supplier GSTIN RPC: `verify_supplier_gstin` from `apps/web/src/features/supplier/api/capabilities.ts`. Latest body found: `00212`. This pass did not re-read that body, so what the RPC proves about a taxpayer is `UNKNOWN` beyond the name.

Discovery trust `DISCOVERED_IN_AREA` is not GST verification.

## Payment

Buyer-to-supplier record: `record_invoice_payment_atomic` from `apps/web/src/features/fulfillment/api/payments.ts`. Latest `CREATE OR REPLACE` found: `00216_verified_remediation_p0_p1_security_integrity.sql`. Subscription UI: `process_subscription_payment` from `apps/web/src/features/subscription/api/subscription.ts`. Pilot policy does not charge. Gateway webhook: `payment-webhook` (SECURITY-01 remediated in source, not redeployed).

## Notification

In-app rows: `apps/web/src/features/notifications/services/notificationService.ts` reads `notifications`. Route `/notifications`.

Outbound phone attempt: `invokeEdgeFunction` in `edge-dispatch.ts` to `onboarding-notify` and, for verification, `otp-dispatch`. `messaging-outbound` is the RFQ notification function. `resolveProvider` defaults to `MOCK`. A row in `notifications` is not a WhatsApp delivery.

## Document and PDF

Issued snapshots: `issued_document_snapshots`, read by `fetch-issued-document-snapshot.ts`, checked by RPC `verify_issued_document_digest`. Writer: `private.issue_po_document_snapshots` and decision-receipt snapshot functions called from `00244` and `00222`.

Browser print: `triggerPrintDialog` and `computeReceiptAuditHash` in `apps/web/src/features/reporting/lib/pdf-generator.ts`. There is no separate PDF rendering service in the chain that was read.

Attachments: `create_attachment_slot` and `confirm_attachment_upload`.

## Support

`create_support_ticket`, `admin_get_support_tickets`, and `admin_resolve_support_ticket` are called from `apps/web/src/features/admin/api/admin-ops.ts`. Bodies for those three were found in `00140_route_support_tickets_to_primary_admin.sql`. Policies were narrowed in `00201`. A later replacement was not confirmed. The admin API is the caller that was found. A dedicated public support route name was not traced.

## Audit

`/audit` and `/rfq/:rfqId/audit` → `AuditRoute`. Read: `fetch-audit-events.ts` from `audit_events`. Ping: `record_audit_ping_response`. PO cancel writes `audit_events` inside `cancel_purchase_order_atomic`. There is no external audit product.

## Google Places (both paths)

Path A, buyer and admin: `prepareGooglePlacesCoverage` (`rfq-lifecycle.ts`), `location-discovery.ts`, and `supplier-network-coverage.ts` invoke `location-pin-coverage`. Edge orchestrator sets `DAILY_LIMIT = 1500` and `allowLegacyMockDiscovery: false`. `runAuthoritativeLocationPinCoverage` reuses `00224` rows, then `discoverManagedCoverage` (`places:searchText`) when a key exists, else `PROVIDER_UNAVAILABLE`. Persisted stage: `DISCOVERED_IN_AREA`.

Path B, library only: `GooglePlacesDiscoveryAdapter.discoverWithFallbackLadder`. Not imported by `apps/web` or the edge function. Live tier only when tests pass `managedOrchestratorAuthorized`. Then an in-memory `Map` labeled `DATABASE_CACHE` (DOC-LEGACY-04). Then `560*` static fixtures (DOC-LEGACY-05). Then `UNAVAILABLE`.

## ONDC

Domain gate `resolveOndcEnvironmentGate`. Edge `supabase/functions/ondc-on-search/index.ts` calls `handleOndcOnSearchRequest` only for a complete pre-production client whose hosts are not production hosts. Otherwise it NACKs. The web procurement path above does not call this function. Status `CREDENTIAL_GATED`. CI does not deploy this function.

## WhatsApp, SMS, and email

Phone: `messaging-outbound` and `onboarding-notify` → `resolveProvider`. Unset or `MOCK` → `MockMessagingProvider`. `TWILIO` or `META` throw if their variables are missing. SMS uses the Twilio branch when that provider is selected.

Email: `resolveSmtpConfig` in `packages/services/src/notifications/email-dispatcher.ts`. Registration notices that were read go through `onboarding-notify`, not through a proven SMTP send. Delivery `UNKNOWN`.

## Payment gateways

`supabase/functions/payment-webhook/index.ts` verifies Razorpay, Stripe, or `x-otp-signature`, then may call `record_verified_payment`. Missing secrets fail verification: SECURITY-01, remediated in source, not redeployed. `SubscriptionPaymentModal` is the pilot UI. `vercel.json` CSP allows Razorpay and Stripe hosts. The allow-list is not activation.

## Pieces left UNKNOWN

| Piece | What was found | What was not established |
| --- | --- | --- |
| Monthly RFQ counter RPC | `evaluateRfqEntitlement` in domain code | The SQL function name that consumes the count |
| `publish_requirement` | File `00030_publish_requirement.sql` | A web caller |
| Hosted effect of every RPC above | The client call | A hosted execution |
