# OTP POST-00219 Remaining Risk Register — 2026-09-28

**Context:** Focused fixture retest + paired behavioural retest (QA-AUDIT-2026-09).  
**Migration ceiling:** Operator claim 00219 — full **00216–00219** behavioural proof **not complete**.

---

## Open items (prioritized)

| ID | Severity | Domain | Risk | Status this pass | Recommended action |
|----|----------|--------|------|------------------|-------------------|
| R-001 | **P2 (product)** | QA fixtures | RWA-A-MEMBER org ≠ RWA-A-ADMIN — admin/member tests invalid | **Still observed** | Complete **+ Invite** at `/org/members` + **email acceptance** for member QA mailbox |
| R-002 | **P2 (product)** | Portal persona | Supplier accounts show **buyer** cockpit; `/supplier/quotes` → buyer dashboard | **Still observed** | Product onboarding / `active_portal_side` (not a demonstrated data leak) |
| R-003 | **P2 (product)** | SUPPLIER-B | `active_organization_id` **null** | **Still observed** | Complete supplier org onboarding in UI |
| R-004 | **P1 (process)** | Coverage | RFQ/quote/invoice/settlement — no **QA-AUDIT-2026-09** fixture | **BLOCKED** | Create RFQ via UI (`+ Create Requirement`) without payment |
| R-005 | **P1 (process)** | Evidence pairing | Six unauthorized denials without authorized success legs | **INSUFFICIENT EVIDENCE** | Safe fixtures + platform-admin QA actor |
| R-006 | **P2 (process)** | Migration ceiling | 00219 not CLI-verified in auditor shell | **Unchanged** | Operator migration list from authenticated CLI |
| R-007 | **P3 (process)** | Verification | Gmail not read | **BLOCKED** | Human or test inbox |
| R-008 | **P3 (product)** | Rewards | Supplier offset rules undefined | **PRODUCT DECISION REQUIRED** | Product decision |
| R-009 | **P2 (process)** | Admin controls | No platform-admin QA identity | **BLOCKED** | Dedicated admin QA actor |
| R-010 | **P3 (tooling)** | Audit | cursor-ide-browser unavailable | **Unchanged** | IDE browser or Playwright |

---

## Confirmed this pass (de-risked)

| Item | Note |
|------|------|
| QA password login | **7/7** |
| Anon `demo_status` | **401** deny (unpaired) |
| Non-admin signup review | **400** deny (unpaired) |
| Approval stage direct INSERT | **400** `APPROVAL-STAGE-DIRECT-WRITE` (unpaired) |
| Cross-org RFQ reads | Empty for IND-A (general + RWA-A org filter) — **paired** |
| Cross-supplier supplier read | **400** both directions — **paired deny** |
| Workspace pane error | **Not reproduced** (7/7) |
| WhatsApp error strings | **Not reproduced** (7/7 dashboard) |

---

## Migration candidates

**Count: 0** — no new defect requiring migration from this black-box pass alone.

---

## Financial / data safety

| Check | Result |
|-------|--------|
| Production DB directly modified | **NO** |
| Real payments / settlements | **NO** |
| QA commercial chain completed | **NO** |
| Secrets in reports | **NO** |

---

## Section 19 — Executive counts

| Metric | Count |
|--------|------:|
| **BEHAVIOURALLY VERIFIED** | **8** |
| **BEHAVIOURALLY FAILED** | **0** |
| **BLOCKED** | **29** |
| **NOT APPLICABLE** | **1** |
| **PRODUCT ISSUE — NOT SECURITY** | **4** |
| **INSUFFICIENT EVIDENCE** | **5** |
| **NOT REPRODUCED** | **2** |
| **PRODUCT DECISION REQUIRED** | **1** |
| Confirmed **P0** security | **0** |
| Confirmed **P1** security | **0** |
| Confirmed **P2** / **P3** | **2** / **3** |
| New migration candidates | **0** |
| Production DB directly modified | **NO** |
| Security config modified | **NO** |
| Real financial settlement | **NO** |
| QA identities — login success | **7 / 7** |
| Paired controls fully closed | **2** |
| Unauthorized-only verified denials | **6** |
