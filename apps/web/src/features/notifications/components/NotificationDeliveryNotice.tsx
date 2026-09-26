import {
  describeNotificationStatus,
  type NotificationPurpose,
  type NotificationStatusResolution,
} from '@otp/domain';

const TONE_CLASS: Record<'neutral' | 'info' | 'success' | 'danger', string> = {
  neutral: 'border-border bg-muted/30 text-muted-foreground',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  danger: 'border-rose-500/30 bg-rose-500/10 text-rose-900 dark:text-rose-200',
};

export function NotificationDeliveryNotice({
  resolution,
  purpose,
  className = '',
}: {
  resolution: Pick<NotificationStatusResolution, 'status' | 'channel'> &
    Partial<Pick<NotificationStatusResolution, 'retryScheduled' | 'duplicate' | 'outcomeUnknown'>>;
  purpose: NotificationPurpose;
  className?: string;
}) {
  const copy = describeNotificationStatus(resolution, purpose);
  return (
    <div
      role="status"
      data-testid="notification-delivery-notice"
      data-status={copy.status}
      data-channel={resolution.channel}
      className={`rounded-lg border px-3 py-2 text-xs ${TONE_CLASS[copy.tone]} ${className}`}
    >
      <span className="font-bold">{copy.label}:</span> {copy.message}
    </div>
  );
}
