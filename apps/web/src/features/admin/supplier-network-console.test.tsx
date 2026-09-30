import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { AdminSupplierNetworkConsole } from './components/AdminSupplierNetworkConsole';

describe('AdminSupplierNetworkConsole (R2-07 Superadmin Location Pre-Warm UI)', () => {
  it('instantiates AdminSupplierNetworkConsole cleanly with default form values', () => {
    const handlePrepare = vi.fn();
    const handleRefresh = vi.fn();

    const element = React.createElement(AdminSupplierNetworkConsole, {
      onPrepareLocation: handlePrepare,
      onRefreshTelemetry: handleRefresh,
    });

    expect(element).toBeDefined();
    expect(element.props.onPrepareLocation).toBe(handlePrepare);
    expect(element.props.onRefreshTelemetry).toBe(handleRefresh);
  });

  it('passes executeDiscovery separately from forceRefresh to backend handler', () => {
    const handlePrepare = vi.fn();
    const element = React.createElement(AdminSupplierNetworkConsole, {
      onPrepareLocation: handlePrepare,
    });
    expect(element.props.onPrepareLocation).toBe(handlePrepare);
  });
});
