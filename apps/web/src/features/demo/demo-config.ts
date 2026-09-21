/**
 * Legacy pilot fixtures.
 *
 * Whether the demo framework is on is a server-side fact now, read through
 * demo_status() — see features/demo/api/demo.ts. This flag survives only to
 * select which hard-coded walkthrough the pilot screens point at, and should go
 * when those screens move onto demo_scenarios.
 */
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

export const DEMO_BANNER_TEXT = 'Demo Mode — Pilot 1 · Local facility service · Bengaluru';

export const DEMO_ORG_NAME = 'Durga Rainbow Flat Owner Welfare Association';

/** Shown alongside org name — clarifies this is one pilot vertical, not the product scope. */
export const DEMO_PILOT_NOTE = 'Pilot 1 · Community buyer · same engine for MSME & local business';
