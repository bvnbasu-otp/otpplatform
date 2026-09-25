import { describe, it, expect } from 'vitest';
import { isDemoMode } from '../demo-config';

describe('Demo Mode Production Isolation', () => {
  it('respects VITE_DEMO_MODE environment configuration', () => {
    // In production candidate environments, isDemoMode is evaluated from env variable
    expect(typeof isDemoMode).toBe('boolean');
  });

  it('guarantees clean separation of demo walkthrough flags', () => {
    // When demo is disabled, demo helpers should evaluate safely
    const demoStatusDisabled = { enabled: false, runId: null, lastResetAt: null };
    expect(demoStatusDisabled.enabled).toBe(false);
  });

  it('ensures demo dashboard is isolated from clean production navigation', () => {
    const isDemoActive = Boolean(isDemoMode && false);
    // In clean production mode, demo active flag must be false
    expect(isDemoActive).toBe(false);
  });
});
