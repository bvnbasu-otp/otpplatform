# Documentation status

Inspected 2026-10-07. Nothing in `OTP Golden Reconstruction/` or the historical `docs/00`–`docs/15` suite was deleted.

## Which tree wins

The canonical pilot-freeze source is the subdirectory tree linked from [docs/README.md](../README.md), and the status table is [CAPABILITY_STATUS.md](../13-truth/CAPABILITY_STATUS.md).

`OTP Golden Reconstruction/` is historical evidence: certifications, forensics, and release notes. It is retained. It does not override the canonical tree.

`docs/00-DOCUMENTATION-INDEX.md` and `docs/01-PLATFORM-OVERVIEW.md` through `docs/15-PRODUCTION-READINESS-AND-CTO-CLEARANCE-REPORT.md`, plus `docs/RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md` and `docs/STANDALONE-OPERATIONS-RUNBOOK.md`, are an older suite. They still describe a Phase 7.1 narrative (185 migrations, commit `c5c97ca` in the index body). They are retained. The banner on `docs/00-DOCUMENTATION-INDEX.md` points here. Those files are superseded. The canonical numbered tree wins.

## Inventory

| Path | Disposition | Why |
| --- | --- | --- |
| `README.md` | Rewrite of the entry point only | It named migration `00215` and SHA `7b1afc12` and pointed at Golden Reconstruction as authority. It now points at `docs/README.md`. |
| `docs/00-DOCUMENTATION-INDEX.md` | Retain, banner updated | Historical map. Banner now names the canonical tree. Body below the banner is unchanged and is not authoritative. |
| `docs/01-PLATFORM-OVERVIEW.md` … `docs/15-*.md` | Retain as archive | Older certification narrative. Do not use for status. |
| `docs/RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md` | Retain | Useful product language was read as historical input, then checked in code. |
| `docs/STANDALONE-OPERATIONS-RUNBOOK.md` | Retain | Superseded for operations by `docs/12-operations/`. Not deleted. |
| `OTP Golden Reconstruction/**` | Retain | Forensic and certification evidence. Includes uncommitted notes. Not a second authority. |
| `archive/qa/` | Retain | Named by the old index. Not re-audited file by file. |
| New `docs/00-governance` through `docs/15-change-management` | Canonical set | Includes Phase 2 additions: `BUSINESS_MODEL.md`, `PUBLIC_PILOT_TRUTH.md`, `RELEASE_DOCUMENTATION_PROTOCOL.md`, and the expanded wiring and findings register. |

## Gaps left on purpose

- The historical suite was not line-edited to remove stale claims inside each old file. The banner plus this page is the conflict rule.
- Golden Reconstruction was not summarized document by document. Facts used from it were re-checked in code before they were written into the canonical tree.
