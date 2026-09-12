import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWorkOrder, updateWorkOrderProgress } from '../api/work-orders';
import { DeliveryInspectionPanel } from '../components/DeliveryInspectionPanel';
import { InvoicePaymentPanel } from '../components/InvoicePaymentPanel';
import { StatusBadge } from '../components/FulfillmentStatus';
import type { WorkOrderSummary } from '../types/fulfillment';

export function SupplierWorkOrderPage({ workOrderId }: { workOrderId: string }) {
  const [workOrder, setWorkOrder] = useState<WorkOrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

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

  async function setProgress(percent: number) {
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
        <div className="h-10 bg-muted/60 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-48 bg-card border rounded-lg animate-pulse" />
          <div className="h-48 bg-card border rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="p-6 max-w-xl mx-auto my-12 text-center rounded-xl border border-border bg-card shadow-sm space-y-4">
        <div className="text-4xl">🛠️</div>
        <h2 className="text-lg font-bold text-foreground">Work Order Not Found</h2>
        <p className="text-sm text-muted-foreground">{error ?? 'The requested work order could not be located.'}</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
          >
            ↻ Retry Loading
          </button>
          <Link
            to="/supplier/purchase-orders"
            className="rounded-md border border-border bg-muted/40 px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition inline-flex items-center"
          >
            ← Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="supplier-work-order-page">
      {/* Compressed Top Bar */}
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            to={`/supplier/purchase-orders/${workOrder.purchaseOrderId}`}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0"
          >
            ← PO Details
          </Link>
          <span className="text-muted-foreground">|</span>
          <h1 className="text-xs font-bold text-foreground truncate">{workOrder.title}</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {workOrder.poNumber && (
            <span className="text-[10px] font-mono font-bold text-muted-foreground">PO: {workOrder.poNumber}</span>
          )}
          <StatusBadge status={workOrder.status} />
        </div>
      </header>

      {error && <p className="mt-1 shrink-0 text-xs font-bold text-red-600 rounded bg-red-50 p-2 border border-red-200">{error}</p>}
      {success && <p className="mt-1 shrink-0 text-xs font-bold text-emerald-700 rounded bg-emerald-50 p-2 border border-emerald-200">{success}</p>}

      {/* Main Content Area - Split Column Grid in zero-scroll-pane */}
      <div className="zero-scroll-pane mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
          {/* Left Column (6 cols): Progress Card & Milestone Reporting */}
          <div className="lg:col-span-6 space-y-2.5">
            {/* Progress Card */}
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">{workOrder.progressPercent}% Completed</span>
                <span className="text-[11px] text-muted-foreground">
                  {workOrder.progressPercent === 100
                    ? workOrder.buyerAcceptedAt
                      ? '✓ 100% Mutually Acknowledged'
                      : 'Awaiting Buyer Sign-off'
                    : 'Execution in Progress'}
                </span>
              </div>

              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 border">
                <div
                  className={`h-full transition-all duration-300 ${
                    workOrder.progressPercent >= 100
                      ? 'bg-emerald-800'
                      : workOrder.progressPercent >= 75
                      ? 'bg-lime-500'
                      : workOrder.progressPercent >= 50
                      ? 'bg-blue-500'
                      : workOrder.progressPercent >= 25
                      ? 'bg-yellow-400'
                      : 'bg-slate-300'
                  }`}
                  style={{ width: `${workOrder.progressPercent}%` }}
                />
              </div>

              {/* Milestone Buttons for Supplier */}
              {workOrder.status !== 'COMPLETED' && (
                <div className="mt-3 border-t pt-2.5">
                  <p className="text-[11px] font-bold text-muted-foreground">Report Execution Milestone:</p>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setProgress(25)}
                      className="rounded border border-yellow-400 bg-yellow-50 py-1.5 px-2 text-[11px] font-bold text-yellow-900 shadow-2xs hover:bg-yellow-100 disabled:opacity-50"
                    >
                      25% (Started)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setProgress(50)}
                      className="rounded border border-blue-400 bg-blue-50 py-1.5 px-2 text-[11px] font-bold text-blue-900 shadow-2xs hover:bg-blue-100 disabled:opacity-50"
                    >
                      50% (In Progress)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setProgress(75)}
                      className="rounded border border-lime-500 bg-lime-50 py-1.5 px-2 text-[11px] font-bold text-lime-900 shadow-2xs hover:bg-lime-100 disabled:opacity-50"
                    >
                      75% (Near End)
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setProgress(100)}
                      className="rounded bg-emerald-800 py-1.5 px-2 text-[11px] font-bold text-white shadow-2xs hover:bg-emerald-900 disabled:opacity-50"
                    >
                      ✓ 100% (Done)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delivery Inspection Section */}
            <DeliveryInspectionPanel
              workOrder={workOrder}
              role="supplier"
              onAccepted={() => void load()}
            />
          </div>

          {/* Right Column (6 cols): Invoicing Section */}
          <div className="lg:col-span-6 space-y-2.5">
            {workOrder.progressPercent >= 100 ? (
              <InvoicePaymentPanel
                workOrderId={workOrder.id}
                supplierId={workOrder.supplierId}
                role="supplier"
                deliveryAccepted={Boolean(workOrder.buyerAcceptedAt)}
                onUpdated={() => void load()}
              />
            ) : (
              <div className="rounded-lg border bg-card p-4 text-center text-xs text-muted-foreground shadow-2xs">
                <p>Complete execution to 100% and obtain buyer delivery inspection to unlock official GST invoice generation and milestone payment release.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
