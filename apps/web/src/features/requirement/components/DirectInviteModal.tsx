import { useState } from 'react';
import { inviteDirectSupplier, type DirectInviteKind } from '../api/rfq-lifecycle';

interface DirectInviteModalProps {
  rfqId: string;
  isOpen: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export function DirectInviteModal({
  rfqId,
  isOpen,
  onClose,
  onInvited,
}: DirectInviteModalProps) {
  const [kind, setKind] = useState<DirectInviteKind>('PHONE');
  const [value, setValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`Please enter a valid ${kind === 'PHONE' ? 'phone number' : 'email address'}.`);
      return;
    }

    if (kind === 'PHONE') {
      const cleanPhone = trimmed.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        setError('Please enter a valid 10-digit mobile number.');
        return;
      }
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError('Please enter a valid email address.');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const res = await inviteDirectSupplier(rfqId, kind, trimmed);
    setIsSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setSuccessMessage(
      res.reused
        ? 'Supplier was already invited to this RFQ.'
        : 'Direct supplier invitation dispatched securely!'
    );
    setValue('');
    onInvited();

    setTimeout(() => {
      onClose();
      setSuccessMessage(null);
    }, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-invite-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl space-y-4 text-foreground animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-lg">✉️</span>
            <h3 id="direct-invite-modal-title" className="text-sm font-bold text-foreground">
              Invite Known Supplier
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition mobile-touch-target"
            aria-label="Close invite modal"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Invite a trusted supplier to submit a sealed quote. They will participate under a protected alias with zero identity exposure to other suppliers.
        </p>

        {/* Kind Toggle Tabs */}
        <div className="flex rounded-lg bg-muted p-1 gap-1">
          <button
            type="button"
            onClick={() => {
              setKind('PHONE');
              setError(null);
            }}
            className={`min-h-[48px] flex-1 rounded-md text-xs font-bold transition mobile-touch-target ${
              kind === 'PHONE'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📱 Mobile / WhatsApp
          </button>
          <button
            type="button"
            onClick={() => {
              setKind('EMAIL');
              setError(null);
            }}
            className={`min-h-[48px] flex-1 rounded-md text-xs font-bold transition mobile-touch-target ${
              kind === 'EMAIL'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            📧 Email Address
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="contact-input" className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              {kind === 'PHONE' ? 'Supplier Mobile Number (10 Digits)' : 'Supplier Work Email'}
            </label>
            <input
              id="contact-input"
              type={kind === 'PHONE' ? 'tel' : 'email'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={kind === 'PHONE' ? 'e.g. 9876543210' : 'e.g. sales@precisioneng.com'}
              className="min-h-[48px] w-full rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary mobile-touch-target"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </p>
          )}

          {successMessage && (
            <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
              {successMessage}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[48px] flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition mobile-touch-target"
            >
              {isSubmitting ? 'Sending Invite…' : 'Send Invitation →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
