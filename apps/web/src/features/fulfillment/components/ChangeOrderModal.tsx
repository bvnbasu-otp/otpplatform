import React, { useState } from 'react';
import {
  calculateChangeOrderTotals,
  validateChangeOrderCommitment,
  type ChangeOrderType,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';
import { commitPoChangeOrderRpc } from '../api/payments';

interface ChangeOrderItemInput {
  description: string;
  quantityDelta: number;
  unit: string;
  unitPrice: number;
  taxAmountDelta: number;
  hsnSacCode: string;
  notes: string;
}

interface ChangeOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchaseOrderId: string;
  poNumber: string;
  currentPoTotal: number;
  cumulativeInvoicedAmount: number;
  organizationId: string;
  isBuyerUser: boolean;
  onSuccess?: () => void;
}

export const ChangeOrderModal: React.FC<ChangeOrderModalProps> = ({
  isOpen,
  onClose,
  purchaseOrderId,
  poNumber,
  currentPoTotal,
  cumulativeInvoicedAmount,
  organizationId,
  isBuyerUser,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [changeType, setChangeType] = useState<ChangeOrderType>('SCOPE_EXPANSION');
  const [items, setItems] = useState<ChangeOrderItemInput[]>([
    {
      description: 'Variation Item Scope Delta',
      quantityDelta: 1,
      unit: 'lot',
      unitPrice: 10000,
      taxAmountDelta: 1800,
      hsnSacCode: '995411',
      notes: '',
    },
  ]);
  const [autoCommit, setAutoCommit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const totals = calculateChangeOrderTotals(
    items.map((i) => ({
      amountDelta: i.quantityDelta * i.unitPrice,
      taxAmountDelta: i.taxAmountDelta,
    })),
  );

  const validation = validateChangeOrderCommitment({
    originalPoTotal: currentPoTotal,
    existingCommittedChangeOrders: [],
    changeOrderToCommit: { totalDelta: totals.totalDelta },
    cumulativeInvoicedAmount,
  });

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        description: '',
        quantityDelta: 1,
        unit: 'lot',
        unitPrice: 0,
        taxAmountDelta: 0,
        hsnSacCode: '',
        notes: '',
      },
    ]);
  };

  const handleUpdateItem = (
    index: number,
    field: keyof ChangeOrderItemInput,
    val: any,
  ) => {
    const updated = [...items];
    (updated[index] as any)[field] = val;
    setItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBuyerUser) return;
    setLoading(true);
    setErrorMsg(null);

    if (!title.trim() || !reason.trim()) {
      setErrorMsg('Title and justification reason are required');
      setLoading(false);
      return;
    }

    if (!validation.isValid) {
      setErrorMsg(validation.error || 'Commitment validation failed');
      setLoading(false);
      return;
    }

    try {
      // 1. Get profile
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const profileId = user?.id;

      // 2. Fetch existing sequence
      const { count } = await supabase
        .from('po_change_orders')
        .select('*', { count: 'exact', head: true })
        .eq('purchase_order_id', purchaseOrderId);

      const seq = (count || 0) + 1;
      const changeOrderNumber = `CO-${poNumber.slice(0, 10)}-${seq.toString().padStart(2, '0')}`;

      // 3. Create Change Order
      const { data: coData, error: coErr } = await supabase
        .from('po_change_orders')
        .insert({
          organization_id: organizationId,
          purchase_order_id: purchaseOrderId,
          change_order_number: changeOrderNumber,
          sequence: seq,
          title,
          reason,
          status: autoCommit ? 'APPROVED' : 'DRAFT',
          change_type: changeType,
          net_amount_delta: totals.netAmountDelta,
          tax_amount_delta: totals.taxAmountDelta,
          total_delta: totals.totalDelta,
          previous_po_total: currentPoTotal,
          revised_po_total: validation.revisedAuthorizedTotal,
          requested_by: profileId,
          approved_by: autoCommit ? profileId : null,
          approved_at: autoCommit ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (coErr || !coData) {
        throw new Error(coErr?.message || 'Failed to create change order');
      }

      // 4. Insert items
      const itemRows = items.map((item, idx) => ({
        change_order_id: coData.id,
        item_index: idx + 1,
        description: item.description,
        hsn_sac_code: item.hsnSacCode || null,
        quantity_delta: item.quantityDelta,
        unit: item.unit,
        unit_price: item.unitPrice,
        amount_delta: item.quantityDelta * item.unitPrice,
        tax_amount_delta: item.taxAmountDelta,
        total_delta: item.quantityDelta * item.unitPrice + item.taxAmountDelta,
        notes: item.notes || null,
      }));

      const { error: itemsErr } = await supabase
        .from('po_change_order_items')
        .insert(itemRows);

      if (itemsErr) {
        throw new Error(itemsErr.message);
      }

      // 5. If autoCommit, execute atomic RPC
      if (autoCommit) {
        const commitRes = await commitPoChangeOrderRpc(
          coData.id,
          organizationId,
        );
        if (!commitRes.ok) {
          throw new Error(commitRes.error);
        }
      }

      setLoading(false);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      setLoading(false);
      setErrorMsg(err?.message || 'Failed to submit change order');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <span>📋</span> PO Change Order / Variation
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Contract variation for {poNumber} | Current: ₹{currentPoTotal.toLocaleString('en-IN')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl font-bold p-1"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="text-xs p-3 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-medium">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Variation Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Additional Waterproofing Layer"
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-foreground text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Variation Category
              </label>
              <select
                value={changeType}
                onChange={(e) => setChangeType(e.target.value as ChangeOrderType)}
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-foreground text-sm"
              >
                <option value="SCOPE_EXPANSION">Scope Expansion (+)</option>
                <option value="SCOPE_REDUCTION">Scope Reduction / De-scoping (-)</option>
                <option value="SPECIFICATION_CHANGE">Specification Change</option>
                <option value="RATE_ADJUSTMENT">Rate Adjustment</option>
                <option value="ADMINISTRATIVE">Administrative</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Justification & Engineering Reason
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide technical justification or site directive reference..."
              className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-foreground text-sm"
            />
          </div>

          {/* Line Items Delta Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Variation Line Items
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-primary hover:underline font-medium"
              >
                + Add Item
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-muted/30 border border-border rounded-lg space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Item #{idx + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        required
                        placeholder="Description of delta"
                        value={item.description}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'description', e.target.value)
                        }
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="HSN/SAC"
                        value={item.hsnSacCode}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'hsnSacCode', e.target.value)
                        }
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Qty Delta</label>
                      <input
                        type="number"
                        step="any"
                        value={item.quantityDelta}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'quantityDelta', Number(e.target.value))
                        }
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Unit Price (₹)</label>
                      <input
                        type="number"
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'unitPrice', Number(e.target.value))
                        }
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Tax Delta (₹)</label>
                      <input
                        type="number"
                        step="any"
                        value={item.taxAmountDelta}
                        onChange={(e) =>
                          handleUpdateItem(idx, 'taxAmountDelta', Number(e.target.value))
                        }
                        className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Financial Commitment Summary Banner */}
          <div className="bg-muted/50 p-3.5 rounded-lg border border-border flex items-center justify-between text-xs">
            <div>
              <div className="text-muted-foreground">Net Delta: ₹{totals.netAmountDelta.toLocaleString('en-IN')}</div>
              <div className="text-muted-foreground">Tax Delta: ₹{totals.taxAmountDelta.toLocaleString('en-IN')}</div>
              <div className="font-bold text-foreground">
                Total Variation Delta: ₹{totals.totalDelta.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">
                Invoiced Floor: ₹{cumulativeInvoicedAmount.toLocaleString('en-IN')}
              </div>
              <div className="text-sm font-bold text-primary">
                Revised PO Total: ₹{validation.revisedAuthorizedTotal.toLocaleString('en-IN')}
              </div>
              {!validation.isValid && (
                <div className="text-destructive font-semibold mt-0.5">
                  Rejection: Below invoiced floor
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoCommit}
                onChange={(e) => setAutoCommit(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
              <span>Approve & Commit immediately (Atomic PO Sync)</span>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !validation.isValid}
                className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
              >
                {loading ? 'Processing...' : autoCommit ? 'Commit Variation' : 'Save Draft'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
