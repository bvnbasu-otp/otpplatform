import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useMaintenance } from '../MaintenanceContext';
import {
  getRetainedSession,
  clearRetainedSession,
  restoreSessionInputs,
  type RetainedSessionData,
} from '../session-retention';

export function RestoredSessionBanner() {
  const { isMaintenanceMode } = useMaintenance();
  const location = useLocation();
  const [retained, setRetained] = useState<RetainedSessionData | null>(null);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);

  useEffect(() => {
    // Only show post-maintenance when maintenance is NOT active
    if (!isMaintenanceMode) {
      const data = getRetainedSession();
      if (data && (data.fieldCount > 0 || data.path)) {
        setRetained(data);
      }
    } else {
      setRetained(null);
    }
  }, [isMaintenanceMode, location.pathname]);

  if (isMaintenanceMode || !retained) return null;

  const handleApply = () => {
    const count = restoreSessionInputs(retained);
    setRestoredNotice(`Successfully restored ${count} field(s) into the active workspace.`);
    setTimeout(() => {
      clearRetainedSession();
      setRetained(null);
      setRestoredNotice(null);
    }, 3500);
  };

  const handleDismiss = () => {
    clearRetainedSession();
    setRetained(null);
  };

  return (
    <aside
      aria-label="Restored Session Alert"
      className="sticky top-0 z-50 w-full border-b border-emerald-500/40 bg-emerald-950/95 text-emerald-100 px-4 py-2.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-emerald-950/80"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 font-medium">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-sm">
            ✨
          </span>
          <div>
            <span className="font-bold text-emerald-300">
              Platform Maintenance Concluded!
            </span>{' '}
            <span className="text-emerald-200/90">
              {restoredNotice || (
                <>
                  Your unsaved session from{' '}
                  <strong className="font-mono text-white">{retained.path}</strong> has been
                  preserved.
                </>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!restoredNotice && retained.fieldCount > 0 && (
            <button
              type="button"
              onClick={handleApply}
              className="inline-flex items-center gap-1 rounded bg-emerald-500 px-3 py-1 font-bold text-slate-950 shadow hover:bg-emerald-400 transition"
            >
              <span>Re-apply Inputs ✓</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded bg-emerald-900/60 hover:bg-emerald-900 px-2.5 py-1 text-emerald-300 transition"
          >
            Dismiss ✕
          </button>
        </div>
      </div>
    </aside>
  );
}
