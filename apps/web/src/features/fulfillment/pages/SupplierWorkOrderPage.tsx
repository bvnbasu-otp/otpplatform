import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWorkOrder, updateWorkOrderProgress } from '../api/work-orders';
import { DeliveryInspectionPanel } from '../components/DeliveryInspectionPanel';
import { InvoicePaymentPanel } from '../components/InvoicePaymentPanel';
import { SupplierMilestoneStepper } from '../components/SupplierMilestoneStepper';
import { StatusBadge } from '../components/FulfillmentStatus';
import type { WorkOrderSummary } from '../types/fulfillment';

export function SupplierWorkOrderPage({ workOrderId }: { workOrderId: string }) {
  const [workOrder, setWorkOrder] = useState<WorkOrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<'MILESTONES' | 'INSPECTION' | 'INVOICING'>('MILESTONES');

  const load = useCallback(async () => {
    const cleanId = (workOrderId || '').trim();
    if (!cleanId) {
      setIsLoading(false);
      setError('Invalid Work Order identifier.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchWorkOrder(cleanId);
      if (result.ok) {
        setWorkOrder(result.workOrder);
      } else {
        setError(result.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load work order';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleProgress(percent: number) {
    const cleanId = (workOrderId || '').trim();
    if (!cleanId) return;
    setBusy(true);
    setSuccess(null);
    try {
      const result = await updateWorkOrderProgress(cleanId, percent);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        percent === 100
          ? '✓ 100% Work completion reported! Buyer has been notified to inspect and acknowledge.'
          : `Progress updated to ${percent}%.`,
      );
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update progress';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="zero-scroll-container p-4 max-w-7xl mx-auto w-full space-y-4">
        <div className="h-10 bg-muted/60 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-card border rounded-2xl animate-pulse" />
          <div className="h-48 bg-card border rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-6 max-w-xl mx-auto my-12 text-center rounded-2xl border border-border bg-card shadow-sm space-y-4">
        <div className="text-4xl">🛠️</div>
        <h2 className="text-lg font-bold text-foreground">Work Order Not Found</h2>
        <p className="text-sm text-muted-foreground">{error ?? 'The requested work order could not be located.'}</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
          >
            ↻ Retry Loading
          </button>
          <Link
            to="/supplier/purchase-orders"
            className="min-h-[44px] rounded-xl border border-border bg-muted/40 px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition inline-flex items-center mobile-touch-target"
          >
            ← Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="zero-scroll-container p-2.5 sm:p-4 max-w-7xl mx-auto w-full overflow-x-hidden" data-testid="supplier-work-order-page">
      {/* Top Header */}
      <header className="rounded-2xl border bg-card p-3.5 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/supplier/purchase-orders/${workOrder.purchaseOrderId}`}
            className="min-h-[36px] px-2 rounded-lg border bg-muted/30 text-xs font-bold text-muted-foreground hover:text-foreground shrink-0 flex items-center"
          >
            ← PO Details
          </Link>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-black text-foreground truncate">{workOrder.title}</h1>
            {workOrder.poNumber && (
              <p className="text-[10px] font-mono font-bold text-muted-foreground">PO Ref: {workOrder.poNumber}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono font-black text-primary">{workOrder.progressPercent}% Done</span>
          <StatusBadge status={workOrder.status} />
        </div>
      </header>

      {error && <p className="mt-2 text-xs font-bold text-red-600 rounded-xl bg-red-50 p-2.5 border border-red-200">⚠️ {error}</p>}
      {success && <p className="mt-2 text-xs font-bold text-emerald-700 rounded-xl bg-emerald-50 p-2.5 border border-emerald-200">{success}</p>}

      {/* Screen 11 Navigation Sub-Tabs */}
      <div className="mt-3 flex items-center gap-1 rounded-xl bg-muted/40 p-1 border overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('MILESTONES')}
          className={`flex-1 min-h-[44px] rounded-lg px-3 py-2 text-xs font-black transition mobile-touch-target ${
            activeTab === 'MILESTONES'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🛠️ Screen 11: Milestones ({workOrder.progressPercent}%)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('INSPECTION')}
          className={`flex-1 min-h-[44px] rounded-lg px-3 py-2 text-xs font-black transition mobile-touch-target ${
            activeTab === 'INSPECTION'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🔍 Inspection Status
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('INVOICING')}
          className={`flex-1 min-h-[44px] rounded-lg px-3 py-2 text-xs font-black transition mobile-touch-target ${
            activeTab === 'INVOICING'
              ? 'bg-card text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🧾 Invoicing &amp; Payment
        </button>
      </div>

      {/* Tab Panels */}
      <div className="mt-3 space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
        {activeTab === 'MILESTONES' && (
          <SupplierMilestoneStepper
            workOrder={workOrder}
            totalAmount={50000}
            currency="INR"
            role="supplier"
            onUpdateProgress={handleProgress}
            busy={busy}
          />
        )}

        {activeTab === 'INSPECTION' && (
          <DeliveryInspectionPanel
            workOrder={workOrder}
            role="supplier"
            onAccepted={() => void load()}
          />
        )}

        {activeTab === 'INVOICING' && (
          <div>
            {workOrder.progressPercent >= 100 ? (
              <InvoicePaymentPanel
                workOrderId={workOrder.id}
                supplierId={workOrder.supplierId}
                role="supplier"
                deliveryAccepted={Boolean(workOrder.buyerAcceptedAt)}
                onUpdated={() => void load()}
              />
            ) : (
              <div className="rounded-2xl border bg-card p-6 text-center text-xs text-muted-foreground shadow-2xs space-y-2">
                <span className="text-3xl block">⏳</span>
                <p className="font-bold text-foreground">Invoicing Locked</p>
                <p className="text-[11px]">
                  Complete milestone execution to 100% and obtain buyer delivery inspection to unlock official GST invoice generation and milestone payment release.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
