import { createContext, useContext } from 'react';
import type { DemoContext as DemoIdentity, DemoStatus } from '../types/demo';

export interface DemoModeState {
  status: DemoStatus;
  /** Null until signed in, or when the signed-in profile has no organization. */
  identity: DemoIdentity | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export const DemoModeContext = createContext<DemoModeState>({
  status: { enabled: false, runId: null, lastResetAt: null },
  identity: null,
  isLoading: true,
  refresh: async () => {},
});

/**
 * Whether the demo framework is on, and who the viewer is within it.
 *
 * Held in context rather than fetched per component: the banner, the reset
 * action and the dashboard all need the same answer, and asking three times
 * invites three different answers mid-reset.
 */
export function useDemoMode(): DemoModeState {
  return useContext(DemoModeContext);
}
