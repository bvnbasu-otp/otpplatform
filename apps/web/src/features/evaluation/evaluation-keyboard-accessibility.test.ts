import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relPath: string) => readFileSync(resolve(relPath), 'utf8');

describe('evaluation cockpit scrollbar and keyboard accessibility', () => {
  it('keeps evaluation cockpit horizontal scroller accessible and scrollable by keyboard', () => {
    const cockpit = read('apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx');
    expect(cockpit).toContain('overflow-x-auto scrollbar-thin');
    expect(cockpit).toContain('tabIndex={0}');
    expect(cockpit).not.toContain('overflow-x-auto no-scrollbar');
    expect(cockpit).toContain("event.key === 'ArrowRight'");
    expect(cockpit).toContain("event.key === 'ArrowLeft'");
  });
});
