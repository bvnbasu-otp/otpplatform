import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  executeDemoUserDeletion,
  previewDemoUserDeletion,
  type DemoUserDeletionPreview,
} from '../api/demo-user-deletion';
import type { AdminUserItem } from '../types/admin';

export function isDemoDeletionPreviewExpired(
  expiresAt: string | null,
  now = Date.now(),
): boolean {
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}

export function demoDeletionErrorRequiresFreshPreview(error: string): boolean {
  return /DEMO_USER_DELETE_(?:STALE_PREVIEW|CONFIRMATION_EXPIRED|CONFIRMATION_MISMATCH|BLOCKED)/.test(
    error,
  );
}

function readableError(error: string): string {
  if (error.includes('DEMO_USER_DELETE_STALE_PREVIEW')) {
    return 'The account changed after this preview. Request a fresh preview and review every dependency again.';
  }
  if (error.includes('DEMO_USER_DELETE_CONFIRMATION_EXPIRED')) {
    return 'This preview expired. Request a fresh preview before trying again.';
  }
  if (error.includes('DEMO_USER_DELETE_CONFIRMATION_MISMATCH')) {
    return 'The one-time confirmation is no longer valid. Request a fresh preview.';
  }
  if (error.includes('DEMO_USER_DELETE_DENIED') || error.includes('permission denied')) {
    return 'The server denied this action. An effective active SUPER_ADMIN session is required.';
  }
  if (error.includes('DEMO_USER_DELETE_BLOCKED')) {
    return 'Deletion is blocked by the current server-side account state. Request a fresh preview.';
  }
  return error;
}

interface DemoUserDeletionModalProps {
  target: AdminUserItem;
  onClose: () => void;
  onDeleted: (auditEventId: string) => void;
}

const FOCUSABLE_CANDIDATES = 'button, input, textarea, select, a[href], [tabindex]';

export function focusableWithin(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_CANDIDATES)).filter((element) => {
    if (element.hasAttribute('disabled') || element.getAttribute('tabindex') === '-1') return false;
    for (let node: HTMLElement | null = element; node && node !== dialog; node = node.parentElement) {
      if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  });
}

export function DemoUserDeletionModal({
  target,
  onClose,
  onDeleted,
}: DemoUserDeletionModalProps) {
  const [preview, setPreview] = useState<DemoUserDeletionPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const requestPreview = async () => {
    if (isPreviewing || submittingRef.current) return;
    setIsPreviewing(true);
    setError(null);
    setPreview(null);
    setConfirmation('');
    try {
      const result = await previewDemoUserDeletion(target.id);
      if (!result.ok) {
        setError(readableError(result.error));
        return;
      }
      setPreview(result.preview);
    } catch (previewError) {
      setError(
        readableError(previewError instanceof Error ? previewError.message : 'Unable to request the deletion preview.'),
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  useEffect(() => {
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog) (focusableWithin(dialog)[0] ?? dialog).focus();
    void requestPreview();
    return () => {
      const previous = previouslyFocusedRef.current;
      if (previous && previous.isConnected) previous.focus();
    };
    // The parent keys this modal by target id, so target changes remount it and
    // discard the prior one-time token and all confirmation fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);

  const expired = isDemoDeletionPreviewExpired(preview?.expiresAt ?? null);
  const canDelete =
    preview?.eligible === true &&
    preview.blockerCount === 0 &&
    Boolean(preview.confirmationToken) &&
    !expired &&
    confirmation === target.email &&
    reason.trim().length > 0 &&
    outcome.trim().length > 0 &&
    !isDeleting;

  const handleDelete = async () => {
    if (!canDelete || !preview?.confirmationToken || submittingRef.current) return;
    if (isDemoDeletionPreviewExpired(preview.expiresAt)) {
      setPreview(null);
      setConfirmation('');
      setError('This preview expired. Request a fresh preview before trying again.');
      return;
    }
    submittingRef.current = true;
    setIsDeleting(true);
    setError(null);
    let deletedAuditEventId: string | null = null;
    try {
      const result = await executeDemoUserDeletion({
        targetProfileId: target.id,
        confirmationToken: preview.confirmationToken,
        reason,
        outcome,
      });
      if (!result.ok) {
        if (demoDeletionErrorRequiresFreshPreview(result.error)) {
          setPreview(null);
          setConfirmation('');
        }
        setError(readableError(result.error));
        return;
      }
      deletedAuditEventId = result.result.auditEventId;
    } catch (executeError) {
      setError(
        readableError(executeError instanceof Error ? executeError.message : 'The deletion request failed.'),
      );
    } finally {
      // A verified deletion keeps the guard engaged so this token is never resubmitted.
      if (deletedAuditEventId === null) {
        submittingRef.current = false;
        setIsDeleting(false);
      }
    }
    if (deletedAuditEventId !== null) onDeleted(deletedAuditEventId);
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!submittingRef.current) onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const focusable = focusableWithin(dialog);
    if (focusable.length === 0) {
      dialog.focus();
      return;
    }
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? focusable[index <= 0 ? focusable.length - 1 : index - 1]
      : focusable[index === -1 || index === focusable.length - 1 ? 0 : index + 1];
    next?.focus();
  };

  const blockingDependencies = preview?.dependencies.filter((dependency) => dependency.blocks) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submittingRef.current) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-deletion-title"
        aria-describedby="demo-deletion-warning"
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-rose-500/40 bg-card p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="demo-deletion-title" className="text-lg font-extrabold text-rose-700 dark:text-rose-300">
              Permanently delete demo/QA account
            </h2>
            <p id="demo-deletion-warning" className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-300">
              Irreversible: this removes both the profile and Auth identity. Existing lifecycle actions remain separate.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Close permanent deletion dialog"
            className="min-h-[44px] min-w-[44px] rounded-xl border text-lg disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <dl className="mt-4 grid gap-2 rounded-xl bg-muted/40 p-3 text-xs sm:grid-cols-2">
          <div><dt className="font-bold text-muted-foreground">Target</dt><dd>{target.fullName || 'Unnamed account'}</dd></div>
          <div><dt className="font-bold text-muted-foreground">Email</dt><dd className="break-all font-mono">{target.email}</dd></div>
          <div><dt className="font-bold text-muted-foreground">Profile ID</dt><dd className="break-all font-mono">{target.id}</dd></div>
          <div><dt className="font-bold text-muted-foreground">UI marker</dt><dd>{target.isDemo ? 'Demo/QA' : 'Not marked demo — action unavailable'}</dd></div>
        </dl>

        {isPreviewing && <p role="status" className="mt-4 text-sm">Requesting server-authorized preview…</p>}
        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {preview && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-xl border p-3"><strong>Server eligibility</strong><div>{preview.eligible ? 'Eligible' : 'Ineligible'}</div></div>
              <div className="rounded-xl border p-3"><strong>Blockers</strong><div>{preview.blockerCount}</div></div>
              <div className="rounded-xl border p-3"><strong>Preview expiry</strong><div>{preview.expiresAt ? new Date(preview.expiresAt).toLocaleString() : 'No token issued'}</div></div>
            </div>

            {preview.policyBlockers.length > 0 && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                <strong>Policy blockers</strong>
                <ul className="mt-1 list-disc pl-5">
                  {preview.policyBlockers.map((blocker) => (
                    <li key={`${blocker.category}:${blocker.code}`}>{blocker.category}: {blocker.code}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border p-3 text-xs">
              <strong>Dependency details ({preview.dependencies.length} catalog entries)</strong>
              {blockingDependencies.length === 0 ? (
                <p className="mt-1 text-emerald-700 dark:text-emerald-300">No retained dependency blocks were found.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {blockingDependencies.map((dependency) => (
                    <li key={dependency.constraint} className="rounded-lg bg-rose-500/10 p-2">
                      <span className="font-mono">{dependency.schema}.{dependency.table}.{dependency.column ?? '?'}</span>
                      {' — '}{dependency.category}, {dependency.count} row(s), {dependency.disposition}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {expired && preview.confirmationToken && (
              <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-xs font-semibold">
                This preview has expired. Request a fresh preview.
              </p>
            )}

            <div className="grid gap-3">
              <label className="text-xs font-bold">
                Type the target email exactly
                <input
                  aria-label="Deletion confirmation email"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  className="mt-1 min-h-[44px] w-full rounded-xl border bg-background px-3 font-mono font-normal"
                />
              </label>
              <label className="text-xs font-bold">
                Reason
                <textarea
                  aria-label="Permanent deletion reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="mt-1 min-h-20 w-full rounded-xl border bg-background p-3 font-normal"
                />
              </label>
              <label className="text-xs font-bold">
                Expected outcome
                <textarea
                  aria-label="Permanent deletion outcome"
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  className="mt-1 min-h-20 w-full rounded-xl border bg-background p-3 font-normal"
                />
              </label>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => void requestPreview()}
            disabled={isPreviewing || isDeleting}
            className="min-h-[44px] rounded-xl border px-4 text-sm font-bold disabled:opacity-50"
          >
            {isPreviewing ? 'Previewing…' : 'Request fresh preview'}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!canDelete}
            className="min-h-[44px] rounded-xl bg-rose-700 px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? 'Deleting…' : 'Permanently delete account'}
          </button>
        </div>
      </section>
    </div>
  );
}
