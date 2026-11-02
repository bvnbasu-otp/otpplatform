import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AdminLiveIntegrationProbes,
  SNE_17_CATEGORIES,
} from './AdminLiveIntegrationProbes';

describe('AdminLiveIntegrationProbes component', () => {
  it('renders all 7 integration gates and SNE categories via renderToStaticMarkup', () => {
    const html = renderToStaticMarkup(<AdminLiveIntegrationProbes />);

    expect(html).toContain('Live Integration Probes &amp; Health Diagnostics');
    expect(html).toContain('fire-all-probes-button');
    expect(html).toContain('probe-card-PROBE-WAHA');
    expect(html).toContain('probe-card-PROBE-GMAIL');
    expect(html).toContain('probe-card-PROBE-GIS');
    expect(html).toContain('probe-card-PROBE-REALTIME');
    expect(html).toContain('probe-card-PROBE-UPI');
    expect(html).toContain('probe-card-PROBE-SNE');
    expect(html).toContain('probe-card-PROBE-ONDC');

    expect(SNE_17_CATEGORIES).toHaveLength(17);
    expect(SNE_17_CATEGORIES).toContain('Borewells & Submersible Pumps');
    expect(SNE_17_CATEGORIES).toContain('Motor Rewinding & Overhaul');
    expect(SNE_17_CATEGORIES).toContain('Elevators & Lift Maintenance');
  });

  it('includes inputs and buttons for all external probe targets', () => {
    const html = renderToStaticMarkup(<AdminLiveIntegrationProbes />);

    expect(html).toContain('+91 98400 12345');
    expect(html).toContain('procurement-ops@otp.test');
    expect(html).toContain('560048');
    expect(html).toContain('50000');
    expect(html).toContain('BOREWELL_MOTOR_REWINDING');
    expect(html).toContain('Fire Probe Test');
  });
});
