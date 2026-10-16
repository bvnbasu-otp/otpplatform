import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ceiling = process.argv[2];
if (!/^\d{5}$/.test(ceiling ?? '')) {
  console.error('Usage: node scripts/verify-migration-ceiling.mjs <five-digit-ceiling>');
  process.exit(2);
}

const migrationsDirectory = resolve('supabase/migrations');
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => /^\d{5}_.+\.sql$/.test(name))
  .map((name) => name.slice(0, 5))
  .sort();

const ceilingNumber = Number(ceiling);
const isContiguous =
  migrations.length === ceilingNumber &&
  migrations.every((version, index) => Number(version) === index + 1);

if (!isContiguous || migrations.at(-1) !== ceiling) {
  console.error(
    `Migration ceiling check failed: expected contiguous migrations 00001-${ceiling}, found ${migrations.length} files ending at ${migrations.at(-1) ?? 'none'}.`,
  );
  process.exit(1);
}

console.log(`Migration ceiling check passed: ${migrations.length} contiguous migrations through ${ceiling}.`);
