# Pilot runbook

Product scope: [PILOT_SCOPE.md](../01-product/PILOT_SCOPE.md). Status of the policy: `IMPLEMENTED` in domain code. Status of a live cohort: `UNKNOWN`.

## What operators may tell a pilot customer

- The product is identity-protected competitive sourcing for an Individual, an RWA, or an MSME.
- The customer decides. OTP does not pick the supplier.
- Allowances in code are 3 RFQs in the calendar month. A yearly plan adds 1 RFQ in the calendar quarter that does not carry.
- Published prices are displayed. The pilot policy does not charge the subscription and does not charge the supplier platform fee.
- Suppliers join the OTP registry or receive a direct link. They are not sent the RFQ on WhatsApp or SMS unless a later, proven provider cutover says so. That cutover is not proven.
- ONDC is not connected.

## What operators must not tell them

- Enterprise onboarding.
- Supplier cashback.
- A count of suppliers, a response rate, or a “ready in your area” guarantee.
- That a Places discovery row is OTP-registered or GST-verified. Static Bengaluru fixtures exist only on the library adapter, not on the buyer edge path.
- That the hosted database is at `00245` without reading it. HOSTED DATABASE CEILING NOT RE-VERIFIED IN THIS PHASE.

## Money

The buyer pays the supplier directly. The product can record an invoice (`submitInvoice`) and a payment reference (`record_invoice_payment_atomic`). Pilot policy does not charge the subscription or the supplier platform fee. Live collection of the 0.5% fee is `UNKNOWN`.

## Who operates release steps

Git commit, git push, and hosted `supabase db push` are done by the user. This runbook does not perform them. `deploy-prod.ps1` is LOCAL DOCKER ONLY (DEFECT-02) and is not the hosted migration.

## Support address

`SupportHelpButtonModal.tsx` uses `VITE_SUPPORT_ADMIN_EMAIL` or a fallback address compiled in the file. Confirm the live value in the host before publishing it in a customer mail. The fallback string is source, not an operations certificate.
