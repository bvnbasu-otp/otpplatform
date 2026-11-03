import React, { useState } from 'react';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import { executeGreenfieldReset } from '../api/admin-ops';

export interface AdminGreenfieldResetCardProps {
  onResetComplete?: () => void;
}

const REQUIRED_RESET_TOKEN = 'RESET-TO-GREENFIELD-2026';

export function AdminGreenfieldResetCard({ onResetComplete }: AdminGreenfieldResetCardProps) {
  const { user } = useAuth();
  const { context: roleContext } = useRoleContext();

  const userEmail = (roleContext?.email || user?.email || '').trim().toLowerCase();
  const isFounder = Boolean(
    roleContext?.isFounder ||
    userEmail === 'bvnbasu@gmail.com' ||
    userEmail === 'bvnbasu@yahoo.com'
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<any | null>(null);

  const isTokenValid = confirmationInput.trim() === REQUIRED_RESET_TOKEN;

  const handleOpenModal = () => {
    setConfirmationInput('');
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (isResetting) return;
    setIsModalOpen(false);
    setConfirmationInput('');
  };

  const handleExecuteReset = async () => {
    if (!isTokenValid || isResetting) return;
    setIsResetting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await executeGreenfieldReset(confirmationInput.trim());
      if (res.ok) {
        setStatusMessage(res.message);
        setReceipt(res.result);
        setIsModalOpen(false);
        if (onResetComplete) {
          onResetComplete();
        }
      } else {
        setErrorMessage(res.error || 'Failed to execute greenfield reset.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown reset error.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/20 via-card to-card p-5 sm:p-6 shadow-sm space-y-4"
      data-testid="admin-greenfield-reset-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl">🌱</span>
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Platform Lifecycle &amp; Greenfield Reset Engine
            </h3>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wide">
              Post-Pilot Reset
            </span>
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 uppercase tracking-wide">
              Founder Only
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Instantaneously reset the platform database back to the pristine greenfield state after pilot testing.
            Wipes all demo/pilot buyers, suppliers, organizations, transactional requirements, quotes, and discovery
            caches in under 3 seconds, while strictly preserving platform schemas, code, triggers, baseline charters,
            and Platform Founder credentials.
          </p>
        </div>

        <div className="shrink-0">
          {isFounder ? (
            <button
              type="button"
              onClick={handleOpenModal}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold shadow transition active:scale-98"
              data-testid="btn-open-greenfield-reset-modal"
            >
              <span>🌱</span>
              <span>Reset to Greenfield State</span>
            </button>
          ) : (
            <div className="rounded-xl border border-border/80 bg-muted/40 p-2.5 text-[11px] text-muted-foreground text-center">
              🔒 Restricted to Platform Founder (Baskar Loganathan)
            </div>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs text-emerald-950 font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 font-bold text-sm">✓</span>
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-muted-foreground hover:text-foreground text-xs font-bold ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {receipt && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/5 p-3 text-[11px] font-mono text-emerald-900 space-y-1">
          <div className="font-bold uppercase tracking-wider text-[10px] text-emerald-700">
            Greenfield Reset Audit Receipt
          </div>
          <div>Status: {receipt.status} &bull; Timestamp: {new Date(receipt.timestamp).toLocaleString('en-IN')}</div>
          <div>Retained Accounts: {Array.isArray(receipt.retained_users) ? receipt.retained_users.join(', ') : 'bvnbasu@gmail.com, bvnbasu@yahoo.com'}</div>
          <div>Production Deployment State: Active &amp; Ready for Greenfield Onboarding</div>
        </div>
      )}

      {/* Two-Step Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h4 className="text-base font-bold text-foreground">
                  Confirm Greenfield Platform Reset
                </h4>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isResetting}
                className="text-muted-foreground hover:text-foreground text-sm font-bold disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              This action executes the canonical greenfield purge engine. All transactional and organizational data
              accumulated during the pilot will be permanently removed.
            </p>

            <div className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-2 text-xs">
              <div className="font-bold text-foreground text-[11px] uppercase tracking-wider">
                Summary of Atomic Operations:
              </div>
              <ul className="space-y-1 text-muted-foreground text-[11px]">
                <li className="flex items-center gap-1.5 text-destructive font-medium">
                  <span>❌</span>
                  <span>Purge all pilot buyers, suppliers, and created organizations</span>
                </li>
                <li className="flex items-center gap-1.5 text-destructive font-medium">
                  <span>❌</span>
                  <span>Purge all transactional RFQs, quotes, POs, invoices, and payments</span>
                </li>
                <li className="flex items-center gap-1.5 text-destructive font-medium">
                  <span>❌</span>
                  <span>Purge SNE and Google Places discovery caches</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <span>✅</span>
                  <span>Preserve bvnbasu@gmail.com &amp; bvnbasu@yahoo.com (Platform Superadmins)</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <span>✅</span>
                  <span>Preserve all database tables, views, triggers, and migrations intact</span>
                </li>
                <li className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <span>✅</span>
                  <span>Preserve baseline referral plans and legal agreements</span>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">
                To confirm, type <span className="font-mono font-bold text-destructive bg-destructive/10 px-1 py-0.5 rounded">{REQUIRED_RESET_TOKEN}</span> below:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder={REQUIRED_RESET_TOKEN}
                disabled={isResetting}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-bold tracking-wider text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-destructive/30"
                data-testid="input-greenfield-reset-confirmation"
              />
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive font-semibold">
                ⚠️ {errorMessage}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isResetting}
                className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={!isTokenValid || isResetting}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-destructive text-white hover:bg-destructive/90 px-4 py-2 text-xs font-bold shadow transition disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="btn-confirm-execute-greenfield-reset"
              >
                {isResetting ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Resetting Database…</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Confirm &amp; Execute Greenfield Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
