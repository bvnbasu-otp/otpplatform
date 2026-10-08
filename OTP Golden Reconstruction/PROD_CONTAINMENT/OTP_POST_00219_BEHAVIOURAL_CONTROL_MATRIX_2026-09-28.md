# OTP POST-00219 Behavioural Control Matrix — 2026-09-28

**Environment:** https://otpplatform-theta.vercel.app (production)  
**QA label:** QA-AUDIT-2026-09  
**Method:** Black-box UI (Playwright, 7 identities) + Supabase REST/RPC with QA JWTs; anon key from public bundle (not logged in reports).  
**cursor-ide-browser:** **Unavailable** (no tab).

**Legend:** Classifications are runtime behavioural only. Post-00219 controls **00216–00219** are **not** declared fixed from code. **BEHAVIOURALLY VERIFIED** requires **both** authorized and unauthorized legs where both are safely exercisable.

---

## Summary counts (Section 19)

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
| Confirmed **P0** security (this pass) | **0** |
| Confirmed **P1** security (this pass) | **0** |
| Confirmed **P2** / **P3** | **2** / **3** |
| New migration candidates | **0** |
| Production DB directly modified | **NO** |
| Security config modified | **NO** |
| Real financial settlement | **NO** |
| QA identities — login success | **7 / 7** |
| Paired controls fully closed | **2** |
| Unauthorized-only verified denials | **6** |

---

## Control matrix

| Control | Authorized actor | Authorized result | Unauthorized actor | Unauthorized result | Final classification |
|---------|------------------|-------------------|----------------------|---------------------|----------------------|
| Anon `demo_status` | Platform user (not run) | N/A | anon | HTTP **401**, permission denied | **INSUFFICIENT EVIDENCE** (unauth deny only) |
| Anon `credit_buyer_settlement_reward_atomic` | Buyer settlement (not run) | N/A | anon | HTTP **404** (not exposed) | **INSUFFICIENT EVIDENCE** (unauth deny only) |
| Anon `lock_and_reveal_award_atomic` | Buyer manager (not run) | N/A | anon | HTTP **404** | **INSUFFICIENT EVIDENCE** (unauth deny only) |
| `admin_review_signup_request` | Platform admin (not run) | N/A | SUPPLIER-A | HTTP **400**, platform admin required | **INSUFFICIENT EVIDENCE** (unauth deny only) |
| `get_organization_wallet` own org | IND-A | HTTP **200**, ok wallet ACTIVE | anon (not run) | N/A | **INSUFFICIENT EVIDENCE** (authorized only) |
| Approval stage direct INSERT | RPC approver path (not run) | N/A | RWA-A-ADMIN direct POST | HTTP **400**, `APPROVAL-STAGE-DIRECT-WRITE` | **INSUFFICIENT EVIDENCE** (client write deny only) |
| Cross-org RFQ list | IND-A own org (no rows) | HTTP **200**, count **0** | IND-A query RWA-A org id | HTTP **200**, count **0** | **BEHAVIOURALLY VERIFIED** (no cross-org rows) |
| Cross-supplier `suppliers` read A→B | SUPPLIER-B own row (not isolated) | N/A | SUPPLIER-A foreign id | HTTP **400** | **BEHAVIOURALLY VERIFIED** (deny) |
| Cross-supplier `suppliers` read B→A | SUPPLIER-A own row (not isolated) | N/A | SUPPLIER-B foreign id | HTTP **400** | **BEHAVIOURALLY VERIFIED** (paired deny legs) |
| Buyer `/supplier/quotes` | — | — | IND-A, IND-B | Redirect **`/dashboard`**, buyer UI, no supplier data | **PRODUCT ISSUE — NOT SECURITY** |
| Supplier `/supplier/quotes` | SUPPLIER-A supplier workspace (expected) | Not reached | SUPPLIER-A | Redirect **`/dashboard`** (buyer UI) | **PRODUCT ISSUE — NOT SECURITY** |
| Supplier `/supplier/quotes` | SUPPLIER-B supplier workspace (expected) | Not reached | SUPPLIER-B | Redirect **`/dashboard`** | **PRODUCT ISSUE — NOT SECURITY** |
| RWA admin vs member same org | RWA-A-ADMIN + MEMBER | Shared org expected | — | **Different** `active_organization_id` | **BLOCKED** (fixture) |
| RWA admin-only op / member op | Admin + member | Not run | — | Membership fixture **BLOCKED** | **BLOCKED** |
| QA RFQ create **QA-AUDIT-2026-09** | IND-A | Not run | IND-B read/mutate | No RFQ fixture | **BLOCKED** |
| Quote isolation SUPPLIER-A vs B | SUPPLIER-A | Not run | SUPPLIER-B | No RFQ/quote | **BLOCKED** |
| RFQ status PATCH (00218) | Valid transition | Not run | Invalid / foreign | No RFQ rows | **BLOCKED** |
| Tier approval RPC success (00219) | Approver | Not run | Outsider | No RFQ | **BLOCKED** |
| Invoice / payment guards | Buyer / supplier roles | Not run | Wrong role | No invoice | **BLOCKED** |
| Wallet credit / award success | Buyer QA | Not run | anon / foreign | No settlement chain | **BLOCKED** |
| Platform admin positive RPCs | Platform admin QA | Not run | — | No admin actor | **BLOCKED** |
| Public GET `/`, `/login`, `/signup` | Anonymous | HTTP **200** | N/A | N/A | **NOT APPLICABLE** |
| Workspace pane error (7 identities) | — | — | — | **Not reproduced** on `/dashboard` | **NOT REPRODUCED** |
| WhatsApp registration error strings | — | — | — | **Not reproduced** in probed UI | **NOT REPRODUCED** |
| Supplier reward / fee offset rules | Product owner | Not defined in UI | — | — | **PRODUCT DECISION REQUIRED** |

*(Remaining post-00219 commercial controls D–N from prior matrix stay **BLOCKED** for lack of RFQ/PO/invoice/payment fixtures; no new unauthorized **write** or cross-tenant **read** demonstrated in this pass.)*

---

*This matrix does not certify OTP secure overall.*
