import React, { useState } from 'react';
import {
  generatePersistentReferralCode,
  generateReferralUrl,
  generateWhatsAppShareUrl,
  getReferralWebShareData,
} from '@/features/subscription';

export interface ReferAndEarnCardProps {
  identifier?: string | null;
  orgName?: string | null;
  side?: 'buyer' | 'supplier';
  className?: string;
  compact?: boolean;
}

export function ReferAndEarnCard({
  identifier,
  orgName,
  side = 'buyer',
  className = '',
  compact = false,
}: ReferAndEarnCardProps) {
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const safeIdentifier = identifier || 'OTP-COMMUNITY';
  const referralCode = generatePersistentReferralCode(safeIdentifier, 'OTP');
  
  const origin = typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : 'https://otp.market';

  const referralUrl = generateReferralUrl(referralCode, origin, side);
  const whatsappUrl = generateWhatsAppShareUrl({
    referralUrl,
    referralCode,
    source: 'web_dashboard',
  });

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(referralUrl);
      } else {
        const input = document.createElement('input');
        input.value = referralUrl;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setShareError('Failed to copy link. Please copy manually.');
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        const shareData = getReferralWebShareData({
          referralUrl,
          referralCode,
        });
        await navigator.share(shareData);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // Fallback to clipboard
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  if (compact) {
    return (
      <div className={`rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-2xs ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">🤝</span>
            <div>
              <h4 className="text-xs font-bold text-foreground">Refer &amp; Earn 10% Reward</h4>
              <p className="text-[11px] text-muted-foreground font-mono">{referralCode}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs flex items-center gap-1.5 transition shadow-2xs"
            >
              <span>💬</span>
              <span>WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-lg border border-border bg-card hover:bg-muted text-foreground font-semibold px-2.5 py-1.5 text-xs transition cursor-pointer"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-card to-card p-5 shadow-xs ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-2xl font-bold shadow-2xs">
            🤝
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-foreground text-base">Refer &amp; Earn 10% Reward</h3>
              <span className="rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 border border-emerald-500/30">
                Non-Cash Platform Credits
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Invite peer buyers or verified suppliers. Receive 10% in OTP Wallet Credits on their first subscription payment.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-blue-500/10 text-blue-800 dark:text-blue-300 text-[10px] font-bold px-2.5 py-1 border border-blue-500/20">
          <span>🛡️</span>
          <span>Controlled Pilot Sandbox</span>
        </div>
      </div>

      {/* Code & Action Box */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Referral Code Display */}
        <div className="md:col-span-6 rounded-xl border border-border bg-background p-3 flex items-center justify-between gap-2 shadow-inner">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Your Persistent Referral Code
            </span>
            <span className="text-base font-black font-mono tracking-wide text-foreground">
              {referralCode}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg bg-muted hover:bg-muted/80 text-foreground text-xs font-bold px-3 py-1.5 border border-border transition cursor-pointer"
          >
            {copied ? '✓ Copied Link' : '📋 Copy Link'}
          </button>
        </div>

        {/* Primary WhatsApp Share & Native Share Buttons */}
        <div className="md:col-span-6 flex flex-wrap sm:flex-nowrap items-center gap-2">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <span className="text-base">💬</span>
            <span>Share on WhatsApp</span>
          </a>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="min-h-[44px] rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-xs px-3 py-2.5 transition flex items-center justify-center gap-1.5 cursor-pointer"
              title="Share via other apps"
            >
              <span>📲</span>
              <span className="hidden sm:inline">Share</span>
            </button>
          )}
        </div>
      </div>

      {/* Referral Link Text Preview */}
      <div className="mt-3 text-[11px] text-muted-foreground font-mono truncate bg-muted/30 px-3 py-1.5 rounded-lg border border-border/40">
        🔗 <span className="text-foreground/80">{referralUrl}</span>
      </div>

      {shareError && (
        <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {shareError}
        </p>
      )}

      {/* Rules & Transparency Footnote */}
      <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
          <span><strong>30-Day Window:</strong> Attribution locked on registration.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
          <span><strong>Anti-Fraud:</strong> Self-referrals strictly blocked.</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
          <span><strong>Wallet Only:</strong> Platform credit for renewals &amp; top-ups.</span>
        </div>
      </div>
    </div>
  );
}
