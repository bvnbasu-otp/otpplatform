import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GstinAutofillField } from './components/GstinAutofillField';
import { BUYER_COPY, INDIVIDUAL_BUYER_SUBHEAD, buyerApprovalHelp, buyerPanelSubhead } from './types/portal';

describe('pilot trust semantics', () => {
  it('a checksum-valid sample GSTIN does not overwrite identity or claim taxpayer status', () => {
    const html = renderToStaticMarkup(
      React.createElement(GstinAutofillField, {
        value: '29ABCDE1234F1Z5',
        onChange: () => undefined,
        onAutofill: () => {
          throw new Error('format validation must not autofill a legal identity');
        },
      }),
    );

    expect(html).toMatch(/not a government registry lookup/i);
    expect(html).toMatch(/Not GST verified/i);
    expect(html).not.toMatch(/REGULAR TAXPAYER/);
    expect(html).not.toMatch(/Apex Painting/);
    expect(html).not.toMatch(/Legal Name/);
  });

  it('individual copy does not say the committee signs off, while RWA copy still does', () => {
    expect(buyerPanelSubhead('BUYER', 'INDIVIDUAL')).toBe(INDIVIDUAL_BUYER_SUBHEAD);
    expect(buyerPanelSubhead('BUYER', 'INDIVIDUAL')).not.toMatch(/committee signs off/i);
    expect(buyerPanelSubhead('BUYER', 'INDIVIDUAL')).toMatch(/no committee/i);
    expect(buyerApprovalHelp('INDIVIDUAL')).not.toMatch(/committee signs off|committee vote/i);
    expect(buyerPanelSubhead('BUYER', 'COMMUNITY')).toMatch(/committee signs off/i);
    expect(BUYER_COPY.subhead).toMatch(/committee signs off/i);
    expect(buyerApprovalHelp('COMMUNITY')).toMatch(/committee vote/i);
    expect(buyerApprovalHelp('MSME')).toMatch(/committee vote/i);
  });
});
