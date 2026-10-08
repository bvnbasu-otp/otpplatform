# Security runtime proof

## 2026-10-08 local, not hosted

`tests/security/subscription-persona-authority.test.ts` rolled back on local Docker. Buyer, RWA member, RWA manager, MSME committee member (the stored stand-in for delegate; the member enum has no DELEGATE), supplier, and anon cannot update `subscription_plan`, `subscription_status`, or `subscription_expires_at`, and cannot execute `platform_admin_set_organization_subscription_status`. A platform admin direct update is rejected. The same admin's RPC sets status ACTIVE and leaves plan and expiry unchanged. `anon` and `authenticated` cannot execute `record_verified_payment`.

Hosted attack tests were not run. Production rows were not modified.

## Local baseline after 00250

After `supabase migration up --local` applied `00246` through `00250`, this command passed:

`vitest run tests/security/verified-remediation-00216-database.test.ts tests/security/subscription-entitlement-authority-00249.test.ts tests/security/financial-authority-00250.test.ts`

Result: 3 files, 25 tests, passed. Duration about 43 seconds. Target `127.0.0.1:54322` only.

EXECUTE on `record_verified_payment` was not granted to `anon` or `authenticated`.

## Hosted

No service-role key, database password, or access token was used. No mutating request was sent to the hosted database.

`payment-webhook` is HTTP 404, so hosted signature rejection was not observed.

`otp-dispatch` is HTTP 404, so a hosted OTP response shape was not observed. The function's source contract is success or failure only, without returning the code. That contract was not runtime-proven.

`location-pin-coverage` rejects unauthenticated discovery with HTTP 401. That is a hosted authorization check for the discovery flag. It is not a full tenant or IDOR pass.

Admin supplier verification on the deployed SHA still updates `subscription_status` from the browser client. Migration `00249` is written to reject that update for `authenticated`. Whether hosted has `00249` was not independently read. The working-tree RPC call is not deployed.

Hidden menus were not treated as authorization.

## Decision

Security is **not certified** for the hosted pilot.
