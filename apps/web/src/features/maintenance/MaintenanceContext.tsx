import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

import { KNOWN_MAINT_ACTIVE_KEY } from './session-retention';

export interface MaintenanceStatusContextType {
  isMaintenanceMode: boolean;
  maintenanceMessage: string;
  checkedAt: string | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const defaultStatus: MaintenanceStatusContextType = {
  isMaintenanceMode: false,
  maintenanceMessage: 'Scheduled maintenance in progress.',
  checkedAt: null,
  isLoading: true,
  refetch: async () => {},
};

const MaintenanceContext = createContext<MaintenanceStatusContextType>(defaultStatus);

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(KNOWN_MAINT_ACTIVE_KEY) === 'true';
    }
    return false;
  });
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>('Scheduled maintenance in progress.');
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_maintenance_status');
      if (!error && data && typeof data === 'object') {
        const maintObj = data as { maintenanceMode?: boolean; message?: string; checkedAt?: string };
        const isMaint = Boolean(maintObj.maintenanceMode);
        setIsMaintenanceMode(isMaint);
        if (typeof window !== 'undefined' && window.sessionStorage) {
          if (isMaint) {
            window.sessionStorage.setItem(KNOWN_MAINT_ACTIVE_KEY, 'true');
          } else {
            window.sessionStorage.removeItem(KNOWN_MAINT_ACTIVE_KEY);
          }
        }
        if (maintObj.message) {
          setMaintenanceMessage(maintObj.message);
        }
        if (maintObj.checkedAt) {
          setCheckedAt(maintObj.checkedAt);
        }
      }
    } catch {
      // Fallback gracefully on network hiccup
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();

    // Fast polling every 10 seconds so open tabs respond promptly when admin toggles maintenance
    const interval = setInterval(() => {
      void fetchStatus();
    }, 10000);

    const onFocus = () => {
      void fetchStatus();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [fetchStatus]);

  return (
    <MaintenanceContext.Provider
      value={{
        isMaintenanceMode,
        maintenanceMessage,
        checkedAt,
        isLoading,
        refetch: fetchStatus,
      }}
    >
      {children}
    </MaintenanceContext.Provider>
  );
}

export function useMaintenance(): MaintenanceStatusContextType {
  return useContext(MaintenanceContext);
}
