import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'pages', 'QuickQuotePage.tsx'),
  'utf8',
);

describe('Quick quote update customer copy', () => {
  it('tells the supplier to reopen the invite link and submit a new price', () => {
    expect(pageSource).toContain(
      'Just open your invite link again and submit a new price before the deadline.',
    );
    expect(pageSource).not.toContain('reply with a new price');
    expect(pageSource).not.toContain('tap the WhatsApp link again');
  });
});
