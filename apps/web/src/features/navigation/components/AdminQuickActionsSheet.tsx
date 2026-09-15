import { Link } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';

export interface AdminQuickActionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminQuickActionsSheet({ isOpen, onClose }: AdminQuickActionsSheetProps) {
  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Super Admin Quick Operations"
      subtitle="Operational controls and diagnostics"
    >
      <div className="space-y-2.5 text-xs py-1">
        <Link
          to="/admin/buyer-diagnostics"
          onClick={onClose}
          className="flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:bg-muted transition min-h-[48px] mobile-touch-target"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🔍</span>
            <div>
              <p className="font-bold text-foreground">Buyer Diagnostics &amp; Inquiries</p>
              <p className="text-[11px] text-muted-foreground">Trace RFQ intake flows and buyer state machines</p>
            </div>
          </div>
          <span className="text-muted-foreground">➔</span>
        </Link>

        <Link
          to="/admin/seller-diagnostics"
          onClick={onClose}
          className="flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:bg-muted transition min-h-[48px] mobile-touch-target"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📡</span>
            <div>
              <p className="font-bold text-foreground">Seller Diagnostics &amp; Radar</p>
              <p className="text-[11px] text-muted-foreground">Inspect supplier invites and quote dispatches</p>
            </div>
          </div>
          <span className="text-muted-foreground">➔</span>
        </Link>

        <Link
          to="/admin?tab=transactions"
          onClick={onClose}
          className="flex items-center justify-between p-3 rounded-xl border border-border bg-card hover:bg-muted transition min-h-[48px] mobile-touch-target"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">📋</span>
            <div>
              <p className="font-bold text-foreground">Transaction Orders &amp; Settlements</p>
              <p className="text-[11px] text-muted-foreground">Platform PO lifecycle and direct escrow settlement logs</p>
            </div>
          </div>
          <span className="text-muted-foreground">➔</span>
        </Link>

        <Link
          to="/admin"
          onClick={onClose}
          className="flex items-center justify-between p-3 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition min-h-[48px] mobile-touch-target"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg">⚡</span>
            <span>Open Main Admin Control Tower</span>
          </div>
          <span>➔</span>
        </Link>
      </div>
    </BottomSheet>
  );
}
