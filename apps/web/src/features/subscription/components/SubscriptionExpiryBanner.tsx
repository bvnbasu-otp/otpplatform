import { getRenewalNoticeLevel, type OrganizationSubscription } from '../types';

interface SubscriptionExpiryBannerProps {
  subscription: OrganizationSubscription | null;
  onRenewClick: () => void;
}

export function SubscriptionExpiryBanner({
  subscription,
  onRenewClick,
}: SubscriptionExpiryBannerProps) {
  if (!subscription) return null;

  const level = getRenewalNoticeLevel(subscription.daysRemaining, subscription.isExpired);
  if (level === 'NONE') return null;

  if (level === 'EXPIRED') {
    return (
      <div className="rounded-2xl border-2 border-rose-300 dark:border-rose-900 bg-rose-50/90 dark:bg-rose-950/40 p-4 text-xs text-rose-950 dark:text-rose-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-xl">🔒</span>
          <div>
            <h4 className="font-bold text-sm text-rose-900 dark:text-rose-200">
              Prepaid Subscription Expired · Read-Only Mode Active
            </h4>
            <p className="text-rose-800 dark:text-rose-300 mt-0.5">
              Your 30-day validity has expired. You can still inspect historical RFQs, quotes, and audit records, but creating new requirements is locked until recharged.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRenewClick}
          className="shrink-0 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 text-xs shadow-md transition flex items-center gap-1.5"
        >
          <span>⚡</span> Renew Plan with UPI / QR
        </button>
      </div>
    );
  }

  if (level === 'URGENT_1_DAY') {
    return (
      <div className="rounded-2xl border-2 border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-4 text-xs text-rose-950 dark:text-rose-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h4 className="font-bold text-sm text-rose-900 dark:text-rose-200">
              Subscription Plan Expires Tomorrow ({subscription.daysRemaining} Day Left)
            </h4>
            <p className="text-rose-800 dark:text-rose-300 mt-0.5">
              Recharge your prepaid plan today to avoid switching into read-only mode and maintain uninterrupted procurement access.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRenewClick}
          className="shrink-0 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 text-xs shadow-md transition flex items-center gap-1.5"
        >
          <span>⚡</span> Quick UPI Recharge
        </button>
      </div>
    );
  }

  if (level === 'WARNING_3_DAYS') {
    return (
      <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-950 dark:text-amber-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-xl">⏳</span>
          <div>
            <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
              Prepaid Renewal Notice · {subscription.daysRemaining} Days Remaining
            </h4>
            <p className="text-amber-800 dark:text-amber-300 mt-0.5">
              Your prepaid subscription for <strong>{subscription.organizationName}</strong> expires on{' '}
              {new Date(subscription.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRenewClick}
          className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 text-xs shadow-md transition flex items-center gap-1.5"
        >
          <span>⚡</span> Renew Plan (UPI)
        </button>
      </div>
    );
  }

  // 7 Days Info Notice
  return (
    <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/80 dark:bg-blue-950/30 p-3.5 text-xs text-blue-950 dark:text-blue-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-base">📅</span>
        <span>
          Prepaid plan active ({subscription.daysRemaining} days remaining). Valid until{' '}
          <strong>{new Date(subscription.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</strong>.
        </span>
      </div>

      <button
        type="button"
        onClick={onRenewClick}
        className="shrink-0 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-100/80 dark:bg-blue-900/40 hover:bg-blue-200 text-blue-900 dark:text-blue-200 font-bold px-3 py-1.5 text-xs transition"
      >
        Renew Early
      </button>
    </div>
  );
}
