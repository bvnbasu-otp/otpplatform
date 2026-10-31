/**
 * OTP Next — Core Procurement Flow: REVIEW Stage
 * Handles identity-protected quotation review, landed cost GST split, and Smart Merit weighting.
 */

import React, { useState, useEffect } from 'react';
import { useContracts } from '@/lib/contracts-context';
import type { IdentityProtectedQuoteDto, SmartMeritComparisonDto } from '@otp/services';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

export interface ProcurementReviewStageProps {
  rfqId: string;
  onProceedToDecide: (selectedQuoteId: string) => void;
  onBackToTell?: () => void;
}

export function ProcurementReviewStage({ rfqId, onProceedToDecide, onBackToTell }: ProcurementReviewStageProps) {
  const contracts = useContracts();
  const [quotes, setQuotes] = useState<IdentityProtectedQuoteDto[]>([]);
  const [meritData, setMeritData] = useState<SmartMeritComparisonDto | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('quote_alpha');
  const [isCustomizingWeights, setIsCustomizingWeights] = useState(false);
  const [weights, setWeights] = useState({
    priceWeightPercentage: 50,
    deliveryWeightPercentage: 20,
    warrantyWeightPercentage: 15,
    ratingWeightPercentage: 15,
  });
  const [isLoading, setIsLoading] = useState(true);

  const actor = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'INDIVIDUAL' as const,
  };

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const quotesRes = await contracts.quotationManagement.listQuotesForRfq(actor, rfqId);
      if (quotesRes.ok) setQuotes(quotesRes.value);

      const meritRes = await contracts.smartMerit.getMeritComparison(actor, rfqId);
      if (meritRes.ok) {
        setMeritData(meritRes.value);
        if (meritRes.value.recommendedQuoteId) {
          setSelectedQuoteId(meritRes.value.recommendedQuoteId);
        }
      }
      setIsLoading(false);
    }
    void loadData();
  }, [rfqId]);

  async function handleApplyWeights() {
    const total =
      weights.priceWeightPercentage +
      weights.deliveryWeightPercentage +
      weights.warrantyWeightPercentage +
      weights.ratingWeightPercentage;

    if (total !== 100) return;

    const res = await contracts.smartMerit.configureMeritWeights(actor, {
      rfqId,
      weights,
    });
    if (res.ok) {
      setMeritData(res.value);
      setIsCustomizingWeights(false);
    }
  }

  if (isLoading) {
    return (
      <div className="w-full max-w-lg mx-auto bg-card rounded-2xl border border-border p-8 text-center space-y-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-bold text-muted-foreground">Evaluating competitive quotations…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-6 shadow-sm">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
          <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">2</span>
          <span>STAGE 2 · REVIEW & SMART MERIT</span>
        </div>
        <h2 className="text-xl font-black text-foreground">Compare Quotations & Merit Scores</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Suppliers remain identity-protected with pseudonym labels to ensure fair quotation comparison. Evaluate by landed cost, delivery, and warranty.
        </p>
      </div>

      {/* Smart Merit Weighting Summary */}
      <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-primary text-xs font-bold">
            <Icon name="verified" size={16} />
            <span>Smart Merit Weights (Normalized 100%)</span>
          </div>
          <button
            type="button"
            onClick={() => setIsCustomizingWeights(!isCustomizingWeights)}
            className="text-[11px] font-bold text-primary hover:underline"
          >
            {isCustomizingWeights ? 'Close' : 'Customize'}
          </button>
        </div>

        {!isCustomizingWeights ? (
          <div className="grid grid-cols-4 gap-2 text-center pt-1">
            <div className="bg-card p-1.5 rounded-lg border border-border/80">
              <span className="text-[10px] text-muted-foreground block font-medium">Price</span>
              <span className="text-xs font-bold text-foreground">{weights.priceWeightPercentage}%</span>
            </div>
            <div className="bg-card p-1.5 rounded-lg border border-border/80">
              <span className="text-[10px] text-muted-foreground block font-medium">Delivery</span>
              <span className="text-xs font-bold text-foreground">{weights.deliveryWeightPercentage}%</span>
            </div>
            <div className="bg-card p-1.5 rounded-lg border border-border/80">
              <span className="text-[10px] text-muted-foreground block font-medium">Warranty</span>
              <span className="text-xs font-bold text-foreground">{weights.warrantyWeightPercentage}%</span>
            </div>
            <div className="bg-card p-1.5 rounded-lg border border-border/80">
              <span className="text-[10px] text-muted-foreground block font-medium">Rating</span>
              <span className="text-xs font-bold text-foreground">{weights.ratingWeightPercentage}%</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 pt-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-muted-foreground block">Price Weight ({weights.priceWeightPercentage}%)</span>
                <input
                  type="range"
                  min="10"
                  max="80"
                  value={weights.priceWeightPercentage}
                  onChange={(e) => setWeights({ ...weights, priceWeightPercentage: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground block">Delivery Weight ({weights.deliveryWeightPercentage}%)</span>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={weights.deliveryWeightPercentage}
                  onChange={(e) => setWeights({ ...weights, deliveryWeightPercentage: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
            <Button type="button" onClick={handleApplyWeights} className="w-full py-1.5 text-xs font-bold">
              Update Merit Scoring
            </Button>
          </div>
        )}
      </div>

      {/* Quote Comparison Cards */}
      <div className="space-y-3">
        <label className="text-xs font-black text-foreground uppercase tracking-wider block">
          Received Protected Quotations ({quotes.length})
        </label>

        {quotes.map((q) => {
          const isSelected = selectedQuoteId === q.quoteId;
          const isRecommended = meritData?.recommendedQuoteId === q.quoteId;

          return (
            <div
              key={q.quoteId}
              onClick={() => setSelectedQuoteId(q.quoteId)}
              className={`p-4 rounded-xl border transition cursor-pointer space-y-3 ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border bg-card hover:border-border/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center font-black text-xs">
                    {q.pseudonymLabel.charAt(q.pseudonymLabel.length - 1)}
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-foreground">{q.pseudonymLabel}</h3>
                    <span className="text-[10px] text-muted-foreground">Identity-Protected Supplier</span>
                  </div>
                </div>
                {isRecommended && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <Icon name="star" size={12} /> Smart Merit Pick
                  </span>
                )}
              </div>

              {/* Price & Landed Cost Breakdown */}
              <div className="grid grid-cols-3 gap-2 bg-muted/20 p-2.5 rounded-lg text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block">Base Amount</span>
                  <span className="font-bold text-foreground">₹{q.totalBaseAmount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Applicable GST</span>
                  <span className="font-bold text-foreground">+ ₹{q.totalGstAmount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block">Total Landed</span>
                  <span className="font-black text-primary">₹{q.totalLandedCost.toLocaleString('en-IN')}</span>
                </div>
              </div>

              {/* Delivery, Warranty & Score */}
              <div className="flex items-center justify-between text-[11px] pt-1">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>⏱ {q.deliveryDays} Days Lead</span>
                  <span>🛡 {q.warrantyMonths} Mo Warranty</span>
                </div>
                <div className="flex items-center gap-1 font-bold text-foreground">
                  <span>Merit Score:</span>
                  <span className="text-primary font-black">{q.meritScore || 90}/100</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Buttons */}
      <div className="pt-4 flex items-center justify-between gap-3">
        {onBackToTell && (
          <Button type="button" variant="ghost" onClick={onBackToTell} className="text-xs min-h-[44px]">
            ← Back to TELL
          </Button>
        )}
        <Button
          type="button"
          onClick={() => onProceedToDecide(selectedQuoteId)}
          className="flex-1 py-3 text-xs font-bold rounded-xl shadow-xs min-h-[44px]"
        >
          Proceed to Decision (DECIDE) →
        </Button>
      </div>
    </div>
  );
}
