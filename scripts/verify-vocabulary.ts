/**
 * =============================================================================
 * OTP Platform — Canonical Procurement Vocabulary Scanner
 * =============================================================================
 * Enforces zero-tolerance compliance with canonical procurement vocabulary.
 * 
 * Rules:
 * 1. Prohibited auction-style / reverse-auction terms:
 *    - "bid", "bids", "bidder", "bidders", "bidding"
 *    - Canonical replacements: "quote", "quotation", "supplier", "vendor", "rate"
 * 
 * 2. Prohibited obfuscation terms:
 *    - "blind"
 *    - Canonical replacements: "identity-protected", "masked", "sealed"
 * 
 * You can modify the lists below to adjust prohibited terms, file extensions,
 * or add allowed exceptions.
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// 1. CONFIGURATION & RULES (MODIFY THESE AS NEEDED)
// -----------------------------------------------------------------------------

/**
 * Words or patterns prohibited across UI and source files.
 * Word boundary (\b) and case-insensitivity (i) are applied automatically.
 */
export const PROHIBITED_WORDS: string[] = [
  'bid',
  'bids',
  'bidder',
  'bidders',
  'bidding',
  'blind',
];

/**
 * Directories to scan relative to repository root.
 */
export const SCAN_DIRECTORIES: string[] = [
  'apps/web/src',
  // 'packages/domain/src', // Uncomment if you want to extend scanning to packages
];

/**
 * File extensions to scan.
 */
export const TARGET_EXTENSIONS: RegExp = /\.(tsx|jsx|ts|js|html)$/;

/**
 * Directories or patterns to ignore during scan.
 */
export const IGNORE_DIRS: string[] = [
  'node_modules',
  'dist',
  '.git',
  '.vite',
  'coverage',
  'backups',
];

/**
 * Files to ignore (e.g., test files and this scanner script itself).
 */
export function shouldIgnoreFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('.test.') || normalized.includes('__tests__')) return true;
  if (normalized.endsWith('verify-vocabulary.ts')) return true;
  return false;
}

// -----------------------------------------------------------------------------
// 2. SCANNER IMPLEMENTATION
// -----------------------------------------------------------------------------

interface Violation {
  file: string;
  line: number;
  word: string;
  lineContent: string;
}

export function scanVocabulary(
  rootDir = path.resolve(__dirname, '..'),
  prohibitedWords = PROHIBITED_WORDS,
  scanDirs = SCAN_DIRECTORIES
): { passed: boolean; violations: Violation[]; filesScanned: number } {
  const regex = new RegExp(`\\b(${prohibitedWords.join('|')})\\b`, 'i');
  const violations: Violation[] = [];
  let filesScanned = 0;

  function walkDirectory(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.includes(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walkDirectory(fullPath);
      } else if (TARGET_EXTENSIONS.test(entry.name) && !shouldIgnoreFile(fullPath)) {
        filesScanned++;
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        lines.forEach((line, idx) => {
          const match = line.match(regex);
          if (match) {
            violations.push({
              file: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
              line: idx + 1,
              word: match[1],
              lineContent: line.trim(),
            });
          }
        });
      }
    }
  }

  for (const scanDir of scanDirs) {
    walkDirectory(path.join(rootDir, scanDir));
  }

  return {
    passed: violations.length === 0,
    violations,
    filesScanned,
  };
}

// -----------------------------------------------------------------------------
// 3. CLI RUNNER
// -----------------------------------------------------------------------------

const isMain = process.argv[1]?.includes('verify-vocabulary') || (typeof require !== 'undefined' && require.main === module);
if (isMain) {
  console.log('=================================================================');
  console.log('  🛡️  OTP PLATFORM — CANONICAL PROCUREMENT VOCABULARY SCANNER');
  console.log('=================================================================');
  console.log(`Prohibited Terms : ${PROHIBITED_WORDS.join(', ')}`);
  console.log(`Target Folders   : ${SCAN_DIRECTORIES.join(', ')}\n`);

  const result = scanVocabulary();

  if (result.passed) {
    console.log(`\x1b[32m✓ PASSED: Scanned ${result.filesScanned} source files. 0 vocabulary violations detected.\x1b[0m\n`);
    process.exit(0);
  } else {
    console.error(`\x1b[31m❌ FAILED: Found ${result.violations.length} prohibited vocabulary violation(s):\x1b[0m\n`);
    result.violations.forEach((v, idx) => {
      console.error(`  ${idx + 1}. [${v.word.toUpperCase()}] at ${v.file}:${v.line}`);
      console.error(`     \x1b[90mLine: "${v.lineContent}"\x1b[0m`);
    });
    console.error('\nPOLICY RULE: Replace auction-style terms with canonical procurement terms.');
    console.error('  • Instead of "bid/bidder"   -> use "quote/supplier/vendor"');
    console.error('  • Instead of "blind"        -> use "identity-protected/masked/sealed"\n');
    process.exit(1);
  }
}
