import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../../scripts/db-gen-types.ts'), 'utf8');

describe('database type generation isolation', () => {
  it('has no implicit local or linked target', () => {
    expect(SOURCE).not.toContain("['gen', 'types', 'typescript', '--local']");
    expect(SOURCE).not.toMatch(/--linked|project-ref|SUPABASE_PROJECT_REF/);
    expect(SOURCE).toContain("'--db-url'");
  });

  it('accepts only loopback disposable ports outside the retained local range', () => {
    expect(SOURCE).toContain("['127.0.0.1', 'localhost']");
    expect(SOURCE).toContain('port < 55000');
    expect(SOURCE).toContain('port > 59999');
    expect(SOURCE).toContain("parsed.pathname !== '/postgres'");
    expect(SOURCE).toContain("parsed.search !== '?sslmode=disable'");
  });

  it('writes UTF-8 stdout only to the reviewed generated type file', () => {
    expect(SOURCE).toContain("packages/database/src/generated/supabase.ts");
    expect(SOURCE).toContain("writeFileSync(OUT, trimmed, { encoding: 'utf8' })");
    expect(SOURCE).not.toContain('stderr += stdout');
  });
});
