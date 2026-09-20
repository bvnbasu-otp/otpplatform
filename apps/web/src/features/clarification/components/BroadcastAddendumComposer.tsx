import { useState, useMemo } from 'react';
import {
  CLARIFICATION_CATEGORIES,
  type ClarificationCategory,
  type RequirementSpecReference,
  postBroadcastClarification,
} from '../api/clarification';
import { detectClarificationPii } from '../utils/pii-scrubber';
import { ClarificationPiiBanner } from './ClarificationPiiBanner';

interface BroadcastAddendumComposerProps {
  rfqId: string;
  specReferences?: RequirementSpecReference[];
  onPublished?: () => void;
  onCancel?: () => void;
}

export function BroadcastAddendumComposer({
  rfqId,
  specReferences = [],
  onPublished,
  onCancel,
}: BroadcastAddendumComposerProps) {
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<ClarificationCategory>('TECHNICAL_SPEC');
  const [selectedSpecId, setSelectedSpecId] = useState<string>('general');
  const [customLineItem, setCustomLineItem] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const piiAnalysis = useMemo(() => {
    if (!body.trim()) return null;
    return detectClarificationPii(body);
  }, [body]);

  const effectiveLineItemRef = useMemo(() => {
    if (customLineItem.trim()) return customLineItem.trim();
    if (selectedSpecId && selectedSpecId !== 'general') {
      const match = specReferences.find((r) => r.id === selectedSpecId);
      return match ? match.label : null;
    }
    return null;
  }, [customLineItem, selectedSpecId, specReferences]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      setError('Addendum body cannot be empty.');
      return;
    }

    if (piiAnalysis?.isOnlyPii) {
      setError('Cannot publish broadcast addendum containing only contact details.');
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);

    const res = await postBroadcastClarification(rfqId, trimmed, {
      inquiryCategory: category,
      lineItemRef: effectiveLineItemRef,
    });

    setIsBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setSuccess('Broadcast clarification addendum published to all invited suppliers.');
    setBody('');
    setCustomLineItem('');
    onPublished?.();
  }

  return (
    <div
      className="rounded-2xl border-2 border-primary/30 bg-card p-4 sm:p-5 shadow-sm space-y-4"
      data-testid="broadcast-addendum-composer"
    >
      <div className="flex items-start justify-between gap-3 border-b pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">📢</span>
            <h3 className="text-sm font-black text-foreground">
              Publish Broadcast Clarification Addendum
            </h3>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Neutral addenda are broadcast to <strong>all invited suppliers</strong> simultaneously to ensure fair, transparent competitive quoting.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground p-1 rounded min-h-[36px] min-w-[36px] flex items-center justify-center"
            aria-label="Close broadcast composer"
          >
            ✕
          </button>
        )}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5">
        {/* Category Picker */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-muted-foreground block">
            Clarification Category
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CLARIFICATION_CATEGORIES.map((cat) => {
              const isSelected = category === cat.key;
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategory(cat.key)}
                  className={`rounded-xl px-2.5 py-2 text-xs font-bold border text-left transition flex items-center gap-1.5 min-h-[44px] mobile-touch-target ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary shadow-2xs ring-1 ring-primary/40'
                      : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <span className="text-sm">{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Line Item / Specification Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label
              htmlFor="spec-select"
              className="text-[11px] font-bold text-muted-foreground block"
            >
              Requirement Spec Reference:
            </label>
            <select
              id="spec-select"
              value={selectedSpecId}
              onChange={(e) => {
                setSelectedSpecId(e.target.value);
                if (e.target.value !== 'custom') {
                  setCustomLineItem('');
                }
              }}
              className="w-full rounded-xl border border-input bg-card text-foreground px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px]"
            >
              {specReferences.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {spec.label}
                </option>
              ))}
              <option value="custom">Custom Line-Item Reference…</option>
            </select>
          </div>

          {selectedSpecId === 'custom' && (
            <div className="space-y-1">
              <label
                htmlFor="custom-ref"
                className="text-[11px] font-bold text-muted-foreground block"
              >
                Custom Specification / Item Tag:
              </label>
              <input
                id="custom-ref"
                type="text"
                value={customLineItem}
                onChange={(e) => setCustomLineItem(e.target.value)}
                placeholder="e.g. Item #2: Copper Rotor Assembly"
                className="w-full rounded-xl border border-input bg-card text-foreground px-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[44px]"
              />
            </div>
          )}
        </div>

        {/* Addendum Message Area */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="broadcast-body"
              className="text-[11px] font-bold text-foreground"
            >
              Addendum Content (Neutral Announcement):
            </label>
            <span className="text-[10px] text-muted-foreground">
              {body.length} characters
            </span>
          </div>
          <textarea
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            required
            placeholder="State the neutral specification clarification, timeline extension, or standardized parameter update for all participants…"
            className="w-full rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground/60 p-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 leading-relaxed"
          />
        </div>

        {/* PII Warning Preview if contact info detected */}
        {piiAnalysis && piiAnalysis.hasPii && (
          <ClarificationPiiBanner
            redactions={piiAnalysis.redactions}
            previewScrubbed={piiAnalysis.previewScrubbed}
            isOnlyPii={piiAnalysis.isOnlyPii}
          />
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300 font-bold"
          >
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-bold"
          >
            ✓ {success}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isBusy}
              className="rounded-xl border border-border px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted min-h-[48px] mobile-touch-target transition"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={isBusy || !body.trim() || piiAnalysis?.isOnlyPii}
            data-testid="publish-broadcast-addendum-submit"
            className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 min-h-[48px] mobile-touch-target transition flex items-center gap-1.5"
          >
            {isBusy ? (
              <span>Publishing…</span>
            ) : (
              <>
                <span>📢</span>
                <span>Publish Addendum to All Suppliers</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
