import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components', 'SupportHelpButtonModal.tsx'),
  'utf8',
);

describe('Support help customer copy', () => {
  it('labels commercial help as plans, pricing, and GST verification', () => {
    expect(modalSource).toContain('Plans, pricing &amp; GST verification');
    expect(modalSource).not.toContain('Enterprise fleet');
  });

  it('exposes a named modal and manages keyboard focus without submitting', () => {
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
    expect(modalSource).toContain('aria-labelledby="support-help-dialog-title"');
    expect(modalSource).toContain('closeButtonRef.current?.focus()');
    expect(modalSource).toContain("e.key !== 'Tab'");
    expect(modalSource).toContain('triggerRef.current?.focus()');
    expect(modalSource).toContain("e.key === 'Escape' && !isSubmittingRef.current");
  });
});
