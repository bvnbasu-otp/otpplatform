import { useState } from 'react';
import { resetDemo } from './api/demo';
import { useDemoMode } from './hooks/use-demo-mode';

/**
 * Puts the demo back to its opening position.
 *
 * The reset itself is a server-side transaction scoped to is_demo rows, so this
 * button cannot delete a real tender however it is called. It asks first anyway:
 * during a live demonstration an accidental reset costs the presenter the thread
 * of their story.
 */
export function DemoResetButton({ onReset }: { onReset?: () => void } = {}) {
  const { status, identity, refresh } = useDemoMode();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!status.enabled) return null;

  // Only a demo account may reset, and the database enforces the same rule.
  // Hiding it from everyone else keeps a real tenant from being invited to
  // press something that will only fail.
  if (identity && !identity.isDemo) return null;

  async function handleReset() {
    setBusy(true);
    setError(null);
    const result = await resetDemo(true);
    setBusy(false);
    setConfirming(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    await refresh();
    onReset?.();
    // Every screen in the app is now looking at rows that were just rebuilt.
    window.location.reload();
  }

  if (!confirming) {
    return (
      <div className="flex items-center gap-2" data-testid="demo-reset">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md bg-amber-900/10 px-2.5 py-1 text-xs font-medium hover:bg-amber-900/20"
        >
          Reset demo
        </button>
        {error && <span className="text-xs text-red-800">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs" data-testid="demo-reset-confirm">
      <span>Rebuild every scenario?</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleReset()}
        className="rounded-md bg-amber-900 px-2.5 py-1 font-medium text-amber-50 disabled:opacity-50"
      >
        {busy ? 'Resetting…' : 'Yes, reset'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1 underline disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}
