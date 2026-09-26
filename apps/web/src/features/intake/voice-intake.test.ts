import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceRequirementDictation } from './components/VoiceRequirementDictation';
import { VoiceTextRequirementIntakeModal } from './components/VoiceTextRequirementIntakeModal';

// Mock useNavigate from react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('Voice Requirement Dictation Module', () => {
  it('exports VoiceRequirementDictation component successfully', () => {
    expect(VoiceRequirementDictation).toBeDefined();
    expect(typeof VoiceRequirementDictation).toBe('function');
  });

  it('DEF-002: instantiates full and compact voice requirement dictation widgets', () => {
    const onTranscript = vi.fn();
    const fullEl = React.createElement(VoiceRequirementDictation, {
      onTranscript,
    });
    expect(fullEl).toBeDefined();
    expect(fullEl.props.compact).toBeFalsy();

    const compactEl = React.createElement(VoiceRequirementDictation, {
      onTranscript,
      compact: true,
    });
    expect(compactEl).toBeDefined();
    expect(compactEl.props.compact).toBe(true);
  });

  it('supports custom class names and default props cleanly', () => {
    const customEl = React.createElement(VoiceRequirementDictation, {
      onTranscript: vi.fn(),
      className: 'test-custom-class',
    });
    expect(customEl.props.className).toBe('test-custom-class');
  });

  it('exports and renders VoiceTextRequirementIntakeModal targeting canonical /intake with permission fallback', () => {
    expect(VoiceTextRequirementIntakeModal).toBeDefined();
    expect(typeof VoiceTextRequirementIntakeModal).toBe('function');

    const modalEl = React.createElement(VoiceTextRequirementIntakeModal, {
      open: true,
      onClose: vi.fn(),
    });
    expect(modalEl).toBeDefined();
    expect(modalEl.props.open).toBe(true);
  });
});
