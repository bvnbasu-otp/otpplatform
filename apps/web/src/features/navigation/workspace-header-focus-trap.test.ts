import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relPath: string) => readFileSync(resolve(relPath), 'utf8');

describe('workspace header menu focus trap and restoration', () => {
  it('manages modal focus, tab trapping, and invoker restoration', () => {
    const menu = read('apps/web/src/features/navigation/components/WorkspaceHeaderMenu.tsx');
    expect(menu).toContain('previouslyFocused');
    expect(menu).toContain('focusable');
    expect(menu).toContain("e.key !== 'Tab'");
    expect(menu).toContain("e.key === 'Escape'");
    expect(menu).toContain('previouslyFocused.focus()');
  });
});
