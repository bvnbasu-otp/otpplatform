import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HERO } from '../content/site-content';
import { VoiceRequirementDictation } from '@/features/intake/components/VoiceRequirementDictation';

export const REQUIREMENT_PROMPT_KEY = 'otp.requirement.prompt';

export function RequirementPrompt() {
  const navigate = useNavigate();
  const [text, setText] = useState('');

  function submit(customText?: string) {
    const trimmed = (customText ?? text).trim();
    if (trimmed) sessionStorage.setItem(REQUIREMENT_PROMPT_KEY, trimmed);
    navigate(trimmed ? `/requirements/new?q=${encodeURIComponent(trimmed)}` : '/requirements/new');
  }

  const handleVoiceTranscript = (dictated: string) => {
    setText(dictated);
    if (dictated.trim().length > 5) {
      submit(dictated);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      data-testid="requirement-prompt"
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="requirement-prompt" className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
          <span className="text-action">✨</span>
          <span>{HERO.prompt}</span>
        </label>
        <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
          <span>🎙️</span> Regional Voice (தமிழ் / हिन्दी / EN)
        </span>
      </div>

      <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:gap-2">
        <div className="relative flex-1 flex items-center">
          <input
            id="requirement-prompt"
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={HERO.promptExample}
            className="w-full rounded-lg border border-primary/30 bg-card px-3 py-2 sm:px-4 sm:py-2.5 pr-10 text-xs sm:text-sm placeholder:text-muted-foreground/70 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/20 shadow-2xs transition"
          />
          <div className="absolute right-1.5">
            <VoiceRequirementDictation
              compact
              onTranscript={handleVoiceTranscript}
            />
          </div>
        </div>

        <button
          type="submit"
          className="shrink-0 rounded-lg bg-action px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold text-action-foreground hover:bg-action-hover transition shadow-2xs flex items-center justify-center gap-1.5"
        >
          <span>Start Free</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
}
