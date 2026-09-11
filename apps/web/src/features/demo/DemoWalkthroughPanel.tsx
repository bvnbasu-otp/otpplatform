import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemoMode } from './demo-config';
import { WALKTHROUGH_STEPS } from './walkthrough-steps';

export function DemoWalkthroughPanel() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  if (!isDemoMode) return null;

  const step = WALKTHROUGH_STEPS[currentStep];

  function goToStep(index: number) {
    setCurrentStep(index);
    const target = WALKTHROUGH_STEPS[index];
    if (target?.route) {
      navigate(target.route);
    }
  }

  return (
    <aside
      className="fixed bottom-4 right-4 z-40 w-80 rounded-lg border bg-card p-4 shadow-lg"
      data-testid="demo-walkthrough-panel"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Presenter Guide</h3>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && step && (
        <>
          <p className="mb-1 text-xs text-muted-foreground">
            Step {step.id} of {WALKTHROUGH_STEPS.length}
          </p>
          <p className="text-sm font-medium">{step.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={() => goToStep(currentStep - 1)}
              className="flex-1 rounded border px-2 py-1 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={currentStep >= WALKTHROUGH_STEPS.length - 1}
              onClick={() => goToStep(currentStep + 1)}
              className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-40"
            >
              Next
            </button>
          </div>
          {step.route && (
            <button
              type="button"
              onClick={() => navigate(step.route!)}
              className="mt-2 w-full rounded border px-2 py-1 text-xs hover:bg-muted"
              data-testid="walkthrough-go-to-step"
            >
              Go to screen →
            </button>
          )}
        </>
      )}
    </aside>
  );
}
