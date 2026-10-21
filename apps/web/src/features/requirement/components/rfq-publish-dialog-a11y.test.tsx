import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RfqPublishConfirmationModal } from './RfqPublishConfirmationModal';

describe('RFQ publish confirmation dialog', () => {
  it('exposes a named modal, a 44px close control, and does not render when closed', () => {
    const closed = renderToStaticMarkup(
      React.createElement(RfqPublishConfirmationModal, {
        pilotAllowance: null,
        allowanceStatus: 'ready',
        isOpen: false,
        onClose: () => undefined,
        onConfirm: async () => undefined,
        supplierCount: 2,
        deadlineDisplay: '21 Oct 2026',
        requirementTitle: 'Motor rewinding',
        isBusy: false,
      }),
    );
    expect(closed).toBe('');

    const html = renderToStaticMarkup(
      React.createElement(RfqPublishConfirmationModal, {
        pilotAllowance: null,
        allowanceStatus: 'ready',
        isOpen: true,
        onClose: () => undefined,
        onConfirm: async () => undefined,
        supplierCount: 2,
        deadlineDisplay: '21 Oct 2026',
        requirementTitle: 'Motor rewinding',
        isBusy: false,
      }),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="publish-confirmation-title"');
    expect(html).toContain('aria-labelledby="publish-confirmation-title"');
    expect(html).toContain('min-h-[48px]');
    expect(html).toContain('Close confirmation dialog');
  });

  it('portals the fixed overlay outside transformed page ancestors in the browser', () => {
    const source = readFileSync(resolve(__dirname, 'RfqPublishConfirmationModal.tsx'), 'utf8');
    expect(source).toContain('createPortal(dialog, document.body)');
  });
});
