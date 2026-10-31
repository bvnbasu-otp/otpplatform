# OTP Next — Authoritative Engineering & Release Documentation

**Platform Version:** 2.0.0 (Greenfield Re-architecture)  
**Philosophy:** *SIMPLE. SECURE. FAIR. Same power. Simpler experience. All the intelligence. None of the complexity. The customer makes the decision. OTP does the procurement work.*

---

## Documentation Index

1. [Phase 1: Architecture & Capability Audit](./OTP_NEXT_ARCHITECTURE_AND_CAPABILITY_AUDIT.md)  
   Comprehensive audit of legacy architecture, 151 database tables, 296 RPCs, and definition of the decoupled 3-layer architecture.
2. [Phase 2: Frontend Design System & Application Shell](./OTP_NEXT_PHASE2_FRONTEND_DESIGN_SYSTEM_AND_SHELL.md)  
   Mobile-first design system specifications, 6-Tile Quick Action Grid, Baskar Loganathan & Durga Rainbow canonical identities, and permanent retirement of Enterprise persona.
3. [Phase 3: Modular Backend Contracts & Adapters](./OTP_NEXT_PHASE3_MODULAR_BACKEND_CONTRACTS.md)  
   Architecture of 28 decoupled application services across `@otp/services`, public contract boundaries, and Supabase RPC adapters.
4. [Phase 4: Authentication & Onboarding Integration](./OTP_NEXT_PHASE4_AUTHENTICATION_AND_ONBOARDING.md)  
   Contract-driven multi-persona registration wizard (Individual, RWA, MSME, Supplier) with instant reactive validation and legal EULA enforcement gates.
5. [Phase 5: Core Procurement Flows (TELL → REVIEW → DECIDE → TRACK)](./OTP_NEXT_PHASE5_CORE_PROCUREMENT_FLOWS.md)  
   Implementation of the 4 core procurement stages with Smart Merit quote ranking and atomic counterparty reveal.
6. [Phase 6: Hardening, Edge Cases & Final Polish](./OTP_NEXT_PHASE6_HARDENING_EDGE_CASES_AND_POLISH.md)  
   Statutory multi-state GST tax regimes (CGST/SGST/IGST/SEZ LUT), order dispute resolution, non-carrying bonus rules, and mobile ergonomics (≥ 44px touch targets).
7. [Phase 7: 4-Persona Interactive Walkthrough & Simulation](./OTP_NEXT_PERSONA_SIMULATION_AND_WALKTHROUGH.md)  
   End-to-end execution results across all 4 customer personas with 100% assertion success verifying RWA invariants (`00240`, `00242`), tax calculations, and blind quoting.
8. [Production Deployment Runbook](./OTP_NEXT_PRODUCTION_DEPLOYMENT_RUNBOOK.md)  
   Operational deployment procedures, CI/CD pipeline stages, Supabase database migration synchronization, Edge Functions deployment, and rollback strategies.
9. [Environment Configuration Guide](./OTP_NEXT_ENVIRONMENT_CONFIG.md)  
   Environment variables, database credentials, public anon keys, and deployment target guardrails for Local, CI Sandbox, and Production.
10. [Release Notes (v2.0.0)](./OTP_NEXT_RELEASE_NOTES.md)  
    Official release summary, key milestones, major features, breaking architectural changes, and platform guarantees.
