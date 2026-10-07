# Black-box testing

Status of a current black-box run: `UNKNOWN`. Phase 2 did not execute one. Phase 1’s 78 unit tests are not a black-box pass.

## Commands that exist

| Script | File |
| --- | --- |
| `pnpm test:smoke` | `scripts/test-live-smoke.ts` |
| `pnpm test:live` | `scripts/run_live_automated_tests.ts` |

What those scripts hit, and whether they passed, was not read as a result. Do not mark them passed.

## Historical notes

`OTP Golden Reconstruction/R2-31/` contains black-box and release notes, including files that are dirty in the working tree. They are evidence of past write-ups, not a current pass. The canonical status remains [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md).

## What a black-box check would have to show before anyone writes LIVE-VERIFIED

- The public URL’s deployed SHA.
- The hosted migration version, read from the database, not from the file ceiling.
- A supplier invite that does not arrive on WhatsApp or SMS unless `MESSAGING_PROVIDER` is a real provider and a handset received it.
- Places responses labelled with the real `sourceType`, never a fixture labelled as a live Google result.

Those checks were not done.
