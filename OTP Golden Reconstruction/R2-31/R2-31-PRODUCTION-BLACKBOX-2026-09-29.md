# R2-31 Production Black-Box Certification — 2026-09-29

## Test harness

| Item | Value |
|------|--------|
| Deployment URL | https://otpplatform-theta.vercel.app |
| Expected release SHA | 9cb4a037418893cbaf5c90b9f108884d32a1601b |
| SHA visible in UI | **NOT OBSERVABLE** (no browser session) |
| Method | cursor-ide-browser MCP only (no repo/source) |
| Tester date | 2026-09-29 |

## Browser attachment

**Browser attachment failed.**

1. `browser_navigate` to production URL returned: *"No browser tab available. Please navigate to a page first."* (attempt 1).
2. Retry with `newTab: true` — same error (attempt 2).
3. `browser_tabs` `action: "new"` reported created tab (`viewId` returned), but immediate `browser_navigate` with that `viewId` returned *"Browser view not found"*; `browser_tabs` `list` then showed **no open tabs**.
4. Repeat with `position: "active"` — same pattern (tab created, view not found on navigate, tab list empty).

No `browser_lock`, snapshots, logins, screenshots, or document flows were executed. **No passwords were entered.** No invented UI evidence.

## Ancillary reachability (non-UI)

PowerShell `Invoke-WebRequest -Method Head` returned HTTP **200** for the deployment URL. This does **not** satisfy R2-31 UI black-box gates (home render, login, wallet labels, documents).

## R2-31 functional gates

| Gate | Result | Notes |
|------|--------|--------|
| Document issuance | NOT TESTABLE | Browser attachment failed |
| Pre-reveal identity protection | NOT TESTABLE | Browser attachment failed |
| Identity reveal | NOT TESTABLE | Browser attachment failed |
| Original-document freeze | NOT TESTABLE | Browser attachment failed |
| Post-reveal document | NOT TESTABLE | Browser attachment failed |
| Integrity verification | NOT TESTABLE | Browser attachment failed |
| Buyer document access | NOT TESTABLE | Browser attachment failed |
| Supplier document access | NOT TESTABLE | Browser attachment failed |
| PDF | NOT TESTABLE | Browser attachment failed |
| Print | NOT TESTABLE | Browser attachment failed |
| Ledger/reporting | NOT TESTABLE | Browser attachment failed |

## Security / isolation

| Check | Result | Notes |
|------|--------|--------|
| Buyer/Supplier isolation | NOT TESTABLE | No login sessions |
| Identity leakage | NOT TESTABLE | No UI observed |
| Internal buyer information leakage | NOT TESTABLE | No UI observed |
| Wallet/persona isolation | NOT TESTABLE | IND-A / Supplier-A not exercised |

## Responsive

| Viewport | Result | Notes |
|----------|--------|--------|
| Desktop screenshots | NOT TESTABLE | Browser attachment failed |
| Mobile ~360×800 | NOT TESTABLE | Emulation not run |
| Landscape | NOT TESTABLE | Emulation not run |

## Defect register

| ID | Severity | Summary |
|----|----------|---------|
| — | — | **none observed** (no UI session; harness blocker only) |

## Certification outcome

Per runbook: when browser cannot attach, all R2-31 rows are **NOT TESTABLE**; **do not** claim **R2-31 PRODUCTION PASS** or **R2-31 CONDITIONAL PASS**. Automatic **R2-31 NO-GO** for production is **not** asserted solely on harness failure (HTTP 200 on HEAD).

**Final:** Production R2-31 black-box certification **not completed** — retry with working browser MCP attachment.
