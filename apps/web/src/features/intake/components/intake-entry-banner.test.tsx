import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntakeEntryBanner } from './IntakeEntryBanner';

describe('IntakeEntryBanner', () => {
  it('renders Step 1 orientation banner and stage guidance', () => {
    const html = renderToStaticMarkup(React.createElement(IntakeEntryBanner));
    expect(html).toContain('data-testid="intake-entry-banner"');
    expect(html).toContain('Step 1 — Tell');
    expect(html).toContain('Describe what you need');
    expect(html).toContain('OTP prepares your requirement and RFQ');
  });
});
