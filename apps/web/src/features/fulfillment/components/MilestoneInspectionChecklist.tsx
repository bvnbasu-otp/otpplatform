import React, { useState } from 'react';
import {
  calculateInspectionScore,
  generateDigitalSignoffHash,
  isMilestoneInvoiceEligible,
  type InspectionItemCategory,
  type InspectionItemStatus,
  type InspectionType,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';

export interface MilestoneInspectionItemState {
  itemCode: string;
  category: InspectionItemCategory;
  description: string;
  status: InspectionItemStatus;
  score: number;
  notes: string;
  evidenceUrls: string[];
}

export interface MilestoneInspectionChecklistProps {
  workOrderId: string;
  milestoneId: string;
  milestoneTitle: string;
  targetPercentage: number;
  organizationId: string;
  isBuyerOrInspector: boolean;
  onInspectionCompleted?: () => void;
}

const DEFAULT_ITEMS: MilestoneInspectionItemState[] = [
  {
    itemCode: 'MAT-01',
    category: 'MATERIALS',
    description: 'Raw materials & components match approved technical specifications and bills of materials',
    status: 'PASSED',
    score: 95,
    notes: 'Certificates of origin and mill test sheets verified',
    evidenceUrls: [],
  },
  {
    itemCode: 'CMP-01',
    category: 'COMPLETION',
    description: 'Physical progress matches target stage deliverables and milestones without omissions',
    status: 'PASSED',
    score: 90,
    notes: 'Physical deliverables inspected on-site',
    evidenceUrls: [],
  },
  {
    itemCode: 'SFT-01',
    category: 'SAFETY',
    description: 'Workmanship conforms to mandatory safety, structural, and regulatory compliance standards',
    status: 'PASSED',
    score: 100,
    notes: 'Safety inspection check cleared without incident',
    evidenceUrls: [],
  },
  {
    itemCode: 'QLT-01',
    category: 'QUALITY',
    description: 'Tolerance levels, dimensional verification, and performance benchmarks satisfied',
    status: 'PASSED',
    score: 90,
    notes: 'Quality tolerance within +/- 0.5% boundary',
    evidenceUrls: [],
  },
  {
    itemCode: 'SPC-01',
    category: 'SPECIFICATION',
    description: 'Packaging, labeling, barcoding, and statutory documentation provided',
    status: 'PASSED',
    score: 95,
    notes: 'Documentation and barcode labels verified',
    evidenceUrls: [],
  },
];

export const MilestoneInspectionChecklist: React.FC<MilestoneInspectionChecklistProps> = ({
  workOrderId,
  milestoneId,
  milestoneTitle,
  targetPercentage,
  organizationId,
  isBuyerOrInspector,
  onInspectionCompleted,
}) => {
  const [inspectionType, setInspectionType] = useState<InspectionType>('PHYSICAL_ONSITE');
  const [items, setItems] = useState<MilestoneInspectionItemState[]>(DEFAULT_ITEMS);
  const [generalNotes, setGeneralNotes] = useState('');
  const [reworkReason, setReworkReason] = useState('');
  const [showReworkModal, setShowReworkModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approvedSignoffHash, setApprovedSignoffHash] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const scoreResult = calculateInspectionScore(items);
  const invoiceEligible = isMilestoneInvoiceEligible(
    approvedSignoffHash ? 'APPROVED' : 'SUBMITTED',
    approvedSignoffHash ? true : false,
  );

  const handleStatusChange = (index: number, newStatus: InspectionItemStatus) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = copy[index];
      if (item) {
        copy[index] = {
          ...item,
          status: newStatus,
          score: newStatus === 'PASSED' ? 95 : newStatus === 'FAILED' ? 40 : 75,
        };
      }
      return copy;
    });
  };

  const handleScoreChange = (index: number, newScore: number) => {
    setItems((prev) => {
      const copy = [...prev];
      const item = copy[index];
      if (item) {
        copy[index] = { ...item, score: newScore };
      }
      return copy;
    });
  };

  const handleApprove = async () => {
    setSubmitting(true);
    setStatusMessage(null);

    try {
      const userRes = await supabase.auth.getUser();
      const inspectorId = userRes.data.user?.id || 'usr-inspector-current';
      const timestampIso = new Date().toISOString();
      const salt = 'otp_prod_inspector_salt_2026';

      // Submit inspection first
      const { data: submitRes, error: submitErr } = await supabase.rpc('submit_milestone_inspection_atomic', {
        p_work_order_id: workOrderId,
        p_milestone_id: milestoneId,
        p_organization_id: organizationId,
        p_inspector_id: inspectorId,
        p_inspection_type: inspectionType,
        p_checklist_template_code: 'STD_MILESTONE_CHECKLIST_V1',
        p_items: items.map((i) => ({
          item_code: i.itemCode,
          category: i.category,
          description: i.description,
          status: i.status,
          score: i.score,
          evidence_urls: i.evidenceUrls,
          evidence_metadata: [],
          notes: i.notes,
        })),
        p_notes: generalNotes || null,
      });

      if (submitErr) throw submitErr;

      const inspectionId = submitRes.inspection_id;
      const signoffHash = generateDigitalSignoffHash(
        inspectionId,
        milestoneId,
        inspectorId,
        scoreResult.overallScore,
        timestampIso,
        salt,
      );

      // Approve inspection
      const { data: approveRes, error: approveErr } = await supabase.rpc('approve_milestone_inspection_atomic', {
        p_inspection_id: inspectionId,
        p_approver_id: inspectorId,
        p_digital_signoff_hash: signoffHash,
        p_notes: 'Digital inspection approval completed with verified checklist',
      });

      if (approveErr) throw approveErr;

      setApprovedSignoffHash(signoffHash);
      setStatusMessage({
        type: 'success',
        text: `Milestone inspection approved successfully! Progressive invoice eligibility unlocked (Sign-off Hash: ${signoffHash.substring(0, 16)}...).`,
      });

      if (onInspectionCompleted) onInspectionCompleted();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to approve milestone inspection' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!reworkReason.trim()) {
      setStatusMessage({ type: 'error', text: 'A rework reason is mandatory when requesting rework.' });
      return;
    }

    setSubmitting(true);
    setStatusMessage(null);

    try {
      const userRes = await supabase.auth.getUser();
      const inspectorId = userRes.data.user?.id || 'usr-inspector-current';

      // Submit inspection
      const { data: submitRes, error: submitErr } = await supabase.rpc('submit_milestone_inspection_atomic', {
        p_work_order_id: workOrderId,
        p_milestone_id: milestoneId,
        p_organization_id: organizationId,
        p_inspector_id: inspectorId,
        p_inspection_type: inspectionType,
        p_checklist_template_code: 'STD_MILESTONE_CHECKLIST_V1',
        p_items: items.map((i) => ({
          item_code: i.itemCode,
          category: i.category,
          description: i.description,
          status: i.status,
          score: i.score,
          evidence_urls: i.evidenceUrls,
          evidence_metadata: [],
          notes: i.notes,
        })),
        p_notes: generalNotes || null,
      });

      if (submitErr) throw submitErr;

      // Reject inspection
      const { error: rejectErr } = await supabase.rpc('reject_milestone_inspection_atomic', {
        p_inspection_id: submitRes.inspection_id,
        p_rejector_id: inspectorId,
        p_rework_reason: reworkReason,
        p_notes: generalNotes || null,
      });

      if (rejectErr) throw rejectErr;

      setShowReworkModal(false);
      setStatusMessage({
        type: 'success',
        text: 'Milestone rework request submitted. Supplier has been notified to rectify deficiencies.',
      });

      if (onInspectionCompleted) onInspectionCompleted();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to submit rework request' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">Progressive Milestone Inspection</h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
              {targetPercentage}% Milestone
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deliverable: <span className="font-semibold text-foreground">{milestoneTitle}</span>
          </p>
        </div>

        {/* Score Card */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Overall Score</span>
            <div className="text-lg font-black text-foreground">{scoreResult.overallScore}%</div>
          </div>
          <div
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${
              scoreResult.passed
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200'
            }`}
          >
            {scoreResult.passed ? '✓ PASSED' : '✕ DEFICIENT'}
          </div>
        </div>
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

      {/* Progressive Invoicing Indicator */}
      <div
        className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
          invoiceEligible || approvedSignoffHash
            ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
            : 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          <span>{invoiceEligible || approvedSignoffHash ? '🔓' : '🔒'}</span>
          <span>
            {invoiceEligible || approvedSignoffHash
              ? 'Progressive Invoicing: Unlocked & Eligible for Claim'
              : 'Progressive Invoicing: Locked (Requires Approved Milestone Quality Sign-Off)'}
          </span>
        </div>
        {approvedSignoffHash && (
          <span className="text-[10px] font-mono bg-emerald-200/60 dark:bg-emerald-900/60 px-2 py-0.5 rounded">
            Sign-off: {approvedSignoffHash.substring(0, 12)}...
          </span>
        )}
      </div>

      {/* Inspection Method Selection */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Inspection Method:</span>
        {(['PHYSICAL_ONSITE', 'DOCUMENT_VERIFICATION', 'REMOTE_AUDIT', 'THIRD_PARTY_QA'] as InspectionType[]).map(
          (m) => (
            <button
              key={m}
              type="button"
              onClick={() => setInspectionType(m)}
              disabled={!isBuyerOrInspector || !!approvedSignoffHash}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                inspectionType === m
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {m.replace(/_/g, ' ')}
            </button>
          ),
        )}
      </div>

      {/* Checklist Items Table */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Milestone Execution Checklist ({items.length} Points)
        </h4>

        <div className="space-y-2.5">
          {items.map((item, idx) => (
            <div
              key={item.itemCode}
              className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-bold text-foreground">
                    {item.itemCode}
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                    {item.category}
                  </span>
                </div>
                <p className="text-xs font-medium text-foreground">{item.description}</p>
                <p className="text-[11px] text-muted-foreground italic">{item.notes}</p>
              </div>

              {/* Status and Score Inputs */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Score:</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.score}
                    onChange={(e) => handleScoreChange(idx, Number(e.target.value))}
                    disabled={!isBuyerOrInspector || !!approvedSignoffHash}
                    className="w-14 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground font-mono"
                  />
                </div>

                <div className="flex items-center gap-1">
                  {(['PASSED', 'WARNING', 'FAILED'] as InspectionItemStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleStatusChange(idx, st)}
                      disabled={!isBuyerOrInspector || !!approvedSignoffHash}
                      className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                        item.status === st
                          ? st === 'PASSED'
                            ? 'bg-emerald-600 text-white'
                            : st === 'WARNING'
                              ? 'bg-amber-500 text-white'
                              : 'bg-rose-600 text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inspection Actions */}
      {isBuyerOrInspector && !approvedSignoffHash && (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => setShowReworkModal(true)}
            disabled={submitting}
            className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-900 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          >
            Request Rework / Reject
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={submitting || !scoreResult.passed}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Signing Off...' : '✓ Sign-Off & Approve Milestone'}
          </button>
        </div>
      )}

      {/* Rework Reason Modal */}
      {showReworkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Request Milestone Rework</h3>
            <p className="text-xs text-muted-foreground">
              Please specify the quality defects or missing deliverable components required for supplier rectification.
            </p>

            <div>
              <label className="text-xs font-semibold text-foreground">Rework Reason (Mandatory)</label>
              <textarea
                rows={4}
                value={reworkReason}
                onChange={(e) => setReworkReason(e.target.value)}
                placeholder="Detail the technical deviations or missing items..."
                className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowReworkModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={submitting || !reworkReason.trim()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Rework Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
