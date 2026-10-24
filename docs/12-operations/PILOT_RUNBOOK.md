# Pilot runbook

Product scope: [PILOT_SCOPE.md](../01-product/PILOT_SCOPE.md). Status of the policy: `IMPLEMENTED` in domain code. Status of a live cohort: `UNKNOWN`.

## What operators may tell a pilot customer

- The product is identity-protected competitive sourcing for an Individual, an RWA, or an MSME.
- The customer decides. OTP does not pick the supplier.
- Allowances in the local database are 3 RFQs in the UTC month, plus one non-carrying quarterly bonus on a yearly plan. The allowance is consumed by the first comparison-eligible supplier quote, not by publishing. A revision, retry, duplicate, or second eligible quote on that RFQ does not consume another. No qualifying response consumes nothing. Cancellation after consumption does not refund.
- A simulated extra-RFQ credit is usable only while its subscription has not expired, and only after the included allowance and quarterly bonus. It does not survive renewal. Cross-month charging is not defined; that quote fails closed.
- The buyer screen may show the allowance only after `get_buyer_pilot_allowance` returns. It must not tell a buyer with a confirmed credit to pay, and it must not publish when the check cannot be completed.
- Published prices are displayed. The pilot policy does not charge the subscription and does not charge the supplier platform fee. The purchase simulator is disabled. Do not say checkout or UPI collection is live.
- Buyer and Supplier EULAs are draft rows at `v1.0-20261014`, both pending legal approval. Enforcement is off and no rollout date is set. Existing users would have 30 calendar days only after a recorded rollout timestamp. Do not say either agreement is approved or that acceptance is currently enforced.
- Suppliers join the OTP registry or receive a direct link. WhatsApp messages (RFQ invitations, verification codes, registration notices) go through WAHA, the owner-confirmed **demo** provider. They depend on the operator's WAHA session being `WORKING` and its tunnel being up. Do not promise delivery, and do not tell suppliers they can quote by replying on WhatsApp (inbound is refused). See [WHATSAPP.md](../09-integrations/WHATSAPP.md).
- SMS is not available for the pilot. Do not tell anyone they will receive an SMS.
- ONDC is not connected.

## What operators must not tell them

- Enterprise onboarding.
- Supplier cashback.
- A count of suppliers, a response rate, or a “ready in your area” guarantee.
- That a Places discovery row is OTP-registered or GST-verified. Static Bengaluru fixtures exist only on the library adapter, not on the buyer edge path.
- That the hosted database is at any ceiling without reading it. HOSTED DATABASE CEILING NOT RE-VERIFIED IN THIS PHASE. Local files through `00290` are not hosted proof.
- That the pilot is green because local tests passed. Certification still needs hosted migration and runtime proof, plus legal approval of the Buyer and Supplier agreements and a GST review. None of those are recorded here.
- That a dual-role user has accepted the agreements. The database requires both `CUSTOMER_EULA` and `SUPPLIER_EULA` when both capabilities apply, and it keeps acceptance history. That rule is not in force while enforcement is off.

## Money

The buyer pays the supplier directly. The product can record an invoice (`submitInvoice`) and a payment reference (`record_invoice_payment_atomic`). Pilot policy does not charge the subscription or the supplier platform fee. Live collection of the 0.5% fee is `UNKNOWN`.

## Who operates release steps

Git commit, git push, and hosted `supabase db push` are done by the user. This runbook does not perform them. `deploy-prod.ps1` is LOCAL DOCKER ONLY (DEFECT-02) and is not the hosted migration.

## Support address

`SupportHelpButtonModal.tsx` uses `VITE_SUPPORT_ADMIN_EMAIL` or a fallback address compiled in the file. Confirm the live value in the host before publishing it in a customer mail. The fallback string is source, not an operations certificate.
