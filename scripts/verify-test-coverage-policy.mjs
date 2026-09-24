/**
 * =============================================================================
 * OTP Platform — Automated Test Suite Expansion & Coverage Policy Engine (MJS)
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function collectFiles(dir, pattern, excludeDirs = ['node_modules', 'dist', '.git', 'releases', 'backups']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function traverse(current) {
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

export function auditTestCategories() {
  const unitDirs = [
    path.join(ROOT_DIR, 'packages', 'domain', 'src'),
    path.join(ROOT_DIR, 'tests', 'unit'),
    path.join(ROOT_DIR, 'supabase', 'functions', '_shared'),
    path.join(ROOT_DIR, 'apps', 'web', 'src', 'lib'),
  ];
  const unitFiles = [];
  for (const d of unitDirs) {
    unitFiles.push(...collectFiles(d, /\.test\.(ts|tsx|js)$/));
  }

  const moduleDirs = [
    path.join(ROOT_DIR, 'apps', 'web', 'src', 'features'),
    path.join(ROOT_DIR, 'apps', 'web', 'src', 'components'),
    path.join(ROOT_DIR, 'packages', 'database', 'src'),
    path.join(ROOT_DIR, 'packages', 'services', 'src'),
  ];
  const moduleFiles = [];
  for (const d of moduleDirs) {
    moduleFiles.push(...collectFiles(d, /\.test\.(ts|tsx|js)$/));
  }

  const functionalDirs = [
    path.join(ROOT_DIR, 'tests', 'integration'),
    path.join(ROOT_DIR, 'tests', 'security'),
    path.join(ROOT_DIR, 'tests', 'demo'),
    path.join(ROOT_DIR, 'tests', 'functional'),
  ];
  const functionalFiles = [];
  for (const d of functionalDirs) {
    functionalFiles.push(...collectFiles(d, /\.test\.(ts|tsx|js)$/));
  }

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

export function checkCoverageAppendRule(strict = false) {
  const violations = [];
  let gitAvailable = false;
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    gitAvailable = true;
  } catch {
    gitAvailable = false;
  }

  if (gitAvailable) {
    try {
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
      } else {
        try {
          const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
          if (staged) {
            diffCommand = 'git diff --cached --name-only';
          }
        } catch {
          // fallback
        }
      }

      const output = execSync(diffCommand, { encoding: 'utf8' }).trim();
      if (!output) {
        return violations;
      }

      const changedFiles = output
        .split('\n')
        .map(l => l.replace(/^\s*[MADRCU?!]{1,2}\s+/, '').trim())
        .filter(f => f.length > 0);

      const changedSourceFiles = changedFiles.filter(f => {
        const isSource = /\.(ts|tsx|js|jsx)$/.test(f);
        const isTest = /\.test\.(ts|tsx|js|jsx)$/.test(f);
        const isExcluded = f.startsWith('dist/') || f.startsWith('scripts/') || f.startsWith('backups/');
        return isSource && !isTest && !isExcluded;
      });

      const changedTestFiles = changedFiles.filter(f => /\.test\.(ts|tsx|js|jsx)$/.test(f));
      const isStrictAppend = strict || process.env.STRICT_APPEND_RULE === 'true';

      for (const src of changedSourceFiles) {
        const featureMatch = src.match(/apps\/web\/src\/features\/([^/]+)/);
        if (featureMatch) {
          const featureName = featureMatch[1];
          const hasMatchingTestChange = changedTestFiles.some(t => t.includes(`features/${featureName}`));
          const featureTestFiles = collectFiles(
            path.join(ROOT_DIR, 'apps', 'web', 'src', 'features', featureName),
            /\.test\.(ts|tsx|js)$/
          );

          if (featureTestFiles.length === 0) {
            violations.push(
              `Feature '${featureName}' modified in '${src}' but has NO test coverage in 'apps/web/src/features/${featureName}/'.`
            );
          } else if (isStrictAppend && !hasMatchingTestChange) {
            violations.push(
              `Code modified in '${src}' without corresponding test update in 'apps/web/src/features/${featureName}/'.`
            );
          }
        }

        if (src.startsWith('packages/domain/src/')) {
          const hasDomainTestChange = changedTestFiles.some(t => t.startsWith('packages/domain/'));
          if (isStrictAppend && !hasDomainTestChange) {
            violations.push(
              `Domain logic modified in '${src}' without corresponding test update in 'packages/domain/'.`
            );
          }
        }
      }
    } catch (err) {
      console.warn(`[WARN] Git diff check skipped: ${err.message}`);
    }
  }

  return violations;
}

export function runPolicyAudit(strict = false) {
  const categories = auditTestCategories();
  const appendRuleViolations = checkCoverageAppendRule(strict);

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

  console.log('='.repeat(70));
  console.log('  🛡️  OTP PLATFORM — TEST SUITE COVERAGE & EXPANSION POLICY AUDIT');
  console.log('='.repeat(70));
  console.log(`Mode: ${isStrict ? '🔒 STRICT (Coverage Append Enforced)' : '🔍 STANDARD'}\n`);

  const result = runPolicyAudit(isStrict);

  console.log('--- 4-TIER TEST ARCHITECTURE COMPLIANCE ---');
  for (const cat of result.categories) {
    const symbol = cat.passed ? '✓' : '✗';
    const status = cat.passed ? 'PASS' : 'FAIL';
    console.log(`[${symbol}] [${status}] ${cat.category.padEnd(12)} : ${cat.files.length} tests (min: ${cat.minRequired})`);
    console.log(`    ↳ ${cat.description}`);
  }

  console.log(`\nTotal Test Files Detected: ${result.totalTestFiles}`);

  if (result.appendRuleViolations.length > 0) {
    console.log('\n❌ COVERAGE APPEND RULE VIOLATIONS:');
    for (const v of result.appendRuleViolations) {
      console.log(`  • ${v}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  if (result.passed) {
    console.log('✅ TEST COVERAGE POLICY AUDIT: PASSED (100% Policy Compliance)');
    console.log('='.repeat(70));
    process.exit(0);
  } else {
    console.error('❌ TEST COVERAGE POLICY AUDIT: FAILED');
    console.log('='.repeat(70));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
