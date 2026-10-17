import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = resolve(ROOT, 'scripts/coverage-recovery-response-check.mjs');
const WORKFLOW = resolve(ROOT, '.github/workflows/supplier-coverage-recovery.yml');

function check(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'otp-coverage-'));
  const file = join(dir, 'response.json');
  writeFileSync(file, body);
  return spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
}

describe('supplier coverage recovery result', () => {
  const workflow = readFileSync(WORKFLOW, 'utf8');

  it('runs every four hours and fails the job on a bad HTTP status', () => {
    expect(workflow).toContain("cron: '0 */4 * * *'");
    expect(workflow).not.toContain('*/15 * * * *');
    expect(workflow).toContain('[ "${status}" -lt 200 ] || [ "${status}" -ge 300 ]');
    expect(workflow).toContain('exit 1');
    expect(workflow).not.toContain('echo "${SUPABASE_SERVICE_ROLE_KEY}"');
    expect(workflow).not.toContain('echo "$SUPABASE_SERVICE_ROLE_KEY"');
    expect(workflow).toContain('node scripts/coverage-recovery-response-check.mjs response.json');
  });

  it('accepts a valid zero-work payload and rejects failed scopes or invalid JSON', () => {
    const empty = check('{"processed":0,"results":[]}');
    expect(empty.status).toBe(0);

    const ok = check('{"processed":1,"results":[{"ok":true}]}');
    expect(ok.status).toBe(0);

    const failed = check('{"processed":1,"results":[{"ok":false}]}');
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('failed scopes: 1');

    const invalid = check('{');
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('invalid JSON');

    const rejected = check('{"ok":false,"processed":0,"results":[]}');
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('recovery response not ok');
  });
});
