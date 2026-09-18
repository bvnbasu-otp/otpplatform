import React, { useState } from 'react';
import {
  calculateDisputeSlaDeadline,
  isSlaBreached,
  canEscalateDispute,
  type DisputeCategory,
  type DisputeEntityType,
  type DisputeResolutionCategory,
  type DisputeSeverity,
  type DisputeStatus,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';

export interface DisputeResolutionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: DisputeEntityType;
  entityId: string;
  entityTitle: string;
  organizationId: string;
  counterpartyOrganizationId?: string | null;
  existingDisputeId?: string | null;
  onDisputeUpdated?: () => void;
}

const CATEGORY_OPTIONS: Array<{ category: DisputeCategory; label: string }> = [
  { category: 'QUALITY_DEFICIENCY', label: 'Quality & Workmanship Deficiency' },
  { category: 'DELIVERY_DELAY', label: 'Delivery Schedule Delay' },
  { category: 'NON_PERFORMANCE', label: 'Non-Performance / Abandonment' },
  { category: 'SPEC_DEVIATION', label: 'Specification & Scope Deviation' },
  { category: 'BILLING_DISCREPANCY', label: 'Billing & Quantity Discrepancy' },
  { category: 'MILESTONE_REJECTION', label: 'Milestone Sign-Off Disagreement' },
  { category: 'PAYMENT_SHORTAGE', label: 'Payment / Settlement Shortage' },
  { category: 'UNAUTHORIZED_ALTERATION', label: 'Unauthorized Scope Alteration' },
];

const SEVERITY_OPTIONS: Array<{ severity: DisputeSeverity; label: string; slaHours: number }> = [
  { severity: 'CRITICAL', label: 'Critical (24h SLA)', slaHours: 24 },
  { severity: 'HIGH', label: 'High Priority (48h SLA)', slaHours: 48 },
  { severity: 'MEDIUM', label: 'Medium Priority (72h SLA)', slaHours: 72 },
  { severity: 'LOW', label: 'Low Priority (120h SLA)', slaHours: 120 },
];

const RESOLUTION_CATEGORIES: Array<{ category: DisputeResolutionCategory; label: string }> = [
  { category: 'NO_ACTION_REQUIRED', label: 'No Action Required (Claim Withdrawn)' },
  { category: 'REWORK_AGREED', label: 'Supplier Rework Agreed' },
  { category: 'PRICE_ADJUSTMENT_MUTUAL', label: 'Mutual Price Adjustment Agreed' },
  { category: 'CHANGE_ORDER_ISSUED', label: 'Formal Change Order Issued' },
  { category: 'TERMINATION_SETTLED', label: 'Mutual Termination & Final Settlement' },
  { category: 'CLAIM_REJECTED', label: 'Claim Rejected Following Review' },
];

export const DisputeResolutionDrawer: React.FC<DisputeResolutionDrawerProps> = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityTitle,
  organizationId,
  counterpartyOrganizationId,
  existingDisputeId,
  onDisputeUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'EVENTS' | 'RESOLUTION'>('DETAILS');
  const [category, setCategory] = useState<DisputeCategory>('QUALITY_DEFICIENCY');
  const [severity, setSeverity] = useState<DisputeSeverity>('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [disputedAmount, setDisputedAmount] = useState<number>(0);
  const [escalationReason, setEscalationReason] = useState('');
  const [resolutionCategory, setResolutionCategory] = useState<DisputeResolutionCategory>('REWORK_AGREED');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleOpenDispute = async () => {
    if (!title.trim() || !description.trim()) {
      setStatusMessage({ type: 'error', text: 'Title and description are required to open a dispute.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const userRes = await supabase.auth.getUser();
      const openedBy = userRes.data.user?.id || 'usr-current';

      const { data, error } = await supabase.rpc('open_dispute_atomic', {
        p_organization_id: organizationId,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_category: category,
        p_severity: severity,
        p_title: title,
        p_description: description,
        p_opened_by: openedBy,
        p_counterparty_organization_id: counterpartyOrganizationId || null,
        p_disputed_amount: disputedAmount || 0,
        p_currency: 'INR',
      });

      if (error) throw error;

      setStatusMessage({
        type: 'success',
        text: `Dispute opened successfully (${data.dispute_number}). SLA deadline: ${new Date(data.sla_deadline).toLocaleString()}.`,
      });

      if (onDisputeUpdated) onDisputeUpdated();
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to open dispute' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalate = async (disputeId: string) => {
    if (!escalationReason.trim()) {
      setStatusMessage({ type: 'error', text: 'Escalation reason is mandatory.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const userRes = await supabase.auth.getUser();
      const actorId = userRes.data.user?.id || 'usr-current';

      const { data, error } = await supabase.rpc('escalate_dispute_atomic', {
        p_dispute_id: disputeId,
        p_actor_id: actorId,
        p_actor_role: 'BUYER',
        p_reason: escalationReason,
      });

      if (error) throw error;

      setStatusMessage({
        type: 'success',
        text: `Dispute escalated to Level ${data.escalation_level}. SLA updated.`,
      });

      if (onDisputeUpdated) onDisputeUpdated();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to escalate dispute' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async (disputeId: string) => {
    if (!resolutionSummary.trim()) {
      setStatusMessage({ type: 'error', text: 'Resolution summary is mandatory.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const userRes = await supabase.auth.getUser();
      const resolvedBy = userRes.data.user?.id || 'usr-current';

      const { data, error } = await supabase.rpc('resolve_dispute_atomic', {
        p_dispute_id: disputeId,
        p_resolved_by: resolvedBy,
        p_actor_role: 'BUYER',
        p_resolution_category: resolutionCategory,
        p_resolution_summary: resolutionSummary,
      });

      if (error) throw error;

      setStatusMessage({
        type: 'success',
        text: 'Dispute marked as RESOLVED. Audit event recorded.',
      });

      if (onDisputeUpdated) onDisputeUpdated();
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to resolve dispute' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-card border-l border-border p-6 shadow-2xl flex flex-col justify-between">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Dispute &amp; Exception Resolution</h2>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  {entityType}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Target Entity: <span className="font-semibold text-foreground">{entityTitle}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              ✕
            </button>
          </div>

          {/* Non-Custodial Safety Disclaimer Banner */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200 space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <span>🛡️</span> Non-Custodial Exception Governance
            </div>
            <p className="text-[11px] leading-snug">
              Dispute records establish structured negotiation, SLA accountability, and evidence preservation. Disputes
              do not automatically alter payment ledgers without separate explicit commercial authorization.
            </p>
          </div>

          {statusMessage && (
            <div
              className={`rounded-xl p-3 text-xs font-semibold ${
                statusMessage.type === 'success'
                  ? 'border border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          {/* Form Content */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-foreground">Dispute Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DisputeCategory)}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Severity &amp; SLA Commitment</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {SEVERITY_OPTIONS.map((s) => (
                  <button
                    key={s.severity}
                    type="button"
                    onClick={() => setSeverity(s.severity)}
                    className={`rounded-xl border p-2.5 text-left text-xs transition-colors ${
                      severity === s.severity
                        ? 'border-primary bg-primary/10 font-bold text-primary'
                        : 'border-border bg-muted/20 text-muted-foreground'
                    }`}
                  >
                    <div className="font-semibold">{s.severity}</div>
                    <div className="text-[10px] mt-0.5">{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Dispute Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of the issue..."
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Disputed Monetary Amount (INR)</label>
              <input
                type="number"
                min="0"
                value={disputedAmount}
                onChange={(e) => setDisputedAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Detailed Description &amp; Deficiencies</label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide comprehensive details of the non-conformance, milestone deviation, or billing discrepancy..."
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOpenDispute}
            disabled={submitting || !title.trim() || !description.trim()}
            className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
          >
            {submitting ? 'Opening...' : 'Open Structured Dispute'}
          </button>
        </div>
      </div>
    </div>
  );
};
