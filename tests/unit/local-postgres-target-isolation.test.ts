import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

describe('local database test target isolation', () => {
  it('routes every test database client through LOCAL_PG_PORT', () => {
    const offenders: string[] = [];
    const scan = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = resolve(directory, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (entry.isFile() && file.endsWith('.ts') && file !== __filename) {
          const source = readFileSync(file, 'utf8');
          if (new RegExp(`port:\\s*${'54322'}\\b`).test(source)) offenders.push(file);
        }
      }
    };
    scan(ROOT);
    expect(offenders).toEqual([]);
  });

  it('derives the local Data API from the selected disposable database port', () => {
    const helper = readFileSync(resolve(ROOT, 'helpers/supabase-local.ts'), 'utf8');
    expect(helper).toContain('LOCAL_POSTGRES_PORT - 1');
    expect(helper).not.toMatch(/process\.env\.(?:SUPABASE_URL|VITE_SUPABASE_URL)/);
  });
});
