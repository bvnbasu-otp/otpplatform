/**
 * OTP Next — Core Procurement Flow Orchestrator Page
 * Implements the 4 canonical stages: TELL → REVIEW → DECIDE → TRACK.
 */

import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProcurementTellStage } from './ProcurementTellStage';
import { ProcurementReviewStage } from './ProcurementReviewStage';
import { ProcurementDecideStage } from './ProcurementDecideStage';
import { ProcurementTrackStage } from './ProcurementTrackStage';
import { Icon } from '@/components/ui/Icon';

export type FlowStage = 'TELL' | 'REVIEW' | 'DECIDE' | 'TRACK';

export function ProcurementFlowPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStage = (searchParams.get('stage') as FlowStage) || 'TELL';
  const initialRfqId = searchParams.get('rfqId') || 'rfq_sample_01';
  const initialAwardId = searchParams.get('awardId') || 'award_sample_01';

  const [currentStage, setCurrentStage] = useState<FlowStage>(initialStage);
  const [rfqId, setRfqId] = useState<string>(initialRfqId);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('quote_alpha');
  const [awardId, setAwardId] = useState<string>(initialAwardId);

  const stages: Array<{ id: FlowStage; label: string; number: number; icon: string }> = [
    { id: 'TELL', label: 'Tell', number: 1, icon: 'edit_note' },
    { id: 'REVIEW', label: 'Review', number: 2, icon: 'balance' },
    { id: 'DECIDE', label: 'Decide', number: 3, icon: 'how_to_vote' },
    { id: 'TRACK', label: 'Track', number: 4, icon: 'local_shipping' },
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
                <span className="text-[10px] uppercase tracking-wider font-extrabold">{st.label}</span>
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
