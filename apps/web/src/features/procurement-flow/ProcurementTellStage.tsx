/**
 * OTP Next — Core Procurement Flow: TELL Stage
 * Handles RFQ intake, 17 canonical categories, UOM, delivery address, and publishing.
 */

import React, { useState, useEffect } from 'react';
import { useContracts } from '@/lib/contracts-context';
import type { CategoryDto, BuyerAddressDto } from '@otp/services';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

export interface ProcurementTellStageProps {
  onPublished: (rfqId: string) => void;
  onCancel?: () => void;
}

export function ProcurementTellStage({ onPublished, onCancel }: ProcurementTellStageProps) {
  const contracts = useContracts();
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [addresses, setAddresses] = useState<BuyerAddressDto[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('cat_dg_set_maintenance');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [title, setTitle] = useState('DG Set Annual Maintenance & Routine Filter Spares');
  const [requiredDate, setRequiredDate] = useState('2026-04-15');
  const [items, setItems] = useState<Array<{ itemDescription: string; quantity: number; uom: string; targetUnitBudget?: number }>>([
    { itemDescription: 'Quarterly Routine Maintenance (250 KVA DG Set)', quantity: 4, uom: 'Visits', targetUnitBudget: 15000 },
    { itemDescription: 'Lube Oil & Primary Fuel Filter Replacements', quantity: 2, uom: 'Sets', targetUnitBudget: 22000 },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actor = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'INDIVIDUAL' as const,
  };

  useEffect(() => {
    void contracts.taxonomyCategories.listAuthoritativeCategories().then((res) => {
      if (res.ok) setCategories(res.value);
    });
    void contracts.addressManagement.listAddresses(actor).then((res) => {
      if (res.ok && res.value.length > 0) {
        setAddresses(res.value);
        setSelectedAddressId(res.value[0]?.addressId || '');
      }
    });
  }, []);

  function handleAddItem() {
    setItems((prev) => [
      ...prev,
      { itemDescription: '', quantity: 1, uom: 'Units', targetUnitBudget: undefined },
    ]);
  }

  function handleRemoveItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleItemChange(index: number, field: string, value: any) {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  }

  async function handlePublishRfq(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a descriptive title for your requirement.');
      return;
    }
    const hasValidItems = items.every((it) => it.itemDescription.trim() && it.quantity > 0);
    if (!hasValidItems) {
      setError('All items must have a valid description and quantity greater than zero.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const draftRes = await contracts.rfqLifecycle.createRfqDraft(actor, {
        title,
        categoryId: selectedCategory,
        deliveryAddressId: selectedAddressId,
        requiredDeliveryDate: requiredDate,
        items,
      });

      if (!draftRes.ok) {
        setError(draftRes.error.message);
        setIsLoading(false);
        return;
      }

      const publishRes = await contracts.rfqLifecycle.publishRfq(actor, draftRes.value.rfqId);
      if (!publishRes.ok) {
        setError(publishRes.error.message);
        setIsLoading(false);
        return;
      }

      onPublished(publishRes.value.rfqId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish requirement');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-6 shadow-sm">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
          <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">1</span>
          <span>STAGE 1 · TELL</span>
        </div>
        <h2 className="text-xl font-black text-foreground">Post Your Procurement Requirement</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Specify what you need. OTP matches verified local suppliers without disclosing your identity.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handlePublishRfq} className="space-y-4">
        {/* Requirement Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">Requirement Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. DG Set Annual Maintenance Contract"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            required
          />
        </div>

        {/* Category Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">Authoritative Category *</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
          >
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

        {/* Delivery Address */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">Delivery / Service Address *</label>
          <div className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-foreground">
                {addresses[0]?.addressLine1 || 'Durga Rainbow, Mahadevapura'}
              </span>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                PIN 560048
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Bengaluru, Karnataka — Pre-filled from your registered address
            </p>
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-foreground uppercase tracking-wider">
              Line Items ({items.length})
            </label>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              <Icon name="add" size={16} /> Add Item
            </button>
          </div>

          <div className="space-y-2.5">
            {items.map((item, idx) => (
              <div key={idx} className="p-3 rounded-xl border border-border bg-card space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Item #{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-destructive hover:opacity-80 text-xs font-bold"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={item.itemDescription}
                  onChange={(e) => handleItemChange(idx, 'itemDescription', e.target.value)}
                  placeholder="Item description or service scope"
                  className="w-full px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                  required
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-0.5 font-medium">Qty</span>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-0.5 font-medium">UOM</span>
                    <select
                      value={item.uom}
                      onChange={(e) => handleItemChange(idx, 'uom', e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground"
                    >
                      <option value="Units">Units</option>
                      <option value="Visits">Visits</option>
                      <option value="Sets">Sets</option>
                      <option value="Meters">Meters</option>
                      <option value="Hours">Hours</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block mb-0.5 font-medium">Target (₹)</span>
                    <input
                      type="number"
                      value={item.targetUnitBudget || ''}
                      onChange={(e) => handleItemChange(idx, 'targetUnitBudget', parseInt(e.target.value) || undefined)}
                      placeholder="Optional"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-border text-xs font-semibold text-foreground"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 flex items-center justify-between gap-3">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} className="text-xs min-h-[44px]">
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={isLoading}
            className="flex-1 py-3 text-xs font-bold rounded-xl shadow-xs min-h-[44px]"
          >
            {isLoading ? 'Publishing RFQ…' : 'Publish Requirement (TELL) →'}
          </Button>
        </div>
      </form>
    </div>
  );
}
