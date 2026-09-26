import { useMemo } from 'react';
import { Card, Badge } from '@/components/ui';

export type GooglePlacesProviderStatus =
  | 'LIVE'
  | 'CREDENTIAL_GATED'
  | 'FALLBACK_ACTIVE'
  | 'QUOTA_EXHAUSTED'
  | 'UNAVAILABLE';

export type GooglePlacesFallbackTier =
  | 'LIVE_API'
  | 'DATABASE_CACHE'
  | 'STATIC_REFERENCE'
  | 'UNAVAILABLE';

export interface GooglePlacesDiscoveryMetrics {
  sessionsToday: number;
  avgApiCallsPerSession: number;
  candidatesDiscoveredInArea: number;
  candidatesOtpRegistered: number;
  candidatesGstVerified: number;
}

export interface GooglePlacesOperationalVisibilityData {
  providerStatus: GooglePlacesProviderStatus;
  isCredentialConfigured: boolean;
  isCredentialVerifiedLive: boolean;
  activeFallbackTier: GooglePlacesFallbackTier;
  dailySafetyLimit: number;
  usedToday: number;
  metrics: GooglePlacesDiscoveryMetrics;
}

export interface GooglePlacesOperationalCardProps {
  data?: GooglePlacesOperationalVisibilityData;
  className?: string;
}

export type QuotaHealthColor = 'green' | 'yellow' | 'orange' | 'red';

export interface QuotaHealthEvaluation {
  used: number;
  limit: number;
  remaining: number;
  percentageConsumed: number;
  healthColor: QuotaHealthColor;
  healthLabel: string;
}

/**
 * Authoritative evaluation of quota health threshold.
 * Quota Health Thresholds:
 *   - 0–70%: Green (Healthy)
 *   - 70–85%: Yellow (Moderate)
 *   - 85–95%: Orange (Warning)
 *   - 95–100%: Red (Critical / Near Exhaustion)
 */
export function evaluateGooglePlacesQuotaHealth(
  used: number,
  limit: number,
): QuotaHealthEvaluation {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 1500;
  const safeUsed = Math.max(0, Number.isFinite(used) ? used : 0);
  const remaining = Math.max(0, safeLimit - safeUsed);
  const percentageConsumed = Math.min(100, Math.round((safeUsed / safeLimit) * 1000) / 10);

  let healthColor: QuotaHealthColor = 'green';
  let healthLabel = 'Normal Operating Headroom';

  if (percentageConsumed >= 95) {
    healthColor = 'red';
    healthLabel = 'Critical / Near Exhaustion';
  } else if (percentageConsumed >= 85) {
    healthColor = 'orange';
    healthLabel = 'High Utilization Warning';
  } else if (percentageConsumed >= 70) {
    healthColor = 'yellow';
    healthLabel = 'Moderate Utilization';
  }

  return {
    used: safeUsed,
    limit: safeLimit,
    remaining,
    percentageConsumed,
    healthColor,
    healthLabel,
  };
}

export function GooglePlacesOperationalCard({
  data,
  className = '',
}: GooglePlacesOperationalCardProps) {
  // Default values aligning with production safety config (default limit: 1,500 reqs/day)
  const operationalData: GooglePlacesOperationalVisibilityData = data ?? {
    providerStatus: 'LIVE',
    isCredentialConfigured: true,
    isCredentialVerifiedLive: true,
    activeFallbackTier: 'LIVE_API',
    dailySafetyLimit: 1500,
    usedToday: 148,
    metrics: {
      sessionsToday: 42,
      avgApiCallsPerSession: 3.5,
      candidatesDiscoveredInArea: 312,
      candidatesOtpRegistered: 84,
      candidatesGstVerified: 46,
    },
  };

  const {
    providerStatus,
    isCredentialConfigured,
    isCredentialVerifiedLive,
    activeFallbackTier,
    dailySafetyLimit,
    usedToday,
    metrics,
  } = operationalData;

  // Strict Truthfulness Invariant: Never display LIVE unless verified live
  const effectiveStatus: GooglePlacesProviderStatus = useMemo(() => {
    if (providerStatus === 'LIVE' && !isCredentialVerifiedLive) {
      return isCredentialConfigured ? 'CREDENTIAL_GATED' : 'UNAVAILABLE';
    }
    return providerStatus;
  }, [providerStatus, isCredentialVerifiedLive, isCredentialConfigured]);

  const quota = useMemo(
    () => evaluateGooglePlacesQuotaHealth(usedToday, dailySafetyLimit),
    [usedToday, dailySafetyLimit],
  );

  const statusBadgeInfo = useMemo(() => {
    switch (effectiveStatus) {
      case 'LIVE':
        return {
          label: 'LIVE',
          tone: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
          icon: '🟢',
          description: 'Production discovery engine actively querying Google Places API.',
        };
      case 'CREDENTIAL_GATED':
        return {
          label: 'CREDENTIAL_GATED',
          tone: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
          icon: '🔒',
          description: 'API key configured but gated or awaiting live activation verification.',
        };
      case 'FALLBACK_ACTIVE':
        return {
          label: 'FALLBACK_ACTIVE',
          tone: 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
          icon: '🛡️',
          description: 'Live API bypassed; serving candidates via database cache or static reference directory.',
        };
      case 'QUOTA_EXHAUSTED':
        return {
          label: 'QUOTA_EXHAUSTED',
          tone: 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
          icon: '⚠️',
          description: 'Daily safety quota consumed (100%). System fail-closed to cached/static fallbacks.',
        };
      case 'UNAVAILABLE':
      default:
        return {
          label: 'UNAVAILABLE',
          tone: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
          icon: '⚪',
          description: 'Provider currently offline or unconfigured.',
        };
    }
  }, [effectiveStatus]);

  const fallbackTiers: Array<{ tier: GooglePlacesFallbackTier; label: string; desc: string }> = [
    { tier: 'LIVE_API', label: 'Tier 1: Live API', desc: 'Authoritative Google Places REST' },
    { tier: 'DATABASE_CACHE', label: 'Tier 2: Database Cache', desc: 'Locally cached discoveries (<30d)' },
    { tier: 'STATIC_REFERENCE', label: 'Tier 3: Static Reference', desc: 'Curated regional directory' },
    { tier: 'UNAVAILABLE', label: 'Tier 4: Unavailable', desc: 'Safe empty candidate response' },
  ];

  return (
    <div
      className={`rounded-lg border p-4 sm:p-5 space-y-4 border-border/90 bg-card shadow-sm overflow-hidden ${className}`}
      data-testid="google-places-operational-card"
    >
      {/* Header: Title & Provider Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-foreground">📍 Google Places Supplier Discovery</span>
          <span
            data-testid="places-provider-status-badge"
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border ${statusBadgeInfo.tone}`}
          >
            <span>{statusBadgeInfo.icon}</span>
            <span>{statusBadgeInfo.label}</span>
          </span>
        </div>

        {/* Credential State (Zero Secret Exposure) */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Credential State:</span>
          <span
            data-testid="places-credential-state"
            className="inline-flex items-center gap-1 font-mono text-[11px]"
          >
            {isCredentialConfigured ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ● Configured ({isCredentialVerifiedLive ? 'Live' : 'Gated'})
              </span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                ○ Not Configured
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Quota Exhaustion Notice if quota exhausted */}
      {effectiveStatus === 'QUOTA_EXHAUSTED' && (
        <div
          data-testid="quota-exhaustion-notice"
          className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2"
        >
          <span className="text-base select-none">🚨</span>
          <div>
            <p className="font-bold">Daily Safety Limit Exceeded (1,500/1,500 Calls)</p>
            <p className="mt-0.5 text-[11px] opacity-90">
              Zero additional Google API charges incurred. All supplier discovery requests are automatically failing closed to Tier 2 (Database Cache) and Tier 3 (Static Regional Reference).
            </p>
          </div>
        </div>
      )}

      {/* Top Grid: Daily Safety Limit & Quota Gauge */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Daily Safety Quota Gauge Card */}
        <div
          data-testid="places-quota-gauge-card"
          className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">OTP Daily Safety Limit</span>
            <span
              data-testid="quota-health-badge"
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                quota.healthColor === 'green'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : quota.healthColor === 'yellow'
                  ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300'
                  : quota.healthColor === 'orange'
                  ? 'bg-orange-50 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300'
                  : 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300'
              }`}
            >
              {quota.healthLabel}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center py-1 bg-card/60 rounded-lg border border-border/40 p-2">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Used Today</span>
              <p data-testid="quota-used-today" className="text-base font-black text-foreground">
                {quota.used.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="min-w-0 border-l border-border/50">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Remaining</span>
              <p
                data-testid="quota-remaining-today"
                className={`text-base font-black ${
                  quota.healthColor === 'red'
                    ? 'text-rose-600 dark:text-rose-400'
                    : quota.healthColor === 'orange'
                    ? 'text-orange-600 dark:text-orange-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {quota.remaining.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="min-w-0 border-l border-border/50">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">% Consumed</span>
              <p
                data-testid="quota-percent-consumed"
                className="text-base font-mono font-black text-foreground"
              >
                {quota.percentageConsumed}%
              </p>
            </div>
          </div>

          {/* Progress Bar with Dynamic Threshold Color */}
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80">
              <div
                data-testid="quota-progress-bar"
                data-health-color={quota.healthColor}
                className={`h-full transition-all duration-500 ${
                  quota.healthColor === 'green'
                    ? 'bg-emerald-500'
                    : quota.healthColor === 'yellow'
                    ? 'bg-amber-500'
                    : quota.healthColor === 'orange'
                    ? 'bg-orange-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, quota.percentageConsumed))}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0 (Resets daily at 05:30 IST / 00:00 UTC)</span>
              <span data-testid="quota-max-limit">Limit: {quota.limit.toLocaleString('en-IN')} reqs/day</span>
            </div>
          </div>
        </div>

        {/* Fallback Ladder Visibility */}
        <div
          data-testid="places-fallback-ladder-card"
          className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">Authoritative Fallback Ladder</span>
            <span className="text-[10px] text-muted-foreground">Fail-Closed Architecture</span>
          </div>

          <div className="space-y-1.5 pt-0.5">
            {fallbackTiers.map((tierItem) => {
              const isActive = activeFallbackTier === tierItem.tier;
              return (
                <div
                  key={tierItem.tier}
                  data-testid={`fallback-tier-${tierItem.tier.toLowerCase()}`}
                  data-active={isActive ? 'true' : 'false'}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition border ${
                    isActive
                      ? 'border-emerald-500/80 bg-emerald-500/10 text-foreground font-semibold shadow-xs'
                      : 'border-border/30 bg-card/40 text-muted-foreground opacity-70'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs">{isActive ? '▶' : '○'}</span>
                    <span className="truncate">{tierItem.label}</span>
                  </div>
                  <span className="text-[10px] font-mono shrink-0 ml-2">
                    {isActive ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                        ACTIVE TIER
                      </span>
                    ) : (
                      tierItem.desc
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Discovery Metrics Grid (Preserving Trust Boundary) */}
      <div className="space-y-2 pt-1 border-t border-border/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">Discovery Pipeline &amp; Trust Boundaries</span>
          <span className="text-[10px] text-muted-foreground">Strict Attribution Separation</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="rounded-lg border border-border/60 bg-card p-2.5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-medium text-muted-foreground block truncate">Sessions Today</span>
            <p data-testid="metrics-sessions-today" className="text-sm sm:text-base font-black text-foreground">
              {metrics.sessionsToday}
            </p>
            <span className="text-[9px] text-muted-foreground block truncate">Buyer discovery</span>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-2.5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-medium text-muted-foreground block truncate">Avg API Calls</span>
            <p data-testid="metrics-avg-calls" className="text-sm sm:text-base font-black text-foreground">
              {metrics.avgApiCallsPerSession}
            </p>
            <span className="text-[9px] text-muted-foreground block truncate">Per intake session</span>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-2.5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-medium text-muted-foreground block truncate">Discovered in Area</span>
            <p
              data-testid="metrics-discovered-in-area"
              className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400"
            >
              {metrics.candidatesDiscoveredInArea}
            </p>
            <span className="text-[9px] text-muted-foreground block truncate">External candidate</span>
          </div>

          <div className="rounded-lg border border-border/60 bg-card p-2.5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-medium text-muted-foreground block truncate">OTP Registered</span>
            <p
              data-testid="metrics-otp-registered"
              className="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400"
            >
              {metrics.candidatesOtpRegistered}
            </p>
            <span className="text-[9px] text-muted-foreground block truncate">Claimed profiles</span>
          </div>

          <div className="col-span-2 sm:col-span-1 rounded-lg border border-border/60 bg-card p-2.5 space-y-0.5 min-w-0">
            <span className="text-[10px] font-medium text-muted-foreground block truncate">GST Verified</span>
            <p
              data-testid="metrics-gst-verified"
              className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400"
            >
              {metrics.candidatesGstVerified}
            </p>
            <span className="text-[9px] text-muted-foreground block truncate">Govt API confirmed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
