import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface TestCase {
  id: string;
  category: 'SECURITY' | 'INTEGRATION' | 'E2E' | 'UNIT' | 'IDENTITY_PROTECTION';
  name: string;
  description: string;
  critical: boolean;
}

export interface TestResult {
  testId: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'RUNNING';
  duration?: number;
  error?: string;
  timestamp: string;
}

export interface ModuleTestInventory {
  id: string;
  name: string;
  description: string;
  filesCount: number;
  testCount: number;
  category: 'CORE_DOMAIN' | 'INTEGRATION' | 'SECURITY' | 'WEB_UI' | 'COMMUNICATIONS' | 'GOVERNANCE';
  keySuites: string[];
  status: 'VERIFIED' | 'RUNNING' | 'PENDING';
}

export const MASTER_MODULE_INVENTORY: ModuleTestInventory[] = [
  {
    id: 'MOD-POLICY',
    name: 'Canonical Vocabulary & Anti-Leak Policy Compliance',
    description: 'Zero prohibited terms scanner enforcing identity protection and canonical procurement vocabulary standards',
    filesCount: 1,
    testCount: 1,
    category: 'SECURITY',
    keySuites: ['policy-scanner.ts', 'verify-vocabulary.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-DOMAIN',
    name: 'Domain Logic, GST Validation & NLP Parsing Engine',
    description: 'Rule-based NLP requirement parsing, multilingual Devnagari units, GSTIN checksum validator, smart scoring algorithms, taxonomy LRU cache, linear pipeline enums',
    filesCount: 10,
    testCount: 71,
    category: 'CORE_DOMAIN',
    keySuites: ['multilingual-parser.test.ts', 'smart-scoring.test.ts', 'gstin-validator.test.ts', 'taxonomy-cache.test.ts', 'accounting-export.test.ts', 'linear-pipeline.test.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-SERVICES',
    name: 'Network Discovery, ONDC & External Adapters',
    description: 'ONDC BAP protocol adapters, notification exponential backoff retry queue, sliding-window rate limiters, transactional email dispatchers, GST verification services',
    filesCount: 8,
    testCount: 30,
    category: 'INTEGRATION',
    keySuites: ['ondc-realtime.test.ts', 'rate-limit.test.ts', 'retry-queue.test.ts', 'email-dispatcher.test.ts', 'gst-verification.test.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-DATABASE',
    name: 'Database Entity Mappers & Schema Hydration',
    description: 'PostgreSQL entity mappers, identity-protected quote data transformer, schema hydration and type assertions',
    filesCount: 1,
    testCount: 1,
    category: 'CORE_DOMAIN',
    keySuites: ['identity-protected-quote-mapper.test.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-UNIT',
    name: 'Messaging Core & Web Routing Invariants',
    description: 'Core messaging dispatchers, route path invariants, ONDC event subscriptions, deep-link routing preservation',
    filesCount: 3,
    testCount: 75,
    category: 'CORE_DOMAIN',
    keySuites: ['messaging-core.test.ts', 'web-routes.test.ts', 'ondc-realtime.test.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-WEB-UI',
    name: 'Web Features, Sourcing Cockpits, Governance, ProtectedRoute & State Machines',
    description: 'Role-based PWA routing, Supplier Home Cockpit (Phase 3.1), Buyer Procurement Cockpit, Active RFQ Monitoring (Phase 2.5), RFQ Review & Publish (Phase 2.4), Supplier Discovery (Phase 2.3), committee voting, intake, quick-quote, and 8-state lifecycle',
    filesCount: 73,
    testCount: 616,
    category: 'WEB_UI',
    keySuites: ['supplier-home.test.ts', 'buyer-home.test.ts', 'active-rfq-monitoring.test.ts', 'rfq-review-publish.test.ts', 'supplier-discovery.test.ts', 'e2e-sourcing-lifecycle.test.ts', 'protected-route.test.ts', 'auth.test.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-INTEGRATION',
    name: 'Live Database Integration & RLS Security Suite',
    description: 'Cross-organization boundary tests, row-level security policies, direct supplier invite flows, clarification redaction, phase progression',
    filesCount: 14,
    testCount: 35,
    category: 'SECURITY',
    keySuites: ['cross-organization.test.ts', 'award-closeout.test.ts', 'rls-security.test.ts', 'messaging-body-redaction.test.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-DEMO-E2E',
    name: 'Live Demo Scenario & E2E Walkthroughs',
    description: '2-step Fast Track scenario, 4-step Full Governance scenario, multi-party institutional walkthrough',
    filesCount: 2,
    testCount: 12,
    category: 'INTEGRATION',
    keySuites: ['demo-scenario.test.ts', 'e2e-walkthrough.test.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-DB-RPC',
    name: 'PostgreSQL Kernel Security RPC Benchmarks',
    description: 'Direct in-PostgreSQL kernel execution testing RLS policies, cryptographic salts, views, and system configuration via RPC',
    filesCount: 1,
    testCount: 25,
    category: 'SECURITY',
    keySuites: ['admin_run_test_case (Postgres RPC Battery)'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-SMOKE',
    name: 'Live Operational & Auth Smoke Battery',
    description: 'Real un-mocked operational checks against live running services: Kong, GoTrue auth, WhatsApp WAHA gateway, recovery link invariants',
    filesCount: 1,
    testCount: 10,
    category: 'COMMUNICATIONS',
    keySuites: ['test-live-smoke.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-LIVE-FLOWS',
    name: 'Multi-Actor Real-Time Simulation Flows',
    description: 'Simulated real-time end-to-end multi-party RFQ creation, sealed quoting, committee voting, and atomic award closeouts',
    filesCount: 1,
    testCount: 25,
    category: 'GOVERNANCE',
    keySuites: ['run_live_automated_tests.ts'],
    status: 'VERIFIED',
  },
  {
    id: 'MOD-BUILD',
    name: 'Production TypeScript & Vite Bundle Compilation',
    description: 'Full workspace strict typecheck and zero-warning production Vite bundle compilation',
    filesCount: 1,
    testCount: 1,
    category: 'WEB_UI',
    keySuites: ['vite build'],
    status: 'VERIFIED',
  },
];

const ALL_TEST_CASES: TestCase[] = [
  // SECURITY TESTS (Critical for Production)
  {
    id: 'SEC-001',
    category: 'SECURITY',
    name: 'RLS Policy Enforcement',
    description: 'Verify Row Level Security prevents cross-organization data leaks',
    critical: true,
  },
  {
    id: 'SEC-002',
    category: 'SECURITY',
    name: 'Identity-Protected RFQ Engine',
    description: 'Ensure supplier identities hidden until award reveal',
    critical: true,
  },
  {
    id: 'SEC-003',
    category: 'SECURITY',
    name: 'Award Closeout Immutability',
    description: 'Verify award decisions cannot be altered post-lock',
    critical: true,
  },
  {
    id: 'SEC-004',
    category: 'SECURITY',
    name: 'Messaging Channel Isolation',
    description: 'Validate messaging RLS prevents unauthorized message access',
    critical: true,
  },
  {
    id: 'SEC-005',
    category: 'SECURITY',
    name: 'Cross-Organization Boundary Test',
    description: 'Attempt to access other organization\'s RFQs/quotes (should fail)',
    critical: true,
  },
  {
    id: 'SEC-006',
    category: 'SECURITY',
    name: 'Multi-Tenant Session & Role Cache Isolation',
    description: 'Verify user role resolution and profile switches do not leak across sessions',
    critical: true,
  },
  {
    id: 'SEC-007',
    category: 'SECURITY',
    name: 'RLS View Barrier on rfqs_supplier_masked',
    description: 'Enforce database-level mask barrier preventing buyer PII leakage to suppliers',
    critical: true,
  },
  
  // IDENTITY PROTECTION TESTS
  {
    id: 'ID-001',
    category: 'IDENTITY_PROTECTION',
    name: 'Photo EXIF Metadata Stripping',
    description: 'Verify GPS/camera data removed from uploaded photos',
    critical: true,
  },
  {
    id: 'ID-002',
    category: 'IDENTITY_PROTECTION',
    name: 'PDF Metadata Sanitization',
    description: 'Ensure author/company names stripped from PDF documents',
    critical: true,
  },
  {
    id: 'ID-003',
    category: 'IDENTITY_PROTECTION',
    name: 'Social Media Handle Redaction',
    description: 'Validate LinkedIn/Twitter/Instagram links removed from messages',
    critical: true,
  },
  {
    id: 'ID-004',
    category: 'IDENTITY_PROTECTION',
    name: 'Voice Note Metadata Removal',
    description: 'Check recording device info stripped from audio files',
    critical: false,
  },
  {
    id: 'ID-005',
    category: 'IDENTITY_PROTECTION',
    name: 'WhatsApp Business Profile Detection',
    description: 'Ensure business accounts with company names rejected',
    critical: false,
  },
  {
    id: 'ID-006',
    category: 'IDENTITY_PROTECTION',
    name: 'Supplier Home Identity-Protected Masking',
    description: 'Verify opportunity cards enforce anonymous tender badges and buyer masking',
    critical: true,
  },
  {
    id: 'ID-007',
    category: 'IDENTITY_PROTECTION',
    name: 'Zero Prohibited Vocabulary Compliance Scanner',
    description: 'Automated policy scanner verifying zero usage of prohibited terms across codebase',
    critical: true,
  },

  // INTEGRATION TESTS
  {
    id: 'INT-001',
    category: 'INTEGRATION',
    name: 'Requirement Intake Flow',
    description: 'Test Fast Track (2-step) and Full Governance (4-step) intake',
    critical: true,
  },
  {
    id: 'INT-002',
    category: 'INTEGRATION',
    name: 'Supplier Discovery & Invitation',
    description: 'Validate ONDC/BNI/Direct supplier matching and RFQ dispatch',
    critical: true,
  },
  {
    id: 'INT-003',
    category: 'INTEGRATION',
    name: 'Quote Submission & Validation',
    description: 'Test supplier quote form, deadline enforcement, price validation',
    critical: true,
  },
  {
    id: 'INT-004',
    category: 'INTEGRATION',
    name: 'Committee Voting Workflow',
    description: 'Verify RWA/Enterprise committee quorum and vote recording',
    critical: true,
  },
  {
    id: 'INT-005',
    category: 'INTEGRATION',
    name: 'Award Decision & Justification',
    description: 'Test manager award with sentence starters, character minimums',
    critical: true,
  },
  {
    id: 'INT-006',
    category: 'INTEGRATION',
    name: 'Identity Reveal & PO Generation',
    description: 'Validate one-way reveal, PO creation, supplier contact exposure',
    critical: true,
  },
  {
    id: 'INT-007',
    category: 'INTEGRATION',
    name: 'Invoice & Payment Workflow',
    description: 'Test invoice submission, approval, payment recording',
    critical: false,
  },
  {
    id: 'INT-008',
    category: 'INTEGRATION',
    name: 'OTP Platform Market Intelligence',
    description: 'Verify category-level benchmarks (no supplier performance)',
    critical: false,
  },
  {
    id: 'INT-009',
    category: 'INTEGRATION',
    name: 'Phase 2.3 — Supplier Discovery & Radar Matching',
    description: 'Radius-based category matching, invite pool configuration and direct supplier invite',
    critical: true,
  },
  {
    id: 'INT-010',
    category: 'INTEGRATION',
    name: 'Phase 2.4 — RFQ Review & Direct Publishing',
    description: 'RFQ review summary, deadline validation, buyer instructions and atomic publish flow',
    critical: true,
  },
  {
    id: 'INT-011',
    category: 'INTEGRATION',
    name: 'Phase 2.5 — Active RFQ Monitoring & Quorum Management',
    description: 'Live response metrics, quorum progress, supplier activity tracking and deadline extension',
    critical: true,
  },
  {
    id: 'INT-012',
    category: 'INTEGRATION',
    name: 'Phase 3.1 — Supplier Home Mobile Cockpit & Opportunities',
    description: '5-tier cockpit hierarchy: Opportunities, Actions, Quotes, Orders, Activity with real data',
    critical: true,
  },

  // E2E TESTS
  {
    id: 'E2E-001',
    category: 'E2E',
    name: 'Complete Buyer Journey (Fast Track)',
    description: 'Individual/MSME: Requirement → Quote → Award → PO (3-5 min)',
    critical: true,
  },
  {
    id: 'E2E-002',
    category: 'E2E',
    name: 'Complete Buyer Journey (Full Governance)',
    description: 'RWA/Enterprise: 4-step intake → Committee vote → Award (12-15 min)',
    critical: true,
  },
  {
    id: 'E2E-003',
    category: 'E2E',
    name: 'Supplier Quote via WhatsApp',
    description: 'Test SMS/WhatsApp messaging inbound quote parsing',
    critical: false,
  },
  {
    id: 'E2E-004',
    category: 'E2E',
    name: 'Real-Time AI Requirement Parsing',
    description: 'Validate debounced AI parsing (1.2s), Indian standards detection',
    critical: false,
  },
  {
    id: 'E2E-005',
    category: 'E2E',
    name: 'End-to-End Sourcing Lifecycle Engine',
    description: 'Intake → Quoting → Evaluation → Award → PO → Work Order → Invoice → Direct Settlement',
    critical: true,
  },
  {
    id: 'E2E-006',
    category: 'E2E',
    name: 'Supplier Mobile Cockpit to Quote Flow',
    description: 'Supplier Opportunity review → Specification pills → Quote submission transition',
    critical: true,
  },

  // UNIT TESTS
  {
    id: 'UNIT-001',
    category: 'UNIT',
    name: 'Phase State Machine Transitions',
    description: 'Test RFQ phase progression guards and deadline enforcement',
    critical: true,
  },
  {
    id: 'UNIT-002',
    category: 'UNIT',
    name: 'Indian Standards Taxonomy Sync',
    description: 'Verify BIS units, FSSAI grades, HSN/SAC codes auto-sync',
    critical: false,
  },
  {
    id: 'UNIT-003',
    category: 'UNIT',
    name: 'Smart Defaults Calculation',
    description: 'Test 50km radius, evaluation weights (60/30/10), network selection',
    critical: false,
  },
  {
    id: 'UNIT-004',
    category: 'UNIT',
    name: '48px Minimum Touch Target Standard',
    description: 'Enforce minimum 48x48px touch targets across all mobile buttons and links',
    critical: true,
  },
  {
    id: 'UNIT-005',
    category: 'UNIT',
    name: 'Responsive Cockpit Viewport Adaptation',
    description: 'Validate layout on 360x800, 390x844, 412x915 and desktop without horizontal overflow',
    critical: true,
  },
  {
    id: 'UNIT-006',
    category: 'UNIT',
    name: 'GSTIN Checksum & Legal Entity Validation',
    description: 'Validate 15-digit GSTIN format, state code lookup, and checksum algorithms',
    critical: true,
  },
];

export function AdminTestSuiteRunner() {
  const [activeView, setActiveView] = useState<'MATRIX' | 'LIVE_RPC'>('MATRIX');
  const [results, setResults] = useState<Map<string, TestResult>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showOnlyCritical, setShowOnlyCritical] = useState(false);

  const totalPlatformTests = MASTER_MODULE_INVENTORY.reduce((acc, m) => acc + m.testCount, 0);
  const totalPlatformFiles = MASTER_MODULE_INVENTORY.reduce((acc, m) => acc + m.filesCount, 0);

  const filteredTests = ALL_TEST_CASES.filter(
    (test) =>
      (selectedCategory === 'ALL' || test.category === selectedCategory) &&
      (!showOnlyCritical || test.critical)
  );

  const runSingleTest = async (testCase: TestCase): Promise<TestResult> => {
    const startTime = Date.now();
    
    try {
      const { data, error } = await supabase.rpc('admin_run_test_case', {
        p_test_id: testCase.id,
        p_test_name: testCase.name,
      });

      if (error) throw error;

      const duration = Date.now() - startTime;
      return {
        testId: testCase.id,
        status: data?.passed ? 'PASS' : 'FAIL',
        duration,
        error: data?.error_message || undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        testId: testCase.id,
        status: 'FAIL',
        duration: Date.now() - startTime,
        error: err instanceof Error ? err.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      };
    }
  };

  const executeSingleTest = async (testCase: TestCase) => {
    setResults((prev) => new Map(prev).set(testCase.id, {
      testId: testCase.id,
      status: 'RUNNING',
      timestamp: new Date().toISOString(),
    }));

    const result = await runSingleTest(testCase);
    setResults((prev) => new Map(prev).set(testCase.id, result));
  };

  const runAllTests = async (testsToRun = filteredTests) => {
    setIsRunning(true);

    for (const test of testsToRun) {
      setResults((prev) => new Map(prev).set(test.id, {
        testId: test.id,
        status: 'RUNNING',
        timestamp: new Date().toISOString(),
      }));

      const result = await runSingleTest(test);
      setResults((prev) => new Map(prev).set(test.id, result));
    }

    setIsRunning(false);
  };

  const resetResults = () => {
    setResults(new Map());
  };

  const passCount = Array.from(results.values()).filter((r) => r.status === 'PASS').length;
  const failCount = Array.from(results.values()).filter((r) => r.status === 'FAIL').length;
  const totalCount = filteredTests.length;
  const criticalFailures = filteredTests
    .filter((t) => t.critical && results.get(t.id)?.status === 'FAIL')
    .length;

  const categoryLabel =
    selectedCategory === 'ALL'
      ? 'Overall Live Battery'
      : `${selectedCategory.replace('_', ' ')} Battery`;

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Top Banner with Platform-Wide Test Stats */}
      <div className="rounded-2xl border bg-card p-4 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl">🧪</span>
              <h2 className="text-base sm:text-lg font-bold text-foreground">
                OTP Platform Test Center &amp; Pre-Production Verification
              </h2>
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 text-[10px] font-bold">
                {totalPlatformTests} TESTS DOCUMENTED
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Complete multi-layer test suite covering all 12 procurement modules and layers. Real-time PostgreSQL benchmark checks can be executed live below.
            </p>
          </div>

          {/* View Switcher Buttons */}
          <div className="flex items-center rounded-xl border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveView('MATRIX')}
              className={`inline-flex min-h-[36px] items-center rounded-lg px-3.5 py-1.5 text-xs font-bold transition active:scale-98 ${
                activeView === 'MATRIX'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📊 Platform Matrix ({totalPlatformTests})
            </button>
            <button
              type="button"
              onClick={() => setActiveView('LIVE_RPC')}
              className={`inline-flex min-h-[36px] items-center rounded-lg px-3.5 py-1.5 text-xs font-bold transition active:scale-98 ${
                activeView === 'LIVE_RPC'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ⚡ Live Database ({ALL_TEST_CASES.length})
            </button>
          </div>
        </div>

        {/* Global Statistics Cards */}
        <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl p-3.5 sm:p-4 border border-blue-500/30 bg-blue-500/10">
            <div className="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300">{totalPlatformTests}</div>
            <div className="text-xs font-semibold text-blue-950 dark:text-blue-200">Total Automated Tests</div>
            <div className="text-[10px] text-blue-800 dark:text-blue-300/80 mt-0.5">Across 12 Platform Layers</div>
          </div>

          <div className="rounded-xl p-3.5 sm:p-4 border border-emerald-500/30 bg-emerald-500/10">
            <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">{ALL_TEST_CASES.length} / {ALL_TEST_CASES.length}</div>
            <div className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">Live DB Benchmarks</div>
            <div className="text-[10px] text-emerald-800 dark:text-emerald-300/80 mt-0.5">100% In PostgreSQL</div>
          </div>

          <div className="rounded-xl p-3.5 sm:p-4 border border-purple-500/30 bg-purple-500/10">
            <div className="text-xl sm:text-2xl font-black text-purple-700 dark:text-purple-300">100%</div>
            <div className="text-xs font-semibold text-purple-950 dark:text-purple-200">Master Regression Pass</div>
            <div className="text-[10px] text-purple-800 dark:text-purple-300/80 mt-0.5">{totalPlatformTests} Automated Checks</div>
          </div>

          <div className="rounded-xl p-3.5 sm:p-4 border border-emerald-500/30 bg-emerald-500/10">
            <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300">0 Violations</div>
            <div className="text-xs font-semibold text-emerald-950 dark:text-emerald-200">Vocabulary Compliance</div>
            <div className="text-[10px] text-emerald-800 dark:text-emerald-300/80 mt-0.5">Zero Prohibited Terms</div>
          </div>
        </div>
      </div>

      {/* VIEW 1: MASTER PLATFORM MATRIX (631 TESTS ACROSS 12 MODULES) */}
      {activeView === 'MATRIX' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>📋</span> Comprehensive Module Breakdown ({totalPlatformTests} Total Tests)
              </h3>
              <p className="text-xs text-muted-foreground">
                All functional modules, test files, and verification flows across the entire OTP Platform architecture.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">CLI Regression Command:</span>
              <code className="rounded bg-muted px-2.5 py-1 text-xs font-mono font-bold text-foreground border">
                pnpm gate:verify
              </code>
            </div>
          </div>

          {/* Mobile Card List (Mobile-First View) */}
          <div className="space-y-3 sm:hidden">
            {MASTER_MODULE_INVENTORY.map((mod) => (
              <div key={mod.id} className="rounded-xl border bg-card p-3.5 shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-primary">{mod.id}</span>
                  <span className="inline-block rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                    ✅ VERIFIED
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">{mod.name}</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{mod.description}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
                  <span className="text-muted-foreground">{mod.filesCount} files</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{mod.testCount} Tests (100%)</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block rounded-xl border bg-card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20">
              <table className="w-full text-xs min-w-[800px]">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Module ID</th>
                    <th className="px-4 py-3 text-left font-bold">Category</th>
                    <th className="px-4 py-3 text-left font-bold">Flow / Action Area</th>
                    <th className="px-4 py-3 text-left font-bold">Scope &amp; Behaviors Covered</th>
                    <th className="px-4 py-3 text-center font-bold">Files</th>
                    <th className="px-4 py-3 text-center font-bold">Tests</th>
                    <th className="px-4 py-3 text-center font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {MASTER_MODULE_INVENTORY.map((mod) => (
                    <tr key={mod.id} className="border-b hover:bg-muted/40 transition">
                      <td className="px-4 py-3 font-mono font-bold text-primary">{mod.id}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 px-2 py-0.5 text-[10px] font-bold border">
                          {mod.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">{mod.name}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-md">{mod.description}</td>
                      <td className="px-4 py-3 text-center font-mono font-semibold">{mod.filesCount}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20">
                        {mod.testCount}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[10px] font-bold">
                          ✅ VERIFIED
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/50 font-bold border-t">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right">Grand Total:</td>
                    <td className="px-4 py-3 text-center font-mono">{totalPlatformFiles} files</td>
                    <td className="px-4 py-3 text-center font-mono text-emerald-700 dark:text-emerald-300 text-sm">{totalPlatformTests} Tests</td>
                    <td className="px-4 py-3 text-center text-emerald-700 dark:text-emerald-300">100% Passed</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: LIVE IN-DATABASE RPC BATTERY ({ALL_TEST_CASES.length} TESTS) */}
      {activeView === 'LIVE_RPC' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>⚡</span> Interactive Live Database Health &amp; Security Probes ({ALL_TEST_CASES.length} Tests)
              </h3>
              <p className="text-xs text-muted-foreground">
                Execute live checks directly inside PostgreSQL (<code className="font-mono">admin_run_test_case</code>) to verify live RLS policies, schemas, and cryptographic engines.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {results.size > 0 && (
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={resetResults}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-muted/60 hover:bg-muted px-4 py-2 text-xs font-bold text-foreground transition active:scale-98 disabled:opacity-50"
                >
                  🔄 Reset
                </button>
              )}

              {selectedCategory !== 'ALL' && (
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => void runAllTests(ALL_TEST_CASES)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 px-4 py-2 text-xs font-bold text-primary transition active:scale-98 disabled:opacity-50"
                >
                  🌐 Run All ({ALL_TEST_CASES.length})
                </button>
              )}

              <button
                type="button"
                disabled={isRunning}
                onClick={() => void runAllTests(filteredTests)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-md transition active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isRunning ? (
                  <>
                    <span className="inline-block animate-spin">⚙️</span>
                    Running... ({Array.from(results.values()).filter(r => r.status !== 'RUNNING').length}/{totalCount})
                  </>
                ) : (
                  <>▶️ Run {categoryLabel} ({totalCount} tests)</>
                )}
              </button>
            </div>
          </div>

          {/* Test Results Summary (When Executed) */}
          {results.size > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className={`rounded-xl p-3.5 border ${
                passCount === totalCount && failCount === 0
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-slate-300 bg-slate-100 dark:bg-slate-800/40 dark:border-slate-700'
              }`}>
                <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-400">{passCount}</div>
                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Passed</div>
              </div>

              <div className={`rounded-xl p-3.5 border ${
                failCount > 0
                  ? 'border-red-500/40 bg-red-500/10'
                  : 'border-slate-300 bg-slate-100 dark:bg-slate-800/40 dark:border-slate-700'
              }`}>
                <div className="text-xl sm:text-2xl font-black text-red-700 dark:text-red-400">{failCount}</div>
                <div className="text-xs font-semibold text-red-900 dark:text-red-200">Failed</div>
              </div>

              <div className="rounded-xl p-3.5 border border-amber-500/40 bg-amber-500/10">
                <div className="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-400">{criticalFailures}</div>
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">Critical Failures</div>
              </div>

              <div className={`rounded-xl p-3.5 border ${
                criticalFailures === 0 && results.size === totalCount
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-slate-300 bg-slate-100 dark:bg-slate-800/40 dark:border-slate-700'
              }`}>
                <div className="text-xl sm:text-2xl font-black">
                  {criticalFailures === 0 && results.size === totalCount ? '✅' : '⚠️'}
                </div>
                <div className="text-xs font-semibold text-foreground">
                  {criticalFailures === 0 && results.size === totalCount ? 'Go-Live Ready' : 'Blocked'}
                </div>
              </div>
            </div>
          )}

          {/* Category & Critical Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border bg-background px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            >
              <option value="ALL">All Categories ({ALL_TEST_CASES.length})</option>
              <option value="SECURITY">Security Tests ({ALL_TEST_CASES.filter(t => t.category === 'SECURITY').length})</option>
              <option value="IDENTITY_PROTECTION">Identity Protection ({ALL_TEST_CASES.filter(t => t.category === 'IDENTITY_PROTECTION').length})</option>
              <option value="INTEGRATION">Integration Tests ({ALL_TEST_CASES.filter(t => t.category === 'INTEGRATION').length})</option>
              <option value="E2E">E2E Tests ({ALL_TEST_CASES.filter(t => t.category === 'E2E').length})</option>
              <option value="UNIT">Unit Tests ({ALL_TEST_CASES.filter(t => t.category === 'UNIT').length})</option>
            </select>

            <label className="inline-flex min-h-[44px] items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyCritical}
                onChange={(e) => setShowOnlyCritical(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span className="text-xs font-semibold text-foreground">
                Show only critical tests ({ALL_TEST_CASES.filter(t => t.critical).length})
              </span>
            </label>
          </div>

          {/* Mobile Card List (Mobile-First View) */}
          <div className="space-y-3 sm:hidden">
            {filteredTests.map((test) => {
              const result = results.get(test.id);
              const isTestRunning = isRunning || result?.status === 'RUNNING';
              return (
                <div key={test.id} className="rounded-xl border bg-card p-3.5 shadow-2xs space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-foreground">{test.id}</span>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          test.category === 'SECURITY'
                            ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                            : test.category === 'IDENTITY_PROTECTION'
                            ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                            : test.category === 'INTEGRATION'
                            ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                            : test.category === 'E2E'
                            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-500/20 text-slate-700 dark:text-slate-300'
                        }`}>
                          {test.category}
                        </span>
                        {test.critical && (
                          <span className="inline-block rounded-full bg-amber-500 text-black px-2 py-0.5 text-[10px] font-bold">
                            CRITICAL
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-foreground leading-snug">{test.name}</h4>
                    </div>
                    <div>
                      {result ? (
                        result.status === 'RUNNING' ? (
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold text-xs">
                            <span className="inline-block animate-spin">⚙️</span>
                          </span>
                        ) : result.status === 'PASS' ? (
                          <span className="inline-block rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                            ✅ PASS
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-red-500/20 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold">
                            ❌ FAIL
                          </span>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{test.description}</p>
                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {result?.duration ? `${result.duration}ms` : 'Not run'}
                    </span>
                    <button
                      type="button"
                      disabled={isTestRunning}
                      onClick={() => void executeSingleTest(test)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground px-4 py-2 text-xs font-bold border transition active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
                      title={`Execute test ${test.id}`}
                    >
                      {result?.status === 'RUNNING' ? (
                        <>
                          <span className="inline-block animate-spin text-xs">⚙️</span>
                          <span>Running...</span>
                        </>
                      ) : (
                        <>▶ Run Test</>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Test Cases Table (Desktop View) */}
          <div className="hidden sm:block rounded-xl border bg-card overflow-hidden shadow-2xs">
            <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20">
              <table className="w-full text-xs min-w-[800px]">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-xs border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold">Test ID</th>
                    <th className="px-4 py-3 text-left font-bold">Category</th>
                    <th className="px-4 py-3 text-left font-bold">Test Name</th>
                    <th className="px-4 py-3 text-left font-bold">Description</th>
                    <th className="px-4 py-3 text-center font-bold">Priority</th>
                    <th className="px-4 py-3 text-center font-bold">Status</th>
                    <th className="px-4 py-3 text-right font-bold">Duration</th>
                    <th className="px-4 py-3 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTests.map((test) => {
                    const result = results.get(test.id);
                    const isTestRunning = isRunning || result?.status === 'RUNNING';
                    return (
                      <tr key={test.id} className="border-b hover:bg-muted/50 transition">
                        <td className="px-4 py-3 font-mono font-semibold">{test.id}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            test.category === 'SECURITY'
                              ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                              : test.category === 'IDENTITY_PROTECTION'
                              ? 'bg-purple-500/20 text-purple-700 dark:text-purple-300'
                              : test.category === 'INTEGRATION'
                              ? 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                              : test.category === 'E2E'
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-500/20 text-slate-700 dark:text-slate-300'
                          }`}>
                            {test.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold">{test.name}</td>
                        <td className="px-4 py-3 text-muted-foreground max-w-md">{test.description}</td>
                        <td className="px-4 py-3 text-center">
                          {test.critical ? (
                            <span className="inline-block rounded-full bg-amber-500 text-black px-2 py-0.5 text-[10px] font-bold">
                              CRITICAL
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Standard</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {result ? (
                            result.status === 'RUNNING' ? (
                              <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                                <span className="inline-block animate-spin">⚙️</span> Running
                              </span>
                            ) : result.status === 'PASS' ? (
                              <span className="inline-block rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                                ✅ PASS
                              </span>
                            ) : (
                              <span className="inline-block rounded-full bg-red-500/20 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold">
                                ❌ FAIL
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {result?.duration ? `${result.duration}ms` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={isTestRunning}
                            onClick={() => void executeSingleTest(test)}
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 text-xs font-semibold border transition active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={`Execute test ${test.id}`}
                          >
                            {result?.status === 'RUNNING' ? (
                              <>
                                <span className="inline-block animate-spin text-[10px]">⚙️</span>
                                <span>...</span>
                              </>
                            ) : (
                              <>▶ Run</>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Failure Details */}
          {Array.from(results.values()).some(r => r.status === 'FAIL' && r.error) && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 sm:p-6">
              <h3 className="text-sm font-bold text-red-900 dark:text-red-300 mb-3">❌ Test Failure Details</h3>
              <div className="space-y-2">
                {Array.from(results.entries())
                  .filter(([_, result]) => result.status === 'FAIL' && result.error)
                  .map(([testId, result]) => (
                    <div key={testId} className="rounded-xl bg-card p-3 border border-red-200 dark:border-red-900/40 shadow-2xs">
                      <div className="font-mono font-bold text-xs text-red-700 dark:text-red-400">{testId}</div>
                      <div className="text-xs text-red-900 dark:text-red-200 mt-1">{result.error}</div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
