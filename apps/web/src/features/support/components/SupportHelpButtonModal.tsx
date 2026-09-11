import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { createSupportTicket } from '@/features/admin/api/admin-ops';
import type { SupportTicketCategory, SupportTicketPriority } from '@/features/admin/types/admin';

interface CategoryOption {
  value: SupportTicketCategory;
  email: string;
  label: string;
  icon: string;
  description: string;
}

const ROUTED_ADMIN_EMAIL = 'bvnbasu@gmail.com';

const CATEGORIES: CategoryOption[] = [
  {
    value: 'BUG',
    email: ROUTED_ADMIN_EMAIL,
    label: 'Report a Bug / Error',
    icon: '🐛',
    description: 'Glitch, calculation discrepancy, or screen issue.',
  },
  {
    value: 'FEATURE',
    email: ROUTED_ADMIN_EMAIL,
    label: 'Feature / Enhancement',
    icon: '💡',
    description: 'Suggest improvements, enhancements, or new capabilities.',
  },
  {
    value: 'SALES',
    email: ROUTED_ADMIN_EMAIL,
    label: 'Sales & Onboarding',
    icon: '💼',
    description: 'Fleet tiers, commercial contracts, or onboarding.',
  },
  {
    value: 'OPS',
    email: ROUTED_ADMIN_EMAIL,
    label: 'Operations & Escalations',
    icon: '🛡️',
    description: 'Stuck transaction, quorum unlock, or urgent escalation.',
  },
];

export function SupportHelpButtonModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<SupportTicketCategory>('BUG');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<SupportTicketPriority>('MEDIUM');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketResult, setTicketResult] = useState<{
    ticketNumber: string;
    routedEmail: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const { context } = useRoleContext();
  const location = useLocation();

  const selectedCat = CATEGORIES.find((c) => c.value === category) || CATEGORIES[0]!;

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await createSupportTicket({
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        pageUrl: window.location.href,
        userEmail: context.profileId
          ? `${context.activeRole?.code.toLowerCase() || 'user'}@buyer-portal.test`
          : 'user@otp.test',
        userRole: context.activeRole?.label || 'Buyer/Supplier Member',
        userSide: context.side || 'PORTAL',
      });

      if (res.ok && res.ticketNumber) {
        setTicketResult({
          ticketNumber: res.ticketNumber,
          routedEmail: res.routedEmail || selectedCat.email,
        });
      } else {
        alert(res.error || 'Failed to submit support request');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setTicketResult(null);
    setSubject('');
    setDescription('');
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Universal Header Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition shadow-2xs ${
          isOpen
            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
            : 'border-border bg-card/90 text-foreground hover:bg-muted hover:text-primary'
        }`}
        title="Reach OTP Support & Ops Team"
        aria-expanded={isOpen}
      >
        <span>💬</span>
        <span className="hidden sm:inline">Help &amp; Support</span>
      </button>

      {/* Mobile Backdrop Overlay to prevent background touches and scroll bleed */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs sm:hidden"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Responsive Dropdown / Mobile Centered Window */}
      {isOpen && (
        <div className="fixed inset-x-2.5 top-16 sm:absolute sm:inset-auto sm:right-0 sm:top-full mt-2 w-auto sm:w-[480px] max-w-[calc(100vw-1.25rem)] sm:max-w-[480px] max-h-[calc(100vh-5rem)] sm:max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-4">
          {/* Popover Header */}
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">💬</span>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  Reach OTP Ops &amp; Support Team
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Automated dispatch to <strong className="text-foreground">bvnbasu@gmail.com</strong> &amp; Ops Console.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground text-xs font-bold p-1.5 rounded-md hover:bg-muted"
              title="Close window"
            >
              ✕
            </button>
          </div>

          {/* Ticket Success Confirmation Screen */}
          {ticketResult ? (
            <div className="space-y-3.5 text-center py-2 animate-in fade-in">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-xl font-bold">
                ✓
              </div>
              <div>
                <h4 className="text-sm font-black text-foreground">Support Ticket Logged</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Dispatched directly to primary administrator and recorded in Ops Console:
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
                  <span className="text-muted-foreground">Category:</span>
                  <span className="font-semibold text-foreground">{selectedCat.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destination:</span>
                  <span className="font-mono font-bold text-primary">{ticketResult.routedEmail}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="font-semibold text-emerald-600">OPEN · Logged in Admin Console</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="w-full rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition"
              >
                Close Window
              </button>
            </div>
          ) : (
            /* Support Request Form */
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Category Radio Grid */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">
                  Select Department / Mailbox:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className={`text-left p-2.5 rounded-xl border text-xs transition ${
                        category === cat.value
                          ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                          : 'border-border bg-card hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-foreground">
                        <span className="flex items-center gap-1.5">
                          <span>{cat.icon}</span> {cat.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                        {cat.description}
                      </p>
                      <span className="text-[10px] font-mono text-primary font-semibold block mt-1 truncate">
                        📬 {cat.email}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Subject / Summary:
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Quotation evaluation stuck or UI enhancement request"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm sm:text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Problem Statement Textarea */}
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Details &amp; Description:
                </label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened, steps to reproduce, or the feature/enhancement you'd like added..."
                  className="w-full rounded-lg border bg-background p-2.5 text-sm sm:text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
                />
              </div>

              {/* Priority & Route Info */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-foreground">Priority:</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
                    className="rounded-lg border bg-background px-2.5 py-1 text-xs text-foreground font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical 🔥</option>
                  </select>
                </div>

                <span className="text-[11px] font-mono font-bold text-primary">
                  📬 {selectedCat.email}
                </span>
              </div>

              {/* Context Line */}
              <div className="rounded-lg bg-muted/40 border px-2.5 py-1.5 text-[10px] text-muted-foreground flex items-center justify-between">
                <span className="truncate max-w-[200px]">📍 {location.pathname}</span>
                <span>Role: <strong>{context.activeRole?.code || 'USER'}</strong></span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !subject.trim() || !description.trim()}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting…' : `Submit to ${selectedCat.email} →`}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
