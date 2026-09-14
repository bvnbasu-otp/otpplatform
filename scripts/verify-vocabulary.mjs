import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROHIBITED_WORDS = [
  'bid',
  'bids',
  'bidder',
  'bidders',
  'bidding',
  'blind',
];

export const SCAN_DIRECTORIES = [
  'apps/web/src',
];

export const TARGET_EXTENSIONS = /\.(tsx|jsx|ts|js|html)$/;

export const IGNORE_DIRS = [
  'node_modules',
  'dist',
  '.git',
  '.vite',
  'coverage',
  'backups',
];

export function shouldIgnoreFile(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('.test.') || normalized.includes('__tests__')) return true;
  if (normalized.endsWith('verify-vocabulary.ts') || normalized.endsWith('verify-vocabulary.mjs')) return true;
  return false;
}

export function scanVocabulary(
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
  process.exit(1);
}
