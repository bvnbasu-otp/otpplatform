# OTP Deferred Features

**Authority:** Level 6 — future / deferred  
**Baseline date:** 28 September 2026

These are not defects in the current pilot baseline. A later agent must not file them as “missing production features” unless a product owner pulls them into scope.

| Item | Why it is deferred |
| --- | --- |
| Live ONDC participation | Adapter is explicitly not a truthful live integration. FAQ says not yet. |
| Live BNI participation | Stub adapter. FAQ says not yet. |
| Association network adapter | Same stub pattern. |
| Turning Google Places hits into verified suppliers | Places discovery may exist as a search. It is not verification. |
| A native mobile app | The web app is the client. |
| New payment collection, escrow, or OTP-operated settlement rails | Current settlement UI is record-only. Changing that is a product decision (FIN-1), not a silent build. |
| Commercial subscription charging | Pilot policy says ₹0. Turning charging on is a product decision after the money sentences match. |
| Cash withdrawal of wallet credits | Domain policy says non-cash and non-withdrawable. |
| Extra AI intake features | Voice intake exists. New model features are out of scope. |
| Blockchain, extra microservices, extra analytics products | Not required to tell, review, decide, and track. |
| Rewriting `docs/01`–`docs/15` into a second architecture | Those files stay historical. Current truth is the golden index. |
| Quote-comparison and decision-receipt A4 print | Issue 09 deferred this. PO print model exists. |
| Full external-network supplier graph | The pilot network is approved OTP suppliers plus explicit invites. |

Deferred does not mean the stubs may be enabled. Enabling ONDC or the quote simulator in a real pilot would create false suppliers or false quotes. Keep the flags off until a later, explicit project.
