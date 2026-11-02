/**
 * OTP Next — Core Procurement Flow: TELL Stage
 * Handles RFQ intake, categories, UOM, delivery address, secondary sourcing/payment options, and publishing.
 */

import React, { useState, useEffect } from 'react';
import { useContracts } from '@/lib/contracts-context';
import type { CategoryDto, BuyerAddressDto } from '@otp/services';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

export interface ProcurementTellStageProps {
  onPublished: (rfqId: string, sourcingMode?: 'IDENTITY_PROTECTED' | 'OPEN_TENDER') => void;
  onCancel?: () => void;
}

export function ProcurementTellStage({ onPublished, onCancel }: ProcurementTellStageProps) {
  const contracts = useContracts();
  const [tellSubStep, setTellSubStep] = useState<1 | 2 | 3>(1);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [addresses, setAddresses] = useState<BuyerAddressDto[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('cat_dg_set_maintenance');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [requiredDate, setRequiredDate] = useState('2026-04-15');
  const [items, setItems] = useState<Array<{ itemDescription: string; quantity: number; uom: string; targetUnitBudget?: number }>>([
    { itemDescription: '', quantity: 1, uom: 'Units', targetUnitBudget: undefined },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Requirement Type & Speed Mode
  const [procurementMode, setProcurementMode] = useState<'EXPRESS_DAILY' | 'STANDARD_TENDER'>('EXPRESS_DAILY');
  const [procurementIntent, setProcurementIntent] = useState<'NEW_BUY' | 'SERVICE_REPAIR' | 'PROJECT_WORKS'>('NEW_BUY');

  // Secondary RFQ Controls
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [paymentOption, setPaymentOption] = useState<
    '100_ON_DELIVERY' | '30_40_30' | '50_50' | 'MILESTONE_BASED' | 'NET_30'
  >('100_ON_DELIVERY');
  const [expressPaymentChannel, setExpressPaymentChannel] = useState<'PATH_A_UPI_QR' | 'PATH_B_COD'>('PATH_A_UPI_QR');
  const [sourcingMode, setSourcingMode] = useState<'IDENTITY_PROTECTED' | 'OPEN_TENDER'>('IDENTITY_PROTECTED');
  const [concentricRing, setConcentricRing] = useState<
    'HYPERLOCAL' | 'PIN_CODE' | 'RADIUS_5_50KM' | 'TOWN_CITY' | 'STATE' | 'PAN_INDIA'
  >('PIN_CODE');
  const [supplierReach, setSupplierReach] = useState<'ALL_ELIGIBLE' | 'VERIFIED_ONLY' | 'PREVIOUSLY_USED'>('ALL_ELIGIBLE');

  const actor = {
    profileId: 'usr_active',
    fullName: 'Active User',
    email: 'user@example.com',
    persona: 'INDIVIDUAL' as const,
  };

  useEffect(() => {
    void contracts.taxonomyCategories.listAuthoritativeCategories().then((res) => {
      if (res.ok && res.value.length > 0) {
        setCategories(res.value);
        if (!selectedCategory) {
          setSelectedCategory(res.value[0]?.categoryId || '');
        }
      }
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
        deliveryAddressId: selectedAddressId || 'addr_default',
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

      onPublished(publishRes.value.rfqId, sourcingMode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish requirement');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-4 shadow-sm">
      {/* 3-Step Progress Header matching Screen 12: Create RFQ (1) --- (2) --- (3) */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="p-1 -ml-1 text-muted-foreground hover:text-foreground"
              aria-label="Back"
            >
              <Icon name="arrow_back" size={18} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5 text-primary font-bold text-[10px] uppercase tracking-wider">
              <span>STAGE 1 · TELL</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-foreground">Create RFQ</h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <button
            type="button"
            onClick={() => setTellSubStep(1)}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
              tellSubStep === 1
                ? 'bg-primary text-primary-foreground font-black shadow-xs'
                : tellSubStep > 1
                ? 'bg-emerald-600 text-white'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {tellSubStep > 1 ? '✓' : '1'}
          </button>
          <span className={`w-3.5 h-0.5 ${tellSubStep > 1 ? 'bg-emerald-600' : 'bg-border'}`} />
          <button
            type="button"
            onClick={() => {
              if (title.trim()) setTellSubStep(2);
            }}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
              tellSubStep === 2
                ? 'bg-primary text-primary-foreground font-black shadow-xs'
                : tellSubStep > 2
                ? 'bg-emerald-600 text-white'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {tellSubStep > 2 ? '✓' : '2'}
          </button>
          <span className={`w-3.5 h-0.5 ${tellSubStep > 2 ? 'bg-emerald-600' : 'bg-border'}`} />
          <button
            type="button"
            onClick={() => {
              if (title.trim()) setTellSubStep(3);
            }}
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
              tellSubStep === 3
                ? 'bg-primary text-primary-foreground font-black shadow-xs'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            3
          </button>
        </div>
      </div>

      <div className="space-y-0.5">
        <h3 className="text-sm font-bold text-foreground">Post Your Procurement Requirement</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {tellSubStep === 1
            ? 'Step 1 of 3 · Requirement Details & Category'
            : tellSubStep === 2
            ? 'Step 2 of 3 · Line Items, Quantities & Delivery Address'
            : 'Step 3 of 3 · Sourcing Mode, Reach & Payment Preferences'}
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handlePublishRfq} className="space-y-4">
        {/* SUB-STEP 1: Requirement Details */}
        <div className={tellSubStep === 1 ? 'space-y-3.5' : 'hidden'}>
        {/* Procurement Speed & Quorum Mode */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">Procurement Flow *</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setProcurementMode('EXPRESS_DAILY');
                setPaymentOption('100_ON_DELIVERY');
                setConcentricRing('PIN_CODE');
              }}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 ${
                procurementMode === 'EXPRESS_DAILY'
                  ? 'border-primary bg-primary/10 text-primary shadow-xs'
                  : 'border-border bg-card text-muted-foreground hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-1.5 font-black text-xs text-foreground">
                <span>⚡ Quick / Daily Order</span>
              </div>
              <span className="text-[10px] leading-tight opacity-80">
                1 quote enough · Fast delivery · UPI/Cash on Delivery
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setProcurementMode('STANDARD_TENDER');
              }}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 ${
                procurementMode === 'STANDARD_TENDER'
                  ? 'border-primary bg-primary/10 text-primary shadow-xs'
                  : 'border-border bg-card text-muted-foreground hover:border-border/80'
              }`}
            >
              <div className="flex items-center gap-1.5 font-black text-xs text-foreground">
                <span>📋 Standard RFQ / Tender</span>
              </div>
              <span className="text-[10px] leading-tight opacity-80">
                Multiple quotes · Quoting window · Milestone terms
              </span>
            </button>
          </div>
        </div>

        {/* Intent / Classification */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">Requirement Type *</label>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'NEW_BUY', label: '🛒 New Buy', desc: 'Material & Goods' },
              { id: 'SERVICE_REPAIR', label: '🔧 Service / Repair', desc: 'Technician / AMC' },
              { id: 'PROJECT_WORKS', label: '🏗️ Project', desc: 'Turnkey Works' },
            ].map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => setProcurementIntent(type.id as any)}
                className={`p-2 rounded-xl border text-center transition min-h-[44px] ${
                  procurementIntent === type.id
                    ? 'border-primary bg-primary text-primary-foreground font-black shadow-xs'
                    : 'border-border bg-card text-foreground font-medium hover:border-border/80'
                }`}
              >
                <span className="text-[11px] block">{type.label}</span>
                <span className={`text-[9px] block ${procurementIntent === type.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{type.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Requirement Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">Requirement Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              procurementMode === 'EXPRESS_DAILY'
                ? 'e.g. 2 BLDC ceiling fans or 1 LED bulb & 3 brass taps'
                : procurementIntent === 'SERVICE_REPAIR'
                ? 'e.g. 10 HP Submersible Pump Rewinding & Seal Replacement'
                : 'e.g. 50 Ergonomic Mesh Office Chairs'
            }
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            required
            data-testid="input-rfq-title"
          />
        </div>

        {/* Category Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground">Authoritative Category *</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            data-testid="select-category"
          >
            {categories.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>

          {/* Expected Delivery Date / Timeline */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Expected Timeline *</label>
            <input
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          <div className="pt-3 flex justify-end">
            <Button
              type="button"
              onClick={() => {
                if (!title.trim()) {
                  setError('Please enter a requirement title before proceeding.');
                  return;
                }
                setError(null);
                setTellSubStep(2);
              }}
              className="w-full py-2.5 text-xs font-bold min-h-[44px]"
            >
              Next: Line Items &amp; Address (Step 2) →
            </Button>
          </div>
        </div>

        {/* SUB-STEP 2: Line Items & Delivery Address */}
        <div className={tellSubStep === 2 ? 'space-y-3.5' : 'hidden'}>
          {/* Delivery Address */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Delivery / Service Address *</label>
            <div className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground">
                  {addresses[0]?.addressLine1 || 'Durga Rainbow, Mahadevapura'}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  PIN {addresses[0]?.pincode || '560048'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {addresses[0]?.city || 'Bengaluru'}, {addresses[0]?.state || 'Karnataka'} — Pre-filled from your registered address
              </p>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-foreground uppercase tracking-wider">
                Line Items ({items.length})
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                data-testid="btn-add-line-item"
              >
                <Icon name="add" size={16} /> Add Item
              </button>
            </div>

            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
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
                    placeholder="e.g. Ergonomic Mesh High-Back Chairs"
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

          <div className="pt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTellSubStep(1)}
              className="text-xs min-h-[44px]"
            >
              ← Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                const hasValidItems = items.every((it) => it.itemDescription.trim() && it.quantity > 0);
                if (!hasValidItems) {
                  setError('Please fill in item description and quantity for all items.');
                  return;
                }
                setError(null);
                setTellSubStep(3);
              }}
              className="flex-1 py-2.5 text-xs font-bold min-h-[44px]"
            >
              Next: Payment &amp; Sourcing (Step 3) →
            </Button>
          </div>
        </div>

        {/* SUB-STEP 3: Secondary Options & Submit */}
        <div className={tellSubStep === 3 ? 'space-y-3.5' : 'hidden'}>
          {/* Secondary Details: Payment, Sourcing Mode & Supplier Reach */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <Icon name="tune" size={16} className="text-primary" />
              <span>Sourcing &amp; Payment Preferences</span>
            </div>

            {/* Payment Options */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-foreground block">Payment Term Preference *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setPaymentOption('100_ON_DELIVERY')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    paymentOption === '100_ON_DELIVERY' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  100% On Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('30_40_30')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    paymentOption === '30_40_30' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  30-40-30 Milestones
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('50_50')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    paymentOption === '50_50' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  50-50 Split
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('MILESTONE_BASED')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    paymentOption === 'MILESTONE_BASED' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  Milestone-Based
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentOption('NET_30')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    paymentOption === 'NET_30' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  Net 30 Days
                </button>
              </div>

              {/* Express On-Delivery Settlement Channel & Micro-Order Floor */}
              {paymentOption === '100_ON_DELIVERY' && (
                <div className="mt-2 p-2.5 rounded-xl bg-card border border-primary/30 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary block">
                    ⚡ On-Delivery Settlement Options:
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setExpressPaymentChannel('PATH_A_UPI_QR')}
                      className={`p-2 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                        expressPaymentChannel === 'PATH_A_UPI_QR'
                          ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                          : 'border-border bg-muted/20 text-muted-foreground'
                      }`}
                    >
                      <span className="text-foreground font-black">Path A: Dynamic UPI QR</span>
                      <span className="text-[9px] leading-tight opacity-80">Instant split at doorstep (GPay/PhonePe). Instant supplier bank payout.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpressPaymentChannel('PATH_B_COD')}
                      className={`p-2 rounded-lg border text-left transition flex flex-col gap-0.5 ${
                        expressPaymentChannel === 'PATH_B_COD'
                          ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                          : 'border-border bg-muted/20 text-muted-foreground'
                      }`}
                    >
                      <span className="text-foreground font-black">Path B: Cash / COD</span>
                      <span className="text-[9px] leading-tight opacity-80">Direct cash or standee. Fee debited to Supplier Platform Wallet.</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-muted-foreground bg-muted/40 p-2 rounded-lg border border-border/50 flex items-center justify-between">
                    <span>Platform Success Fee: <strong>0.50%</strong></span>
                    <span className="text-primary font-bold">Rule: ₹10 min floor on micro-orders</span>
                  </div>
                </div>
              )}
            </div>

            {/* Sourcing Mode */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-foreground block">Sourcing Mode</label>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setSourcingMode('IDENTITY_PROTECTED')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    sourcingMode === 'IDENTITY_PROTECTED' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  🛡️ Identity Protected
                </button>
                <button
                  type="button"
                  onClick={() => setSourcingMode('OPEN_TENDER')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    sourcingMode === 'OPEN_TENDER' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  📢 Open RFQ Tender
                </button>
              </div>
            </div>

            {/* Supplier Reach — Concentric Rings */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-foreground block">
                  Supplier Reach · Concentric Rings *
                </label>
                <span className="text-[10px] text-primary font-bold">
                  {concentricRing === 'HYPERLOCAL'
                    ? 'Ring 1 · Hyperlocal'
                    : concentricRing === 'PIN_CODE'
                    ? 'Ring 2 · PIN (560048)'
                    : concentricRing === 'RADIUS_5_50KM'
                    ? 'Ring 3 · 5–50 km Radius'
                    : concentricRing === 'TOWN_CITY'
                    ? 'Ring 4 · Town / City'
                    : concentricRing === 'STATE'
                    ? 'Ring 5 · State'
                    : 'Ring 6 · PAN India'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setConcentricRing('HYPERLOCAL')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    concentricRing === 'HYPERLOCAL' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  📍 Hyperlocal
                </button>
                <button
                  type="button"
                  onClick={() => setConcentricRing('PIN_CODE')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    concentricRing === 'PIN_CODE' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  📮 PIN Code
                </button>
                <button
                  type="button"
                  onClick={() => setConcentricRing('RADIUS_5_50KM')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    concentricRing === 'RADIUS_5_50KM' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  ⭕ 5–50 km
                </button>
                <button
                  type="button"
                  onClick={() => setConcentricRing('TOWN_CITY')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    concentricRing === 'TOWN_CITY' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  🏙️ Town/City
                </button>
                <button
                  type="button"
                  onClick={() => setConcentricRing('STATE')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    concentricRing === 'STATE' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  🗺️ State
                </button>
                <button
                  type="button"
                  onClick={() => setConcentricRing('PAN_INDIA')}
                  className={`p-2 rounded-lg border font-bold text-center transition ${
                    concentricRing === 'PAN_INDIA' ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary' : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  🇮🇳 PAN India
                </button>
              </div>
            </div>
          </div>

          {/* Review Summary Card */}
          <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-1 text-xs">
            <span className="text-[10px] font-bold text-primary uppercase">Summary:</span>
            <p className="font-extrabold text-foreground">{title || 'Untitled RFQ'}</p>
            <p className="text-[11px] text-muted-foreground">
              {items.length} item(s) · Delivery by {requiredDate} · {sourcingMode === 'IDENTITY_PROTECTED' ? 'Identity Protected' : 'Open Tender'}
            </p>
          </div>

          <div className="pt-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTellSubStep(2)}
              className="text-xs min-h-[44px]"
            >
              ← Back
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 text-xs font-bold rounded-xl shadow-xs min-h-[44px]"
              data-testid="btn-publish-rfq"
            >
              {isLoading ? 'Publishing RFQ…' : 'Submit RFQ (TELL) ✓'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
