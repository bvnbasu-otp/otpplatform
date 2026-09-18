import { describe, it, expect, vi } from 'vitest';
import { useOnlineStatus } from '../useOnlineStatus';
import { useDeviceCapabilities } from '../useDeviceCapabilities';

describe('useDeviceCapabilities & useOnlineStatus modules', () => {
  it('exports useOnlineStatus hook function', () => {
    expect(useOnlineStatus).toBeDefined();
    expect(typeof useOnlineStatus).toBe('function');
  });

  it('exports useDeviceCapabilities hook function', () => {
    expect(useDeviceCapabilities).toBeDefined();
    expect(typeof useDeviceCapabilities).toBe('function');
  });
});
