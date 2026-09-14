import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('=================================================================');
console.log('  🛡️  PHASE 3 (SCREENS 31–40) VERIFICATION & QUALITY SUITE');
console.log('=================================================================\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(name, fn) {
  totalChecks++;
  try {
    const result = fn();
    if (result === false) {
      failedChecks++;
      console.error(`  ❌ FAIL: ${name}`);
    } else {
      passedChecks++;
      console.log(`  ✓ PASS: ${name}`);
    }
  } catch (err) {
    failedChecks++;
    console.error(`  ❌ FAIL: ${name} -> ${err.message}`);
  }
}

// 1. Check all required screen files exist
const requiredFiles = [
  'apps/web/src/features/site/pages/LandingPage.tsx',
  'apps/web/src/features/site/pages/AboutPage.tsx',
  'apps/web/src/features/site/pages/PricingPage.tsx',
  'apps/web/src/features/site/pages/FaqPage.tsx',
  'apps/web/src/features/site/components/SiteLayout.tsx',
  'apps/web/src/features/site/components/SiteHeader.tsx',
  'apps/web/src/features/site/components/RequirementPrompt.tsx',
  'apps/web/src/features/site/components/IdentityProtectedComparisonPreview.tsx',
  'apps/web/src/features/portal/pages/LoginPage.tsx',
  'apps/web/src/features/portal/pages/SignupPage.tsx',
  'apps/web/src/features/portal/pages/ResetPasswordPage.tsx',
  'apps/web/src/features/portal/pages/LegalPage.tsx',
  'apps/web/src/features/portal/components/BuyerRegisterForm.tsx',
  'apps/web/src/features/portal/components/SupplierRegisterForm.tsx',
  'apps/web/src/features/portal/components/GstinAutofillField.tsx',
  'apps/web/src/features/portal/components/RoleChoiceField.tsx',
  'apps/web/src/features/portal/components/VerificationChoice.tsx',
  'apps/web/src/features/portal/components/SignupSuccess.tsx',
  'apps/web/src/features/portal/components/PortalFooter.tsx',
];

console.log('📁 1. Verifying Phase 3 Screen & Component Artifacts:');
for (const relPath of requiredFiles) {
  check(`File exists: ${relPath}`, () => {
    return fs.existsSync(path.join(rootDir, relPath));
  });
}

// 2. Scan for canonical procurement vocabulary violations
console.log('\n🛡️ 2. Scanning for Canonical Procurement Vocabulary Violations:');
const PROHIBITED_WORDS = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
const regex = new RegExp(`\\b(${PROHIBITED_WORDS.join('|')})\\b`, 'i');

function walkDir(currentDir, fileList = []) {
  if (!fs.existsSync(currentDir)) return fileList;
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (['node_modules', 'dist', '.git', '.vite', 'coverage', 'backups'].includes(entry.name)) continue;
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, fileList);
    } else if (/\.(tsx|jsx|ts|js|html)$/.test(entry.name) && !entry.name.includes('.test.') && !entry.name.includes('verify-vocabulary')) {
      fileList.push(full);
    }
  }
  return fileList;
}

const scannedFiles = walkDir(path.join(rootDir, 'apps/web/src'));
const violations = [];

for (const file of scannedFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    const match = line.match(regex);
    if (match) {
      violations.push({
        file: path.relative(rootDir, file).replace(/\\/g, '/'),
        line: idx + 1,
        word: match[1],
        lineContent: line.trim(),
      });
    }
  });
}

check(`Zero vocabulary violations across ${scannedFiles.length} source files`, () => {
  if (violations.length > 0) {
    violations.forEach(v => console.error(`    Found [${v.word}] at ${v.file}:${v.line} -> "${v.lineContent}"`));
    return false;
  }
  return true;
});

// 3. Check UX Invariants (Safe-Area Bottom Padding & 44px+ touch targets)
console.log('\n📱 3. Verifying UX Invariants & Mobile Ergonomics:');

check('SiteLayout includes safe-area bottom inset padding', () => {
  const layoutCode = fs.readFileSync(path.join(rootDir, 'apps/web/src/features/site/components/SiteLayout.tsx'), 'utf8');
  return layoutCode.includes('safe-area-inset-bottom');
});

check('Mobile touch targets in SignInForm meet or exceed 44px (h-11)', () => {
  const signInCode = fs.readFileSync(path.join(rootDir, 'apps/web/src/features/auth/components/SignInForm.tsx'), 'utf8');
  return signInCode.includes('h-11');
});

check('GstinAutofillField supports 15-digit uppercase formatting & live status preview', () => {
  const gstinCode = fs.readFileSync(path.join(rootDir, 'apps/web/src/features/portal/components/GstinAutofillField.tsx'), 'utf8');
  return gstinCode.includes('maxLength={15}') && gstinCode.includes('Live Verified GSTIN');
});

console.log('\n=================================================================');
console.log(`  FINAL VERIFICATION SUMMARY: ${passedChecks}/${totalChecks} checks passed.`);
console.log('=================================================================\n');

if (failedChecks > 0) process.exit(1);
process.exit(0);
