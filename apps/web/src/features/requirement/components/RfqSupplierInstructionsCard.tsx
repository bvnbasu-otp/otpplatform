import { useState } from 'react';

interface RfqSupplierInstructionsCardProps {
  initialInstructions: string;
  onInstructionsChange: (newInstructions: string) => void;
}

export function RfqSupplierInstructionsCard({
  initialInstructions,
  onInstructionsChange,
}: RfqSupplierInstructionsCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [instructions, setInstructions] = useState(initialInstructions);

  function handleSave() {
    setIsEditing(false);
    onInstructionsChange(instructions);
  }

  function handleCancel() {
    setIsEditing(false);
    setInstructions(initialInstructions);
  }

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3 transition-all text-foreground"
      data-testid="rfq-supplier-instructions-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="rounded-md bg-teal-100 dark:bg-teal-950/60 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            5. Supplier Instructions &amp; Quoting Guidelines
          </span>
          <h3 className="text-sm sm:text-base font-bold text-foreground mt-1">
            Special Notes for Quoting Suppliers
          </h3>
        </div>

        <button
          type="button"
          onClick={() => {
            if (isEditing) handleSave();
            else setIsEditing(true);
          }}
          className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-lg border bg-muted/30 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target shrink-0"
        >
          <span>{isEditing ? 'Save ✓' : 'Edit Notes ✎'}</span>
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2 pt-1">
          <label htmlFor="supplier-instructions-input" className="sr-only">
            Custom Supplier Instructions
          </label>
          <textarea
            id="supplier-instructions-input"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            placeholder="e.g. Please quote all-inclusive landed rate with minimum 1-year replacement warranty and estimated completion date."
            className="w-full rounded-lg border bg-background p-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="min-h-[48px] px-3.5 py-1.5 rounded-lg border bg-muted/30 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[48px] px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
            >
              Save Instructions
            </button>
          </div>
        </div>
      ) : instructions ? (
        <div className="rounded-lg bg-muted/20 p-2.5 text-xs text-foreground border leading-relaxed whitespace-pre-wrap">
          &ldquo;{instructions}&rdquo;
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground bg-muted/10">
          Standard transparent quoting terms apply. Tap <strong>Edit Notes</strong> to provide custom instructions to quoting vendors.
        </div>
      )}
    </section>
  );
}
