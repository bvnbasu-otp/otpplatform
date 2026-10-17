import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LegalSnapshotNotice } from './components/LegalSnapshotNotice';
import { RegistrationFrozenAgreementPanel } from './components/RegistrationFrozenAgreementPanel';
import type { CurrentAgreementState } from './hooks/use-current-agreement';

const readyPublished: CurrentAgreementState = {
  phase: 'ready',
  agreement: {
    agreementType: 'CUSTOMER_EULA',
    version: 'v-test',
    documentHash: 'sha256:abc',
    title: 'Buyer EULA',
    snapshotPublished: true,
    bodyText: 'Frozen buyer bytes',
  },
};

const readyUnpublished: CurrentAgreementState = {
  phase: 'ready',
  agreement: {
    agreementType: 'CUSTOMER_EULA',
    version: 'v-test',
    documentHash: 'sha256:abc',
    title: 'Buyer EULA',
    snapshotPublished: false,
    bodyText: null,
  },
};

describe('registration frozen agreement UI', () => {
  it('disables acceptance until the snapshot is published', () => {
    const html = renderToStaticMarkup(
      <RegistrationFrozenAgreementPanel
        side="BUYER"
        state={readyUnpublished}
        agreementVersion="v-test"
        agreementAccepted={false}
        onAgreementAcceptedChange={() => undefined}
        checkboxTestId="buyer-frozen-agreement-checkbox"
        panelTestId="buyer-frozen-agreement-panel"
      />,
    );
    expect(html).toContain('data-testid="legal-snapshot-unpublished"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('data-testid="buyer-frozen-agreement-checkbox"');
  });

  it('allows the checkbox only when ready and published', () => {
    const html = renderToStaticMarkup(
      <RegistrationFrozenAgreementPanel
        side="SUPPLIER"
        state={readyPublished}
        agreementVersion="v-test"
        agreementAccepted={false}
        onAgreementAcceptedChange={() => undefined}
        checkboxTestId="supplier-agreement-checkbox"
        panelTestId="supplier-agreement-prompt"
      />,
    );
    expect(html).toContain('Frozen buyer bytes');
    expect(html).toContain('data-testid="legal-snapshot-text"');
    expect(html).not.toContain('disabled=""');
  });

  it('shows loading and error states on the snapshot notice', () => {
    const loading = renderToStaticMarkup(<LegalSnapshotNotice version="" documentHash="" bodyText={null} published={false} loadPhase="loading" />);
    expect(loading).toContain('data-testid="legal-snapshot-loading"');

    const error = renderToStaticMarkup(
      <LegalSnapshotNotice
        version=""
        documentHash=""
        bodyText={null}
        published={false}
        loadPhase="error"
        errorMessage="Catalogue offline"
      />,
    );
    expect(error).toContain('data-testid="legal-snapshot-error"');
    expect(error).toContain('Catalogue offline');
  });
});
