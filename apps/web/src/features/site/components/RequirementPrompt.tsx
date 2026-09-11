/**
 * The first interaction: one question, one box.
 *
 * A "Create requirement" button asks the visitor to accept an unknown amount of
 * work before they learn anything. A box they can type a sentence into asks for
 * the one thing they already know, and hands it to the intake wizard so the
 * first screen there is confirmation rather than a blank form.
 *
 * The text is stashed before navigating because someone without a session is
 * sent to the buyer door on the way in, and the query string does not survive
 * that trip.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HERO } from '../content/site-content';

export const REQUIREMENT_PROMPT_KEY = 'otp.requirement.prompt';

export function RequirementPrompt() {
  const navigate = useNavigate();
  const [text, setText] = useState('');

  function submit() {
    const trimmed = text.trim();
    if (trimmed) sessionStorage.setItem(REQUIREMENT_PROMPT_KEY, trimmed);
    navigate(trimmed ? `/requirements/new?q=${encodeURIComponent(trimmed)}` : '/requirements/new');
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      data-testid="requirement-prompt"
    >
      <label htmlFor="requirement-prompt" className="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
        <span className="text-action">✨</span>
        <span>{HERO.prompt}</span>
      </label>

      <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:gap-2">
        <input
          id="requirement-prompt"
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={HERO.promptExample}
          className="min-w-0 flex-1 rounded-lg border border-primary/30 bg-card px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm placeholder:text-muted-foreground/70 focus:border-action focus:outline-none focus:ring-2 focus:ring-action/20 shadow-2xs transition"
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-action px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-bold text-action-foreground hover:bg-action-hover transition shadow-2xs flex items-center justify-center gap-1.5"
        >
          <span>Create requirement</span>
          <span>→</span>
        </button>
      </div>
    </form>
  );
}
