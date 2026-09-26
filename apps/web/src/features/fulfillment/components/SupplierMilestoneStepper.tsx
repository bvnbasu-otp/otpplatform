import React, { useState } from 'react';
import { formatMoney, type WorkOrderSummary } from '../types/fulfillment';
import { StatusBadge } from './FulfillmentStatus';

export interface MilestoneDef {
  id: number;
  title: string;
  stageName: string;
  payoutPercent: number;
  description: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  completedDate?: string | null;
  requiresInspection?: boolean;
}

interface SupplierMilestoneStepperProps {
  workOrder: WorkOrderSummary;
  totalAmount: number;
  currency?: string;
  role: 'buyer' | 'supplier';
  onUpdateProgress: (percent: number) => Promise<void>;
  busy?: boolean;
}

export function SupplierMilestoneStepper({
  workOrder,
  totalAmount,
  currency = 'INR',
  role,
  onUpdateProgress,
  busy = false,
}: SupplierMilestoneStepperProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [attachmentNote, setAttachmentNote] = useState<string>('');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ name: string; size: string; time: string }>>([]);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [markCompleteOnSave, setMarkCompleteOnSave] = useState(false);

  const currentPercent = workOrder.progressPercent || 0;

  // 4 Execution Milestones
  const milestones: MilestoneDef[] = [
    {
      id: 1,
      title: 'Milestone 1: Advance / Kickoff & Mobilization',
      stageName: 'Kickoff & Mobilization',
      payoutPercent: 20,
      description: 'Order confirmed, project kickoff complete, material requisition initiated.',
      status: currentPercent >= 25 ? 'COMPLETED' : 'IN_PROGRESS',
      completedDate: currentPercent >= 25 ? 'Verified' : undefined,
    },
    {
      id: 2,
      title: 'Milestone 2: Material Dispatch & In-Transit',
      stageName: 'Dispatch & Transit',
      payoutPercent: 40,
      description: 'Goods/assemblies dispatched from factory with valid LR/e-Way bill & tracking.',
      status: currentPercent >= 50 ? 'COMPLETED' : currentPercent >= 25 ? 'IN_PROGRESS' : 'PENDING',
      completedDate: currentPercent >= 50 ? 'Verified' : undefined,
    },
    {
      id: 3,
      title: 'Milestone 3: Installation & QA Inspection',
      stageName: 'Installation & QA',
      payoutPercent: 30,
      description: 'On-site installation, testing parameters verified, site staging photos uploaded.',
      status: currentPercent >= 75 ? 'COMPLETED' : currentPercent >= 50 ? 'IN_PROGRESS' : 'PENDING',
      completedDate: currentPercent >= 75 ? 'Verified' : undefined,
      requiresInspection: true,
    },
    {
      id: 4,
      title: 'Milestone 4: Final Acceptance & Warranty Sign-off',
      stageName: 'Acceptance & Retention',
      payoutPercent: 10,
      description: '100% mutual sign-off by buyer, test certificates delivered, warranty activated.',
      status: currentPercent >= 100 && workOrder.buyerAcceptedAt ? 'COMPLETED' : currentPercent >= 75 ? 'IN_PROGRESS' : 'PENDING',
      completedDate: workOrder.buyerAcceptedAt ? 'Signed off' : undefined,
      requiresInspection: true,
    },
  ];

  const handleAddMockAttachment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachmentNote.trim()) return;
    setAttachedFiles((prev) => [
      ...prev,
      {
        name: attachmentNote.trim().endsWith('.jpg') || attachmentNote.trim().endsWith('.pdf') ? attachmentNote.trim() : `${attachmentNote.trim()}.jpg`,
        size: '1.2 MB',
        time: 'Just now',
      },
    ]);
    if (markCompleteOnSave && currentPercent < 100) {
      void onUpdateProgress(100);
    }
    setAttachmentNote('');
    setShowAttachModal(false);
  };

  return (
    <div className="space-y-4" data-testid="supplier-milestone-stepper">
      {/* High-Impact Milestone Progress Header */}
      <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              Execution Progress
            </span>
            <h3 className="text-sm font-black text-foreground">
              {currentPercent}% Work Scope Executed
            </h3>
          </div>
          <StatusBadge status={workOrder.status} />
        </div>

        {/* Interactive 0-100% (25% increments) Stepped Progress Bar */}
        <div className="space-y-2">
          <div className="relative pt-2 pb-1">
            {/* Background Track */}
            <div className="h-3 w-full rounded-full bg-muted border overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  currentPercent >= 100
                    ? 'bg-emerald-600'
                    : currentPercent >= 75
                    ? 'bg-lime-500'
                    : currentPercent >= 50
                    ? 'bg-blue-600'
                    : currentPercent >= 25
                    ? 'bg-amber-500'
                    : 'bg-slate-300'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, currentPercent))}%` }}
              />
            </div>

            {/* 5 Step Checkpoint Markers (0%, 25%, 50%, 75%, 100%) */}
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-0.5 pointer-events-none">
              {[0, 25, 50, 75, 100].map((step) => {
                const isPassed = currentPercent >= step;
                const isCurrent = currentPercent === step;
                return (
                  <button
                    key={step}
                    type="button"
                    disabled={busy || workOrder.status === 'COMPLETED'}
                    onClick={() => onUpdateProgress(step)}
                    title={`Record progress at ${step}%`}
                    aria-label={`Record progress at ${step}%`}
                    className={`pointer-events-auto w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all cursor-pointer shadow-xs focus:outline-hidden focus:ring-2 focus:ring-primary ${
                      isCurrent
                        ? 'border-primary bg-background ring-2 ring-primary/40 scale-110'
                        : isPassed
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-muted-foreground/30 bg-card hover:border-primary/60'
                    } ${busy || workOrder.status === 'COMPLETED' ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {isPassed && step > 0 ? (
                      <span className="text-[10px] font-black leading-none">✓</span>
                    ) : (
                      <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stepped Scale Labels (0%, 25%, 50%, 75%, 100%) */}
          <div className="flex justify-between text-[11px] font-bold text-muted-foreground px-0.5">
            {[
              { val: 0, label: '0% Start' },
              { val: 25, label: '25% M1' },
              { val: 50, label: '50% M2' },
              { val: 75, label: '75% M3' },
              { val: 100, label: '100% Done' },
            ].map((s) => (
              <button
                key={s.val}
                type="button"
                disabled={busy || workOrder.status === 'COMPLETED'}
                onClick={() => onUpdateProgress(s.val)}
                className={`transition hover:text-foreground text-center ${
                  currentPercent === s.val ? 'text-primary font-black scale-105' : ''
                } ${busy || workOrder.status === 'COMPLETED' ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 1-Tap Quick Action Progress Bar Buttons (0%, 25%, 50%, 75%, 100%) */}
        {workOrder.status !== 'COMPLETED' && (
          <div className="pt-2 border-t space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              Record Execution Milestone (25% increments):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onUpdateProgress(0)}
                className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-bold transition flex flex-col items-center justify-center border mobile-touch-target ${
                  currentPercent === 0
                    ? 'bg-slate-700 text-white border-slate-800 shadow-xs'
                    : 'bg-muted/40 border-border text-foreground hover:bg-muted'
                }`}
              >
                <span>0% Pending</span>
                <span className="text-[10px] opacity-70">Kickoff</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onUpdateProgress(25)}
                className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-bold transition flex flex-col items-center justify-center border mobile-touch-target ${
                  currentPercent === 25
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 hover:bg-amber-100'
                }`}
              >
                <span>25% Mobilize</span>
                <span className="text-[10px] opacity-80">M1 (20% ₹)</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onUpdateProgress(50)}
                className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-bold transition flex flex-col items-center justify-center border mobile-touch-target ${
                  currentPercent === 50
                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                    : 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200 hover:bg-blue-100'
                }`}
              >
                <span>50% Dispatch</span>
                <span className="text-[10px] opacity-80">M2 (40% ₹)</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onUpdateProgress(75)}
                className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-bold transition flex flex-col items-center justify-center border mobile-touch-target ${
                  currentPercent === 75
                    ? 'bg-lime-600 text-white border-lime-700 shadow-xs'
                    : 'bg-lime-50 dark:bg-lime-950/40 border-lime-300 dark:border-lime-800 text-lime-900 dark:text-lime-200 hover:bg-lime-100'
                }`}
              >
                <span>75% Installed</span>
                <span className="text-[10px] opacity-80">M3 (30% ₹)</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => onUpdateProgress(100)}
                className={`min-h-[44px] rounded-xl px-2 py-2 text-xs font-black transition flex flex-col items-center justify-center border mobile-touch-target ${
                  currentPercent >= 100
                    ? 'bg-emerald-700 text-white border-emerald-800 shadow-xs'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700'
                }`}
              >
                <span>✓ 100% Done</span>
                <span className="text-[10px] opacity-90">M4 (10% ₹)</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vertical Visual Milestone Stepper */}
      <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
              Execution &amp; Settlement Stepper
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Direct linkage between milestone completion, inspection sign-off, and escrow release.
            </p>
          </div>
          <span className="text-[10px] font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
            4 Milestones
          </span>
        </div>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-border">
          {milestones.map((m) => {
            const milestoneValue = Math.round((totalAmount * m.payoutPercent) / 100);
            const isDone = m.status === 'COMPLETED';
            const isActive = m.status === 'IN_PROGRESS';

            return (
              <div key={m.id} className="relative group">
                {/* Stepper Bullet */}
                <div
                  className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black border transition ${
                    isDone
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                      : isActive
                      ? 'bg-primary text-primary-foreground border-primary ring-4 ring-primary/20 animate-pulse'
                      : 'bg-card text-muted-foreground border-border'
                  }`}
                >
                  {isDone ? '✓' : m.id}
                </div>

                {/* Milestone Card Body */}
                <div
                  className={`rounded-xl border p-3 transition space-y-1.5 ${
                    isActive
                      ? 'border-primary/50 bg-primary/5 shadow-2xs'
                      : isDone
                      ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                      : 'border-border/60 bg-muted/20 opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-xs font-extrabold text-foreground">
                      {m.title}
                    </span>
                    <span className="font-mono text-xs font-bold text-primary">
                      {formatMoney(milestoneValue, currency)} ({m.payoutPercent}%)
                    </span>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {m.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px]">
                    <span
                      className={`font-bold px-2 py-0.5 rounded-md ${
                        isDone
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                          : isActive
                          ? 'bg-primary/20 text-primary font-extrabold'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isDone ? '✓ Completed & Verified' : isActive ? '⚡ Active Execution' : '⏳ Pending Prior Step'}
                    </span>

                    {m.requiresInspection && (
                      <span className="text-muted-foreground font-medium flex items-center gap-1">
                        <span>🔍</span> Requires On-Site QA
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Photo & Inspection Report Attachment Trigger */}
      <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <span>📸</span>
              <span>Photo &amp; Inspection Evidence</span>
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Attach on-site proof, dispatch bills (LR/e-Way), and calibration test reports.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowAttachModal(true)}
              className="min-h-[44px] rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 active:scale-98 transition flex items-center gap-1.5 mobile-touch-target"
            >
              <span>📸</span>
              <span>Mark Ready for Delivery &amp; Upload Slip →</span>
            </button>
            {currentPercent < 100 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onUpdateProgress(100)}
                className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3.5 py-2 text-xs shadow-xs transition flex items-center gap-1.5 mobile-touch-target"
              >
                <span>📦</span>
                <span>Confirm Delivery (100%) →</span>
              </button>
            )}
          </div>
        </div>

        {/* Evidence List */}
        {attachedFiles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
            No milestone execution evidence or dispatch receipts uploaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {attachedFiles.map((f, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border/80 bg-muted/20 p-2.5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">📄</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">{f.size} · {f.time}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(f.name)}
                  className="text-xs font-bold text-primary hover:underline shrink-0 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center mobile-touch-target"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal / Dialog for New Evidence Upload */}
      {showAttachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>📎</span> Attach Inspection &amp; Dispatch Proof
              </h3>
              <button
                type="button"
                onClick={() => setShowAttachModal(false)}
                className="p-1 rounded-lg text-muted-foreground hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMockAttachment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Document / Photo Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={attachmentNote}
                  onChange={(e) => setAttachmentNote(e.target.value)}
                  placeholder="e.g. In-Transit Dispatch LR or Staging Photo"
                  className="w-full rounded-xl border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary focus:outline-none min-h-[44px]"
                />
              </div>

              <div className="rounded-xl border border-dashed border-border p-4 text-center space-y-1 bg-muted/10">
                <span className="text-2xl block">📷</span>
                <p className="text-xs font-bold text-foreground">Tap to take photo or upload document</p>
                <p className="text-[10px] text-muted-foreground">Supported: JPG, PNG, PDF (Up to 15MB)</p>
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/20 p-2.5 text-xs cursor-pointer min-h-[44px] mobile-touch-target">
                <input
                  type="checkbox"
                  checked={markCompleteOnSave}
                  onChange={(e) => setMarkCompleteOnSave(e.target.checked)}
                  className="h-4 w-4 rounded text-primary focus:ring-primary shrink-0"
                />
                <span className="font-semibold text-foreground text-[11px] leading-snug">
                  ✓ Mark progress at 100% and notify buyer for on-site inspection
                </span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAttachModal(false)}
                  className="min-h-[44px] rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90"
                >
                  Save Attachment ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Photo Preview Viewer Dialog */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold text-foreground truncate">{selectedPhoto}</span>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 rounded-lg text-muted-foreground hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="h-48 rounded-xl bg-muted/30 border flex flex-col items-center justify-center text-muted-foreground text-xs p-4 text-center space-y-2">
              <span className="text-4xl">🖼️</span>
              <p className="font-semibold text-foreground">{selectedPhoto}</p>
              <p className="text-[10px] text-muted-foreground">Cryptographically timestamped &amp; sealed on OTP ledger.</p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="w-full min-h-[44px] rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
