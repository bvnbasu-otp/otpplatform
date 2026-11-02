import React from 'react';
import { Button } from '@/components/ui/Button';
import { CelebrationIllustration } from '@/components/illustrations/VectorIllustrations';

export interface WizardStep8CompleteProps {
  fullName?: string;
  onGoToDashboard: () => void;
}

export function WizardStep8Complete({ fullName, onGoToDashboard }: WizardStep8CompleteProps) {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground justify-between p-4 sm:p-6 max-w-md mx-auto w-full text-center">
      <div className="pt-8 sm:pt-12 space-y-5">
        {/* Confetti & Success Badge Flat Vector Illustration */}
        <div className="animate-in zoom-in-75 duration-300">
          <CelebrationIllustration className="w-36 h-36 mx-auto drop-shadow-sm" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black text-foreground">Registration Complete!</h1>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
            {fullName ? `Welcome aboard, ${fullName}! ` : ''}Your account has been created successfully.
          </p>
        </div>

        {/* What's next card */}
        <div className="bg-card border border-border/80 rounded-2xl p-4 text-left space-y-3 shadow-2xs mt-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">What&apos;s next?</h3>
          <ul className="space-y-2.5 text-xs">
            <li className="flex items-center gap-2.5 text-foreground font-semibold">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] shrink-0 font-bold">1</span>
              <span>Complete your profile preferences</span>
            </li>
            <li className="flex items-center gap-2.5 text-foreground font-semibold">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] shrink-0 font-bold">2</span>
              <span>Explore trending opportunities in your area</span>
            </li>
            <li className="flex items-center gap-2.5 text-foreground font-semibold">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] shrink-0 font-bold">3</span>
              <span>Start your procurement journey (TELL → REVIEW → DECIDE → TRACK)</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="pt-6 pb-6">
        <Button
          type="button"
          onClick={onGoToDashboard}
          className="w-full py-3.5 text-sm font-bold shadow-md"
          data-testid="btn-go-to-dashboard"
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
