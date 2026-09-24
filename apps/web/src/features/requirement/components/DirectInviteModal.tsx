import { useState, useEffect } from 'react';
import { inviteDirectSupplier, type DirectInviteKind } from '../api/rfq-lifecycle';

interface DirectInviteModalProps {
  rfqId: string;
  isOpen: boolean;
  onClose: () => void;
  onInvited: () => void;
}

// Validation helpers
export function validateDirectInviteContact(kind: DirectInviteKind, rawValue: string): { valid: boolean; error?: string; normalized: string } {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: `Please enter ${kind === 'PHONE' ? 'a phone number' : 'an email address'}.`,
      normalized: '',
    };
  }

  if (kind === 'PHONE') {
    // Check if Indian mobile with country code +91
    if (trimmed.startsWith('+91')) {
      const nationalNumber = trimmed.replace(/\D/g, '').slice(2);
      if (/^[6-9]\d{9}$/.test(nationalNumber)) {
        return { valid: true, normalized: nationalNumber };
      }
      return {
        valid: false,
        error: 'Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
        normalized: trimmed,
      };
    }

    // If input explicitly starts with '+', validate international E.164 format (+ followed by 8 to 15 digits)
    if (trimmed.startsWith('+')) {
      const cleanIntl = trimmed.replace(/[\s\-()]/g, '');
      if (/^\+[1-9]\d{7,14}$/.test(cleanIntl)) {
        return { valid: true, normalized: cleanIntl };
      }
      return {
        valid: false,
        error: 'Please enter a valid international phone number with country code (e.g. +14155552671).',
        normalized: trimmed,
      };
    }

    // Strip non-digit characters
    const cleanDigits = trimmed.replace(/\D/g, '');

    // Check if 10-digit Indian mobile number (must start with 6, 7, 8, or 9)
    if (cleanDigits.length === 10) {
      if (/^[6-9]\d{9}$/.test(cleanDigits)) {
        return { valid: true, normalized: cleanDigits };
      }
      return {
        valid: false,
        error: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.',
        normalized: trimmed,
      };
    }

    // Check if Indian mobile with country code 91 (12 digits)
    if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
      const nationalNumber = cleanDigits.slice(2);
      if (/^[6-9]\d{9}$/.test(nationalNumber)) {
        return { valid: true, normalized: nationalNumber };
      }
    }

    // Check if Indian mobile with leading 0 (11 digits)
    if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) {
      const nationalNumber = cleanDigits.slice(1);
      if (/^[6-9]\d{9}$/.test(nationalNumber)) {
        return { valid: true, normalized: nationalNumber };
      }
    }

    return {
      valid: false,
      error: 'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9 (or international format starting with +).',
      normalized: trimmed,
    };
  } else {
    // Email address validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmed)) {
      return {
        valid: false,
        error: 'Please enter a valid work email address (e.g. sales@vendor.com).',
        normalized: trimmed,
      };
    }
    return { valid: true, normalized: trimmed.toLowerCase() };
  }
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
  const [createdInvite, setCreatedInvite] = useState<{
    quickQuoteUrl?: string;
    token?: string;
    reused: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Handle escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateDirectInviteContact(kind, value);

    if (!validation.valid) {
      setError(validation.error || 'Invalid input.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const res = await inviteDirectSupplier(rfqId, kind, validation.normalized);
    setIsSubmitting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setCreatedInvite({
      quickQuoteUrl: res.quickQuoteUrl,
      token: res.token,
      reused: res.reused,
    });
    setValue('');
    onInvited();
  }

  const handleCopyLink = async () => {
    if (!createdInvite?.quickQuoteUrl) return;
    try {
      await navigator.clipboard.writeText(createdInvite.quickQuoteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleReset = () => {
    setCreatedInvite(null);
    setValue('');
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-invite-modal-title"
      aria-describedby="direct-invite-modal-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl space-y-4 text-foreground animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">✉️</span>
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

        <p id="direct-invite-modal-desc" className="text-xs text-muted-foreground leading-relaxed">
          Invite a trusted supplier to submit a sealed quote. They will participate under a protected alias with zero identity exposure to other suppliers.
        </p>

        {/* Kind Toggle Tabs */}
        <div className="flex rounded-lg bg-muted p-1 gap-1" role="tablist" aria-label="Invitation Contact Type">
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'PHONE'}
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
            role="tab"
            aria-selected={kind === 'EMAIL'}
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

        {createdInvite ? (
          <div className="space-y-3.5 animate-in fade-in" data-testid="direct-invite-success">
            <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 space-y-1">
              <span className="font-bold text-xs text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <span>✓</span>
                <span>{createdInvite.reused ? 'Supplier Already Invited' : 'Supplier Invitation Registered'}</span>
              </span>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-snug">
                {createdInvite.reused
                  ? 'This vendor was previously invited to this RFQ under an identity-protected alias.'
                  : 'Invitation registered in database. Direct single-use quotation link is generated below.'}
              </p>
            </div>

            {/* Truthful gateway notice & Link sharing */}
            <div className="rounded-xl border bg-muted/20 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-semibold">
                <span>Direct Quotation Link:</span>
                <span className="text-[10px] text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-300">
                  Gateway offline · Share directly
                </span>
              </div>

              {createdInvite.quickQuoteUrl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      readOnly
                      value={createdInvite.quickQuoteUrl}
                      aria-label="Quotation Link"
                      className="min-h-[44px] flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-mono text-foreground focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCopyLink()}
                      className="min-h-[44px] px-3.5 py-1.5 rounded-lg bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shrink-0"
                    >
                      {copied ? '✓ Copied!' : 'Copy Link'}
                    </button>
                  </div>

                  {/* 1-Tap WhatsApp Forward */}
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Hello, you have been invited to submit a commercial quote on OTP. Submit your quotation here: ${createdInvite.quickQuoteUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] w-full rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 p-2"
                  >
                    <span>📲</span>
                    <span>Forward Link via WhatsApp →</span>
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleReset}
                className="min-h-[44px] w-full rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
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
                placeholder={kind === 'PHONE' ? 'e.g. 9876543210 or +91 9876543210' : 'e.g. sales@precisioneng.com'}
                className="min-h-[48px] w-full rounded-lg border bg-background px-3 py-2 text-base sm:text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary mobile-touch-target"
                autoFocus
                autoComplete={kind === 'PHONE' ? 'tel' : 'email'}
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-800 animate-in fade-in">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="min-h-[48px] flex-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[48px] flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition mobile-touch-target flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Inviting…</span>
                  </>
                ) : (
                  <span>Send Invitation →</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
