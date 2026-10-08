# Financial runtime proof

## 2026-10-08

Local Docker is at `00251`. `00250` was not edited. `record_verified_payment` EXECUTE on local Docker: `anon` false, `authenticated` false, `service_role` true. An authenticated buyer call is permission denied. No supplier cashback was added. Hosted grants were not read. The hosted webhook is HTTP 404, so settlement was not executed on the hosted project.

The live bundle still contains TAN `BLR0998811`. A local production build of the working tree does not. The local build was not deployed.

## What was proven locally on 2026-10-07

Local Docker was then at migration `00250`. `tests/security/financial-authority-00250.test.ts` passed as part of 3 files / 25 tests against `127.0.0.1:54322` after `00246`–`00250` were applied. Those tests roll their own statements back. They were not pointed at the hosted project.

Local `record_verified_payment` EXECUTE is limited to `service_role` and the owner role. That is a catalog reading on Docker, not on `qsuvtcezffomtwzwyrso`.

`process_subscription_payment` in `00250` returns a simulation and does not write plan, status, or expiry. A client payment reference is not an activation on that local function. This was not called on the hosted database.

Supplier platform fee charged amount in `00250` is 0 under the pilot waiver. The defined rate remains 0.5 percent. Supplier cashback was not added. No statutory TDS rate was written into SQL. `00250` still says the TDS product decision is required, and that comment was not edited.

## What was proven on the public web bundle

Chunk `https://otpplatform-theta.vercel.app/assets/index-BaBAprvQ.js` contains the strings `Form 16A` and `BLR0998811`. That is the deployed placeholder certificate. It is not a statutory filing and it is not evidence of a TAN.

The working tree removes that generator. The working tree is not the deployed SHA.

## What was not proven

No hosted invoice, purchase order, wallet ledger, fee row, or subscription expiry was read. No payment was sent. `payment-webhook` HTTP 404, so a verified settlement was not accepted in production.

`record_verified_payment` in `00150` would still activate a subscription if a service-role caller reached it. `00250` intentionally does not replace that function. The HTTP caller is not deployed. This conflict is recorded and was not "fixed" by changing the payment policy.

## Decision

Financial lifecycle is **not certified** on the hosted pilot.
