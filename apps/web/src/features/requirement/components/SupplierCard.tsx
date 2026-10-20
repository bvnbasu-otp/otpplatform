import type { MatchedSupplier } from '../types/discovery';
import {
  hasGstVerification,
  hasOtpRegistration,
  invitationStatusPresentation,
  isDirectInvitation,
  isGooglePlacesDiscovery,
} from '../lib/supplier-truth';

interface SupplierCardProps {
  supplier: MatchedSupplier;
  isSelected: boolean;
  onToggleSelect: (supplierId: string) => void;
  disabled?: boolean;
}

export function SupplierCard({
  supplier,
  isSelected,
  onToggleSelect,
  disabled = false,
}: SupplierCardProps) {
  const {
    invitationId,
    anonymousLabel,
    matchScore,
    matchLevel,
    matchReasons,
    networkLabel,
    isLocal,
    distanceKm,
    availabilityText,
  } = supplier;

  const invite = invitationStatusPresentation(supplier);
  const otpRegistered = hasOtpRegistration(supplier);
  const gstVerified = hasGstVerification(supplier);
  const placesDiscovery = isGooglePlacesDiscovery(supplier);
  const directInvite = isDirectInvitation(supplier);

  const matchLevelConfig = {
    EXCELLENT: {
      label: 'Excellent fit',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
    STRONG: {
      label: 'Strong fit',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    RELEVANT: {
      label: 'Relevant fit',
      textColor: 'text-purple-600 dark:text-purple-400',
    },
    CANDIDATE: {
      label: 'Candidate fit',
      textColor: 'text-slate-600 dark:text-slate-400',
    },
  };

  const levelConfig = matchLevelConfig[matchLevel] || matchLevelConfig.CANDIDATE;

  return (
    <article
      className={`rounded-xl border p-3.5 shadow-2xs transition-all ${
        isSelected
          ? 'border-primary/60 bg-primary/5 dark:bg-primary/10 shadow-xs ring-1 ring-primary/30'
          : 'bg-card border-border hover:border-border/80'
      }`}
      data-testid={`supplier-card-${invitationId}`}
      aria-label={`${anonymousLabel} - ${levelConfig.label}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-black text-foreground tracking-tight break-words">
              {anonymousLabel}
            </h3>
            <span
              className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border max-w-full truncate"
              data-testid={`supplier-network-label-${invitationId}`}
              title={networkLabel}
            >
              {networkLabel}
            </span>
          </div>

          <div
            className="flex flex-wrap items-center gap-2 text-[11px]"
            data-testid={`supplier-invitation-status-${invitationId}`}
          >
            <span
              className={`font-semibold ${
                invite.tone === 'positive'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : invite.tone === 'negative'
                    ? 'text-rose-700 dark:text-rose-300'
                    : invite.tone === 'warning'
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-muted-foreground'
              }`}
            >
              {invite.label}
            </span>
            {invite.detail && <span className="text-muted-foreground">{invite.detail}</span>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${levelConfig.textColor}`}>{levelConfig.label}</span>
            <span
              className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold text-primary border border-primary/20"
              data-testid={`match-score-${invitationId}`}
              title="Relevance score from discovery — not a customer rating"
            >
              Match {matchScore}/100
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-0.5 text-[11px]" data-testid={`supplier-trust-badges-${invitationId}`}>
            {otpRegistered ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 font-semibold text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800">
                OTP registered
              </span>
            ) : placesDiscovery ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-900/50 px-2 py-0.5 font-medium text-slate-700 dark:text-slate-300 border">
                Discovered in area — not OTP registered
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 font-medium text-muted-foreground border">
                Registration status unknown
              </span>
            )}

            {gstVerified ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                GST verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 font-medium text-muted-foreground border">
                GST not verified in this view
              </span>
            )}

            {directInvite && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 font-semibold text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                Direct invite
              </span>
            )}

            {isLocal && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Local radius{distanceKm ? ` (${distanceKm} km)` : ''}
              </span>
            )}

            {availabilityText && (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground border">
                {availabilityText}
              </span>
            )}

            {matchReasons
              .filter(
                (r) =>
                  ![
                    'category_match',
                    'verified_active',
                    'location_match',
                    'ondc',
                    'local',
                    'otp_registered',
                    'gst_verified',
                    'direct_invite',
                    'discovered_in_area',
                    'pin_coverage',
                  ].includes(r),
              )
              .slice(0, 2)
              .map((reason) => (
                <span
                  key={reason}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground border"
                >
                  {reason.replace(/_/g, ' ')}
                </span>
              ))}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggleSelect(invitationId)}
            className={`min-h-[48px] min-w-[48px] px-3.5 py-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 mobile-touch-target ${
              isSelected
                ? 'bg-primary text-primary-foreground shadow-2xs hover:bg-primary/90 ring-2 ring-primary/30'
                : 'border border-input bg-background text-foreground hover:bg-muted'
            } disabled:opacity-50`}
            aria-pressed={isSelected}
            aria-label={`${isSelected ? 'Deselect' : 'Select'} ${anonymousLabel}`}
            data-testid={`select-supplier-button-${invitationId}`}
          >
            <span className="text-sm font-black" aria-hidden="true">{isSelected ? '✓' : '+'}</span>
            <span>{isSelected ? 'Selected' : 'Select'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
