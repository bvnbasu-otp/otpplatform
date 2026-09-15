import { AttachmentScope } from '@otp/domain';
import { Button, Card } from '@/components/ui';
import { AttachmentUploader } from '@/features/attachments';
import type { IntakeDraft } from '../../types/intake-draft';

export interface AttachmentsStepProps {
  draft: IntakeDraft;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}

export function AttachmentsStep({
  draft,
  isBusy,
  onBack,
  onSubmit,
}: AttachmentsStepProps) {
  return (
    <div className="space-y-4" data-testid="attachments-step">
      <Card
        title="Drawings, BoQ & Attachments (Optional)"
        description="Upload technical drawings (CAD/PDF), BoQ spreadsheets, spec sheets, or site photos to clarify your requirement."
      >
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-primary">
            <span>🔒</span> 100% Identity-Protected Uploads:
          </div>
          <p className="text-muted-foreground leading-relaxed">
            All files are stripped of metadata and company headers before sharing. Invited suppliers only see anonymized titles like <em>&ldquo;Drawing 1&rdquo;</em>, <em>&ldquo;Specification 1&rdquo;</em>, or <em>&ldquo;Site Photo 1&rdquo;</em>.
          </p>
        </div>

        {/* Dedicated Attachment Uploader */}
        <AttachmentUploader
          scope={AttachmentScope.REQUIREMENT}
          requirementId={draft.requirementId}
          disabled={isBusy}
          label="Drop drawings, BoQ files, or photos here"
          hint="Supports PDF, CAD/DWG, Excel/CSV, JPG, PNG up to 25MB"
          allowVoiceNote={true}
        />

        <div className="mt-4 rounded-lg bg-muted/40 p-3 text-center text-xs text-muted-foreground border border-dashed">
          💡 <strong>No files to upload?</strong> You can skip this step and proceed directly to Review &amp; Publish.
        </div>

        <div className="mt-5 pt-3 border-t border-border/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <Button variant="ghost" onClick={onBack} className="min-h-[44px]">
            ← Back to Specifications
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            busy={isBusy}
            busyLabel="Processing…"
            className="min-h-[46px] w-full sm:w-auto font-bold text-xs sm:text-sm shadow-xs"
          >
            Continue to Review &amp; Publish →
          </Button>
        </div>
      </Card>
    </div>
  );
}
