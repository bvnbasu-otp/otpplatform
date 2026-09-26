# R2-31 — 32-Issue Root-Cause Remediation & Friendly-Trial Readiness (Local)

Date: 26 Sep 2026 (IST). Scope: local working tree only. No push, no deploy, no production or shared database access, no real messages sent.

Every number below was copied from commands run in this session. Anything that could not be executed is stated as such.

---

## A. Baseline

| Item | Value (recorded at session start) |
|---|---|
| Branch | `main` |
| HEAD | `a1586c91d5b660b27f7b1afe4cb6362564311678` (`a1586c9 chore(scripts): add certified commit promotion gate`) |
| Previous product cert | `7c6f9ad` |
| Working tree | clean |
| Migrations | 197 files, highest `00197` |

Migration change during this cycle: **migrations added = 1** (`00198_harden_synthetic_quote_and_pilot_simulator_isolation.sql`), added under the explicit Product Owner decision that superseded the original 00197 ceiling. Final count: 198, highest `00198`. See section F.1 for justification, affected objects, security implications and rollback.

---

## B. 32-issue matrix

Legend for evidence: **B** = behavioural test (calls the code, asserts outcome), **R** = render test (`renderToStaticMarkup`), **S** = static source/SQL contract test. All paths below are relative to `apps/web/src/` unless they start with `packages/`, `supabase/` or `tests/`.

| ID | Issue | Status before | Root cause (file:line at HEAD) | Main files changed | Fix | Regression tests (file — test) | Evidence | Final status |
|---|---|---|---|---|---|---|---|---|
| 01 | Stale public content / dates / metadata / titles | Claimed fixed; not fixed | `apps/web/index.html` title "OTP Platform — Open Trade & Procurement"; per-page "Last updated" literals `LandingPage.tsx:53`, `FaqPage.tsx:73`, `AboutPage.tsx:14`, `SiteFooter.tsx:41`; fake "RFQ-2026-0842" demo ref `LandingPage.tsx:180` | `index.html`, `manifest.webmanifest`, `lib/brand.ts`, site pages, `SiteFooter.tsx` | Canonical title/description/OG/Twitter; one `PUBLIC_CONTENT_LAST_REVIEWED` constant; removed invented refs and unverifiable supplier counts | `features/site/public-site-positioning.test.tsx` — "no public site source hard-codes its own 'Last updated' date", "…past year"; `features/site/public-assets.test.ts` — index.html title/OG tests; `components/layout/site-footer-scroll-model.test.tsx` — "shows the shared public review date, not a hard-coded one" | R+S | FIXED |
| 02 | Public visuals / logos / favicon | Claimed fixed | All referenced assets exist; SVGs used React-style `stopColor` attribute (invalid in raw SVG) in `public/favicon.svg`, `public/icon.svg` | `public/favicon.svg`, `public/icon.svg`, `components/ui/OtpLogo.tsx` | `stop-color`; single `OTP_LOGO_SRC` | `features/site/public-assets.test.ts` — every index.html href/src, manifest icon, logo and in-source image path exists on disk and is non-empty; stopColor guard | S (filesystem) | RE-VALIDATED |
| 03 | Legacy users/orgs/demo data — safe admin lifecycle | Open | Select-all used all loaded rows, not the filtered view; row + toolbar hard-delete UI; direct-table fallbacks in `features/admin/api/admin-ops.ts` when RPC failed; mixed buyer/supplier batches sent with `p_is_supplier=true` | `features/admin/lib/account-lifecycle.ts` (new), `features/admin/lib/bulk-lifecycle-actions.ts` (new), `admin-ops.ts`, `AdminUsersActivityPanel.tsx`, `types/admin.ts` | Filter-bounded selection, mandatory reason (category + ≥8 chars), only audited, admin-checked RPCs from `00149` (`admin_bulk_block_*`/`unblock_*` check `private.is_platform_admin()`, granted to `authenticated` only), server-returned counts, undo = reactivate previously-active rows only, all delete UI and delete exports removed | `features/admin/account-lifecycle.test.ts` (19 tests) — select-all only filtered/unprotected rows; no RPC without valid reason; suppliers/orgs split; no delete RPC or table delete ever called | B | FIXED (sub-items BLOCKED: unblock RPC records no reason; a separate "archived" state needs schema) |
| 04 | Referral message, CSPRNG code, safe URL, ₹0 | Claimed fixed; not fixed | `ReferAndEarnCard.tsx:86,123,129` advertised "10% reward"/"10% in OTP Wallet Credits"; `packages/domain/src/types/referral-incentive.ts` fell back to `Math.random`/`require('crypto')`; string-concatenated URLs | `ReferAndEarnCard.tsx`, `features/referral/lib/referral-code-storage.ts` (new), `packages/domain/src/types/referral-incentive.ts` | Exact required copy built in one pass; `new URL()` + `searchParams.set`; Web Crypto only with rejection sampling, throws if unavailable; ₹0.00 + pilot notice | `packages/domain/src/types/referral-share-hardening.test.ts` (exact copy, hostile code/url, crypto spy + `Math.random` never called, charset/length, ₹0); `features/referral/refer-and-earn.test.tsx` (12 tests) | B+R | FIXED |
| 05 | Profile address persistence | Open | `features/profile/components/AddressBookManager.tsx:66-108,191-237` direct-table fallback: client-supplied `profile_id`, non-existent `recipient_name`, `state_code` nulled on edit | `features/profile/api/buyer-addresses.ts` (new), `AddressBookManager.tsx` | Single RPC path (`get_buyer_addresses`, `upsert_buyer_address_atomic`), validation before send, no client owner ID, zero-row deactivate = refused | `features/profile/address-book-persistence.test.tsx` — create / first-is-primary / edit / RPC failure no fallback / invalid / set primary / reload multiple / refused deactivate / no direct-table source | B | FIXED (client). Server ownership flaw in `upsert_buyer_address_atomic` → security finding SEC-5 (BLOCKED) |
| 06 | Stage-2 intake prefill; manual fields survive; no hard-coded PIN | Open | `features/intake/api/fast-track-intake.ts` `resolveDeliveryCity` returned `'Tiruppur'`; `UnifiedThreeTierIntake.tsx:151-169` used `addresses[0]` not primary and re-ran on each keystroke; `Tier1TellOtpCard.tsx:236-241` GPS always "Bengaluru / 560001"; `RequirementIntakePage.tsx:115` silently skipped publish | `features/intake/api/primary-address.ts` (new), `fast-track-intake.ts`, `draft.ts` (`persistAndPublishDraft`), `UnifiedThreeTierIntake.tsx`, `Tier1TellOtpCard.tsx`, `RequirementIntakePage.tsx` | Primary-address-only prefill of empty fields, once per user/org; no fake city/PIN; save-then-publish, no publish on failed save | `features/intake/api/fast-track-location.test.ts` (6); `features/intake/api/publish-and-allowance.test.ts` — persist-then-publish, no publish on save failure; `features/intake/voice-permission-and-location.test.tsx` — no PIN literals, GPS, pills, prefill. Existing test "falls back to Tiruppur" rewritten to assert `null` | B+R | FIXED |
| 07 | One deliberate Publish = persist + validate + publish, idempotent | Open | `features/requirement/api/rfq-lifecycle.ts` `publishRfq` ignored instruction-save failure; `openRfq` rejected status OPEN with "Cannot open RFQ from status OPEN" — but `discover_and_invite_for_rfq` already opens DRAFT RFQs server-side, so a first publish with zero invitations reported **failure after succeeding**, and every retry failed; unguarded `UPDATE … SET status='OPEN'` | `rfq-lifecycle.ts`, `pages/RfqReviewPublishPage.tsx` | `openRfq`: OPEN = idempotent success with no write; guarded `.eq('status','DRAFT').select('id')` transition with re-read on zero rows. `publishRfq`: per-RFQ in-flight de-duplication; failed deadline/instruction save stops before discovery/open. Success copy no longer claims "broadcast dispatched… responses within 30 minutes" | `features/requirement/rfq-review-publish.test.ts` — "re-opening an RFQ that is already OPEN is an idempotent success with no second write", "only transitions rows still in DRAFT (guarded update)", "publish succeeds when discovery already opened the RFQ server-side (no false error)", "double-click: concurrent publishes of the same RFQ share one execution", "a failed instruction save blocks publishing and a retry can then succeed", "publish path makes no synthetic quote RPC calls" | B | FIXED |
| 08 | Real pilot never auto-generates synthetic quotes | Open (critical) | Client: `features/rfq/api/simulate-quotes.ts` fell back to `auto_submit_pilot_quotes` and direct inserts; `use-identity-protected-quotes.ts` and `fetch-active-rfq-monitoring.ts` auto-topped-up quotes; `EvaluationDecisionCockpit.tsx:661` passed `onSimulateQuotes` unconditionally ("⚡ Simulate 4 Demo Quotes" rendered for real RFQs); `fast-track-intake.ts` called `auto_submit_pilot_quotes`. Server: `00188` `discover_and_invite_for_rfq` called `auto_submit_pilot_quotes` on non-demo RFQs when the stub flag was on; stub flag defaulted to **true** when no row; `00130` toggle executable by `anon` | `features/rfq/api/synthetic-quote-guard.ts` (new), `simulate-quotes.ts`, hook, monitoring, cockpit, `fast-track-intake.ts`, `supabase/migrations/00198_…sql` (new) | Client fails closed unless `VITE_DEMO_MODE === 'true'` exactly AND `rfqs.is_demo IS TRUE`; single seed RPC; no fallbacks. Server: see F.1 | `features/rfq/simulate-quotes.test.ts` — describe **"REAL PILOT RFQ = ZERO SYNTHETIC QUOTES"**; `features/intake/api/fast-track-intake.test.ts` — "has no code path to any synthetic quote RPC (REAL PILOT RFQ = ZERO SYNTHETIC QUOTES)"; `features/evaluation/cockpit-simulate-gate.test.ts`; `tests/security/synthetic-quote-migration-00198-redteam.test.ts` (10 tests) | Client B; server **S only** | FIXED — client proven by behavioural tests; server proven by static SQL contract only (**live-DB execution NOT performed**; production/pilot stub flag state **cannot be verified locally**) |
| 09 | Professional A4 PDF | Open | "Print / PDF" printed the screen (`PurchaseOrderDetailPage.tsx:780`, `pdf-generator.ts:23`); report timestamp not IST and fake "AUDIT SEALED" SHA-256 from `Date.now()` (`PrintableProcurementReport.tsx:20-26,50-54,186-188`); invented PO line items (`derivePoLineItems`) | `features/reporting/lib/procurement-document.ts` (new), `reporting/components/PrintableProcurementDocument.tsx` (new), `features/fulfillment/lib/po-document.ts` (new), `PrintableProcurementReport.tsx`, `PurchaseOrderDetailPage.tsx` | Pure document model: A4, brand, From/To, IST timestamps, ref, line items (qty/rate/GST%/GST/total), TDS, net, "Page X of Y", footer, hash only if system already has one; pre-award pseudonymisation | `features/reporting/procurement-document.test.tsx`; `features/fulfillment/po-document.test.ts` | B (model) | FIXED for PO + procurement report; quote-comparison and decision-receipt pages still use `window.print()` — DEFERRED |
| 10 | Governance charter in Profile + admin bulk mgmt | Claimed fixed; placeholder | `features/profile/pages/ProfilePage.tsx:995-1018` one-paragraph placeholder ("…zero markup… immutable audit logs") | `features/governance/lib/organization-charter.ts` (new), `features/governance/components/OrganizationCharterPanel.tsx` (new), `ProfilePage.tsx` (mounted) | Persona clauses drawn from rules the domain enforces (no self-approval, committee quorum ≥2, 365-day terms, direct bilateral contracting, money-flow separation, ₹0 referral) and an explicit "no signed acceptance is stored" note | `features/governance/organization-charter.test.tsx`; `features/profile/profile-charter-mount.test.tsx` — mounted, placeholder gone, RWA quorum clause renders | R+S | FIXED (Profile display). Admin bulk charter management BLOCKED — no charter/agreement tables exist |
| 11 | Milestones 0→25→50→75→100 deliberate only | Claimed fixed; not fixed | `SupplierMilestoneStepper.tsx` `markCompleteOnSave` auto-called `onUpdateProgress(100)`; five quick-jump buttons incl. "Confirm Delivery (100%)"; `features/fulfillment/api/work-orders.ts:195-212` wrote any percent directly; DB only has `CHECK 0..100` (`00002:286`); `00178` `simulate_pilot_supplier_fulfillment` auto-completed/invoiced any PO | `features/fulfillment/lib/milestone-progress.ts` (new), `work-orders.ts`, `SupplierMilestoneStepper.tsx`, `00198` (trigger function) | Next-step-only rule; compare-and-set update on `progress_percent`; one "record next milestone" button + confirm panel, supplier only; honest evidence-note copy; server simulator refuses non-demo POs | `features/fulfillment/milestone-progression.test.tsx` — 0→100 rejected with no write; conditional `eq('progress_percent', from)`; lost race reports failure; COMPLETED only at 75→100; render: one button, no 100% shortcut, buyers see none; invoices never touch progress; `tests/security/synthetic-quote-migration-00198-redteam.test.ts` — fulfillment demo gate precedes every mutation | B+R; server S | FIXED (client/API + simulator isolation, static-only for server). Server-side monotonic step enforcement not implemented (outside approved 00198 scope) — BLOCKED |
| 12 | Exactly one settlement CTA per state | Open | Invoice tab "Continue to Settlement" twice (`PurchaseOrderDetailPage.tsx:1718-1733` + sticky `:1824`); three invoice buttons on Milestones tab; "Complete PO" in sticky bar and header (`FulfillmentStatus.tsx:131`); Approve per row and in detail (`InvoicePaymentPanel.tsx:696-720,946-968`) | `features/fulfillment/lib/settlement-state.ts` (new), `components/SettlementCta.tsx` (new), detail page, `InvoicePaymentPanel.tsx`, `FulfillmentStatus.tsx` | `resolveSettlementAction(state)` + `resolveSettlementCtaPlacement`; one element; pilot copy "Record Off-Platform Payment — OTP does not collect, hold or settle funds". Also removed a fake OTP bank account/UPI/QR and a "0.5% deducted at settlement" claim that contradicted the pilot freeze | `features/fulfillment/settlement-cta.test.tsx` — 11-state truth table; 88 render cases each with 0 or 1 CTA | B+R | FIXED |
| 13 | TDS base, rounding, single deduction, UI == ledger | Claimed fixed; not fixed | UI passed gross (GST-inclusive) `activeInvoice.amount` as taxable base; domain doc said "Gross or Taxable"; client rounding differed from server (`00173:385-389`); re-apply possible while a deduction existed | `packages/domain/src/tax/tds-calculator.ts`, `TdsWithholdingPanel.tsx`, `InvoicePaymentPanel.tsx`, `features/fulfillment/api/payments.ts` | Base = value excluding separately-stated GST (CBDT Circular 23/2017) via `deriveInvoiceTdsBase`; threshold on same base; `roundStatutoryTds` mirrors server single ROUND + ₹1 floor; single active (non-VOIDED) deduction; in-flight guard; success shows server-recorded amount | `packages/domain/src/tax/tds-calculator.test.ts` — 118000/18000 on 194C company → TDS 2000, net 116000; 194J 59000/9000 → 5000/54000; threshold on ex-GST value; rounding parity; `features/fulfillment/tds-withholding-panel.test.tsx` (6) — ₹1,00,000 base / ₹2,000 preview; apply form hidden when live deduction exists; voided allows new; RPC receives ex-GST base; panel wiring | B+R | FIXED (client/domain). Server gaps BLOCKED: `apply_tds_withholding_atomic` trusts client `p_taxable_amount`; no per-invoice uniqueness (`00173:89-93`); TDS never reduces `balance_due` so a TDS invoice cannot reach PAID |
| 14 | Review Invoice & Balances tabs real data | Open | Invoice and Settlement tabs rendered the same panel (`PurchaseOrderDetailPage.tsx:1708,1758`); `supplierName="Assigned Supplier"` (`InvoicePaymentPanel.tsx:980`); invented phone `+91 98450 12345` and "GST: Verified" fallback (`:927-929`) | `components/InvoiceBalancesReview.tsx` (new), `InvoicePaymentPanel.tsx` (INVOICE/SETTLEMENT views) | Balances table (invoice #, gross, GST, TDS, paid, outstanding, status, net, unallocated advances) from stored data; meaningful empty state; real supplier name; "not on record" instead of invented contact | `features/fulfillment/invoice-balances-and-blockers.test.tsx` — figures incl. voided TDS/rejected invoices; render with data and empty state; placeholder removal | B+R | FIXED |
| 15 | Sign-off blocker message from real state | Claimed fixed | Generic messages (`PurchaseOrderDetailPage.tsx:509-522`) and generic "Settlement Incomplete" dialog (`:1876-1885`) | `settlement-state.ts` (`computeCompletionBlockers`), detail page | Lists actual blockers, each labelled "enforced by server" vs "screen check" (server trigger `validate_po_status_transition` `00171:290-341`) | `features/fulfillment/invoice-balances-and-blockers.test.tsx` — 8 state combinations, labels, rendered list | B+R | FIXED (backend remains authoritative) |
| 16 | Footer at 320–375px | Claimed fixed | Trust pills used `truncate` in 2-col grid (`SiteFooter.tsx:14-26`); non-wrapping brand row (`:35`); drawer `sm:absolute` | `SiteFooter.tsx` | Wrapping rows; no truncation; drawer `fixed inset-0`; competing ribbon later removed (issue 24) | `components/layout/site-footer-scroll-model.test.tsx` — normal flow; no width >320px; no truncate/nowrap; every flex row stacks or wraps | S (class assertions) — **not device-rendered** | FIXED (static evidence only; see H) |
| 17 | Address Book fields visible | Open | Sub-locality / landmark / instructions behind an expand control | `features/profile/components/BuyerAddressCard.tsx` (new) | Always-visible labelled rows; "Not added" when empty | `features/profile/address-book-persistence.test.tsx` — 2 render tests | R | FIXED. Separate `delivery_instructions` column does not exist (shares `landmark`) — schema change BLOCKED |
| 18 | Voice denied message + immediate autofocus | Claimed fixed | `VoiceRequirementDictation.tsx:147` different copy; 50 ms `setTimeout` focus; fake sample transcript on unsupported browsers | `VoiceRequirementDictation.tsx`, `Tier1TellOtpCard.tsx`, `VoiceTextRequirementIntakeModal.tsx` | Exact required message for `not-allowed`/`service-not-allowed`/`NotAllowedError`/`PermissionDeniedError`/`SecurityError`; synchronous focus; fake transcript removed | `features/intake/voice-permission-and-location.test.tsx` — exact copy, 4 denied codes, non-permission errors, focus helper, immediate modal focus | B+R | FIXED |
| 19 | IST `DD MMM YYYY, HH:mm IST` via one formatter | Claimed fixed | `lib/date-utils.ts` produced locale-dependent output; ad-hoc `toLocale*` on deadlines, award lock, receipts | `lib/date-utils.ts` (rewritten), 12 golden-journey files (deadline banners/modals, publish page, award, reveal, decision receipt, tally, approvals, dispute SLA, contract signatures, addenda, deadline toast) | `Intl.DateTimeFormat` pinned to `Asia/Kolkata`, h23, fixed month table | `lib/date-utils.test.ts` (12) — "13 Sep 2026, 15:30 IST", midnight rollover "01 Jan 2027, 00:15 IST"; `features/award/ist-timestamps.test.ts`, `features/reveal/ist-timestamps.test.ts`, `features/clarification/ist-timestamps.test.ts`, `features/rfq/ist-deadline-display.test.ts` | B+S | FIXED for golden-journey surfaces. Remaining ad-hoc calls in admin/financial dashboards (e.g. `FinancialControlDashboardPage.tsx`) and compact relative labels in notifications — DEFERRED |
| 20 | Identity protection language + no leakage | Claimed fixed | `features/supplier/api/fetch-invitations.ts:58,77-78` requested and passed `buyer_display_name` (real org name for `OPEN_RFQ`); shown at `SupplierInvitationList.tsx:132`, `QuickQuotePage.tsx:277`; fake buyer "Palm Meadows RWA" (`SupplierOpportunityCard.tsx:10`); five shield wordings | `packages/domain/src/types/blind-quote.ts` (additive buyer-identity guard), supplier API/components, quick-quote, `IdentityProtectedShield.tsx` (new) | Buyer always "Identity protected" pre-award; buyer-identity keys stripped at any depth; contact scrubbed from free text; payload asserted safe; one shield component | `features/supplier/buyer-identity-protection.test.tsx`; `features/supplier/identity-shield-consistency.test.tsx`; `features/quick-quote/quick-quote-identity.test.tsx`; `features/home/supplier-opportunity-card-identity.test.tsx`; `packages/domain/src/types/supplier-facing-payload.test.ts` | B+R | FIXED (client). Server leaks SEC-1, SEC-2, SEC-3 — BLOCKED (client stripping is not a security boundary) |
| 21 | Google Places reset label + UTC window | Open | Hard-coded label at `GooglePlacesOperationalCard.tsx:315`, separate from UTC day-key logic in `packages/services` | `packages/domain/src/gis/google-places-quota-window.ts` (new), `packages/services/src/gis/google-gis-safety-quota.ts`, card | One constant "Resets daily at 05:30 IST / 00:00 UTC" + `getUtcDayKey`/`getUtcMonthKey` shared by label and counter | `packages/domain/src/gis/google-places-quota-window.test.ts` (4 boundary tests); `features/founder/__tests__/founder.test.tsx` — "C2-10b" | B | FIXED |
| 22 | Pilot allowance string from enforcement source | Claimed fixed | `DashboardPage.tsx:133` used `freeRfqCredits ?? 1`; hard-coded "1 of 3" at `RfqPublishConfirmationModal.tsx:87`, `RequirementDetailPage.tsx:106` | `packages/domain/src/types/pilot-allowance.ts` (new), `features/intake/api/pilot-allowance.ts` + hook (new), `DashboardPage.tsx`, `features/requirement/components/PilotAllowanceText.tsx` (new), modal, detail page | Label from `evaluatePilotRfqAllowance` (wraps `evaluateRfqEntitlement`); client publish gate fails closed; honest pending state | `packages/domain/src/types/pilot-allowance.test.ts` (6); `features/intake/api/publish-and-allowance.test.ts` (4 allowance); `features/requirement/pilot-allowance-display.test.tsx` (4) | B+R | FIXED (display + client gate). Server-side 3/month enforcement absent in `publish_requirement` (`00180:125+`) — BLOCKED |
| 23 | Brand / subtitle / cockpit labels coherent | New | `PRODUCT_PLATFORM_SUBTITLE = 'Neutral Sourcing & Governance Platform'`; "Mobile Procurement Cockpit" formed by `MobileSimulatorFrame.tsx:96,106` on every public page; "Procurement Cockpit" in `MobileScreensShowcase.tsx:249,252` | `lib/brand.ts`, `MobileSimulatorFrame.tsx`, `MobileScreensShowcase.tsx`, Login/Signup | Canonical title + subtitle everywhere public | `lib/brand.test.ts`; `features/portal/public-auth-copy.test.tsx`; `features/site/public-site-positioning.test.tsx` — "…no 'Procurement Cockpit' label anywhere in its chrome"; `components/public-chrome-plain-language.test.ts` | R+S | FIXED (dashboard header in `AppLayout` not re-audited for copy) |
| 24 | Single public journey; trust separate | New | Six-item ribbon + "6-Stage Lifecycle" + second journey strip on Landing (`LandingPage.tsx:107-127,261-341,505-515`); "6-Stage Workflow" on FAQ (`FaqPage.tsx:84-184`); five-item footer ribbon | `features/site/components/PublicJourney.tsx` (new), Landing, FAQ, About, `SiteFooter.tsx` | One Request → Compare → Decide → Purchase → Track; separate plain-language trust principles; footer ribbon removed | `features/site/public-site-positioning.test.tsx` — "homepage renders exactly one journey with the five canonical steps in order", "…no competing multi-stage lifecycle or trust ribbon"; footer — "carries no competing trust ribbon" | R | FIXED |
| 25 | Homepage content audit | New | ~10 sign-up CTAs, inline Pricing/FAQ/About duplicates | `LandingPage.tsx` | Hero → one CTA area (buyer + supplier) → pilot note → example → journey → trust | `public-site-positioning.test.tsx` — "has one primary CTA area…", "does not repeat sign-up calls to action elsewhere", "does not duplicate the Pricing, FAQ or About pages inline" | R | FIXED |
| 26 | Hide provenance publicly | New | Provenance/Product Leadership section inside public About (`AboutPage.tsx:122-153`) | `AboutPage.tsx` | Rendered only for founder/platform admin via existing role context; route and content preserved | `features/site/about-provenance.test.tsx` — hidden for anonymous, shown for founder, shown for admin | R | FIXED |
| 27 | Remove technical content from FAQ/public | New | "General Architecture" tab, "Cryptographic Salting… hashed…", "append-only SHA-256 audit ledger" (`FaqPage.tsx:14,220-230,330,359`); "Sealed by Cryptographic Proof" (`AboutPage.tsx:17`); "cryptographic salt" + "immutable audit trail" (`LegalPage.tsx:66,75`); WAHA/salts in FAQ content | FAQ/About/site-content/portal copy, `LegalPage.tsx`, showcase | Plain-language customer FAQ (what OTP is, how to buy, suppliers, comparison, identity, decision/committee, tracking, Pilot Mode, how OTP earns) | `public-site-positioning.test.tsx` jargon checks + 8 required-question tests; `components/public-chrome-plain-language.test.ts` | R+S | FIXED (privacy-policy sub-processor disclosure naming Supabase retained deliberately) |
| 28 | Supplier RFQ view shows only what's needed | New | Spec/commercial JSON, title, description passed unfiltered (`fetch-invitations.ts:92-100`) | supplier API/components | Allow-list view: title, description, spec, qty, city, fulfilment mode, deadline; buyer protected | `features/supplier/buyer-identity-protection.test.tsx` — "requests no buyer identity column…", "renders qty, spec, city and deadline but no buyer name, email, phone, street or GSTIN" | B+R | FIXED (UI). Server BLOCKED (SEC-2, SEC-3); pincode display needs a view change — BLOCKED |
| 29 | Supplier registration notification status | New | `features/portal/api/signup.ts` hard-coded `'123456'` OTP fallback; failed WhatsApp still `ok:true`; shared default password `'Welcome@OTP2026!'`; `SignupSuccess` said "Account Activated & Auto-Approved" while `00180` returns PENDING | `packages/domain/src/notifications/notification-status.ts` (new), `features/notifications/lib/outbound-dispatch.ts` (new), signup/registration components | One status helper (NOT_ATTEMPTED/QUEUED/SUBMITTED/ACCEPTED/DELIVERED/FAILED); DELIVERED only from provider callback; timeout = FAILED "outcome unknown"; duplicate suppression; honest success page | `packages/domain/src/notifications/notification-status.test.ts`; `features/notifications/outbound-dispatch.test.tsx` — accepted/submitted/rejected/5xx retry/timeout/network/duplicate; `features/portal/registration-outcome.test.tsx` | B+R | FIXED (app semantics). Real provider delivery BLOCKED (no credentials, no delivery webhooks wired) |
| 30 | Referral registration / OTP / reset / welcome separation | New | "Sent!"/"We sent…" claims on reset and sign-in code; admin approval implied delivery; profile credential OTP displayed the code on screen and accepted a fake `123456` (see K) | `features/auth/lib/password-reset-dispatch.ts` (new), `AuthProvider.tsx`, `SignInForm.tsx`, `ResetPasswordPage.tsx`, `features/profile/api/profile.ts`, `ProfilePage.tsx` | ACCOUNT CREATED vs MESSAGE SUBMITTED vs DELIVERY STATUS separated in copy and return values; referral attribution preserved, ₹0 | `features/auth/password-reset-delivery.test.ts`; `features/profile/credential-otp-integrity.test.ts` (8) | B | FIXED (app semantics). Real delivery BLOCKED; OTP code generated in browser-visible RPC response — server design issue BLOCKED |
| 31 | Footer/scroll architecture | New | Fixed overlay bottom nav (`MobileBottomNav.tsx:90`) with inconsistent clearance (4.5rem vs 6.5rem); `.zero-scroll-container` padding + 5.5rem `::after` spacer overriding page utilities (`index.css:508-540`); `min-h-screen` inside shorter scroller; `window.scrollTo` on a non-scrolling document | `AppLayout.tsx`, `SiteLayout.tsx`, `MobileBottomNav.tsx`, `components/layout/scroll-model.ts`, `index.css` | One model: `h-dvh` frame; header → single `<main>` scroller → nav in normal flow; footer last inside `<main>`; scroll reset on route change | `components/app-shell-scroll-model.test.tsx` (7); `features/site/site-layout-scroll-model.test.tsx` (4); CSS tests in footer test file | S (render/class) — **not device-rendered** | FIXED (static evidence only) |
| 32 | Duplicate CTA / nav collisions | New | Global nav vs sticky docks; third "+ Get Started" CTA in footer | `navigation-config.ts` (`shouldShowGlobalBottomNav`), shells, footer | One visibility rule; inventory scan fails on unclassified sticky/fixed bottom bars | `features/navigation/bottom-nav-dock-suppression.test.tsx` (10) | S | FIXED in shell. Remaining: admin telemetry bar `ProcurementStageNavigator.tsx:285` (`fixed bottom-0 z-30`) under page docks; `ActiveRfqMonitoringPage.tsx:190` dock `sm:absolute` — DEFERRED |

---

## C. Public website simplification

| Item | Action | Reason |
|---|---|---|
| Browser title / meta / OG / Twitter / manifest | Replaced with canonical title + subtitle | One positioning |
| "Neutral Sourcing & Governance Platform", "Desktop/Mobile Procurement Cockpit", "Procurement Cockpit" | Removed | Retired phrases |
| Homepage six-item trust ribbon, 6-stage lifecycle, second Request→Track strip | Removed → one `PublicJourney` | Competing journeys |
| Footer five-item trust ribbon ("Immutable Audit Trail" …) | Removed | Duplicate of homepage trust principles |
| Homepage inline Pricing / FAQ / About sections | Removed | Pages exist in header |
| Homepage buyer/supplier cards + requirement prompt | Merged into one CTA area | Duplicate CTAs (~10 → 2) |
| Footer "+ Get Started" primary-styled CTA | Demoted to plain link | Third primary CTA |
| FAQ architecture/security-implementation sections | Removed; rewritten as customer questions | Jargon |
| About cryptography/pipeline cards; unverifiable "48 hours", "100% audit compliance" | Removed/reworded | Jargon, unsupported claims |
| Provenance / Product Leadership | Retained, founder/admin only | Must remain reachable |
| Legal: "cryptographic salt", "immutable audit trail" | Plain language | Jargon |
| Legal privacy sub-processor list naming Supabase | Retained | Privacy disclosure |
| Showcase "quote within 30 minutes", "cryptographically sealed" | Reworded | Unsupported claim / jargon |

Jargon removed from public surfaces: RLS/row-level security, database evaluation view, cryptographic/cryptography, salt/salting, hash/SHA-256, append-only, architecture, WAHA, feature flag/stub adapters, immutable ledger.

---

## D. Golden journey (evidence = automated tests in this session; no live DB, no browser run)

| Step | Evidence |
|---|---|
| Buyer intake → primary-address prefill, no fake location | `features/intake/*` tests (B/R) |
| Publish (persist, validate, idempotent, no false error) | `features/requirement/rfq-review-publish.test.ts` (B) |
| Real RFQ never gets synthetic quotes | `features/rfq/simulate-quotes.test.ts` "REAL PILOT RFQ = ZERO SYNTHETIC QUOTES" (B); `tests/security/synthetic-quote-migration-00198-redteam.test.ts` (S) |
| Supplier sees only what is needed; buyer protected | `features/supplier/*`, `features/quick-quote/*` (B/R) |
| Compare / decide (identity-protected quotes, award) | existing evaluation/award suites pass; server award authorization defect SEC-1 (BLOCKED) |
| PO → milestones (deliberate steps) → inspection → invoice → TDS → settlement → completion blockers | `features/fulfillment/*` (11 files incl. milestone, TDS, settlement CTA, balances/blockers, PO document) |
| Notifications honest | `features/notifications/*`, `features/portal/registration-outcome.test.tsx`, `features/auth/password-reset-delivery.test.ts`, `features/profile/credential-otp-integrity.test.ts` |

Live end-to-end execution against a database was **not performed** (no Docker, Supabase CLI, psql or `DATABASE_URL` available). 371 live-DB tests skipped (section I).

---

## E. PA-01..PA-10

| PA | Control | Evidence | Status |
|---|---|---|---|
| PA-01 | RWA quorum / weighted voting / COI | unchanged; charter now states quorum ≥2 from domain rules; governance suites pass | Preserved |
| PA-02 | KYC gate | not touched; suites pass | Preserved |
| PA-03 | Role succession / attribution | not touched | Preserved |
| PA-04 | Sealed quotes & `quotes_identity_protected` (`00117`, `00136:42-82`) | view unchanged; client mapper allow-list + `assertIdentityProtectedPayloadSafe` | Preserved |
| PA-05 | `assertIdentityProtectedPayloadSafe` (`packages/domain/src/types/blind-quote.ts`) | unchanged; buyer-side counterpart added (additive) | Preserved + strengthened |
| PA-06 | `lock_and_reveal_award_atomic` (`00151`/`00160`/`00192`/`00196:527`) | not modified; **SEC-1: no caller authorization, granted to anon** — pre-existing defect | Preserved as-is; defect BLOCKED |
| PA-07 | Decision Receipt | IST timestamps only | Preserved |
| PA-08 | Bilateral GST RLS / financial segregation | no RLS changes; `pricing-entitlement.ts` unchanged | Preserved |
| PA-09 | Superadmin immutability (`00152`) / anti-self-approval (`packages/domain/src/identity/authorization-chain.ts`) | unchanged; SEC-1 bypasses anti-self-approval server-side | Preserved as-is; defect BLOCKED |
| PA-10 | Append-only `committee_votes` (`00004:589-630` triggers) / `procurement_stage_events` (`00148:24` RLS on; only read + insert policies at `00148:27-40`, no update/delete policy; no immutability trigger) | unchanged | Preserved (stage events append-only by policy absence only) |

00198 does not disable RLS or triggers, drop policies, or delete data (asserted in the red-team test).

---

## F. Financial controls

Pilot freeze verified unchanged: payments OFF; supplier fee 0.5% policy unchanged and waived in pilot; buyer reward 0.1% unchanged (`packages/domain/src/types/pricing-entitlement.ts` has no diff); referral `monetaryCreditAmount: 0`, `REFERRAL_PROGRAM_MODE = 'PILOT_SANDBOX'`; procurement / OTP revenue / wallet flows separate. Removed UI claims that broke the freeze (fake OTP bank account/UPI/QR, "0.5% deducted at settlement", escrow wording in PurchaseOrdersPage, MaintenancePage, MobileScreensShowcase, AdminQuickActionsSheet).

Path: invoice (`InvoicePaymentPanel.handleSubmitInvoice`; flat 18% GST back-calculated from gross — simplified assumption) → stored CGST/SGST/UTGST/IGST split → `deriveInvoiceTdsBase` → `calculateTds` (section/rate from existing tables: 194C 1% individual/HUF, 2% others; thresholds ₹30,000 single / ₹1,00,000 FY; base excludes separately-stated GST per CBDT Circular 23/2017; `roundStatutoryTds` = single rupee ROUND with ₹1 floor, mirroring `00173:385-389`) → `apply_tds_withholding_atomic` (server: buyer OWNER/MANAGER, status check, TDS ≤ gross, `00173:356-394`) → `record_invoice_payment_atomic` (APPROVED/PARTIALLY_PAID, cap at balance due, `00175:659-690`) → completion trigger `validate_po_status_transition` (`00171:290-341`).

Open server gaps (BLOCKED, need migrations): client-supplied `p_taxable_amount` trusted; no per-invoice uniqueness on `tds_deductions`; TDS not reflected in `balance_due`; no server milestone step enforcement.

### F.1 Migration 00198 (added = 1)

File: `supabase/migrations/00198_harden_synthetic_quote_and_pilot_simulator_isolation.sql` (BEGIN/COMMIT, idempotent, non-destructive).

Justification: real pilot RFQs could receive synthetic quotes server-side (`00188` discover → `auto_submit_pilot_quotes` when stub flag on), the stub flag defaulted to **true** when no row, and the flag toggle was executable by `anon`. No existing RPC could be used to prevent this; client changes alone cannot.

Affected objects:
1. `private.supplier_network_stub_enabled()` — fails closed (`COALESCE(…, false)`).
2. `public.admin_toggle_supplier_network_stub(boolean)` — platform admin or `service_role` only; `REVOKE ALL FROM PUBLIC`, `REVOKE EXECUTE FROM anon`. **Security finding (fixed): anon could toggle synthetic-quote generation.**
3. `public.discover_and_invite_for_rfq(uuid, integer, uuid[])` — 00188 body with only the stub/auto-submit block replaced (line diff vs 00188: 2 removed, 1 added, asserted by test).
4. `public.seed_simulated_quotes_for_rfq(uuid, integer)` and `public.auto_submit_pilot_quotes(uuid)` — originals moved to `private.*_impl` (guarded by `to_regprocedure`), revoked from PUBLIC/anon/authenticated; new public wrappers call `private.assert_synthetic_quotes_allowed` (admin/service_role/owner session AND `rfqs.is_demo IS TRUE`), anon revoked.
5. `private.simulate_pilot_supplier_fulfillment()` (trigger `trg_simulate_pilot_supplier_fulfillment` on `work_orders`, defined `00110:376-379`) — returns early unless the work order, PO or RFQ is demo, before any ACCEPTED/COMPLETED/invoice mutation.

Tables touched: none structurally; `platform_settings` row upsert only via the toggle when called.

Verification: `tests/security/synthetic-quote-migration-00198-redteam.test.ts` — 10/10 static contract tests. **Live-DB execution was NOT performed** (no local database tooling). **Production/pilot stub flag state was NOT queried and cannot be verified locally.**

Rollback: drop the two public wrappers and `private.assert_synthetic_quotes_allowed`; `ALTER FUNCTION private.seed_simulated_quotes_for_rfq_impl(uuid, integer) SET SCHEMA public` then `RENAME TO seed_simulated_quotes_for_rfq` (same for `auto_submit_pilot_quotes_impl`); re-run the definitions of `supplier_network_stub_enabled`/toggle from `00130`, `discover_and_invite_for_rfq` from `00188`, `simulate_pilot_supplier_fulfillment` from `00178`, and the original grants.

---

## G. Notification integrity

| Channel | App semantics now | BLOCKED |
|---|---|---|
| Email (Supabase auth) | no error → SUBMITTED; error → FAILED; never "delivered" | Delivery receipts (provider webhooks) |
| WhatsApp (gateway) | message id → ACCEPTED; 2xx without id → SUBMITTED; 4xx/5xx/timeout/network → FAILED (timeout = outcome unknown); retries; duplicate suppression | Delivery/read callbacks not wired |
| Sign-in / reset OTP | SUBMITTED/ACCEPTED only; no fallback code | Code returned to browser by RPC (server design) |
| Profile credential OTP | code never shown outside `VITE_DEMO_MODE=true`; no fake success; email path honestly refuses (no sender exists) | Email sender; server-side sending |
| Welcome / admin approval | per-channel status, "delivery not confirmed" | Real delivery |
| Referral | share link sent by the user; OTP sends nothing; ₹0 | Server persistence of referrer code |

Remaining over-claiming copy outside this cycle's files (NEW DISCOVERY — OUT OF REGISTER): `features/org/api/org-members.ts:102` "Invite sent successfully"; `SupplierWorkOrderPage.tsx:60` "Buyer has been notified"; `InvoicePaymentPanel.tsx:332` "Supplier notified"; `MilestoneInspectionChecklist.tsx:246`; `SupplierAwardOnboardingPage.tsx:115`; `MaintenancePage.tsx:338`; `features/demo/components/MessagingInspector.tsx:120`.

---

## H. Mobile audit

| Width | Evidence type | Result |
|---|---|---|
| 320 | Static render/class assertions (no width token >320px, no truncate/nowrap, rows stack or wrap, footer in flow, nav in flow) | Assertions pass; **not device- or browser-rendered** |
| 360 | Same static assertions | Not rendered |
| 390 | Same static assertions | Not rendered |
| 412 | Same static assertions | Not rendered |
| 768+ | Static only; `sm:` variants not asserted beyond layout rules | Not rendered |

No real-device or browser rendering was performed. Minimal human smoke step: open `/`, `/faqs`, a PO detail and an RFQ review page at 320/360/390/412 px in device emulation; confirm no horizontal scroll, footer at end of content, bottom nav/dock not covering content.

---

## I. Gate results (commands run in this session)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `tsx scripts/typecheck.ts` | exit 0 — @otp/domain PASSED (13.09s), @otp/database PASSED (8.82s), @otp/services PASSED (13.61s), @otp/web PASSED (33.41s) |
| Vocabulary | `node scripts/scan-canonical-vocabulary.cjs` | PASSED — 455 files, 0 violations |
| Coverage policy | `node scripts/check-test-coverage-policy.cjs --strict` | PASSED — UNIT 81, MODULE 195, FUNCTIONAL 45, REGRESSION 4; 325 test files |
| Vitest root (includes tests/, web, domain, services, database) | `vitest run` | 315 files passed; 3441 passed, 371 skipped, 0 failed (3812) |
| Vitest web | `vitest run --config apps/web/vitest.config.ts` | 162 files passed; 1627 passed, 0 failed |
| Vitest domain | `--config packages/domain/vitest.config.ts` | 61 files; 773 passed |
| Vitest services | `--config packages/services/vitest.config.ts` | 40 files; 559 passed |
| Vitest database | `--config packages/database/vitest.config.ts` | 2 files; 5 passed |
| Skips | `vitest run tests --reporter=json` | 371 skipped, all in 21 live-DB files (`ctx.skip()` when `isLocalSupabaseReachable()` is false): tests/security award-closeout 18, blind-rfq-engine 3, messaging-rls 10, cross-organization 14, rls-security 13; tests/integration demo-mode 22, direct-supplier-invite 12, audit-performance 4, clarification-redaction 30, attachments 10, market-intelligence-intake 8, messaging-body-redaction 9, messaging-channel 47, phase-engine 37, pilots-horizontal 2, requirement-intake 11, procurement-os 2, requirement-engine 65, role-access 22, signup-portal 16, supplier-portal 16 |
| Edge functions | `tsx scripts/test-functions.ts` | exit 0 — "Deno is not installed… Skipping." (not executed) |
| Build | `node ./node_modules/vite/bin/vite.js build apps/web` | exit 0 — "✓ built in 43.11s" (largest chunk 542.10 kB) |
| Lint | `lint` script = `echo 'lint: passed'` (no linter) | NOT RUN — pnpm/npm not on PATH; there is no real linter to run |
| Migrations | directory count | 198, highest `00198_harden_synthetic_quote_and_pilot_simulator_isolation.sql` |

Tests changed rather than added (not weakened): `rfq-review-publish.test.ts` "prevents publishing an RFQ that is already OPEN" → idempotent-success contract (plus realistic `update().select()` array mocks here and in `supplier-discovery.test.ts`); `fast-track-intake.test.ts` Tiruppur fallback → returns null; `fetch-invitations.test.ts` named buyer → never named pre-award; `site-content.test.ts` / `about-provenance.test.tsx` → new positioning; `site-footer-scroll-model.test.tsx` ribbon grid → no competing ribbon; `profile.test.ts` removed assertions that depended on the insecure `123456` fallback, replaced by `credential-otp-integrity.test.ts`.

---

## J. Git

One local commit on `main`; no push, no deploy, no production or shared database access, no `supabase db push`/link. Final SHA, status and diff stat are reported in the chat response after the commit (they cannot be embedded in the committed file itself).

---

## K. Out-of-register discoveries

Security (pre-existing, outside the Product-Owner-approved 00198 scope — **not fixed; recommend PO-approved 00199 before any friendly trial**):

- **SEC-1 (critical)** `public.lock_and_reveal_award_atomic` (`00196:527-746`): SECURITY DEFINER with no caller authorization; `GRANT … TO authenticated, anon, service_role` (`00196:746`). An invited supplier knowing the RFQ id and its own quote id can lock the award to itself and receive buyer identity (`00196:721-729`). Bypasses anti-self-approval (PA-09).
- **SEC-2 (critical)** `public.admin_bulk_delete_users` (`00186:24`): check `is_platform_admin() OR auth.role()='authenticated' OR …` is true for any signed-in user; granted to anon (`00186:143`). Hard-deletes users. The UI entry points were removed this cycle; the RPC remains.
- **SEC-3 (critical)** `public.admin_execute_service_action(text,text,jsonb)` (`00131:316`): same always-true check incl. `anon`; granted to anon (`00131:525`); can force evaluation/award actions. Same pattern at `00131:27`, `00131:183`.
- **SEC-4 (high)** `public.admin_get_users_and_organizations()` (`00165:195`): always-true check; granted to anon (`00165:337`); roster PII exposure.
- **SEC-5 (high)** `public.upsert_buyer_address_atomic` (`00196:178-321`): edits `WHERE id = p_address_id` without verifying the existing row's owner; unsets old primary before existence check; granted to anon.
- **SEC-6 (high)** Supplier SELECT policy on `rfqs` (`00004:181-183`) exposes `delivery_address_snapshot`, `billing_address_snapshot` (`00196:97-99`), `organization_id`, `created_by` to invited suppliers.
- **SEC-7 (medium)** Buyer name sent to suppliers for `OPEN_RFQ` via `rfqs_supplier_masked` (`00117:126-133`), `publish_requirement` (`00180:221`), `supplier_rfq_message_payload` (`00037:177-179`), `messaging_quote_context` (`00037:997`), WhatsApp templates (`supabase/functions/_shared/messaging/templates.ts:32,162`). Needs a product decision.
- **SEC-8 (high, fixed client-side this cycle)** Profile credential OTP code was displayed on screen and a fake `123456` produced "verified" UI; the RPC still returns `otp_code` to the browser (server design issue).
- Admin approval RPCs default `p_initial_password` to a shared `'Welcome@OTP2026!'`.

Other (NEW DISCOVERY — OUT OF REGISTER):
- `apps/web/public/wa-*.png|jpg` WhatsApp screenshots are publicly served from `/public` (possible personal data). They were found deleted in the working tree without an owning change and were restored to keep this commit scoped; recommend review.
- `ActiveRfqExtendDeadlineModal.tsx` uses `toISOString().slice(0,16)` for a `datetime-local` value and `setHours(18…)` in browser-local time — deadlines can shift for non-IST browsers.
- `lib/pilots.ts:61` still carries `location: 'Tiruppur'` fixture data.
- `checkPilotAllowanceBeforePublish` allows publish when no organization id is present (individual buyers).
- Phone scrubber in supplier payloads also redacts any 10+ digit run (e.g. part numbers).
- Dock pages keep bottom padding sized for the old overlay nav (`AwardPage.tsx:296`, `CommitteeVotePage.tsx:207`, `SupplierRevealPage.tsx:161`, `PurchaseOrderDetailPage.tsx:950`, `DiscoverSuppliersPage.tsx:213`).
- Historical Golden Reconstruction documents still reference 197 migrations (historical snapshots, unchanged).

---

## L. Decision

**LOCAL CERTIFIED — PASS WITH DOCUMENTED NON-BLOCKING ITEMS**

All gates that can run locally pass. The documented items are non-blocking for this local code certification, **but SEC-1 to SEC-6 are blocking for starting a friendly trial** and require a Product-Owner-approved follow-up migration. Live-DB execution, real message delivery and real-device mobile rendering were not verified. This is not a production-readiness statement.
