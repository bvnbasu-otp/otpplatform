/**
 * Exit 0 only for a valid recovery payload with no failed scopes.
 * A missing results array is zero work, not a failure.
 * Invalid JSON, a top-level ok:false, and any results[].ok === false fail the process.
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('response file required');
  process.exit(1);
}

let body;
try {
  body = JSON.parse(readFileSync(file, 'utf8'));
} catch {
  console.error('invalid JSON');
  process.exit(1);
}

if (body === null || typeof body !== 'object' || Array.isArray(body)) {
  console.error('invalid JSON');
  process.exit(1);
}

if (body.ok === false) {
  console.error('recovery response not ok');
  process.exit(1);
}
const results = Array.isArray(body.results) ? body.results : [];
const failed = results.filter((item) => item && item.ok === false);
console.log('processed:', body.processed ?? 0);
if (failed.length > 0) {
  console.error('failed scopes:', failed.length);
  process.exit(1);
}
