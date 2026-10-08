# Public truth certification

## 2026-10-08

Live site, not the working tree: `/assets/index-BaBAprvQ.js` still contains `Form 16A`, TAN `BLR0998811`, and PAN `AAACB1234F`. `/assets/index-C-tWaO3v.js` contains `3 requests a month` and the quarterly extra. The entry bundle contains `Not connected` for ONDC. A local `vite build` of the working tree, not deployed, does not contain the TAN or PAN. Its TDS sentence says this is not a Form 16A certificate. Public truth on the hosted site is not certified.

Host: `https://otpplatform-theta.vercel.app`. Bundle fetched 2026-10-07. No login.

| Claim | Evidence | Result |
| --- | --- | --- |
| Allowance sentence: 3 requests a month, 1 extra each quarter on a yearly plan | Present in live chunk `/assets/index-C-tWaO3v.js` as `3 requests a month`. Main bundle also contains the quarterly bonus label. | PRESENT |
| Customers are Individual, RWA, MSME | `PricingPage.tsx` renders those three cards. The page was not clicked in a browser. | SOURCE MATCHES. BROWSER CLICK NOT DONE. |
| Enterprise is not a customer type | Live main bundle still contains the internal tier object `Enterprise & Institutional` and a demo badge `Enterprise Lead`. It is not a fourth card in `PricingPage.tsx`. | NOT A PUBLIC PRICING CARD IN SOURCE. OBJECT STILL SHIPS. |
| Supplier platform fee 0.5% with pilot waiver | Live bundle text: defined commercial fee 0.50% of purchase-order gross, plus 18% GST on that fee, and the pilot does not charge it. | PRESENT |
| Supplier cashback | Live bundle: supplier cashback is not a product. | PRESENT |
| WhatsApp and SMS | Live bundle contains `Not yet live` and `WhatsApp and SMS`. | NOT CLAIMED AS LIVE |
| ONDC | Live bundle contains `Not connected`. HTTP paths are the SPA. | NOT CLAIMED AS LIVE |
| e-invoice, e-way bill | Those strings were not in the main bundle. | NOT CLAIMED |
| Form 16A | Live chunk `/assets/index-BaBAprvQ.js` contains `Form 16A` and placeholder TAN `BLR0998811`. | FALSE ARTIFACT STILL DEPLOYED |
| Google Places as verified suppliers | Read-only coverage for PIN `560048` returned zero suppliers and `NEVER_DISCOVERED`. | NOT CLAIMED BY THAT CALL |

## Decision

Public pricing and channel limits that were scanned match the pilot sentences, except the deployed Form 16A placeholder. Public truth is **not certified**.
