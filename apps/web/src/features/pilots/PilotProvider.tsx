import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PILOT_ID,
  getPilotById,
  isPilotId,
  type PilotDefinition,
  type PilotId,
} from '@/lib/pilots';

const STORAGE_KEY = 'otp-active-pilot';

function readStoredPilotId(): PilotId {
  if (typeof window === 'undefined') return DEFAULT_PILOT_ID;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored && isPilotId(stored) ? stored : DEFAULT_PILOT_ID;
}

interface PilotContextValue {
  activePilot: PilotDefinition;
  activePilotId: PilotId;
  setActivePilotId: (id: PilotId) => void;
}

const PilotContext = createContext<PilotContextValue | null>(null);

export function PilotProvider({ children }: { children: ReactNode }) {
  const [activePilotId, setActivePilotIdState] = useState<PilotId>(readStoredPilotId);

  const setActivePilotId = useCallback((id: PilotId) => {
    setActivePilotIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activePilot = useMemo(() => getPilotById(activePilotId), [activePilotId]);

  const value = useMemo(
    () => ({ activePilot, activePilotId, setActivePilotId }),
    [activePilot, activePilotId, setActivePilotId],
  );

  return <PilotContext.Provider value={value}>{children}</PilotContext.Provider>;
}

export function usePilot(): PilotContextValue {
  const ctx = useContext(PilotContext);
  if (!ctx) {
    throw new Error('usePilot must be used within PilotProvider');
  }
  return ctx;
}
