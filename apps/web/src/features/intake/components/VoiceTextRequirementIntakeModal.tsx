import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { VoiceRequirementDictation } from './VoiceRequirementDictation';
import { REQUIREMENT_PROMPT_KEY } from '@/features/site/components/RequirementPrompt';

export interface VoiceTextRequirementIntakeModalProps {
  open: boolean;
  onClose: () => void;
}

const TEMPLATE_CHIPS = [
  '10 HP Submersible Borewell Motor Rewind',
  'Annual HVAC Air Conditioning Maintenance',
  'CNC Machined Steel Flanges (500 units)',
  'Terrace Waterproofing & Elastomeric Coating',
];

export function VoiceTextRequirementIntakeModal({
  open,
  onClose,
}: VoiceTextRequirementIntakeModalProps) {
  const navigate = useNavigate();
  const [promptText, setPromptText] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleVoiceTranscript = (dictated: string) => {
    setPromptText(dictated);
    setPermissionError(null);
  };

  const handlePermissionError = (errorMsg: string) => {
    setPermissionError(errorMsg);
    // Instant auto-focus on the text input area
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleLaunchIntake = (customText?: string) => {
    const textToSubmit = (customText ?? promptText).trim();
    if (textToSubmit) {
      sessionStorage.setItem(REQUIREMENT_PROMPT_KEY, textToSubmit);
      navigate(`/intake?q=${encodeURIComponent(textToSubmit)}`);
    } else {
      navigate('/intake');
    }
    onClose();
  };

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/15 text-primary font-black text-sm">
            🎙️
          </span>
          <span className="font-extrabold text-foreground text-sm">
            Post New Requirement / RFQ
          </span>
        </div>
      }
      subtitle="Speak or type your requirement in Tamil, Hindi, or English to start competitive quoting."
      className="sm:max-w-lg"
    >
      <div className="space-y-4 text-xs" data-testid="voice-text-intake-modal">
        {/* Permission Guidance Banner when mic permission denied or unsupported */}
        {permissionError && (
          <div
            data-testid="voice-permission-guidance"
            className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 animate-in fade-in-50"
          >
            <span className="text-base shrink-0 mt-0.5">🔒</span>
            <div className="space-y-1 min-w-0">
              <p className="font-bold text-[11px]">Microphone Permission Required</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                Click the microphone icon in your browser address bar to enable, or simply type your requirement below.
              </p>
            </div>
          </div>
        )}

        {/* Voice & Plain-Text Input Area */}
        <div className="rounded-2xl border-2 border-primary/40 bg-card p-3.5 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <label
              htmlFor="modal-intake-input"
              className="text-[11px] font-bold text-foreground flex items-center gap-1.5"
            >
              <span>✨</span> Describe what you need:
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground font-semibold">
                Voice Dictation:
              </span>
              <VoiceRequirementDictation
                compact
                onTranscript={handleVoiceTranscript}
                onPermissionError={handlePermissionError}
              />
            </div>
          </div>

          <textarea
            id="modal-intake-input"
            ref={textareaRef}
            rows={3}
            value={promptText}
            onChange={(e) => {
              setPromptText(e.target.value);
              if (permissionError) setPermissionError(null);
            }}
            placeholder="e.g. 10 HP submersible motor rewinding in Coimbatore within 3 days with 6-month warranty..."
            className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-medium text-foreground resize-none leading-relaxed focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
          />

          {/* Quick Template Chips */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Popular Template Intakes:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setPromptText(chip)}
                  className="rounded-lg bg-muted/60 hover:bg-muted border border-border/70 px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition text-left"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border bg-card text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition mobile-touch-target"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleLaunchIntake()}
            data-testid="modal-launch-rfq-btn"
            className="flex-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-xs hover:bg-primary/90 transition flex items-center justify-center gap-1.5 mobile-touch-target"
          >
            <span>Proceed to RFQ Builder</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
