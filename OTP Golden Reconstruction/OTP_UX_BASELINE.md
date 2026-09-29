# OTP UX Baseline

**Authority:** Level 1 — product UX intent, plus a separate list of observations  
**Baseline date:** 28 September 2026  
**Repository HEAD:** `7b1afc12ac7761efc206c70db80486612a34d146`

## Intended principle

> Simple clicks. Complex backend.

The buyer should tell, review, decide, and track. Quorum, conflict-of-interest, fee math, identity masking, and allowances stay on the server. The screen shows the next action and the reason a control is blocked.

This principle is the target. Several current screens do not meet it. Those gaps are listed as observations or as bugs already in the issue register. They are not all equal defects.

## Primary journey

| Step | Buyer should see | Supplier should see |
| --- | --- | --- |
| TELL | One place to describe the need and the place. | Nothing until invited. |
| REVIEW | Alias, price, delivery, warranty. No legal name. | The requirement without the buyer’s name, until award. |
| DECIDE | “You choose” for an individual. “The committee chooses” only after a real vote. | Waiting, or “not selected”, without the winner’s identity if they lost. |
| TRACK | Order, work, invoice, “pay the supplier and record the reference”. | Accept work, update milestones, invoice. |

Public labels already in `site-content.ts`: Request, Compare, Decide, Purchase, Track.

## Experience expectations

These are expectations for remediation, not claims that the current UI satisfies them.

- Mobile-first. Primary controls at least 44px. No horizontal scroll at 320, 360, 390, and 430px.
- One primary action per stage.
- Numbers on a card open the detail. The card does not dump the whole ledger.
- Printable records are A4 documents (parties, lines, tax, reference, page numbers), not a screenshot of the app. Issue 09 fixed the PO document model and left comparison and decision-receipt print on `window.print()`.
- Customer copy does not show internal flags, control ids, or source markup.
- Trust labels match stored facts. A GST badge appears only when `gst_verified` is true.
- Individual buyers do not see committee machinery.
- Suppliers see a short quote form: price, tax, delivery, warranty, then submit.

## Known observations (not automatically defects)

| Observation | Why it is not yet a defect |
| --- | --- |
| Signup asks who you are buying for before the first request. | A verification gate can be a real product choice. The missing piece is a clear wait state, which is a separate issue. |
| RWA and MSME agreements are long. | Governance has to be accepted. The defect is internal codes inside the agreement, not the existence of an agreement. |
| Pricing shows post-pilot prices during a free pilot. | Acceptable if every price is labelled “after the pilot”. The FAQ does that. The About page does not. That conflict is FIN-2, not a request to hide pricing. |
| A 15-step internal engine exists. | Fine if customers never see the step ids. |

## Known UX bugs already evidenced

Recorded in `OTP_MASTER_ISSUE_REGISTER.md` and `OTP_PUBLIC_SITE_TRUTH.md`. Short list:

- Discovery cards state GST, distance, and availability the database did not provide.
- Award screen says “Recorded Committee Consensus” unconditionally (`AwardPage.tsx`).
- Estate-manager home shows the literal `canVote: false`.
- Pricing shows `($\ge 2$)`.
- Public pages are wrapped in `MobileSimulatorFrame`, so “Desktop” and “Mobile” preview buttons render on the production marketing site (`SiteLayout.tsx`).
- `/register` is not a route. The catch-all sends it to `/`.
- PIN prefixes 560, 400, 110, and 600 show “active suppliers discovered and ready”.

## Browser evidence on 28 Sep 2026

A browser-only pass of `https://otpplatform-theta.vercel.app` (no repository access) saw the public site only. It confirmed draft legal banners, the fee-language split, the LaTeX, the `/register` redirect, the preview buttons, and shared pricing links to `/signup?side=buyer`. It did not sign in. Mobile overlap of the bottom bar was not fully stress-tested. Details: `OTP_AUDIT_HISTORY.md`.

## Developer controls that must not be customer UI

- `canVote = false` and `canVote: false`
- `PA-09`
- “Institutional Procurement OS”
- “sovereign spend authority”
- Desktop / Mobile preview toggles
- Raw LaTeX
- “Controlled Pilot Sandbox” as a customer badge, unless a product owner decides the pilot label stays

Removing those strings does not remove the underlying controls.
