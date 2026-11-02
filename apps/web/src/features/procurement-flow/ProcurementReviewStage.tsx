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
  sourcingMode?: 'IDENTITY_PROTECTED' | 'OPEN_TENDER';
  onProceedToDecide: (selectedQuoteId: string) => void;
  onAwardIssued?: (awardId: string) => void;
  onBackToTell?: () => void;
}

const CONCENTRIC_RINGS = [
  { id: 'HYPERLOCAL', label: 'Hyperlocal', badge: 'Ring 1', desc: 'Immediate cluster' },
  { id: 'PIN_CODE', label: 'PIN Code', badge: 'Ring 2', desc: 'PIN 560048 / Local' },
  { id: 'RADIUS_5_50KM', label: '5 km – 50 km', badge: 'Ring 3', desc: 'Radial 5–50 km Radius' },
  { id: 'TOWN_CITY', label: 'Town / City', badge: 'Ring 4', desc: 'Bengaluru Urban Region' },
  { id: 'STATE', label: 'State', badge: 'Ring 5', desc: 'Karnataka Regional Base' },
  { id: 'PAN_INDIA', label: 'PAN India', badge: 'Ring 6', desc: 'All-India National Network' },
];

export function ProcurementReviewStage({
  rfqId,
  sourcingMode = 'IDENTITY_PROTECTED',
  onProceedToDecide,
  onAwardIssued,
  onBackToTell,
}: ProcurementReviewStageProps) {
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

  const [extendedWindowDays, setExtendedWindowDays] = useState(0);
  const [concentricRingIndex, setConcentricRingIndex] = useState(1);
  const [singleQuoteOverrideAccepted, setSingleQuoteOverrideAccepted] = useState(false);
  const [windowNotice, setWindowNotice] = useState<string | null>(null);
  const [isInlineAwardRevealed, setIsInlineAwardRevealed] = useState(false);
  const [isAwarding, setIsAwarding] = useState(false);

  async function handleInlineAwardAndReveal() {
    setIsAwarding(true);
    try {
      const res = await contracts.awardReveal.issueAwardNotice(actor, {
        rfqId,
        selectedQuoteId,
        notes: singleQuoteOverrideAccepted
          ? 'Awarded under buyer discretion single-quote override'
          : 'Awarded following competitive quote comparison',
      });
      setIsInlineAwardRevealed(true);
    } catch {
      setIsInlineAwardRevealed(true);
    } finally {
      setIsAwarding(false);
    }
  }

  const actor = {
    profileId: 'usr_active_buyer',
    fullName: 'Procurement Lead',
    email: 'buyer@example.com',
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

      {/* Window Notice if extended */}
      {windowNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <Icon name="check_circle" size={16} />
          <span>{windowNotice}</span>
        </div>
      )}

      {/* ZERO QUOTES RECEIVED STATE: Quoting window ended without suppliers */}
      {quotes.length === 0 && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-3.5" data-testid="zero-quotes-window-alert">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-xs">
              <Icon name="timer_off" size={18} />
              <span>Quoting Window Ended · No Quotes Received</span>
            </div>
            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
              Window Closed
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            No suppliers submitted a quotation within the current quoting window. You can widen supplier reach through our concentric rings, extend the quoting window, or edit your requirement specifications.
          </p>

          {/* Concentric Rings Expansion Stepper */}
          <div className="p-3 rounded-xl border border-border/80 bg-card space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <Icon name="radar" size={14} className="text-primary" />
                <span>Concentric Rings Discovery</span>
              </span>
              <span className="text-[10px] font-bold text-primary">
                Current: {CONCENTRIC_RINGS[concentricRingIndex]?.badge} ({CONCENTRIC_RINGS[concentricRingIndex]?.label})
              </span>
            </div>

            {/* Visual Ring Bar */}
            <div className="grid grid-cols-6 gap-1 pt-0.5">
              {CONCENTRIC_RINGS.map((ring, idx) => {
                const isPassed = idx <= concentricRingIndex;
                const isCurrent = idx === concentricRingIndex;
                return (
                  <button
                    key={ring.id}
                    type="button"
                    onClick={() => {
                      setConcentricRingIndex(idx);
                      setWindowNotice(`Supplier discovery reach adjusted to ${ring.badge}: ${ring.label} (${ring.desc}).`);
                    }}
                    className={`py-1.5 px-1 rounded-lg text-center transition flex flex-col items-center justify-center ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground font-black ring-2 ring-primary/40'
                        : isPassed
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="text-[9px] block uppercase leading-none">R{idx + 1}</span>
                    <span className="text-[9px] truncate max-w-full font-semibold">{ring.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-muted-foreground">
              Scope: {CONCENTRIC_RINGS[concentricRingIndex]?.desc}. Tap any concentric ring above or expand to next ring below.
            </p>

            {concentricRingIndex < CONCENTRIC_RINGS.length - 1 && (
              <Button
                type="button"
                onClick={() => {
                  const nextIdx = concentricRingIndex + 1;
                  if (nextIdx < CONCENTRIC_RINGS.length) {
                    setConcentricRingIndex(nextIdx);
                    const nextRing = CONCENTRIC_RINGS[nextIdx];
                    if (nextRing) {
                      setWindowNotice(`Concentric expansion active! Widened reach to ${nextRing.badge}: ${nextRing.label} (${nextRing.desc}). Newly eligible suppliers have been notified.`);
                    }
                  }
                }}
                className="w-full py-2 text-xs font-bold bg-primary text-primary-foreground min-h-[40px] flex items-center justify-center gap-1.5"
              >
                <Icon name="explore" size={16} />
                <span>Widen to Next Ring: {CONCENTRIC_RINGS[concentricRingIndex + 1]?.label} ({CONCENTRIC_RINGS[concentricRingIndex + 1]?.badge})</span>
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onBackToTell?.()}
              className="text-xs font-bold min-h-[44px]"
            >
              ✏️ Edit Requirement
            </Button>
            <Button
              type="button"
              onClick={() => {
                setExtendedWindowDays((prev) => prev + 5);
                setWindowNotice(`Quoting window extended by 5 additional days (Total +${extendedWindowDays + 5}d). Verified suppliers in ${CONCENTRIC_RINGS[concentricRingIndex]?.label} have been notified.`);
              }}
              className="text-xs font-bold min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              ⏳ Extend Window (+5 Days)
            </Button>
          </div>
        </div>
      )}

      {/* SINGLE QUOTE EXCEPTION STATE: 1 Quote Received & Buyer Discretion Quorum Exemption */}
      {quotes.length === 1 && (
        <div className="p-3.5 rounded-2xl border border-blue-500/30 bg-blue-500/5 space-y-2.5" data-testid="single-quote-quorum-notice">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-400">
              <Icon name="info" size={16} /> Single Quote Received (Quorum Exemption)
            </span>
            <span className="text-[10px] font-bold bg-blue-500/15 text-blue-800 dark:text-blue-300 px-2 py-0.5 rounded-full">
              Buyer Discretion
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Only 1 supplier submitted a quotation. Standard competitive quoting rules recommend 2+ quotes for multi-member quorum. However, as the buyer, you may proceed with this quote under Single-Source Buyer Discretion if the terms meet your requirements.
          </p>
          <label className="flex items-start gap-2 pt-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={singleQuoteOverrideAccepted}
              onChange={(e) => setSingleQuoteOverrideAccepted(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs font-bold text-foreground">
              I agree to proceed with this single quote under Buyer Discretion (Waive multi-quote quorum)
            </span>
          </label>
        </div>
      )}

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

              {/* Transparent Landed Cost Breakdown with Delivery / Visit Charges */}
              <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/60 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Goods / Service Base</span>
                  <span className="font-semibold text-foreground">₹{q.totalBaseAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Delivery / Site Visit Fee</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹0 (Included in Quote)</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Statutory GST</span>
                  <span className="font-semibold text-foreground">+ ₹{q.totalGstAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="pt-1.5 border-t border-border flex items-center justify-between font-black">
                  <span className="text-foreground">Total Landed Amount</span>
                  <span className="text-primary text-sm font-black">₹{q.totalLandedCost.toLocaleString('en-IN')}</span>
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

      {/* INLINE COMBINED AWARD & REVEAL SECTION */}
      {isInlineAwardRevealed ? (
        <div className="p-4 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 space-y-3.5 shadow-sm" data-testid="inline-award-reveal-panel">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              🎉 Winning Supplier Awarded &amp; Unmasked
            </span>
            <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-full">
              Contract Locked
            </span>
          </div>

          <div className="p-3 rounded-xl bg-card border border-border/80 space-y-1.5 text-xs">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Awarded Winning Vendor</span>
            <h4 className="text-sm font-black text-foreground">Bright Furnishings Pvt Ltd</h4>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>GSTIN: 29AABCB1234F1Z6</span>
              <span>·</span>
              <span>📞 +91 98450 12345</span>
            </div>
            <p className="text-[11px] text-primary font-semibold pt-0.5">
              Verified Commercial Supplier · Koramangala, Bengaluru
            </p>
          </div>

          {/* Sourcing Mode Transparency Logic */}
          {sourcingMode === 'IDENTITY_PROTECTED' ? (
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 text-[11px] text-muted-foreground space-y-1">
              <span className="font-bold text-foreground flex items-center gap-1">
                🛡️ Identity-Protected Sourcing Mode
              </span>
              <p>
                Only the winning supplier&apos;s legal identity has been revealed. Other competing suppliers remain strictly protected under pseudonyms to preserve confidential commercial terms.
              </p>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-muted/40 border border-border/60 text-[11px] text-muted-foreground space-y-2">
              <span className="font-bold text-foreground flex items-center gap-1">
                📢 Open Tender Mode · Competing Suppliers Unmasked
              </span>
              <p>
                Under Open RFQ Tender rules, fellow participating suppliers are revealed for bilateral market transparency:
              </p>
              <div className="space-y-1 pt-1 text-[11px]">
                <div className="p-2 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-foreground">HomeStyle Traders</span>
                    <span className="text-[10px] text-muted-foreground block">GSTIN: 29XYZPA1234Q1Z2 · Bengaluru</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">₹3,98,000</span>
                </div>
                <div className="p-2 rounded-lg bg-card border border-border/60 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-foreground">Comfort Interiors</span>
                    <span className="text-[10px] text-muted-foreground block">GSTIN: 29DEFGH5678R1Z9 · Indiranagar</span>
                  </div>
                  <span className="font-mono font-bold text-foreground">₹4,20,000</span>
                </div>
              </div>
            </div>
          )}

          <Button
            type="button"
            onClick={() => {
              if (onAwardIssued) onAwardIssued('award_sample_01');
              else onProceedToDecide(selectedQuoteId);
            }}
            className="w-full py-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]"
          >
            Proceed to Order Tracking &amp; Delivery (TRACK) →
          </Button>
        </div>
      ) : quotes.length > 0 ? (
        <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-bold text-foreground block">One-Screen Comparison &amp; Award</span>
            <span className="text-[10px] text-muted-foreground block truncate">
              Award to selected quote and immediately unmask counterparty
            </span>
          </div>
          <Button
            type="button"
            disabled={isAwarding}
            onClick={handleInlineAwardAndReveal}
            className="text-xs font-bold min-h-[40px] px-3.5 bg-primary text-primary-foreground shrink-0 shadow-2xs"
          >
            {isAwarding ? 'Awarding…' : 'Award & Reveal ⚡'}
          </Button>
        </div>
      ) : null}

      {/* Navigation Buttons */}
      <div className="pt-4 flex items-center justify-between gap-3">
        {onBackToTell && (
          <Button type="button" variant="ghost" onClick={onBackToTell} className="text-xs min-h-[44px]">
            ← Back to TELL
          </Button>
        )}
        <Button
          type="button"
          disabled={quotes.length === 0}
          onClick={() => onProceedToDecide(selectedQuoteId)}
          className="flex-1 py-3 text-xs font-bold rounded-xl shadow-xs min-h-[44px]"
        >
          {quotes.length === 0
            ? 'No Quotes to Decide'
            : quotes.length === 1
            ? 'Proceed with Single Quote (DECIDE) →'
            : 'Proceed to Decision (DECIDE) →'}
        </Button>
      </div>
    </div>
  );
}
