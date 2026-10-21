import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RecordPager } from './RecordPager';

describe('RecordPager', () => {
  it('enables Next on a full page and keeps Previous off the first page', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordPager, {
        offset: 0,
        pageSize: 50,
        count: 50,
        label: 'Buyer orders pages',
        onOffsetChange: vi.fn(),
      }),
    );
    expect(html).toContain('Showing 1–50');
    expect(html).toContain('Page 1');
    expect(html).toContain('disabled=""');
    expect(html).toContain('>Next<');
    const nextDisabled = html.includes('>Next<') && html.lastIndexOf('disabled=""') > html.indexOf('Previous');
    expect(nextDisabled).toBe(false);
  });

  it('enables Previous and disables Next on a short later page', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordPager, {
        offset: 50,
        pageSize: 50,
        count: 10,
        totalCount: 60,
        label: 'Audit log pages',
        onOffsetChange: vi.fn(),
      }),
    );
    expect(html).toContain('Showing 51–60 of 60');
    expect(html).toContain('Page 2');
    expect(html.indexOf('Previous')).toBeLessThan(html.indexOf('disabled=""'));
  });

  it('uses an authoritative hasNext signal instead of guessing from a full page', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordPager, {
        offset: 50,
        pageSize: 50,
        count: 50,
        hasNext: false,
        label: 'Seller order pages',
        onOffsetChange: vi.fn(),
      }),
    );
    expect(html).toContain('Showing 51–100');
    expect(html).toContain('Page 2');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Next<\/button>/);
  });
});
