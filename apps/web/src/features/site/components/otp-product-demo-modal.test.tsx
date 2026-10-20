import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OtpProductDemoModal } from './OtpProductDemoModal';

describe('OtpProductDemoModal', () => {
  it('renders interactive demo modal with illustrative label', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(OtpProductDemoModal, {
          isOpen: true,
          onClose: vi.fn(),
        }),
      ),
    );
    expect(html).toContain('data-testid="otp-product-demo-modal"');
    expect(html).toContain('data-testid="otp-demo-illustrative-label"');
    expect(html).toContain('Interactive demo — illustrative only');
  });

  it('renders null when closed', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(OtpProductDemoModal, {
          isOpen: false,
          onClose: vi.fn(),
        }),
      ),
    );
    expect(html).toBe('');
  });
});
