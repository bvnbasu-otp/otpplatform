import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RfqPublishConfirmationModal } from './RfqPublishConfirmationModal';

const onConfirm = vi.fn(async () => undefined);

function markup(isBusy: boolean) {
  return renderToStaticMarkup(
    React.createElement(RfqPublishConfirmationModal, {
      pilotAllowance: null,
      allowanceStatus: 'ready',
      isOpen: true,
      onClose: () => undefined,
      onConfirm,
      supplierCount: 2,
      deadlineDisplay: '21 Oct 2026',
      requirementTitle: 'Disposable motor rewinding',
      isBusy,
    }),
  );
}

describe('RFQ publish dialog busy-state contract', () => {
  it('keeps the real modal named and prevents close controls from bypassing a busy publish', () => {
    const html = markup(true);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="publish-confirmation-title"');
    expect(html).toContain('Ready to Broadcast RFQ?');
    expect(html).toContain('aria-label="Close confirmation dialog"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Back to Review');
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-testid="confirm-publish-button"');
    expect(html).not.toContain('publishRfq');
  });

  it('restores an operable close control after the busy state clears', () => {
    const html = markup(false);
    expect(html).toContain('aria-disabled="false"');
    expect(html).toContain('Close confirmation dialog');
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
