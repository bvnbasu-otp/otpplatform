import { useEffect, useState, useMemo } from 'react';
import { formatDateTimeIST } from '@/lib/date-utils';
import {
  CLARIFICATION_CATEGORIES,
  type ClarificationCategory,
  type ClarificationMessage,
  type RequirementSpecReference,
  postClarificationMessage,
} from '../api/clarification';
import { ClarificationCategoryBadge } from './ClarificationCategoryBadge';
import { ClarificationPiiBanner, ClarificationRedactionTag } from './ClarificationPiiBanner';
import { detectClarificationPii } from '../utils/pii-scrubber';

interface ClarificationThreadProps {
  rfqId: string;
  invitationId?: string;
  messages: ClarificationMessage[];
  authorSide: 'BUYER' | 'SUPPLIER';
  readOnly?: boolean;
  specReferences?: RequirementSpecReference[];
  onPosted?: () => void;
  className?: string;
}

export function ClarificationThread({
  rfqId,
  invitationId,
  messages,
  authorSide,
  readOnly = false,
  specReferences = [],
  onPosted,
  className = '',
}: ClarificationThreadProps) {
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<ClarificationCategory>('TECHNICAL_SPEC');
  const [selectedSpecId, setSelectedSpecId] = useState<string>('general');
  const [customLineItem, setCustomLineItem] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBody('');
    setError(null);
  }, [invitationId]);

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
    if (!invitationId && authorSide === 'SUPPLIER') {
      setError('Missing supplier invitation context.');
      return;
    }

    const trimmed = body.trim();
    if (!trimmed) {
      setError('Message cannot be empty.');
      return;
    }

    if (piiAnalysis?.isOnlyPii) {
      setError('Cannot submit message containing only contact details. Questions must refer to requirement specifications.');
      return;
    }

    setBusy(true);
    setError(null);

    const result = await postClarificationMessage(
      rfqId,
      invitationId || '',
      trimmed,
      authorSide,
      {
        inquiryCategory: category,
        lineItemRef: effectiveLineItemRef,
      },
    );

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBody('');
    setCustomLineItem('');
    onPosted?.();
  }

  return (
    <div
      className={`rounded-2xl border bg-card p-3 sm:p-4 shadow-2xs space-y-4 ${className}`}
      data-testid="clarification-thread"
    >
      {/* Messages Scroll View */}
      <div
        className="max-h-[380px] sm:max-h-[440px] space-y-3 overflow-y-auto pr-1"
        data-testid="clarification-messages-container"
      >
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center space-y-1">
            <span className="text-2xl block">💬</span>
            <p className="text-xs font-bold text-foreground">No questions in this thread yet</p>
            <p className="text-[11px] text-muted-foreground">
              {authorSide === 'BUYER'
                ? 'Wait for supplier inquiries or publish a broadcast addendum.'
                : 'Submit your specification, commercial or logistics questions below.'}
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe =
              (authorSide === 'BUYER' && m.authorSide === 'BUYER') ||
              (authorSide === 'SUPPLIER' && m.authorSide === 'SUPPLIER' && !m.isBroadcast);

            const isBroadcast = m.isBroadcast;

            return (
              <div
                key={m.id}
                className={`rounded-xl p-3 text-xs space-y-2 transition-all ${
                  isBroadcast
                    ? 'border-2 border-primary/40 bg-primary/5 dark:bg-primary/10 shadow-xs'
                    : isMe
                    ? 'border border-primary/20 bg-muted/40 ml-4 sm:ml-8'
                    : 'border border-border bg-card mr-4 sm:mr-8'
                }`}
                data-testid={`clarification-message-${m.id}`}
              >
                {/* Header Strip: Author, Category Badge, Line-Item Ref, Broadcast Notice */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/40 pb-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isBroadcast ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-black uppercase tracking-wide shadow-2xs">
                        <span>📢</span> Broadcast Addendum
                      </span>
                    ) : (
                      <span className="font-extrabold text-foreground flex items-center gap-1">
                        <span>{m.authorSide === 'BUYER' ? '🏢' : '🔒'}</span>
                        <span>{m.authorDisplay}</span>
                      </span>
                    )}

                    <ClarificationCategoryBadge category={m.inquiryCategory} size="sm" />

                    {m.lineItemRef && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border">
                        <span>🏷️</span>
                        <span className="truncate max-w-[180px]">{m.lineItemRef}</span>
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatDateTimeIST(m.createdAt)}
                  </span>
                </div>

                {/* Body */}
                <p className="whitespace-pre-wrap leading-relaxed text-foreground text-xs sm:text-[13px]">
                  {m.body}
                </p>

                {/* Redaction Tags */}
                {m.redactions && m.redactions.length > 0 && (
                  <ClarificationRedactionTag kinds={m.redactions} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Message Composer Form */}
      {!readOnly && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-3 pt-2 border-t border-border"
          data-testid="clarification-composer-form"
        >
          {/* Category Selector Chips */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
              Inquiry Category:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CLARIFICATION_CATEGORIES.map((cat) => {
                const isSelected = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key)}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-bold border transition flex items-center gap-1 min-h-[40px] ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/40 font-black'
                        : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Line-Item / Spec Reference Dropdown */}
          {specReferences.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="thread-spec-select"
                  className="text-[10px] font-bold text-muted-foreground block"
                >
                  Reference Requirement Item:
                </label>
                <select
                  id="thread-spec-select"
                  value={selectedSpecId}
                  onChange={(e) => {
                    setSelectedSpecId(e.target.value);
                    if (e.target.value !== 'custom') {
                      setCustomLineItem('');
                    }
                  }}
                  className="w-full rounded-lg border border-input bg-card text-foreground px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[40px]"
                >
                  {specReferences.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.label}
                    </option>
                  ))}
                  <option value="custom">Other / Custom Ref…</option>
                </select>
              </div>

              {selectedSpecId === 'custom' && (
                <div className="space-y-1">
                  <label
                    htmlFor="thread-custom-ref"
                    className="text-[10px] font-bold text-muted-foreground block"
                  >
                    Custom Line Item Tag:
                  </label>
                  <input
                    id="thread-custom-ref"
                    type="text"
                    value={customLineItem}
                    onChange={(e) => setCustomLineItem(e.target.value)}
                    placeholder="e.g. Line Item #3"
                    className="w-full rounded-lg border border-input bg-card text-foreground px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[40px]"
                  />
                </div>
              )}
            </div>
          )}

          {/* Textarea */}
          <div className="space-y-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              required
              placeholder={
                authorSide === 'BUYER'
                  ? 'Respond to supplier inquiry with neutral clarification on requirement specs…'
                  : 'Ask a specific technical question, request drawing clarification, or ask about milestone terms…'
              }
              className="w-full rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground/60 px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 leading-relaxed"
            />
          </div>

          {/* Live PII Scrub Warning */}
          {piiAnalysis && piiAnalysis.hasPii && (
            <ClarificationPiiBanner
              redactions={piiAnalysis.redactions}
              previewScrubbed={piiAnalysis.previewScrubbed}
              isOnlyPii={piiAnalysis.isOnlyPii}
            />
          )}

          {error && (
            <p
              role="alert"
              className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2 rounded-lg border border-red-200 dark:border-red-900"
            >
              ⚠️ {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">
              🛡️ Direct contact identifiers are scrubbed automatically to protect evaluation integrity.
            </span>

            <button
              type="submit"
              disabled={busy || !body.trim() || piiAnalysis?.isOnlyPii}
              data-testid="post-clarification-submit"
              className="rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-black hover:bg-primary/90 disabled:opacity-50 transition min-h-[48px] mobile-touch-target shadow-2xs flex items-center gap-1.5"
            >
              {busy ? (
                <span>Posting…</span>
              ) : (
                <>
                  <span>💬</span>
                  <span>{authorSide === 'BUYER' ? 'Post Reply' : 'Send Clarification'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
