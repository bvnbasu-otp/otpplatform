# Mobile product contract

This is the behaviour a phone-sized client must keep. It is not a visual design and not a native app. A native iOS or Android project was not found. `apps/web` is the client. `/mobile` renders `MobileShowcasePage` inside that web app. Status of a native app: `NOT-IMPLEMENTED`.

## Identity

- The customer sees prices, delivery, and warranty before legal names.
- Supplier legal name, phone, and email appear only from a reveal that the server accepts (`reveal_award` in `00244`, or the auto-reveal branch of `lock_and_reveal_award_atomic` in `00222`).
- A client must not show `suppliers.business_name` on the comparison screen.

## Decision

- The client does not choose the winner.
- RWA: the client may hide a vote button for an estate manager. The server still rejects the insert (`00238`). Hiding the button is not the control.
- A seat on the RFQ is not enough to vote.
- `DECLARED_CONFLICT` cannot be cleared by a client update (`00242`).

## Money and plans

- Show the three buyer types only.
- Allowances: 3 RFQs in the calendar month; yearly plans add 1 that expires with the quarter.
- Do not show Enterprise pricing as a plan the customer can buy.
- Do not show supplier cashback.
- Payment structures the server understands: single, 30/50/20, four times 25, custom with no invented schedule.
- The purchase-order total already includes GST and transport. Do not add GST again. Transport is not a second tax base.

## Channels

- A quote link may be opened at `/q/:token` without an account.
- Do not promise WhatsApp or SMS delivery.
- Do not label ONDC, BNI, or Google Places fixtures as a live network.
- If a Places result is shown, it must carry its real source. A static fixture is not a live Google result.

## Copy

Public sentences live in `apps/web/src/features/site/content/site-content.ts`. A second wording of “when is the name revealed” is how the product gets described wrongly. Link, do not paraphrase into a stronger claim.
