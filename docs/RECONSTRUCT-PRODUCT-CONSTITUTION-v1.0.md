# OTP — OPEN TRADE & PROCUREMENT

## Product Constitution v1.0

### Documentation Freeze Draft

**Status:** DRAFT — HUMAN REVIEW REQUIRED  
**Product:** OTP — Open Trade & Procurement  
**Primary Market:** India  
**Customer Buyer Contexts:** Individual, RWA, MSME  
**Platform Participant:** Supplier  
**Platform Roles:** Superadmin, CEO/Founder, Operations/Support  
**Enterprise:** OUT OF PRODUCT SCOPE  

---

# 1. PURPOSE OF OTP

OTP — Open Trade & Procurement — is a procurement platform designed to perform the complex procurement work behind a simple customer experience.

The fundamental product principle is:

> **OTP does the procurement work. The customer makes the decision.**

OTP should make procurement:

* simple
* transparent
* identity-protected where appropriate
* auditable
* governed
* financially controlled
* mobile-first
* easy for non-expert buyers

The complexity belongs primarily in the backend.

The customer experience should remain simple.

---

# 2. OTP CUSTOMER SCOPE

OTP has exactly **three buyer contexts** in the current product:

```text
1. Individual
2. RWA
3. MSME
```

There is no Enterprise buyer persona in the current OTP product.

Enterprise is explicitly excluded from:

* buyer registration
* buyer onboarding
* buyer dashboards
* buyer workflows
* organization model
* approval model
* navigation
* product terminology
* procurement journeys
* documentation
* UX
* reconstruction scope

Existing enterprise-related implementation artifacts may remain temporarily where they are shared infrastructure, but they must be classified and must not create Enterprise behavior in the customer-facing product.

---

# 3. OTP CUSTOMER CONTEXTS

## 3.1 Individual

An Individual is a person purchasing for themselves.

The Individual experience is:

* self-contained
* personal
* simple
* independent of organizations

An Individual does NOT have:

* committee members
* team members
* delegates
* organizational voting
* quorum
* organizational approval chains

An Individual may:

* create personal requirements
* create procurement requests/RFQs
* evaluate offers
* make personal procurement decisions
* purchase products/services/projects
* maintain personal addresses
* manage personal procurement history

---

# 4. INDIVIDUAL + OTHER LEGITIMATE CONTEXTS

A person is not restricted to being only an Individual.

The same person may legitimately have multiple contexts.

For example:

```text
Person A
│
├── Individual Buyer
│
├── Resident Owner — RWA X
│
├── Committee Member — RWA X
│
└── Primary — MSME Y
```

These contexts are independent.

Authority granted by one context MUST NOT automatically create authority in another context.

For example:

```text
RWA Treasurer authority
≠
MSME authority

MSME Primary authority
≠
Individual authority
```

OTP must evaluate authorization using the relevant context.

---

# 5. RWA

RWA represents a residential/community organization using OTP for collective procurement.

An RWA has:

* organization identity
* registered/official information
* operational information
* resident-owner eligibility
* committee membership
* committee roles
* responsibilities
* voting/approval authority
* procurement history
* financial/procurement records

RWA procurement may require committee governance according to the applicable transaction and authority rules.

---

# 6. RWA RESIDENT-OWNER PRINCIPLE

A person may be a committee member of an RWA only when the person satisfies the applicable resident-owner eligibility requirement and has been legitimately appointed/invited to the committee.

Therefore:

```text
Resident Owner
    ≠
Automatic Committee Member
```

A resident owner cannot self-appoint.

A random OTP user cannot add themselves to an RWA committee.

Committee membership requires legitimate RWA authorization.

---

# 7. RWA COMMITTEE ROLES

OTP must support the RWA committee role model without treating any role as permanently belonging to a person.

At minimum:

* President
* Vice President
* Secretary
* Joint Secretary
* Treasurer
* Other Committee Members

Additional roles may be introduced without redesigning the underlying role architecture.

Roles are organizational assignments.

Therefore:

```text
Role ≠ Person
```

A person holds a role for a defined period.

---

# 8. RWA ROLE SUCCESSION

Every RWA role must support:

* appointment
* activation
* responsibility assignment
* authority assignment
* effective start
* effective end
* replacement
* resignation
* removal
* eligibility termination

Example:

```text
President
Person A
2025 → 2026

President
Person B
2026 → current
```

Person A's historical actions remain attributed to Person A.

Person B receives current President authority from the effective date.

Person B does not become Person A.

This applies equally to:

* President
* Vice President
* Secretary
* Joint Secretary
* Treasurer
* Committee Member
* future RWA roles

---

# 9. RWA MEMBER REMOVAL

A committee member may cease to have committee authority because of:

* resignation
* removal
* role completion
* replacement
* loss of resident-owner eligibility
* moving out of the RWA
* other authorized governance events

When committee authority ends:

```text
Future authority = revoked
Historical actions = preserved
Historical actor = unchanged
```

A former committee member may continue using their Individual account where applicable.

A person who moves out of the RWA loses future RWA authority but does not lose legitimate historical attribution.

---

# 10. RWA HISTORICAL CONTINUITY

The RWA organization continues even when people holding roles change.

Historical records MUST remain associated with the person who actually performed the action.

Example:

```text
2025
Approved by: Person A
Role: Treasurer

2026
Current Treasurer: Person B
```

Person B may receive authorized historical visibility as the current Treasurer.

Person B cannot:

* rewrite Person A's approval
* change Person A into the actor
* modify historical votes
* modify historical role attribution
* impersonate Person A

Therefore:

> **Historical visibility is not historical authority.**

---

# 11. RWA MANAGER

The RWA manager is an operational role and does not automatically become a committee member or receive committee voting authority.

A manager may have authority to perform permitted operational tasks.

However, where governance requires a valid committee forum:

```text
No valid committee forum
        ↓
No committee-governed transaction approval
```

The backend must enforce this.

The UI must not be the only enforcement layer.

---

# 12. MSME

MSME represents a business using OTP for procurement.

An MSME has:

* business identity
* legal/registered information where applicable
* operational information
* Primary/Owner
* members
* managers where applicable
* delegates
* roles
* responsibilities
* approval authority
* delegation authority
* procurement history

---

# 13. MSME PRIMARY

The Primary MSME is the authorized initial business owner/administrator.

The Primary may, according to the organization's authority model:

* add members
* assign responsibilities
* establish roles
* create delegations
* revoke delegations
* manage organizational procurement authority

A newly registered OTP user cannot simply add themselves to an existing MSME.

---

# 14. MSME DELEGATION

MSME delegation must be:

* explicitly granted
* scoped
* auditable
* revocable
* subject to applicable time limits
* subject to applicable spending limits
* subject to anti-self-approval rules

A delegate cannot increase their own authority.

A delegate cannot appoint themselves.

A delegate cannot grant themselves a larger spending limit.

Delegation must remain subordinate to the authority of the granting Primary/authorized authority.

---

# 15. INDIVIDUAL DELEGATION

Individuals do not have organizational delegates.

Therefore:

```text
Individual
    ↓
Personal procurement
    ↓
Personal decision
```

There is no:

```text
Individual → Delegate
```

model in the current OTP product.

---

# 16. SUPPLIER

Supplier is a procurement participant, not a buyer organization persona.

A supplier may initially participate in an RFQ without having a full OTP supplier account.

Therefore:

```text
RFQ Participant
    ≠
Verified OTP Supplier
```

Supplier onboarding can occur after quote participation and award selection.

---

# 17. SUPPLIER AWARD / ONBOARDING PRINCIPLE

When a buyer selects a supplier:

OTP must first determine whether the supplier already exists in the OTP supplier database.

Possible states include:

```text
Existing + Verified
Existing + Verification Required
New Supplier
```

If the supplier is not yet verified/onboarded:

```text
Award
  ↓
Supplier onboarding / verification
  ↓
Reveal gate
  ↓
Identity revealed
```

The buyer must not bypass this gate merely because the supplier was selected.

This preserves the opportunity to create a reusable verified supplier-network asset.

---

# 18. SUPPLIER IDENTITY PROTECTION

Supplier identity must remain protected until the authorized reveal condition is satisfied.

Protection must cover more than visible UI.

OTP must prevent unintended leakage through:

* API responses
* browser payloads
* React props
* hidden DOM
* URLs
* query parameters
* files
* filenames
* metadata
* logs
* analytics
* error messages
* exports
* caches
* client storage

Server-side controls are mandatory.

---

# 19. BUYER / SUPPLIER SEPARATION

The current product maintains buyer and supplier as separate personas.

A buyer cannot simply convert the buyer account into a supplier account.

A supplier cannot simply convert the supplier account into a buyer account.

This is a product rule for the current OTP model.

The underlying person identity may be represented independently where technically required, but buyer/supplier authorization contexts must remain distinct.

---

# 20. PROCUREMENT PRINCIPLE

OTP's procurement experience follows the principle:

> **Simple customer actions, complex backend execution.**

The customer should not have to understand:

* procurement orchestration
* internal state machines
* RLS
* authorization rules
* supplier identity protection
* financial reconciliation
* tax calculation mechanics
* audit event structures
* notification adapters

Those are platform responsibilities.

---

# 21. GOLDEN PROCUREMENT JOURNEY

The customer-facing procurement journey is conceptually:

```text
Tell OTP What You Need
        ↓
Review Offers
        ↓
Vote / Decide
        ↓
Approve Purchase & Track
```

The underlying procurement lifecycle may be more granular.

The current golden state model is:

```text
DRAFT
  ↓
QUOTING
  ↓
EVALUATING
  ↓
AWARDED
  ↓
PO ISSUED
  ↓
INVOICED
  ↓
SETTLED
```

with:

```text
STALLED
```

as an exception state.

Internal events may be more granular without exposing that complexity to normal buyers.

---

# 22. GOVERNANCE

Governance is mandatory where applicable, particularly for RWA collective procurement.

OTP must preserve:

* voting
* quorum
* weighted authority
* conflict of interest
* approval authority
* delegation controls
* auditability
* decision receipts
* atomic award controls

Governance must be enforced at backend/database level.

---

# 23. FINANCIAL PRINCIPLES

OTP separates:

### Procurement value

Products, services and projects purchased by customers.

### OTP revenue

Including applicable:

* subscription
* platform fees

### Wallet / incentives

Including applicable:

* rewards
* referral incentives
* buyer wallet

These must not be treated as one financial category.

Applicable GST/TDS and reconciliation controls must remain explicit.

---

# 24. CUSTOMER SUBSCRIPTION PRINCIPLE

Where subscription is applicable:

Subscription entitlement controls the ability to place new orders according to the current product rules.

Existing orders must remain manageable according to their authorized lifecycle even if subscription status subsequently changes.

---

# 25. MOBILE-FIRST PRODUCT PRINCIPLE

OTP is mobile-first.

The primary customer experience must fit naturally inside the mobile application shell.

Desktop is supported but must not cause mobile workflows to become desktop-style enterprise screens.

Every user-facing screen must be tested for:

* mobile width
* responsive behavior
* no horizontal overflow
* no floating elements obscuring content
* usable touch targets
* readable text
* clear primary action

---

# 26. UX SIMPLICITY PRINCIPLE

OTP should not expose backend complexity unnecessarily.

Avoid:

* unnecessary text
* duplicate information
* duplicate screens
* duplicate routes
* excessive configuration
* enterprise-style administration in customer journeys
* unnecessary workflow steps
* technical terminology

The user should understand:

```text
What do I need?
What are my options?
What do I need to decide?
What happens next?
```

---

# 27. CANONICAL SCREEN PRINCIPLE

Every customer capability should have one canonical implementation unless there is a documented reason for multiple representations.

OTP must maintain:

```text
One purpose
→ One canonical route
→ One canonical screen/component
```

Duplicate screens must be identified during reconstruction and classified as:

* canonical
* duplicate
* legacy
* dead
* intentional variant

Users should not have to discover duplicate implementations through normal usage.

---

# 28. ADDRESS PRINCIPLE

Addresses are first-class data.

### Individual

Must support:

* primary/default address
* additional/secondary saved addresses

New procurement should default to the primary address unless the user selects another authorized saved address.

### RWA

Must distinguish applicable:

* registered/legal address
* operational/delivery address

### MSME

Must distinguish applicable:

* registered/legal address
* operational/delivery address

Historical procurement records must retain appropriate address snapshots.

Changing a profile address must not rewrite historical procurement records.

---

# 29. VERIFIED IDENTITY PRINCIPLE

OTP must distinguish:

```text
User Provided
        vs
OTP Verified
```

Verification states may include:

```text
NOT PROVIDED
PENDING
VERIFIED
FAILED
REQUIRES REVERIFICATION
```

OTP must never display an unverified value as verified.

Where authoritative verification providers are unavailable, the system must truthfully report the actual state.

---

# 30. TAXONOMY PRINCIPLE

OTP must maintain canonical procurement taxonomies/reference data.

Taxonomy must be reusable across:

* requirement creation
* RFQ
* supplier discovery
* categorization
* market intelligence
* analytics
* reporting

The same business concept must not be represented using unrelated free-text values across different modules.

Taxonomy changes must be controlled and auditable.

---

# 31. NOTIFICATION PRINCIPLE

OTP notifications must be truthful.

Supported channels may include:

* email
* WhatsApp
* other configured channels

The platform must distinguish:

```text
Created
Dispatch Requested
Accepted by Provider
Delivered
Opened
Claimed
Failed
Unavailable
```

OTP must never claim that WhatsApp/email delivery occurred unless the configured provider supplies appropriate evidence.

---

# 32. MARKET INTELLIGENCE PRINCIPLE

Market intelligence must clearly distinguish its source state.

The fallback ladder is:

```text
LIVE_API
    ↓
DATABASE_CACHE
    ↓
STATIC_REFERENCE
    ↓
UNAVAILABLE
```

OTP must never label cached or static information as live market intelligence.

---

# 33. PLATFORM ADMINISTRATION

Superadmin is a **platform role**, not a customer persona.

Superadmin responsibilities may include:

* platform configuration
* operational administration
* supplier verification operations
* taxonomy management
* reference-data management
* integration management
* controlled support operations
* security investigation
* system health
* feature configuration

Superadmin actions must be audited.

Superadmin must not silently rewrite historical business actions.

---

# 34. CEO / FOUNDER

CEO/Founder is a **platform oversight role**, not a buyer persona.

The CEO/Founder cockpit should provide visibility into:

* platform health
* customer adoption
* Individuals
* RWAs
* MSMEs
* supplier network
* procurement funnel
* financial/settlement metrics
* operational metrics
* UX telemetry
* business telemetry
* security/audit signals
* critical exceptions

CEO/Founder visibility does not automatically create authority to act as:

* RWA President
* RWA Treasurer
* MSME Primary
* Individual Buyer
* Supplier

Platform visibility and customer authority remain separate.

---

# 35. TELEMETRY PRINCIPLE

OTP telemetry is divided into:

### UX telemetry

What users experience.

### Business telemetry

What happens to the business/procurement funnel.

### Security/audit telemetry

What privileged or sensitive actions occurred.

These must not be conflated.

---

# 36. AUDIT PRINCIPLE

Historical business actions must be attributable to the person and authority that actually performed them.

When a role changes:

```text
Old person
    ↓
Historical actions preserved

New person
    ↓
Current authority begins from effective date
```

Never rewrite history to make the new role holder appear to have performed old actions.

---

# 37. AUTHORIZATION PRINCIPLE

Authorization must consider the complete relevant context.

Conceptually:

```text
Person
+
Buyer/Supplier Context
+
Organization
+
Eligibility
+
Membership
+
Role
+
Responsibility
+
Delegation
+
Authority
+
Transaction
+
Effective Date
```

A UI permission is not sufficient.

The same authorization must be enforced through:

* server logic
* API
* RPC
* database
* RLS
* audit controls

where applicable.

---

# 38. NO SELF-MANUFACTURED AUTHORITY

Users must not be able to manufacture organizational authority through the client.

A user cannot simply:

* select an RWA
* declare themselves President
* declare themselves Treasurer
* add themselves to a committee
* add themselves to an MSME
* grant themselves delegation
* increase their spending limit
* assign themselves voting authority

Legitimate organizational relationships must be established through authorized workflows.

---

# 39. DATA / ENVIRONMENT CLEANLINESS

The customer-facing OTP product must not expose engineering/demo clutter.

Existing artifacts must be classified before removal:

```text
PRODUCTION
TEST
DEMO
PILOT
STAGING
MOCK
STUB
LEGACY
REFERENCE
SHARED INFRASTRUCTURE
```

Dummy/demo/test data must not appear as genuine production customer information.

Engineering infrastructure should not leak into normal customer workflows.

---

# 40. ENTERPRISE EXCLUSION

Enterprise is explicitly excluded from the OTP product constitution.

Do not introduce:

* Enterprise registration
* Enterprise buyer dashboards
* Enterprise-specific procurement journeys
* Enterprise approval hierarchies
* Enterprise terminology
* Enterprise navigation
* Enterprise roles

unless this Product Constitution is formally changed in a future product version.

Existing enterprise-related code/database structures must be assessed individually before removal.

They must never be assumed to be safe to delete merely because Enterprise is out of product scope.

---

# 41. PRODUCT DESIGN NORTH STAR

The OTP customer should experience:

```text
Simple
        ↓
Clear
        ↓
Trustworthy
        ↓
Protected
        ↓
Governed
        ↓
Auditable
```

while the backend performs the complex work required to achieve those outcomes.

---

# 42. NON-NEGOTIABLE PRINCIPLE

> **OTP does the procurement work. The customer makes the decision.**

The customer should not need to understand the machinery that makes OTP trustworthy.

The platform must carry the complexity.

---

# 43. DOCUMENT AUTHORITY

This Product Constitution is the highest-level product definition.

All subsequent OTP documentation must conform to it.

If two documents conflict:

1. Identify the contradiction.
2. Stop implementation of the affected behavior.
3. Present the contradiction for human product decision.
4. Update the authoritative documentation.
5. Only then implement.

An implementation agent must never silently invent a business rule to resolve a documentation contradiction.

---

# 44. RECONSTRUCTION RULE

The future OTP reconstruction must follow:

> **Reuse before rebuild. Repair before replace. Extend before duplicate.**

Existing implementation must first be classified as:

```text
KEEP
REUSE
REFACTOR
REBUILD
RETIRE
REMOVE
RETAIN AS INFRASTRUCTURE
REQUIRES PRODUCT DECISION
```

No destructive rewrite should occur merely because a cleaner implementation is possible.

---

# 45. DOCUMENT FREEZE STATUS

This document is currently:

**DRAFT — NOT YET FROZEN**

The following documents must subsequently be reviewed against this Constitution:

* Identity & Account Model
* RWA Governance & Role Lifecycle
* MSME Organization & Delegation Model
* Individual Buyer Model
* Supplier Lifecycle
* Procurement State Machine
* Financial/Tax Model
* UX/Visual Contract
* Security/RLS/Audit Model
* Superadmin Model
* CEO/Founder & Telemetry Model
* Reconstruction Specification

Only after cross-document contradiction review should the OTP Documentation Pack become:

**OTP PRODUCT CONSTITUTION v1.0 — FROZEN**
