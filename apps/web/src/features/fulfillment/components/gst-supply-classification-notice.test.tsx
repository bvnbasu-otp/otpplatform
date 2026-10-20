import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GstSupplyClassificationNotice } from './GstSupplyClassificationNotice';

describe('GstSupplyClassificationNotice', () => {
  it('renders review-required state', () => {
    const html = renderToStaticMarkup(
      React.createElement(GstSupplyClassificationNotice, { treatment: 'REVIEW_REQUIRED' }),
    );
    expect(html).toContain('data-testid="gst-supply-classification-notice"');
    expect(html).toContain('GST classification review required');
    expect(html).toContain('does not prove the supplier is unregistered');
  });

  it('renders distinct nil-rated copy', () => {
    const html = renderToStaticMarkup(
      React.createElement(GstSupplyClassificationNotice, { treatment: 'NIL_RATED' }),
    );
    expect(html).toContain('Nil-rated');
    expect(html).not.toContain('Zero-rated');
  });
});
