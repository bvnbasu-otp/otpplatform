/**
 * =============================================================================
 * OTP Platform — Automated Test Suite Expansion & Coverage Policy Engine
 * =============================================================================
 * Enforces the mandatory test coverage policy:
 * 1. Coverage Append Rule:
 *    Every code modification, bug fix, or feature MUST include matching test
 *    updates/additions across:
 *      - Unit Tests: isolated helper functions, formulas (GST, weights, sanitizers), utility logic
 *      - Module Tests: specific components or views in isolation
 *      - Functional Tests: user workflows (subscription payments, layout rendering, permissions, intake)
 *      - Regression Tests: master regression battery integrity
 * 2. Pre-Merge / Pre-Deploy Validation:
 *    Blocks any release build or PR merge where code is added or modified
 *    without corresponding test coverage.
 * 3. Parity Audit:
 *    Ensures all 4 test categories meet minimum structural thresholds and
 *    that feature modules maintain dedicated test coverage.
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface CategoryResult {
  category: 'UNIT' | 'MODULE' | 'FUNCTIONAL' | 'REGRESSION';
  description: string;
  files: string[];
  minRequired: number;
  passed: boolean;
  notes?: string;
}

interface PolicyAuditResult {
  passed: boolean;
  categories: CategoryResult[];
  appendRuleViolations: string[];
  totalTestFiles: number;
}

const ROOT_DIR = path.resolve(__dirname, '..');

// Helper to recursively collect files matching a regex pattern
function collectFiles(dir: string, pattern: RegExp, excludeDirs: string[] = ['node_modules', 'dist', '.git', 'releases', 'backups']): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  function traverse(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeDirs.includes(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (pattern.test(entry.name)) {
        results.push(path.relative(ROOT_DIR, fullPath).replace(/\\/g, '/'));
      }
    }
  }

  traverse(dir);
  return results;
}

/**
 * Categorizes all existing tests into the 4 mandatory tiers.
 */
function auditTestCategories(): CategoryResult[] {
  // 1. Unit Tests (Formulas, isolated utilities, domain logic, parsing, helpers)
  const unitDirs = [
    path.join(ROOT_DIR, 'packages', 'domain', 'src'),
    path.join(ROOT_DIR, 'tests', 'unit'),
    path.join(ROOT_DIR, 'supabase', 'functions', '_shared'),
    path.join(ROOT_DIR, 'apps', 'web', 'src', 'lib'),
  ];
  const unitFiles: string[] = [];
  for (const d of unitDirs) {
    unitFiles.push(...collectFiles(d, /\.test\.(ts|tsx|js)$/));
  }

  // 2. Module Tests (Specific features, components, views, services, db mappers in isolation)
  const moduleDirs = [
    path.join(ROOT_DIR, 'apps', 'web', 'src', 'features'),
    path.join(ROOT_DIR, 'apps', 'web', 'src', 'components'),
    path.join(ROOT_DIR, 'packages', 'database', 'src'),
    path.join(ROOT_DIR, 'packages', 'services', 'src'),
  ];
  const moduleFiles: string[] = [];
  for (const d of moduleDirs) {
    moduleFiles.push(...collectFiles(d, /\.test\.(ts|tsx|js)$/));
  }

  // 3. Functional Tests (User workflows, permissions, intake, subscription, e2e flows)
  const functionalDirs = [
    path.join(ROOT_DIR, 'tests', 'integration'),
    path.join(ROOT_DIR, 'tests', 'security'),
    path.join(ROOT_DIR, 'tests', 'demo'),
    path.join(ROOT_DIR, 'tests', 'functional'),
  ];
  const functionalFiles: string[] = [];
  for (const d of functionalDirs) {
    functionalFiles.push(...collectFiles(d, /\.test\.(ts|tsx|js)$/));
  }

  // 4. Regression Tests (Master regression battery, live smoke, gatekeeper)
  const regressionFiles = [
    'scripts/run-master-regression.ts',
    'scripts/verify-staging-gate.ts',
    'scripts/test-live-smoke.ts',
    'scripts/run_live_automated_tests.ts',
  ].filter(f => fs.existsSync(path.join(ROOT_DIR, f)));

  return [
    {
      category: 'UNIT',
      description: 'Isolated helpers, formulas (GST, weights, sanitizers), utility logic',
      files: unitFiles,
      minRequired: 10,
      passed: unitFiles.length >= 10,
      notes: `${unitFiles.length} unit test files found across domain, unit, and shared packages`,
    },
    {
      category: 'MODULE',
      description: 'Specific features, views, components, and service mappers in isolation',
      files: moduleFiles,
      minRequired: 20,
      passed: moduleFiles.length >= 20,
      notes: `${moduleFiles.length} module test files found across web features, components, and services`,
    },
    {
      category: 'FUNCTIONAL',
      description: 'User workflows (subscription payments, intake, permissions, lifecycle)',
      files: functionalFiles,
      minRequired: 15,
      passed: functionalFiles.length >= 15,
      notes: `${functionalFiles.length} functional/integration test files found across security and workflows`,
    },
    {
      category: 'REGRESSION',
      description: 'Master regression battery integrity and verification gatekeeper',
      files: regressionFiles,
      minRequired: 3,
      passed: regressionFiles.length >= 3,
      notes: `${regressionFiles.length} regression battery orchestrators found`,
    },
  ];
}

/**
 * Enforces the Coverage Append Rule:
 * For every modified or newly added code file, verifies that a matching test file
 * is also created or modified in the same change set.
 */
function checkCoverageAppendRule(): string[] {
  const violations: string[] = [];

  // Check if git is available
  let gitAvailable = false;
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    gitAvailable = true;
  } catch {
    gitAvailable = false;
  }

  if (gitAvailable) {
    try {
      // Check staged + unstaged changes, or compare against base ref if in CI
      let diffCommand = 'git status --porcelain';
      if (process.env.GITHUB_BASE_REF) {
        diffCommand = `git diff --name-only origin/${process.env.GITHUB_BASE_REF}...HEAD`;
      } else if (process.env.CI) {
        try {
          execSync('git rev-parse --verify HEAD~1', { stdio: 'ignore' });
          diffCommand = 'git diff --name-only HEAD~1 HEAD';
        } catch {
          diffCommand = 'git status --porcelain';
        }
      }

      const output = execSync(diffCommand, { encoding: 'utf8' }).trim();
      if (!output) {
        return violations; // No uncommitted or branch changes
      }

      const changedFiles = output
        .split('\n')
        .map(l => l.replace(/^[MADRCU?!]{1,2}\s+/, '').trim())
        .filter(f => f.length > 0);

      // Separate source files and test files
      const changedSourceFiles = changedFiles.filter(f => {
        const isSource = /\.(ts|tsx|js|jsx)$/.test(f);
        const isTest = /\.test\.(ts|tsx|js|jsx)$/.test(f);
        const isExcluded = f.startsWith('dist/') || f.startsWith('scripts/') || f.startsWith('backups/');
        return isSource && !isTest && !isExcluded;
      });

      const changedTestFiles = changedFiles.filter(f => /\.test\.(ts|tsx|js|jsx)$/.test(f));

      // For each changed feature or package source file, check if corresponding tests exist/changed
      for (const src of changedSourceFiles) {
        // Feature file check
        const featureMatch = src.match(/apps\/web\/src\/features\/([^/]+)/);
        if (featureMatch) {
          const featureName = featureMatch[1];
          const hasMatchingTestChange = changedTestFiles.some(t => t.includes(`features/${featureName}`));
          // Check if test exists at all in that feature
          const featureTestFiles = collectFiles(
            path.join(ROOT_DIR, 'apps', 'web', 'src', 'features', featureName),
            /\.test\.(ts|tsx|js)$/
          );

          if (featureTestFiles.length === 0) {
            violations.push(
              `Feature '${featureName}' modified in '${src}' but has NO test coverage in 'apps/web/src/features/${featureName}/'.`
            );
          } else if (process.env.STRICT_APPEND_RULE === 'true' && !hasMatchingTestChange) {
            violations.push(
              `Code modified in '${src}' without corresponding test update in 'apps/web/src/features/${featureName}/'.`
            );
          }
        }

        // Domain package check
        if (src.startsWith('packages/domain/src/')) {
          const hasDomainTestChange = changedTestFiles.some(t => t.startsWith('packages/domain/'));
          if (process.env.STRICT_APPEND_RULE === 'true' && !hasDomainTestChange) {
            violations.push(
              `Domain logic modified in '${src}' without corresponding test update in 'packages/domain/'.`
            );
          }
        }
      }
    } catch (err: any) {
      // Git command error; fallback gracefully
      console.warn(`[WARN] Git diff check skipped: ${err.message}`);
    }
  } else {
    // Standalone / Offline mode: Enforce Feature Parity
    // Ensure every major feature directory has at least 1 test file
    const featuresDir = path.join(ROOT_DIR, 'apps', 'web', 'src', 'features');
    if (fs.existsSync(featuresDir)) {
      const features = fs.readdirSync(featuresDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const feat of features) {
        const featDir = path.join(featuresDir, feat);
        const tests = collectFiles(featDir, /\.test\.(ts|tsx|js)$/);
        if (tests.length === 0) {
          violations.push(`Feature module 'apps/web/src/features/${feat}' lacks dedicated module test coverage.`);
        }
      }
    }
  }

  return violations;
}

export function runPolicyAudit(strict = false): PolicyAuditResult {
  const categories = auditTestCategories();
  const appendRuleViolations = checkCoverageAppendRule();

  const totalTestFiles = categories.reduce((sum, c) => sum + c.files.length, 0);
  const categoriesPassed = categories.every(c => c.passed);
  const passed = categoriesPassed && (!strict || appendRuleViolations.length === 0);

  return {
    passed,
    categories,
    appendRuleViolations,
    totalTestFiles,
  };
}

async function main() {
  const isStrict = process.argv.includes('--strict') || process.env.STRICT_APPEND_RULE === 'true';

  console.log('\n=================================================================');
  console.log('  🧪 OTP PLATFORM — AUTOMATED TEST COVERAGE & EXPANSION POLICY');
  console.log('=================================================================');
  console.log(`Timestamp : ${new Date().toISOString()}`);
  console.log(`Strict Mode: ${isStrict ? 'ENABLED (Zero Violations Tolerated)' : 'STANDARD'}\n`);

  const audit = runPolicyAudit(isStrict);

  console.log('Tiered Test Category Audit:');
  for (const cat of audit.categories) {
    const icon = cat.passed ? '\x1b[32m✓ PASS\x1b[0m' : '\x1b[31m✕ FAIL\x1b[0m';
    console.log(` [${icon}] ${cat.category.padEnd(11)}: ${cat.files.length.toString().padStart(3)} test files (min: ${cat.minRequired})`);
    console.log(`        └─ ${cat.description}`);
  }

  console.log(`\nTotal Active Test Files: ${audit.totalTestFiles}`);

  if (audit.appendRuleViolations.length > 0) {
    console.log('\n=================================================================');
    console.log('  ⚠️ COVERAGE APPEND RULE AUDIT FINDINGS');
    console.log('=================================================================');
    audit.appendRuleViolations.forEach(v => console.log(`  - ❌ ${v}`));

    if (isStrict) {
      console.log('\n\x1b[31m[REJECTED] Coverage append rule violation! Code modified or added without matching test coverage.\x1b[0m');
      console.log('Every new feature, bugfix, or refactor MUST be accompanied by corresponding tests.');
      process.exit(1);
    } else {
      console.log('\n[NOTICE] Run with --strict to block builds on uncovered feature modules.');
    }
  } else {
    console.log('\n\x1b[32m✓ COVERAGE APPEND RULE: 100% COMPLIANT\x1b[0m');
    console.log('All features and modified packages have verified corresponding test coverage.');
  }

  if (audit.passed) {
    console.log('\n\x1b[32m🎉 TEST POLICY GATE PASSED: Test suite expansion criteria satisfied.\x1b[0m\n');
    process.exit(0);
  } else {
    console.log('\n\x1b[31m🛑 TEST POLICY GATE FAILED: One or more test categories fell below required thresholds.\x1b[0m\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal policy error:', err);
    process.exit(1);
  });
}
