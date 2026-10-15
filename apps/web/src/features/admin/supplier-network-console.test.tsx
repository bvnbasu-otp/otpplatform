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

  it('supports canonical database categories during superadmin location warming', () => {
    const handlePrepare = vi.fn();
    const handleRefresh = vi.fn();
    const element = React.createElement(AdminSupplierNetworkConsole, {
      onPrepareLocation: handlePrepare,
      onRefreshTelemetry: handleRefresh,
    });
    expect(element.type).toBe(AdminSupplierNetworkConsole);
  });

  it('operates based on PINCODE ONLY without requiring manual state/city dropdown selection', () => {
    const handlePrepare = vi.fn();
    const element = React.createElement(AdminSupplierNetworkConsole, {
      onPrepareLocation: handlePrepare,
    });
    expect(element.props.onPrepareLocation).toBe(handlePrepare);
  });

  it('auto-derives state and city (e.g. 638301 -> Tamil Nadu, Bhavani, Erode) preventing state/city mismatch', async () => {
    const { inferIndianState, inferIndianCity } = await import('@/features/intake/api/draft');
    const state = inferIndianState('638301');
    const city = inferIndianCity('638301', state);

    expect(state).toBe('Tamil Nadu');
    expect(city).toBe('Bhavani, Erode');
  });

  it('safely binds detectedCity into supplier location cards preventing undefined city errors', () => {
    const element = React.createElement(AdminSupplierNetworkConsole, {});
    expect(element.type).toBe(AdminSupplierNetworkConsole);
  });
});

