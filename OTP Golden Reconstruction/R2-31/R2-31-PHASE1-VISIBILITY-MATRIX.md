# R2-31 Phase 1 — Visibility Matrix

**Baseline:** `c444df6a2b8ca268c5b5233bd3a61ec2c34181b5`  
**Policy inputs:** `rfq.reveal_status`, award status, `ProcurementDocumentPhase` (`procurement-document.ts`), SQL views `quotes_identity_protected` / `quotes_revealed` (`00136`, `00178`), RLS on org/supplier membership.

**Legend:** ● visible (real data) · ○ pseudonym / redacted · ✕ hidden · — not applicable

---

## 1. Identity phases

| Phase | SQL / product signal | Document `identity_state` |
|-------|----------------------|-------------------------|
| Pre-reveal | `rfq.reveal_status` ≠ `REVEALED` or award not fully revealed | `PRE_REVEAL` |
| Post-reveal | `rfq.reveal_status = REVEALED` and awarded supplier identified per policy | `POST_REVEAL` |

Map `PRE_AWARD` / `POST_AWARD` in `procurement-document.ts` to the above (C-07).

---

## 2. Matrix — document × persona × phase

### Buyer org member (Individual / RWA owner / MSME primary)

| Data element | Pre-reveal | Post-reveal |
|--------------|------------|-------------|
| Own org name, address, GSTIN, contacts | ● | ● |
| Competing supplier legal names | ○ pseudonym (`supplierPseudonym`) | ● on comparison; losers may stay sealed per `quotes_revealed` rules |
| Competing supplier GSTIN/address | ○ withheld | ● if quote policy allows post-award audit |
| Awarded supplier name | ○ or ● if buyer-only lock view | ● |
| Committee votes / weighted tally | ● (buyer governance) | ● |
| Smart Merit scores | ● | ● |
| COI declarations | ● | ● |
| Evaluation narrative | ● | ● |
| Other suppliers’ sealed bid details (non-winner) | ✕ or ○ per `quotes_revealed` | ✕ for non-selected |

### RWA committee member / manager / delegate

Same as buyer org member **for documents scoped to their org and role**; delegate sees only delegated RFQs (existing role gates — do not expand in R2-31).

### Supplier (invited / quoting / awarded)

| Data element | Pre-reveal | Post-reveal |
|--------------|------------|-------------|
| Buyer legal name | ○ `PROTECTED_BUYER_LABEL` on supplier-facing docs | ● on PO/invoice/settlement |
| Buyer GSTIN/PAN/address | ○ | ● on bilateral fulfillment docs |
| Own quote identity | ● self | ● |
| **Other suppliers** names, quotes, prices | ✕ | ✕ |
| Committee votes / COI / internal evaluation | ✕ | ✕ |
| Smart Merit breakdown vs competitors | ✕ | ✕ |
| Winner identity (if not self) | ○ or ✕ | ● only if awarded to them; else ○ sealed |
| Decision receipt merit table | ✕ other rows | Limited to reveal policy |

### Supplier (non-participant)

✕ all procurement documents except public marketing.

### Founder / platform admin

● all fields subject to audit policy; **founder reports not rendered on buyer/supplier routes.**

---

## 3. Document kind rollup

| Document | Buyer pre | Buyer post | Supplier pre | Supplier post | Snapshot required |
|----------|-----------|------------|--------------|---------------|-------------------|
| Quote comparison A4 | ○ competitors | ●/○ mix | ✕ or self only | self ● | Yes |
| Evaluation export | ● | ● | ✕ | ✕ | Yes (buyer) |
| Decision receipt | ● governance | ● | ○/● if awarded | ● if awarded | **Yes** |
| PO A4 | ● buyer; ○ supplier on pre-award N/A | ● bilateral | ○ buyer | ● bilateral | Yes |
| Tax invoice A4 | ● | ● | ○ buyer | ● bilateral | Yes |
| Period procurement report | ● org PO list | ● | ✕ | ✕ | Optional |
| Wallet statement | ● own wallet | ● | ● own wallet | ● | No (ledger is source) |
| OTP fee statement | ● own fees | ● | ● own fees | ● | No |
| Founder revenue report | ✕ on buyer UI | ✕ | ✕ | ✕ | N/A |

---

## 4. Enforcement layers

1. **SQL views** — `quotes_identity_protected` for live reads.  
2. **DocumentPolicy** — before building `ProcurementDocumentInput`.  
3. **Issued snapshot** — reprint uses frozen `visibility_context` + `payload_json` (00222).  
4. **RLS** — org/supplier scoping on snapshot SELECT.

---

## 5. Explicit prohibitions (design)

- Supplier never receives another supplier’s protected quote/evaluation/committee data.  
- Supplier never receives buyer committee internals or COI of other members.  
- Wallet statement never shows another org’s credits or procurement GMV.  
- Buyer period report never shows founder-only OTP revenue totals.

---

**End visibility matrix.**
