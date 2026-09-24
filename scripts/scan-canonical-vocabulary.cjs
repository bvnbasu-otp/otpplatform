/**
 * OTP Platform — Canonical Procurement Vocabulary Scanner (CJS)
 */
const fs = require('fs');
const path = require('path');

const PROHIBITED_WORDS = [
  'bid',
  'bids',
  'bidder',
  'bidders',
  'bidding',
  'blind',
];

const SCAN_DIRECTORIES = [
  'apps/web/src',
];

const TARGET_EXTENSIONS = /\.(tsx|jsx|ts|js|html)$/;

const IGNORE_DIRS = [
  'node_modules',
  'dist',
  '.git',
  '.vite',
  'coverage',
  'backups',
];

function shouldIgnoreFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('.test.') || normalized.includes('__tests__')) return true;
  if (normalized.endsWith('verify-vocabulary.ts') || normalized.endsWith('verify-vocabulary.mjs') || normalized.endsWith('scan-canonical-vocabulary.cjs')) return true;
  return false;
}

function scanVocabulary(
  rootDir = path.resolve(__dirname, '..'),
  prohibitedWords = PROHIBITED_WORDS,
  scanDirs = SCAN_DIRECTORIES
) {
  const regex = new RegExp(`\\b(${prohibitedWords.join('|')})\\b`, 'i');
  const violations = [];
  let filesScanned = 0;

  function walkDirectory(currentDir) {
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

        lines.forEach((line, index) => {
          const match = line.match(regex);
          if (match) {
            violations.push({
              file: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
              line: index + 1,
              term: match[0],
              context: line.trim(),
            });
          }
        });
      }
    }
  }

  for (const relDir of scanDirs) {
    const fullDir = path.resolve(rootDir, relDir);
    walkDirectory(fullDir);
  }

  return { filesScanned, violations };
}

function runScanner() {
  console.log('='.repeat(65));
  console.log('  🛡️  OTP PLATFORM — CANONICAL PROCUREMENT VOCABULARY SCANNER');
  console.log('='.repeat(65));
  console.log(`Prohibited Terms : ${PROHIBITED_WORDS.join(', ')}`);
  console.log(`Target Folders   : ${SCAN_DIRECTORIES.join(', ')}\n`);

  const { filesScanned, violations } = scanVocabulary();

  if (violations.length === 0) {
    console.log(`\x1b[32m✓ PASSED: Scanned ${filesScanned} source files. 0 vocabulary violations detected.\x1b[0m\n`);
    process.exit(0);
  } else {
    console.error(`\x1b[31m✗ FAILED: Found ${violations.length} prohibited term occurrence(s) across ${filesScanned} files:\x1b[0m\n`);
    violations.forEach(v => {
      console.error(`  \x1b[33m${v.file}:${v.line}\x1b[0m — Found prohibited term '\x1b[31m${v.term}\x1b[0m'`);
      console.error(`    ↳ Line: ${v.context}\n`);
    });
    process.exit(1);
  }
}

if (require.main === module) {
  runScanner();
}

module.exports = { scanVocabulary, PROHIBITED_WORDS, SCAN_DIRECTORIES };
