import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReferAndEarnCard } from './components/ReferAndEarnCard';

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

describe('ReferAndEarnCard pilot invitation copy', () => {
  it('invites peer buyers or suppliers and states referral credit is not cash', () => {
    const html = decodeHtml(
      renderToStaticMarkup(
        React.createElement(ReferAndEarnCard, { identifier: 'org-copy-1', side: 'buyer' }),
      ),
    );

    expect(html).toContain('Invite peer buyers or suppliers.');
    expect(html).toContain('Referral credit is not cash');
    expect(html).not.toContain('Invite peer buyers or verified suppliers.');
    expect(html).not.toContain('Controlled Pilot Sandbox');
  });
});
