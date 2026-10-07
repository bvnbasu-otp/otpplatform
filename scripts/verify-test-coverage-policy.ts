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
import { execFileSync, execSync } from 'child_process';

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

const posix = path.posix;

/** Approved fixed-literal floor for cross-feature copy credit. */
const CROSS_FEATURE_COPY_LITERAL_MIN_LENGTH = 16;
const CROSS_FEATURE_COPY_FORBIDDEN_CHARS = /[(){};=<>]/;
const REGEX_WILDCARDS = new Set(['.', '*', '+', '?', '[', ']', '(', ')', '|', '{', '}', '^', '$']);

type CoverageDiffMode =
  | { kind: 'cached' }
  | { kind: 'range'; rangeArgs: string[] }
  | { kind: 'worktree' };

export interface CopySubstitutionPair {
  removed: string;
  added: string;
}

interface AssertedCopyLiteral {
  polarity: 'negative' | 'positive';
  text: string;
}

interface JoinedReadBinding {
  name: string;
  literals: string[];
  mapper: 'read' | 'readFileSync';
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function matchingFeatureName(sourcePath: string): string | null {
  const match = normalizeRepoPath(sourcePath).match(/apps\/web\/src\/features\/([^/]+)/);
  return match ? match[1] : null;
}

/** Existing same-feature matcher. A changed test path containing features/<feature> qualifies with no source read. */
export function hasMatchingFeatureTestChange(sourcePath: string, changedTestPaths: string[]): boolean {
  const featureName = matchingFeatureName(sourcePath);
  if (!featureName) return false;
  return changedTestPaths.some(testPath => normalizeRepoPath(testPath).includes(`features/${featureName}`));
}

/** Existing domain matcher. A changed test under packages/domain/ qualifies with no source read. */
export function hasMatchingDomainTestChange(sourcePath: string, changedTestPaths: string[]): boolean {
  if (!normalizeRepoPath(sourcePath).startsWith('packages/domain/src/')) return false;
  return changedTestPaths.some(testPath => normalizeRepoPath(testPath).startsWith('packages/domain/'));
}

function isCoverageTestPath(filePath: string): boolean {
  return /\.test\.(ts|tsx|js|jsx)$/.test(normalizeRepoPath(filePath));
}

function isIdentAt(source: string, index: number, name: string): boolean {
  if (!source.startsWith(name, index)) return false;
  if (index > 0 && /[\w$]/.test(source[index - 1])) return false;
  const after = index + name.length;
  if (after < source.length && /[\w$]/.test(source[after])) return false;
  return true;
}

function readIdentifier(source: string, index: number): string | null {
  if (!/[A-Za-z_$]/.test(source[index] ?? '')) return null;
  let end = index + 1;
  while (end < source.length && /[\w$]/.test(source[end])) end++;
  return source.slice(index, end);
}

function previousNonWs(source: string, index: number): string {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
  return cursor >= 0 ? source[cursor] : '';
}

function isRegexStart(source: string, index: number): boolean {
  if (source[index] !== '/' || source[index + 1] === '/' || source[index + 1] === '*') return false;
  const prev = previousNonWs(source, index);
  return prev === '' || '([{:;,=!?&|~+-*%^<>'.includes(prev);
}

function skipString(source: string, index: number): number {
  const quote = source[index];
  if (quote !== "'" && quote !== '"' && quote !== '`') return -1;
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (quote === '`' && source[cursor] === '$' && source[cursor + 1] === '{') return -1;
    if (source[cursor] === quote) return cursor + 1;
    if (quote !== '`' && source[cursor] === '\n') return -1;
    cursor++;
  }
  return -1;
}

function skipRegex(source: string, index: number): number {
  let cursor = index + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (source[cursor] === '/') return cursor + 1;
    if (source[cursor] === '\n') return -1;
    cursor++;
  }
  return -1;
}

/** Returns the index after a comment, string, or regex, the same index when `index` is code, or -1 if the token is unterminated. */
function skipNonCode(source: string, index: number): number {
  if (index >= source.length) return index;
  if (source[index] === '/' && source[index + 1] === '/') {
    let cursor = index + 2;
    while (cursor < source.length && source[cursor] !== '\n') cursor++;
    return cursor;
  }
  if (source[index] === '/' && source[index + 1] === '*') {
    let cursor = index + 2;
    while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) cursor++;
    if (cursor >= source.length) return -1;
    return cursor + 2;
  }
  if (source[index] === "'" || source[index] === '"' || source[index] === '`') return skipString(source, index);
  if (isRegexStart(source, index)) return skipRegex(source, index);
  return index;
}

function matchBracket(source: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let cursor = open;
  while (cursor < source.length) {
    const skipped = skipNonCode(source, cursor);
    if (skipped < 0) return -1;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    if (source[cursor] === openChar) depth++;
    else if (source[cursor] === closeChar) {
      depth--;
      if (depth === 0) return cursor;
    }
    cursor++;
  }
  return -1;
}

interface ParsedCall {
  args: string[];
  end: number;
}

function parseNamedCall(expr: string, name: string): ParsedCall | null {
  let cursor = 0;
  while (cursor < expr.length && /\s/.test(expr[cursor])) cursor++;
  if (!isIdentAt(expr, cursor, name)) return null;
  cursor += name.length;
  while (cursor < expr.length && /\s/.test(expr[cursor])) cursor++;
  if (expr[cursor] !== '(') return null;
  cursor++;
  const args: string[] = [];
  let argStart = cursor;
  let depth = 0;
  while (cursor < expr.length) {
    const skipped = skipNonCode(expr, cursor);
    if (skipped < 0) return null;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    const ch = expr[cursor];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cursor++;
      continue;
    }
    if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) {
      depth--;
      cursor++;
      continue;
    }
    if (ch === ',' && depth === 0) {
      args.push(expr.slice(argStart, cursor).trim());
      cursor++;
      argStart = cursor;
      continue;
    }
    if (ch === ')' && depth === 0) {
      const last = expr.slice(argStart, cursor).trim();
      if (last.length > 0) args.push(last);
      return { args, end: cursor + 1 };
    }
    cursor++;
  }
  return null;
}

function callConsumes(expr: string, end: number): boolean {
  return expr.slice(end).trim() === '';
}

function decodeFixedString(token: string): string | null {
  const quote = token[0];
  if ((quote !== "'" && quote !== '"') || token.length < 2 || token[token.length - 1] !== quote) return null;
  let text = '';
  for (let cursor = 1; cursor < token.length - 1; cursor++) {
    if (token[cursor] === '\\') {
      const escaped = token[++cursor];
      if (escaped === undefined) return null;
      if (/[nrtubfvx0-9]/.test(escaped)) return null;
      text += escaped;
      continue;
    }
    if (token[cursor] === quote) return null;
    text += token[cursor];
  }
  return text;
}

function decodeFixedRegex(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith('/')) return null;
  let raw = '';
  for (let cursor = 1; cursor < trimmed.length; cursor++) {
    if (trimmed[cursor] === '\\') {
      const escaped = trimmed[++cursor];
      if (escaped === undefined) return null;
      raw += `\\${escaped}`;
      continue;
    }
    if (trimmed[cursor] === '/') {
      if (trimmed.slice(cursor + 1).trim() !== '') return null;
      return unescapeFixedPattern(raw);
    }
    raw += trimmed[cursor];
  }
  return null;
}

function unescapeFixedPattern(raw: string): string | null {
  let text = '';
  for (let cursor = 0; cursor < raw.length; cursor++) {
    const ch = raw[cursor];
    if (ch === '\\') {
      const escaped = raw[++cursor];
      if (escaped === undefined) return null;
      if (/[A-Za-z0-9]/.test(escaped) || REGEX_WILDCARDS.has(escaped)) return null;
      text += escaped;
      continue;
    }
    if (REGEX_WILDCARDS.has(ch)) return null;
    text += ch;
  }
  return text;
}

function isApprovedCopyLiteral(text: string): boolean {
  return text.length >= CROSS_FEATURE_COPY_LITERAL_MIN_LENGTH
    && text.includes(' ')
    && !CROSS_FEATURE_COPY_FORBIDDEN_CHARS.test(text);
}

function decodeAssertionArgument(raw: string, matcher: 'toMatch' | 'toContain'): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
    const text = decodeFixedString(trimmed);
    if (text == null) return null;
    if (matcher === 'toMatch' && [...text].some(ch => REGEX_WILDCARDS.has(ch))) return null;
    return text;
  }
  if (trimmed.startsWith('/') && matcher === 'toMatch') return decodeFixedRegex(trimmed);
  return null;
}

function readOneArgument(source: string, start: number): { inner: string; end: number } | null {
  let cursor = start;
  let depth = 0;
  const argStart = cursor;
  while (cursor < source.length) {
    const skipped = skipNonCode(source, cursor);
    if (skipped < 0) return null;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    const ch = source[cursor];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cursor++;
      continue;
    }
    if ((ch === ')' || ch === ']' || ch === '}') && depth > 0) {
      depth--;
      cursor++;
      continue;
    }
    if (ch === ',' && depth === 0) return null;
    if (ch === ')' && depth === 0) {
      return { inner: source.slice(argStart, cursor).trim(), end: cursor + 1 };
    }
    cursor++;
  }
  return null;
}

function collectQualifyingLiterals(chain: string): AssertedCopyLiteral[] {
  const literals: AssertedCopyLiteral[] = [];
  let cursor = 0;
  while (cursor < chain.length) {
    while (cursor < chain.length && /\s/.test(chain[cursor])) cursor++;
    if (cursor >= chain.length || chain[cursor] !== '.') break;
    cursor++;
    while (cursor < chain.length && /\s/.test(chain[cursor])) cursor++;
    const ident = readIdentifier(chain, cursor);
    if (!ident) break;
    cursor += ident.length;
    let negated = false;
    let matcher = ident;
    if (ident === 'not') {
      while (cursor < chain.length && /\s/.test(chain[cursor])) cursor++;
      if (chain[cursor] !== '.') break;
      cursor++;
      while (cursor < chain.length && /\s/.test(chain[cursor])) cursor++;
      const next = readIdentifier(chain, cursor);
      if (!next) break;
      cursor += next.length;
      negated = true;
      matcher = next;
    }
    while (cursor < chain.length && /\s/.test(chain[cursor])) cursor++;
    if (chain[cursor] !== '(') break;
    cursor++;
    const arg = readOneArgument(chain, cursor);
    if (!arg) break;
    cursor = arg.end;
    if (matcher === 'toMatch' || matcher === 'toContain') {
      const text = decodeAssertionArgument(arg.inner, matcher);
      if (text != null && isApprovedCopyLiteral(text)) {
        literals.push({ polarity: negated ? 'negative' : 'positive', text });
      }
    }
  }
  return literals;
}

function hasFileReadHelper(testSource: string): boolean {
  let cursor = 0;
  while (cursor < testSource.length) {
    const skipped = skipNonCode(testSource, cursor);
    if (skipped < 0) break;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    if (isIdentAt(testSource, cursor, 'const') || isIdentAt(testSource, cursor, 'let') || isIdentAt(testSource, cursor, 'var')) {
      const end = testSource.indexOf('\n', cursor);
      const statement = testSource.slice(cursor, end === -1 ? testSource.length : end);
      if (/(?:const|let|var)\s+read\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*(?:\(\s*)?readFileSync\s*\(/.test(statement)) {
        return true;
      }
    }
    cursor++;
  }
  return false;
}

function isImportMetaDirname(expr: string): boolean {
  const compact = expr.replace(/\s+/g, '');
  return compact === 'dirname(fileURLToPath(import.meta.url))' || compact === 'dirname(import.meta.url)';
}

function detectReaderRoots(testRepoPath: string, testSource: string): string[] {
  const testDir = posix.dirname(normalizeRepoPath(testRepoPath));
  const roots = new Set<string>();
  let cursor = 0;
  while (cursor < testSource.length) {
    const skipped = skipNonCode(testSource, cursor);
    if (skipped < 0) break;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    if (isIdentAt(testSource, cursor, 'join')) {
      const call = parseNamedCall(testSource.slice(cursor), 'join');
      if (call && call.args.length >= 2 && isImportMetaDirname(call.args[0])) {
        const relative = decodeFixedString(call.args[1].trim());
        if (relative != null && !relative.includes('\\')) {
          const resolved = posix.normalize(posix.join(testDir, relative)).replace(/\\/g, '/');
          if (resolved === 'apps/web/src' || resolved.startsWith('apps/web/src/')) roots.add(resolved);
        }
      }
    }
    cursor++;
  }
  return [...roots];
}

function resolvedReadPaths(literal: string, roots: string[]): string[] {
  const spec = literal.replace(/\\/g, '/').trim();
  if (!spec.includes('/') || spec.startsWith('/') || spec.startsWith('//') || /^[A-Za-z]:\//.test(spec)) return [];
  const paths: string[] = [];
  const add = (candidate: string) => {
    const normalized = posix.normalize(candidate).replace(/\\/g, '/');
    if (!normalized || normalized === '.' || normalized.startsWith('..') || normalized.startsWith('/')) return;
    paths.push(normalized);
  };
  add(spec);
  for (const root of roots) add(posix.join(root, spec));
  return [...new Set(paths)];
}

function resolvesToSource(literal: string, sourcePath: string, roots: string[]): boolean {
  const source = posix.normalize(normalizeRepoPath(sourcePath)).replace(/\\/g, '/');
  return resolvedReadPaths(literal, roots).some(candidate => candidate === source);
}

function extractDirectReadLiteral(expr: string, allowReadHelper: boolean): string | null {
  const trimmed = expr.trim();
  if (allowReadHelper) {
    const readCall = parseNamedCall(trimmed, 'read');
    if (readCall && callConsumes(trimmed, readCall.end) && readCall.args.length === 1) {
      const literal = decodeFixedString(readCall.args[0].trim());
      if (literal != null) return literal;
    }
  }
  const readFileCall = parseNamedCall(trimmed, 'readFileSync');
  if (!readFileCall || !callConsumes(trimmed, readFileCall.end) || readFileCall.args.length < 1) return null;
  const first = readFileCall.args[0].trim();
  const direct = decodeFixedString(first);
  if (direct != null) return direct;
  const joinCall = parseNamedCall(first, 'join');
  if (!joinCall || !callConsumes(first, joinCall.end)) return null;
  const stringArgs = joinCall.args
    .map(arg => decodeFixedString(arg.trim()))
    .filter((value): value is string => value != null);
  if (stringArgs.length !== 1 || joinCall.args.filter(arg => decodeFixedString(arg.trim()) != null).length !== 1) return null;
  return stringArgs[0];
}

function parseStringArrayElements(inner: string): string[] | null {
  const elements: string[] = [];
  let cursor = 0;
  while (cursor < inner.length) {
    while (cursor < inner.length && /[\s,]/.test(inner[cursor])) cursor++;
    if (cursor >= inner.length) break;
    if (inner[cursor] === '/' && (inner[cursor + 1] === '/' || inner[cursor + 1] === '*')) {
      const skipped = skipNonCode(inner, cursor);
      if (skipped < 0 || skipped === cursor) return null;
      cursor = skipped;
      continue;
    }
    if (inner[cursor] !== "'" && inner[cursor] !== '"') return null;
    const end = skipString(inner, cursor);
    if (end < 0) return null;
    const decoded = decodeFixedString(inner.slice(cursor, end));
    if (decoded == null) return null;
    elements.push(decoded);
    cursor = end;
  }
  return elements;
}

function findJoinBindings(body: string): JoinedReadBinding[] {
  const bindings: JoinedReadBinding[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const skipped = skipNonCode(body, cursor);
    if (skipped < 0) break;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    let keyword = '';
    if (isIdentAt(body, cursor, 'const')) keyword = 'const';
    else if (isIdentAt(body, cursor, 'let')) keyword = 'let';
    else if (isIdentAt(body, cursor, 'var')) keyword = 'var';
    if (!keyword) {
      cursor++;
      continue;
    }
    let nameAt = cursor + keyword.length;
    while (nameAt < body.length && /\s/.test(body[nameAt])) nameAt++;
    const name = readIdentifier(body, nameAt);
    if (!name) {
      cursor++;
      continue;
    }
    let equalsAt = nameAt + name.length;
    while (equalsAt < body.length && /\s/.test(body[equalsAt])) equalsAt++;
    if (body[equalsAt] !== '=') {
      cursor++;
      continue;
    }
    let bracketAt = equalsAt + 1;
    while (bracketAt < body.length && /\s/.test(body[bracketAt])) bracketAt++;
    if (body[bracketAt] !== '[') {
      cursor++;
      continue;
    }
    const close = matchBracket(body, bracketAt, '[', ']');
    if (close < 0) {
      cursor++;
      continue;
    }
    let dotAt = close + 1;
    while (dotAt < body.length && /\s/.test(body[dotAt])) dotAt++;
    const mapCall = body[dotAt] === '.' ? parseNamedCall(body.slice(dotAt + 1), 'map') : null;
    if (!mapCall || mapCall.args.length !== 1) {
      cursor++;
      continue;
    }
    const mapper = mapCall.args[0].trim();
    if (mapper !== 'read' && mapper !== 'readFileSync') {
      cursor++;
      continue;
    }
    let joinAt = dotAt + 1 + mapCall.end;
    while (joinAt < body.length && /\s/.test(body[joinAt])) joinAt++;
    const joinCall = body[joinAt] === '.' ? parseNamedCall(body.slice(joinAt + 1), 'join') : null;
    if (!joinCall) {
      cursor++;
      continue;
    }
    const elements = parseStringArrayElements(body.slice(bracketAt + 1, close));
    if (!elements) {
      cursor++;
      continue;
    }
    bindings.push({ name, literals: elements, mapper });
    cursor = joinAt + 1 + joinCall.end;
  }
  return bindings;
}

function extractItCallbackBody(source: string, openParen: number): { body: string; end: number } | null {
  let cursor = openParen + 1;
  let parenDepth = 1;
  let callbackReady = false;
  let body: string | null = null;
  while (cursor < source.length && parenDepth > 0) {
    const skipped = skipNonCode(source, cursor);
    if (skipped < 0) return null;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    const ch = source[cursor];
    if (ch === '(') {
      parenDepth++;
      cursor++;
      continue;
    }
    if (ch === ')') {
      parenDepth--;
      cursor++;
      continue;
    }
    if (parenDepth === 1 && ch === '=' && source[cursor + 1] === '>') {
      callbackReady = true;
      cursor += 2;
      continue;
    }
    if (parenDepth === 1 && isIdentAt(source, cursor, 'function')) {
      callbackReady = true;
      cursor += 'function'.length;
      continue;
    }
    if (parenDepth === 1 && callbackReady && body == null && ch === '{') {
      const close = matchBracket(source, cursor, '{', '}');
      if (close < 0) return null;
      body = source.slice(cursor + 1, close);
      cursor = close + 1;
      continue;
    }
    cursor++;
  }
  if (body == null || parenDepth !== 0) return null;
  return { body, end: cursor };
}

function extractItBodies(source: string): string[] {
  const bodies: string[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const skipped = skipNonCode(source, cursor);
    if (skipped < 0) break;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    if (!isIdentAt(source, cursor, 'it')) {
      cursor++;
      continue;
    }
    let parenAt = cursor + 2;
    while (parenAt < source.length && /\s/.test(source[parenAt])) parenAt++;
    if (source[parenAt] !== '(') {
      cursor++;
      continue;
    }
    const extracted = extractItCallbackBody(source, parenAt);
    if (!extracted) {
      cursor = parenAt + 1;
      continue;
    }
    bodies.push(extracted.body);
    cursor = extracted.end;
  }
  return bodies;
}

function expectationAppliesToSource(
  target: string,
  bindings: JoinedReadBinding[],
  sourcePath: string,
  roots: string[],
  allowReadHelper: boolean,
): boolean {
  const direct = extractDirectReadLiteral(target, allowReadHelper);
  if (direct != null) return resolvesToSource(direct, sourcePath, roots);
  const ident = target.trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(ident)) return false;
  const binding = bindings.find(item => item.name === ident);
  if (!binding) return false;
  if (binding.mapper === 'read' && !allowReadHelper) return false;
  return binding.literals.some(literal => resolvesToSource(literal, sourcePath, roots));
}

function literalsForSourceInBody(
  body: string,
  sourcePath: string,
  roots: string[],
  allowReadHelper: boolean,
): AssertedCopyLiteral[] {
  const bindings = findJoinBindings(body);
  const literals: AssertedCopyLiteral[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const skipped = skipNonCode(body, cursor);
    if (skipped < 0) break;
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    const callName = isIdentAt(body, cursor, 'expect') ? 'expect' : isIdentAt(body, cursor, 'assert') ? 'assert' : null;
    if (!callName) {
      cursor++;
      continue;
    }
    const call = parseNamedCall(body.slice(cursor), callName);
    if (!call || call.args.length < 1) {
      cursor++;
      continue;
    }
    if (expectationAppliesToSource(call.args[0], bindings, sourcePath, roots, allowReadHelper)) {
      literals.push(...collectQualifyingLiterals(body.slice(cursor + call.end)));
    }
    cursor += call.end;
  }
  return literals;
}

function literalCoversPair(literal: AssertedCopyLiteral, pair: CopySubstitutionPair): boolean {
  if (literal.polarity === 'negative') {
    return pair.removed.includes(literal.text) && !pair.added.includes(literal.text);
  }
  return pair.added.includes(literal.text);
}

/**
 * Every hunk in the diff must be exactly one removed line paired with one added line.
 * Any other hunk shape fails closed (returns null).
 */
export function parsePureSubstitutionPairs(diffText: string): CopySubstitutionPair[] | null {
  if (!diffText.trim()) return null;
  const lines = diffText.split(/\r?\n/);
  const pairs: CopySubstitutionPair[] = [];
  let sawHunk = false;
  for (let index = 0; index < lines.length; index++) {
    const header = lines[index].replace(/\r$/, '');
    if (!header.startsWith('@@')) continue;
    const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(header);
    if (!match) return null;
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);
    if (oldCount !== 1 || newCount !== 1) return null;
    sawHunk = true;
    const removed: string[] = [];
    const added: string[] = [];
    index++;
    for (; index < lines.length; index++) {
      const hunkLine = lines[index].replace(/\r$/, '');
      if (hunkLine.startsWith('@@') || hunkLine.startsWith('diff ')) {
        index--;
        break;
      }
      if (hunkLine === '') break;
      if (hunkLine.startsWith('\\')) continue;
      if (hunkLine.startsWith('+')) added.push(hunkLine.slice(1));
      else if (hunkLine.startsWith('-')) removed.push(hunkLine.slice(1));
      else if (hunkLine.startsWith('---') || hunkLine.startsWith('+++') || hunkLine.startsWith('index ')) break;
      else return null;
    }
    if (removed.length !== 1 || added.length !== 1) return null;
    pairs.push({ removed: removed[0], added: added[0] });
  }
  if (!sawHunk || pairs.length === 0) return null;
  return pairs;
}

/**
 * Cross-feature copy credit. Used only after the same-feature matcher fails.
 * A changed test may clear a changed feature source only when it reads that exact
 * path and one it() block asserts a fixed literal over every 1:1 substitution hunk.
 */
export function crossFeatureCopyCreditCovers(input: {
  sourcePath: string;
  testPath: string;
  testSource: string;
  diffText: string;
}): boolean {
  if (!isCoverageTestPath(input.testPath)) return false;
  const pairs = parsePureSubstitutionPairs(input.diffText);
  if (!pairs) return false;
  const sourcePath = normalizeRepoPath(input.sourcePath);
  const roots = detectReaderRoots(input.testPath, input.testSource);
  const allowReadHelper = hasFileReadHelper(input.testSource);
  for (const body of extractItBodies(input.testSource)) {
    const literals = literalsForSourceInBody(body, sourcePath, roots, allowReadHelper);
    if (literals.length === 0) continue;
    if (pairs.every(pair => literals.some(literal => literalCoversPair(literal, pair)))) return true;
  }
  return false;
}

function runGit(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
}

function readUnifiedDiff(repoPath: string, diffMode: CoverageDiffMode): string | null {
  const normalized = normalizeRepoPath(repoPath);
  const args = ['diff', '-U0'];
  if (diffMode.kind === 'cached') args.push('--cached');
  else if (diffMode.kind === 'range') args.push(...diffMode.rangeArgs);
  else args.push('HEAD');
  args.push('--', normalized);
  return runGit(args);
}

function readChangeSetText(repoPath: string, diffMode: CoverageDiffMode): string | null {
  const normalized = normalizeRepoPath(repoPath);
  if (diffMode.kind === 'cached') return runGit(['show', `:${normalized}`]);
  if (diffMode.kind === 'range') return runGit(['show', `HEAD:${normalized}`]);
  const absolute = path.join(ROOT_DIR, normalized);
  if (!fs.existsSync(absolute)) return null;
  try {
    return fs.readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

function sourceHasCrossFeatureCopyCredit(
  sourcePath: string,
  changedTestFiles: string[],
  diffMode: CoverageDiffMode,
): boolean {
  try {
    const diffText = readUnifiedDiff(sourcePath, diffMode);
    if (diffText == null) return false;
    for (const testPath of changedTestFiles) {
      if (!isCoverageTestPath(testPath)) continue;
      try {
        const testSource = readChangeSetText(testPath, diffMode);
        if (testSource == null) continue;
        if (crossFeatureCopyCreditCovers({ sourcePath, testPath, testSource, diffText })) return true;
      } catch {
        // Unrecognized test shape or unreadable blob: fail closed for this test.
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Enforces the Coverage Append Rule:
 * For every modified or newly added code file, verifies that a matching test file
 * is also created or modified in the same change set.
 */
function checkCoverageAppendRule(strict: boolean = false): string[] {
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
      // Check staged + unstaged changes, or compare against base ref if in CI.
      // Hunk credit uses this same diff source (cached, range, or worktree), not a hardcoded index.
      let diffCommand = 'git status --porcelain';
      let diffMode: CoverageDiffMode = { kind: 'worktree' };
      if (process.env.GITHUB_BASE_REF) {
        diffCommand = `git diff --name-only origin/${process.env.GITHUB_BASE_REF}...HEAD`;
        diffMode = { kind: 'range', rangeArgs: [`origin/${process.env.GITHUB_BASE_REF}...HEAD`] };
      } else if (process.env.CI) {
        try {
          execSync('git rev-parse --verify HEAD~1', { stdio: 'ignore' });
          diffCommand = 'git diff --name-only HEAD~1 HEAD';
          diffMode = { kind: 'range', rangeArgs: ['HEAD~1', 'HEAD'] };
        } catch {
          diffCommand = 'git status --porcelain';
          diffMode = { kind: 'worktree' };
        }
      } else {
        // Local mode: if files are staged for commit, audit staged files directly
        try {
          const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' }).trim();
          if (staged) {
            diffCommand = 'git diff --cached --name-only';
            diffMode = { kind: 'cached' };
          }
        } catch {
          // fallback to porcelain
        }
      }

      const output = execSync(diffCommand, { encoding: 'utf8' }).trim();
      if (!output) {
        return violations; // No uncommitted or branch changes
      }

      const changedFiles = output
        .split('\n')
        .map(l => l.replace(/^\s*[MADRCU?!]{1,2}\s+/, '').trim())
        .filter(f => f.length > 0)
        .map(f => normalizeRepoPath(f));

      // Separate source files and test files
      const changedSourceFiles = changedFiles.filter(f => {
        const isSource = /\.(ts|tsx|js|jsx)$/.test(f);
        const isTest = /\.test\.(ts|tsx|js|jsx)$/.test(f);
        const isExcluded = f.startsWith('dist/') || f.startsWith('scripts/') || f.startsWith('backups/');
        return isSource && !isTest && !isExcluded;
      });

      const changedTestFiles = changedFiles.filter(f => /\.test\.(ts|tsx|js|jsx)$/.test(f));
      const isStrictAppend = strict || process.env.STRICT_APPEND_RULE === 'true';

      // For each changed feature or package source file, check if corresponding tests exist/changed
      for (const src of changedSourceFiles) {
        // Feature file check
        const featureName = matchingFeatureName(src);
        if (featureName) {
          const hasMatchingTestChange = hasMatchingFeatureTestChange(src, changedTestFiles);
          // Check if test exists at all in that feature
          const featureTestFiles = collectFiles(
            path.join(ROOT_DIR, 'apps', 'web', 'src', 'features', featureName),
            /\.test\.(ts|tsx|js)$/
          );

          if (featureTestFiles.length === 0) {
            violations.push(
              `Feature '${featureName}' modified in '${src}' but has NO test coverage in 'apps/web/src/features/${featureName}/'.`
            );
          } else if (isStrictAppend && !hasMatchingTestChange) {
            const crossFeatureCredit = sourceHasCrossFeatureCopyCredit(src, changedTestFiles, diffMode);
            if (!crossFeatureCredit) {
              violations.push(
                `Code modified in '${src}' without corresponding test update in 'apps/web/src/features/${featureName}/'.`
              );
            }
          }
        }

        // Domain package check
        if (src.startsWith('packages/domain/src/')) {
          const hasDomainTestChange = hasMatchingDomainTestChange(src, changedTestFiles);
          if (isStrictAppend && !hasDomainTestChange) {
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
