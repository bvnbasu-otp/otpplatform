import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceRequirementDictation } from './components/VoiceRequirementDictation';

describe('Voice Requirement Dictation Module', () => {
  it('exports VoiceRequirementDictation component successfully', () => {
    expect(VoiceRequirementDictation).toBeDefined();
    expect(typeof VoiceRequirementDictation).toBe('function');
  });

  it('DEF-002: instantiates full and compact voice requirement dictation widgets', () => {
    const fullEl = React.createElement(VoiceRequirementDictation, {
      onTranscript: vi.fn(),
    });
    expect(fullEl).toBeDefined();
    expect(fullEl.props.compact).toBeFalsy();

    const compactEl = React.createElement(VoiceRequirementDictation, {
      onTranscript: vi.fn(),
      compact: true,
    });
    expect(compactEl).toBeDefined();
    expect(compactEl.props.compact).toBe(true);
  });
});
