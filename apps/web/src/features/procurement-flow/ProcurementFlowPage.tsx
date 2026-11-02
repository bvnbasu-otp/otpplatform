/**
 * OTP Next — Core Procurement Flow Orchestrator Page
 * Implements the 4 canonical stages: TELL → REVIEW → DECIDE → TRACK.
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '@/lib/i18n';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { ProcurementTellStage } from './ProcurementTellStage';
import { ProcurementReviewStage } from './ProcurementReviewStage';
import { ProcurementDecideStage } from './ProcurementDecideStage';
import { ProcurementTrackStage } from './ProcurementTrackStage';
import { Icon } from '@/components/ui/Icon';

export type FlowStage = 'TELL' | 'REVIEW' | 'DECIDE' | 'TRACK';

export function ProcurementFlowPage() {
  const navigate = useNavigate();
  const { t, currentMeta } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStage = (searchParams.get('stage') as FlowStage) || 'TELL';
  const initialRfqId = searchParams.get('rfqId') || 'rfq_sample_01';
  const initialAwardId = searchParams.get('awardId') || 'award_sample_01';

  const [currentStage, setCurrentStage] = useState<FlowStage>(initialStage);
  const [rfqId, setRfqId] = useState<string>(initialRfqId);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('quote_alpha');
  const [awardId, setAwardId] = useState<string>(initialAwardId);
  const [sourcingMode, setSourcingMode] = useState<'IDENTITY_PROTECTED' | 'OPEN_TENDER'>('IDENTITY_PROTECTED');

  const stages: Array<{ id: FlowStage; label: string; number: number; icon: string }> = [
    { id: 'TELL', label: t('journey.tell', 'Tell').replace(/^\d+\.\s*/, ''), number: 1, icon: 'edit_note' },
    { id: 'REVIEW', label: t('journey.review', 'Review').replace(/^\d+\.\s*/, ''), number: 2, icon: 'balance' },
    { id: 'DECIDE', label: t('journey.decide', 'Decide').replace(/^\d+\.\s*/, ''), number: 3, icon: 'how_to_vote' },
    { id: 'TRACK', label: t('journey.track', 'Track').replace(/^\d+\.\s*/, ''), number: 4, icon: 'local_shipping' },
  ];

  function handleRfqPublished(newRfqId: string) {
    setRfqId(newRfqId);
    setCurrentStage('REVIEW');
    setSearchParams({ stage: 'REVIEW', rfqId: newRfqId });
  }

  function handleProceedToDecide(quoteId: string) {
    setSelectedQuoteId(quoteId);
    setCurrentStage('DECIDE');
    setSearchParams({ stage: 'DECIDE', rfqId, quoteId });
  }

  function handleAwardIssued(newAwardId: string) {
    setAwardId(newAwardId);
    setCurrentStage('TRACK');
    setSearchParams({ stage: 'TRACK', rfqId, awardId: newAwardId });
  }

  function handleFinishFlow() {
    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-start py-4 px-3 sm:py-6 sm:px-4">
      {/* Top Header with App Brand & Multi-Language Switcher */}
      <div className="w-full max-w-lg mx-auto mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black tracking-tight text-foreground">X2O / OTP Next</span>
          <span className="text-[10px] text-muted-foreground font-medium hidden sm:inline">
            {currentMeta.nativeName}
          </span>
        </div>
        <LanguageSwitcher placement="header" />
      </div>

      {/* 4-Stage Stepper Header */}
      <div className="w-full max-w-lg mx-auto mb-4 bg-card rounded-2xl border border-border p-2.5 shadow-2xs">
        <div className="grid grid-cols-4 gap-1">
          {stages.map((st) => {
            const isActive = currentStage === st.id;
            const isPassed =
              (st.id === 'TELL' && currentStage !== 'TELL') ||
              (st.id === 'REVIEW' && (currentStage === 'DECIDE' || currentStage === 'TRACK')) ||
              (st.id === 'DECIDE' && currentStage === 'TRACK');

            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  if (isPassed) {
                    setCurrentStage(st.id);
                  }
                }}
                disabled={!isPassed && !isActive}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-center transition min-h-[44px] ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                    : isPassed
                    ? 'text-emerald-700 dark:text-emerald-400 font-semibold hover:bg-muted/50 cursor-pointer'
                    : 'text-muted-foreground opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <Icon name={isPassed ? 'check' : st.icon} size={14} />
                  <span className="text-[10px] font-black">{st.number}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-extrabold truncate max-w-full">
                  {st.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage Content */}
      <div className="w-full max-w-lg mx-auto">
        {currentStage === 'TELL' && (
          <ProcurementTellStage
            onPublished={handleRfqPublished}
            onCancel={() => navigate('/dashboard')}
          />
        )}

        {currentStage === 'REVIEW' && (
          <ProcurementReviewStage
            rfqId={rfqId}
            onProceedToDecide={handleProceedToDecide}
            onBackToTell={() => setCurrentStage('TELL')}
          />
        )}

        {currentStage === 'DECIDE' && (
          <ProcurementDecideStage
            rfqId={rfqId}
            selectedQuoteId={selectedQuoteId}
            onAwardIssued={handleAwardIssued}
            onBackToReview={() => setCurrentStage('REVIEW')}
          />
        )}

        {currentStage === 'TRACK' && (
          <ProcurementTrackStage
            awardId={awardId}
            onFinishFlow={handleFinishFlow}
            onBackToDecide={() => setCurrentStage('DECIDE')}
          />
        )}
      </div>
    </div>
  );
}
