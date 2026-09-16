import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import { createSupportTicket } from '@/features/admin/api/admin-ops';
import type { SupportTicketCategory, SupportTicketPriority } from '@/features/admin/types/admin';

export type SupportFeedbackTab = 'BUG' | 'FEATURE' | 'GENERAL';

export interface SupportHelpButtonModalProps {
  className?: string;
  initialTab?: SupportFeedbackTab;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const ROUTED_ADMIN_EMAIL = 'bvnbasu@gmail.com';

export function SupportHelpButtonModal({
  className = '',
  initialTab = 'BUG',
  isOpen: controlledIsOpen,
  onOpenChange,
}: SupportHelpButtonModalProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const setOpen = (open: boolean) => {
    if (!isControlled) {
      setInternalIsOpen(open);
    }
    onOpenChange?.(open);
  };

  const [activeTab, setActiveTab] = useState<SupportFeedbackTab>(initialTab);
  
  // Bug form fields
  const [bugSeverity, setBugSeverity] = useState<SupportTicketPriority>('MEDIUM');
  const [bugSubject, setBugSubject] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugReproSteps, setBugReproSteps] = useState('');

  // Feature form fields
  const [featureSubject, setFeatureSubject] = useState('');
  const [featureUseCase, setFeatureUseCase] = useState('');
  const [featureImprovement, setFeatureImprovement] = useState('');

  // General inquiry fields
  const [generalSubject, setGeneralSubject] = useState('');
  const [generalDescription, setGeneralDescription] = useState('');
  const [generalDepartment, setGeneralDepartment] = useState<'OPS' | 'SALES'>('OPS');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ticketResult, setTicketResult] = useState<{
    ticketNumber: string;
    routedEmail: string;
    category: SupportTicketCategory;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const { context } = useRoleContext();
  const { user } = useAuth();
  const location = useLocation();

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleClose = () => {
    setOpen(false);
    setTicketResult(null);
    setSubmitError(null);
    setBugSubject('');
    setBugDescription('');
    setBugReproSteps('');
    setFeatureSubject('');
    setFeatureUseCase('');
    setFeatureImprovement('');
    setGeneralSubject('');
    setGeneralDescription('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    let category: SupportTicketCategory = 'BUG';
    let subject = '';
    let description = '';
    let priority: SupportTicketPriority = 'MEDIUM';

    if (activeTab === 'BUG') {
      category = 'BUG';
      subject = bugSubject.trim();
      priority = bugSeverity;
      description = [
        `[BUG DESCRIPTION]\n${bugDescription.trim()}`,
        bugReproSteps.trim() ? `\n[STEPS TO REPRODUCE]\n${bugReproSteps.trim()}` : '',
        `\n[DIAGNOSTIC METADATA]`,
        `- Active Role: ${context.activeRole?.label || context.side || 'BUYER'} (${context.activeRole?.code || 'USER'})`,
        `- Organization ID: ${context.organizationId || 'Personal / None'} (${context.organizationName || 'N/A'})`,
        `- Current Route: ${location.pathname}${location.search}`,
        `- Client Timestamp: ${new Date().toISOString()}`,
        `- User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Browser'}`,
      ].filter(Boolean).join('\n');
    } else if (activeTab === 'FEATURE') {
      category = 'FEATURE';
      subject = featureSubject.trim();
      priority = 'MEDIUM';
      description = [
        `[FEATURE / USE CASE]\n${featureUseCase.trim()}`,
        featureImprovement.trim() ? `\n[SUGGESTED ENHANCEMENT / SPEC]\n${featureImprovement.trim()}` : '',
        `\n[DIAGNOSTIC METADATA]`,
        `- Active Role: ${context.activeRole?.label || context.side || 'BUYER'} (${context.activeRole?.code || 'USER'})`,
        `- Organization ID: ${context.organizationId || 'Personal / None'} (${context.organizationName || 'N/A'})`,
        `- Current Route: ${location.pathname}${location.search}`,
        `- Client Timestamp: ${new Date().toISOString()}`,
        `- User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Browser'}`,
      ].filter(Boolean).join('\n');
    } else {
      category = generalDepartment;
      subject = generalSubject.trim();
      priority = 'HIGH';
      description = [
        `[DEPARTMENT INQUIRY / ESCALATION]\n${generalDescription.trim()}`,
        `\n[DIAGNOSTIC METADATA]`,
        `- Active Role: ${context.activeRole?.label || context.side || 'BUYER'} (${context.activeRole?.code || 'USER'})`,
        `- Organization ID: ${context.organizationId || 'Personal / None'} (${context.organizationName || 'N/A'})`,
        `- Current Route: ${location.pathname}${location.search}`,
        `- Client Timestamp: ${new Date().toISOString()}`,
        `- User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown Browser'}`,
      ].filter(Boolean).join('\n');
    }

    if (!subject || !description) {
      setSubmitError('Please complete the required subject and details.');
      return;
    }

    setIsSubmitting(true);
    try {
      const userEmail = context.email || user?.email || (context.profileId
        ? `${context.activeRole?.code.toLowerCase() || 'user'}@buyer-portal.test`
        : 'user@otp.test');

      const res = await createSupportTicket({
        category,
        subject,
        description,
        priority,
        pageUrl: window.location.href,
        userEmail,
        userRole: context.activeRole?.label || (context.isPlatformAdmin ? 'Platform Admin' : `${context.side || 'PORTAL'} User`),
        userSide: context.isPlatformAdmin ? 'ADMIN' : context.side || 'PORTAL',
      });

      if (res.ok && res.ticketNumber) {
        setTicketResult({
          ticketNumber: res.ticketNumber,
          routedEmail: res.routedEmail || ROUTED_ADMIN_EMAIL,
          category,
        });
      } else {
        setSubmitError(res.error || 'Failed to submit support request. Please try again.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Unexpected network error submitting support request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {/* Universal Header Trigger Button: Help & Support (?) */}
      <button
        type="button"
        onClick={() => setOpen(!isOpen)}
        aria-label="Help and Support"
        aria-expanded={isOpen}
        data-testid="help-and-support-trigger"
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold transition shadow-2xs min-h-[32px] mobile-touch-target cursor-pointer ${
          isOpen
            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
            : 'border-border/80 bg-card text-foreground hover:bg-muted/80 hover:text-primary hover:border-primary/40'
        }`}
        title="Help & Support (?): Report Bugs, Request Features, or Contact Ops"
      >
        <span className="text-base leading-none select-none">❓</span>
      </button>

      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs sm:hidden"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Modal / Popover Container */}
      {isOpen && (
        <div className="fixed inset-x-2.5 top-14 sm:absolute sm:inset-auto sm:right-0 sm:top-full mt-2 w-auto sm:w-[500px] max-w-[calc(100vw-1.25rem)] sm:max-w-[500px] max-h-[calc(100vh-4.5rem)] sm:max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛠️</span>
              <div>
                <h3 className="text-sm font-extrabold text-foreground">
                  OTP Help &amp; Support Center
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Automated dispatch to <strong className="text-foreground">{ROUTED_ADMIN_EMAIL}</strong> &amp; Ops Console.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground text-xs font-bold p-1.5 rounded-md hover:bg-muted"
              title="Close window"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Success Screen */}
          {ticketResult ? (
            <div className="space-y-3.5 text-center py-2 animate-in fade-in">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 text-xl font-black">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-black text-foreground">
                  {ticketResult.category === 'BUG' ? 'Bug Report Submitted' : ticketResult.category === 'FEATURE' ? 'Feature Request Submitted' : 'Escalation Ticket Logged'}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Dispatched directly to primary operations administrator and recorded in Ops Console:
                </p>
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 font-mono text-xs font-bold text-primary">
                  <span>📬</span> {ticketResult.routedEmail}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3 text-xs text-left space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tracking ID:</span>
                  <span className="font-mono font-bold text-foreground">{ticketResult.ticketNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="font-semibold text-foreground">
                    {ticketResult.category === 'BUG' ? '🐛 Bug / Screen Error' : ticketResult.category === 'FEATURE' ? '💡 Feature / Enhancement' : '🛡️ Ops Escalation'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Context Attached:</span>
                  <span className="font-semibold text-foreground">Role ({context.side || 'Buyer'}) · Route ({location.pathname})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">OPEN · Logged in Admin Console</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition min-h-[44px] mobile-touch-target"
              >
                Done
              </button>
            </div>
          ) : (
            /* Interactive Feedback Modal with Dual-Role Bug & Feature Toggles */
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Segmented Mode Selector Tabs */}
              <div
                role="tablist"
                aria-label="Feedback category"
                className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 border border-border/80"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'BUG'}
                  onClick={() => setActiveTab('BUG')}
                  data-testid="tab-report-bug"
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition min-h-[36px] ${
                    activeTab === 'BUG'
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>🐛</span>
                  <span className="truncate">Report a Bug</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'FEATURE'}
                  onClick={() => setActiveTab('FEATURE')}
                  data-testid="tab-request-feature"
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition min-h-[36px] ${
                    activeTab === 'FEATURE'
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>💡</span>
                  <span className="truncate">Feature Request</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'GENERAL'}
                  onClick={() => setActiveTab('GENERAL')}
                  data-testid="tab-general-support"
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition min-h-[36px] ${
                    activeTab === 'GENERAL'
                      ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>🛡️</span>
                  <span className="truncate">Ops / Help</span>
                </button>
              </div>

              {submitError && (
                <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-2.5 text-xs text-red-800 dark:text-red-300">
                  ⚠️ {submitError}
                </div>
              )}

              {/* TAB 1: REPORT A BUG */}
              {activeTab === 'BUG' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  {/* Severity Pill Selector */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Bug Severity / Impact:
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as SupportTicketPriority[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setBugSeverity(p)}
                          className={`rounded-lg border py-1.5 text-[11px] font-bold transition text-center min-h-[36px] ${
                            bugSeverity === p
                              ? p === 'CRITICAL'
                                ? 'border-red-500 bg-red-500 text-white shadow-xs'
                                : p === 'HIGH'
                                ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                                : 'border-primary bg-primary text-primary-foreground shadow-xs'
                              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {p === 'CRITICAL' ? '🔥 Critical' : p === 'HIGH' ? '⚡ High' : p === 'MEDIUM' ? 'Medium' : 'Low'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Bug Summary */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Bug Summary / Issue Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={bugSubject}
                      onChange={(e) => setBugSubject(e.target.value)}
                      placeholder="e.g., Quotation comparison discrepancy on mobile screen"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[40px]"
                    />
                  </div>

                  {/* Bug Description */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Description of the Issue <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={bugDescription}
                      onChange={(e) => setBugDescription(e.target.value)}
                      placeholder="What unexpected behavior occurred? Include any error codes or unexpected calculations..."
                      className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    />
                  </div>

                  {/* Reproduction Steps */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Steps to Reproduce (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={bugReproSteps}
                      onChange={(e) => setBugReproSteps(e.target.value)}
                      placeholder="1. Go to Orders tab&#10;2. Click on RFQ evaluation&#10;3. Tap finalize award button"
                      className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed font-mono"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: REQUEST A FEATURE / ENHANCEMENT */}
              {activeTab === 'FEATURE' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  {/* Feature Summary */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Feature / Enhancement Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={featureSubject}
                      onChange={(e) => setFeatureSubject(e.target.value)}
                      placeholder="e.g., Export RFQ evaluation ballot summary to CSV / PDF"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[40px]"
                    />
                  </div>

                  {/* Use Case */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Business Use Case / Problem to Solve <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={featureUseCase}
                      onChange={(e) => setFeatureUseCase(e.target.value)}
                      placeholder="Why is this feature needed? How would this improve your procurement workflow as a Buyer or Supplier?"
                      className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    />
                  </div>

                  {/* Suggested Improvement */}
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Suggested Solution / Improvement Specs
                    </label>
                    <textarea
                      rows={2}
                      value={featureImprovement}
                      onChange={(e) => setFeatureImprovement(e.target.value)}
                      placeholder="Describe how the feature should behave, UI placements, or suggested workflow..."
                      className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: GENERAL / OPS / SALES */}
              {activeTab === 'GENERAL' && (
                <div className="space-y-3 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Select Department:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setGeneralDepartment('OPS')}
                        className={`p-2.5 rounded-xl border text-xs text-left transition ${
                          generalDepartment === 'OPS'
                            ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="block font-bold">🛡️ Operations &amp; Escalations</span>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">Stuck transactions &amp; quorum mediation</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGeneralDepartment('SALES')}
                        className={`p-2.5 rounded-xl border text-xs text-left transition ${
                          generalDepartment === 'SALES'
                            ? 'border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <span className="block font-bold">💼 Commercial &amp; Onboarding</span>
                        <span className="text-[10px] text-muted-foreground block mt-0.5">Enterprise fleet tiers &amp; GST verification</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Subject / Topic <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={generalSubject}
                      onChange={(e) => setGeneralSubject(e.target.value)}
                      placeholder="e.g., Urgent mediation request for Order #PO-9821"
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[40px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-foreground mb-1">
                      Inquiry Details <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={generalDescription}
                      onChange={(e) => setGeneralDescription(e.target.value)}
                      placeholder="Describe your inquiry, order reference number, or dispute details..."
                      className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {/* Automatically Appended Context Metadata Bar */}
              <div className="rounded-xl bg-muted/40 border px-3 py-2 text-[10px] text-muted-foreground flex flex-wrap items-center justify-between gap-1">
                <span className="truncate max-w-[220px]">📍 {location.pathname}</span>
                <span>Role: <strong>{context.activeRole?.code || (context.isPlatformAdmin ? 'ADMIN' : context.side || 'BUYER')}</strong></span>
                <span className="text-[9px] text-muted-foreground font-mono">Metadata attached automatically ✓</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted min-h-[40px] mobile-touch-target"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition disabled:opacity-50 min-h-[40px] mobile-touch-target"
                >
                  {isSubmitting ? 'Submitting…' : activeTab === 'BUG' ? 'Submit Bug Report →' : activeTab === 'FEATURE' ? 'Submit Feature Request →' : 'Submit Escalation →'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

// Export alias for SupportFeedbackModal
export const SupportFeedbackModal = SupportHelpButtonModal;
