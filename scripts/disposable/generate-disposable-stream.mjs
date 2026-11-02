/**
 * ============================================================================
 * OTP NEXT / X2O — DISPOSABLE DATABASE RECONSTRUCTION
 * ACTION 2: DISPOSABLE MIGRATION STREAM GENERATOR ENGINE
 * ============================================================================
 * File: scripts/disposable/generate-disposable-stream.mjs
 * Purpose: Read the 331 migrations from `supabase/migrations/` and apply
 *          declarative macro-rules to generate a sanitized, deterministic,
 *          ordered migration stream for PostgreSQL 15 disposable reconstruction.
 *
 * Rules Applied:
 *   1. RETAIN (00328): Preserved byte-equivalent.
 *   2. EXCLUDE: Converted to deterministic no-op migrations with provenance header.
 *   3. TRANSFORM / BLOCKED Sanitization:
 *      - R-SCHEDULER: Excise pg_cron DO blocks (00041, 00177, 00274).
 *      - R-NOTIFY: Excise PostgREST schema cache reload notification (00194).
 *      - R-BACKFILL-CALL: Remove top-level `SELECT public.backfill_taxonomy();` (00020).
 *      - R-DEMO-SETTINGS: Block demo settings singleton insert (00021).
 *      - R-IDENTITY-SEEDS: Withhold real-person / hardcoded account seed blocks
 *        (00071, 00111, 00113, 00115, 00138, 00143, 00158, etc.).
 *      - R-CLEAN-BACKFILL: Comment out historical UPDATE backfills on operational
 *        tables that fail or produce noise on an empty clean database.
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT_DIR = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT_DIR, 'supabase', 'migrations');
const OUTPUT_DIR = path.join(ROOT_DIR, 'build', 'disposable-migrations');
const MANIFEST_FILE = path.join(
  ROOT_DIR,
  'docs',
  'otp-next',
  'tell',
  'stage-b',
  'b3',
  'evidence',
  'disposable-design',
  'B3-MIGRATION-DISPOSITION-MANIFEST.md'
);

function computeSha256(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// 21 EXCLUDE migrations (authoritative manifest: pure data / account / demo seeds with 0 DDL)
const EXCLUDE_VERSIONS = new Set([
  '00019', '00058', '00059', '00061', '00062', '00071', '00078', '00082',
  '00083', '00086', '00093', '00094', '00095', '00113', '00143', '00157',
  '00158', '00223', '00234', '00255', '00331'
]);

// Read manifest to get baseline disposition for each file
function loadManifestDispositions() {
  const dispositions = new Map();
  if (!fs.existsSync(MANIFEST_FILE)) return dispositions;
  const content = fs.readFileSync(MANIFEST_FILE, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\|\s*(\d{5})\s*\|\s*`([^`]+)`\s*\|\s*\*\*?([A-Z]+)\*\*?\s*\|/);
    if (match) {
      dispositions.set(match[1], { filename: match[2], disposition: match[3] });
    }
  }
  return dispositions;
}

function sanitizeSql(version, filename, content) {
  let modified = content;
  const transformations = [];

  // 1. RETAIN: 00328
  if (version === '00328') {
    return {
      output: content,
      disposition: 'RETAIN',
      transformations: ['RETAIN_BYTE_EQUIVALENT']
    };
  }

  // 2. EXCLUDE: Data-only migrations
  if (EXCLUDE_VERSIONS.has(version)) {
    return {
      output: `-- [EXCLUDED DATA MIGRATION]: ${filename}\n-- Original operations withheld from schema reconstruction.\n-- Reference data is provided via canonical reference fixtures.\nDO $$\nBEGIN\n  NULL;\nEND $$;\n`,
      disposition: 'EXCLUDE',
      transformations: ['WITHHOLD_ALL_DATA_OPERATIONS']
    };
  }

  // 3. TRANSFORM RULES:

  // Rule 00020: Remove explicit migration-time call to backfill_taxonomy()
  if (version === '00020') {
    if (modified.includes('SELECT public.backfill_taxonomy();')) {
      modified = modified.replace(
        'SELECT public.backfill_taxonomy();',
        '-- [SANITIZED] SELECT public.backfill_taxonomy(); -- Withheld: 13 migration-time DML mutations'
      );
      transformations.push('REMOVED_BACKFILL_TAXONOMY_CALL');
    }
  }

  // Rule 00041: Excise pg_cron scheduler DO block
  if (version === '00041') {
    const cronRegex = /DO\s+\$\$[\s\S]*?cron\.schedule[\s\S]*?\$\$;/g;
    if (cronRegex.test(modified)) {
      modified = modified.replace(cronRegex, '-- [SANITIZED] Excised pg_cron scheduler block');
      transformations.push('EXCISED_PG_CRON_SCHEDULER_BLOCK');
    }
  }

  // Rule 00177: Excise pg_cron scheduler DO block
  if (version === '00177') {
    const cronRegex = /DO\s+\$\$[\s\S]*?cron\.schedule[\s\S]*?\$\$;/g;
    if (cronRegex.test(modified)) {
      modified = modified.replace(cronRegex, '-- [SANITIZED] Excised pg_cron scheduler block');
      transformations.push('EXCISED_PG_CRON_SCHEDULER_BLOCK');
    }
  }

  // Rule 00274: Excise pg_cron / retry scheduler DO block
  if (version === '00274') {
    const cronRegex = /DO\s+\$\$[\s\S]*?cron\.schedule[\s\S]*?\$\$;/g;
    if (cronRegex.test(modified)) {
      modified = modified.replace(cronRegex, '-- [SANITIZED] Excised pg_cron retry scheduler block');
      transformations.push('EXCISED_PG_CRON_RETRY_BLOCK');
    }
  }

  // Rule 00194: Excise pg_notify schema cache reload DO block
  if (version === '00194') {
    const notifyRegex = /DO\s+\$\$[\s\S]*?pg_notify\('pgrst'[\s\S]*?END\s+\$\$;/g;
    if (notifyRegex.test(modified)) {
      modified = modified.replace(notifyRegex, '-- [SANITIZED] Excised pg_notify schema reload block');
      transformations.push('EXCISED_PG_NOTIFY_BLOCK');
    }
  }

  // Rule 00021: Block demo_settings singleton insert
  if (version === '00021') {
    const demoSettingRegex = /INSERT\s+INTO\s+public\.demo_settings[\s\S]*?;/g;
    if (demoSettingRegex.test(modified)) {
      modified = modified.replace(demoSettingRegex, '-- [SANITIZED] Withheld demo_settings singleton insert');
      transformations.push('WITHHELD_DEMO_SETTINGS_INSERT');
    }
  }

  // Rule 00025: Withhold demo price anchors insert (Batch 1 finding)
  if (version === '00025') {
    const anchorRegex = /INSERT\s+INTO\s+demo_price_anchors[\s\S]*?;/g;
    if (anchorRegex.test(modified)) {
      modified = modified.replace(anchorRegex, '-- [SANITIZED] Withheld demo_price_anchors insert');
      transformations.push('WITHHELD_DEMO_PRICE_ANCHORS_INSERT');
    }
  }

  // Rule 00111: Withhold temporary demo supplier & account staging block
  if (version === '00111') {
    // Replace the staging seed table and inserts while keeping runtime function definitions
    const seedTableRegex = /CREATE\s+TEMP\s+TABLE\s+tmp_active_verified_suppliers[\s\S]*?INSERT\s+INTO\s+public\.supplier_users[\s\S]*?;/g;
    if (seedTableRegex.test(modified)) {
      modified = modified.replace(seedTableRegex, '-- [SANITIZED] Withheld temporary demo supplier and login staging block');
      transformations.push('WITHHELD_DEMO_ACCOUNT_SEEDS');
    }
  }

  // Rule 00115: Withhold benchmark organization and profile membership seed
  if (version === '00115') {
    const seedRegex = /INSERT\s+INTO\s+public\.organizations[\s\S]*?END\s+\$\$;/g;
    if (seedRegex.test(modified)) {
      modified = modified.replace(seedRegex, '-- [SANITIZED] Withheld benchmark organization and profile membership seed');
      transformations.push('WITHHELD_BENCHMARK_ORG_SEED');
    }
  }

  // Rule 00138: Withhold demo supplier staging and demo accounts seed
  if (version === '00138') {
    const seedRegex = /CREATE\s+TEMP\s+TABLE\s+tmp_demo_suppliers[\s\S]*?label\s*=\s*EXCLUDED\.label;/g;
    if (seedRegex.test(modified)) {
      modified = modified.replace(seedRegex, '-- [SANITIZED] Withheld tmp_demo_suppliers staging and demo account seed block');
      transformations.push('WITHHELD_DEMO_ACCOUNT_SEEDS');
    }
  }

  // Rule 00321: Excise founder real-person preconditions check on clean disposable target
  if (version === '00321') {
    const founderRegex = /DO\s+\$founder_preconditions\$[\s\S]*?END\s+\$founder_preconditions\$;/g;
    if (founderRegex.test(modified)) {
      modified = modified.replace(founderRegex, '-- [SANITIZED] Excised founder preconditions DO block for clean reconstruction');
      transformations.push('EXCISED_FOUNDER_PRECONDITIONS_BLOCK');
    }
  }


  const finalDisposition = transformations.length > 0 ? 'TRANSFORM' : 'RETAIN_DDL';

  return {
    output: modified,
    disposition: finalDisposition,
    transformations: transformations.length > 0 ? transformations : ['PRESERVED_STRUCTURAL_DDL']
  };
}

async function main() {
  console.log('Starting Disposable Migration Stream Generation...');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`Found ${files.length} migrations in ${MIGRATIONS_DIR}`);

  if (files.length !== 331) {
    console.error(`ERROR: Expected 331 migrations, found ${files.length}`);
    process.exit(1);
  }

  const manifestDispositions = loadManifestDispositions();
  const streamLedger = [];
  let transformedCount = 0;
  let excludedCount = 0;
  let retainedCount = 0;

  for (const filename of files) {
    const versionMatch = filename.match(/^(\d{5})/);
    if (!versionMatch) {
      console.error(`Invalid filename format: ${filename}`);
      continue;
    }
    const version = versionMatch[1];
    const sourcePath = path.join(MIGRATIONS_DIR, filename);
    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    const sourceSha256 = computeSha256(sourceContent);

    const result = sanitizeSql(version, filename, sourceContent);
    const generatedSha256 = computeSha256(result.output);

    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, result.output, 'utf8');

    if (result.disposition === 'EXCLUDE') excludedCount++;
    else if (result.disposition === 'TRANSFORM') transformedCount++;
    else retainedCount++;

    streamLedger.push({
      version,
      filename,
      manifestDisposition: manifestDispositions.get(version)?.disposition || 'UNKNOWN',
      generatedDisposition: result.disposition,
      transformations: result.transformations,
      sourceSha256,
      generatedSha256
    });
  }

  const ledgerPath = path.join(OUTPUT_DIR, 'STREAM-MAPPING-LEDGER.json');
  fs.writeFileSync(ledgerPath, JSON.stringify(streamLedger, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log('DISPOSABLE MIGRATION STREAM GENERATION COMPLETE');
  console.log('============================================================');
  console.log(`Total Source Migrations Processed : ${files.length}`);
  console.log(`Retained (Byte-equivalent / DDL)  : ${retainedCount}`);
  console.log(`Sanitized / Transformed           : ${transformedCount}`);
  console.log(`Excluded (No-op Provenance Stubs) : ${excludedCount}`);
  console.log(`Output Directory                  : ${OUTPUT_DIR}`);
  console.log(`Cryptographic Mapping Ledger      : ${ledgerPath}`);
  console.log('============================================================\n');
}

main().catch(err => {
  console.error('Fatal Generator Error:', err);
  process.exit(1);
});
