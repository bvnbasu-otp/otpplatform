import { useState, useEffect } from 'react';

const STORAGE_KEY = 'otp_tour_completed_v1';

export const TOUR_STEPS = [
  {
    step: 1,
    title: '🛡️ Identity-Protected Sourcing',
    description:
      'Supplier brand names and contact info are cryptographically masked as "Supplier-XXXX" to prevent bias, kickbacks, and cartel pricing.',
  },
  {
    step: 2,
    title: '⚡ 1-Click Committee Voting',
    description:
      'Committee members cast weighted ballots based purely on normalized price, warranty, rating, and on-time reliability bands.',
  },
  {
    step: 3,
    title: '🏆 Irrevocable Award & Reveal',
    description:
      'Winner identity is permanently unlocked only AFTER the award decision is committed. Official Purchase Orders are generated automatically.',
  },
];

export function OnboardingTourModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        setIsOpen(true);
      }
    }
  }, []);

  function handleClose() {
    setIsOpen(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }

  function handleNext() {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  }

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep] ?? TOUR_STEPS[0]!;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full rounded-2xl border bg-card p-6 shadow-2xl relative text-left">
        <div className="flex items-center justify-between pb-3 border-b">
          <span className="text-xs font-bold text-primary tracking-wider uppercase">
            Platform Guide · Step {step.step} of {TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        <div className="py-5">
          <h3 className="text-base font-bold text-foreground">{step.title}</h3>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{step.description}</p>
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Skip Tour
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-sm"
          >
            {currentStep === TOUR_STEPS.length - 1 ? 'Get Started 🚀' : 'Next Step →'}
          </button>
        </div>
      </div>
    </div>
  );
}
