import type { BuyerAddress } from '@otp/domain';

export interface BuyerAddressCardProps {
  address: BuyerAddress;
  isSelected?: boolean;
  onSetPrimary?: (addressId: string) => void;
  onSelect?: (address: BuyerAddress) => void;
  onEdit?: (address: BuyerAddress) => void;
  onDelete?: (addressId: string) => void;
}

function DetailRow({ label, value, testId }: { label: string; value?: string | null; testId: string }) {
  return (
    <p className="text-muted-foreground" data-testid={testId}>
      <span className="font-medium text-foreground/70">{label}:</span>{' '}
      {value ? value : <span className="italic opacity-70">Not added</span>}
    </p>
  );
}

export function BuyerAddressCard({
  address: addr,
  isSelected = false,
  onSetPrimary,
  onSelect,
  onEdit,
  onDelete,
}: BuyerAddressCardProps) {
  return (
    <div
      data-testid="buyer-address-card"
      className={`relative p-4 rounded-xl border transition-all ${
        addr.isPrimary
          ? 'border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-sm'
          : 'border-border bg-card hover:border-border/80'
      } ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-foreground">{addr.label}</span>
          {addr.isPrimary && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
              Primary Default
            </span>
          )}
          {addr.locationType && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
              {addr.locationType.replace(/_/g, ' ')}
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            {addr.addressType}
          </span>
        </div>
      </div>

      <div className="text-xs text-foreground/80 space-y-1 mb-3">
        {addr.recipientName && <p className="font-semibold text-foreground">{addr.recipientName}</p>}
        <p className="font-medium">{addr.line1}</p>
        <DetailRow
          label="Sub-locality / Area"
          value={addr.line2 || addr.locality}
          testId="address-sub-locality"
        />
        <DetailRow
          label="Landmark / Delivery Instructions"
          value={addr.landmark}
          testId="address-landmark"
        />
        <p className="text-muted-foreground">
          {addr.city}
          {addr.district ? `, ${addr.district}` : ''}, {addr.state} —{' '}
          <span className="font-mono font-medium text-foreground">{addr.pincode}</span>
        </p>
        {(addr.contactPerson || addr.contactPhone) && (
          <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 mt-1">
            Contact: {addr.contactPerson || 'Site Incharge'} {addr.contactPhone ? `(${addr.contactPhone})` : ''}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/50 gap-2">
        <div className="flex items-center gap-2">
          {!addr.isPrimary && onSetPrimary && (
            <button
              type="button"
              onClick={() => onSetPrimary(addr.id)}
              className="text-xs text-primary hover:underline min-h-[44px] py-1 px-2 touch-manipulation font-medium"
            >
              Set as Primary
            </button>
          )}
          {onSelect && (
            <button
              type="button"
              onClick={() => onSelect(addr)}
              className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md min-h-[44px] touch-manipulation font-medium"
            >
              Select for RFQ
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(addr)}
              className="text-xs text-muted-foreground hover:text-foreground p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center touch-manipulation"
              title="Edit Location"
            >
              ✏️ Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(addr.id)}
              className="text-xs text-destructive hover:text-destructive/80 p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center touch-manipulation"
              title="Deactivate Location"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
