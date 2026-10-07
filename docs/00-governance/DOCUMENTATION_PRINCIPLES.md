# Documentation principles

Canonical tree: [docs/README.md](../README.md). Status words: [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md).

## What a document may claim

A sentence is allowed only when a file in this repository, a function name, or a config key supports it. Code, UI copy, SQL, tests, READMEs, roadmaps, and demo seeds are evidence of what the repository contains. They are not evidence that the hosted database or `https://otpplatform-theta.vercel.app` is running that revision.

Allowed status labels, and no others:

`LIVE-VERIFIED`, `LIVE-CONFIGURED`, `IMPLEMENTED`, `CONFIG-GATED`, `EXTERNAL-DEPENDENCY`, `PARTIAL`, `STUB/MOCK`, `PLANNED`, `NOT-IMPLEMENTED`, `UNKNOWN`.

`LIVE-VERIFIED` requires an observation of the running system made in the same effort that writes the sentence. This reconstruction did not browse the production site, did not call Supabase, and did not deploy. Nothing in the new tree is `LIVE-VERIFIED`.

## Consistency

[CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md) is the only status table. Other documents repeat a status only by using the same label for the same capability. If a later edit changes a status, change that table first.

Mark `UNKNOWN` rather than filling a gap. Do not draw a state machine for states that were not read.

## Secrets

Name environment variables. Do not copy secret values, webhook fallbacks, tokens, or connection strings into documentation.

## What this reconstruction will not do

It does not add product features, providers, or customer categories so that a document has something to describe. Enterprise is not a customer type. Supplier cashback is not a supplier-wallet event. P0–P4 remediations are closed and are not reopened here. A defect found while reading is recorded in [DOCUMENTATION_DISCOVERED_DEFECTS.md](../13-truth/DOCUMENTATION_DISCOVERED_DEFECTS.md) and is not silently patched.

## Historical material

`OTP Golden Reconstruction/` and `docs/00-DOCUMENTATION-INDEX.md` through `docs/15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md` stay on disk. See [DOCUMENTATION_STATUS.md](./DOCUMENTATION_STATUS.md).
