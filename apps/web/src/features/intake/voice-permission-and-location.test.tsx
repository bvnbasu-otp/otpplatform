import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TaxonomySnapshot } from '@otp/domain';
import {
  MIC_PERMISSION_DENIED_MESSAGE,
  VOICE_UNSUPPORTED_MESSAGE,
  isMicPermissionDenied,
  reportVoiceError,
} from './components/VoiceRequirementDictation';
import {
  Tier1TellOtpCard,
  focusRequirementDescriptionInput,
} from './components/Tier1TellOtpCard';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

describe('Issue 18: microphone permission denied', () => {
  it('uses the exact required copy', () => {
    expect(MIC_PERMISSION_DENIED_MESSAGE).toBe(
      'Click the microphone icon in your browser address bar to enable, or simply type your requirement below.',
    );
  });

  it.each(['not-allowed', 'service-not-allowed', 'NotAllowedError', 'SecurityError'])(
    '%s shows the exact message and notifies the caller synchronously',
    (code) => {
      const setError = vi.fn();
      const onPermissionError = vi.fn();
      reportVoiceError(code, { setError, onPermissionError });
      expect(setError).toHaveBeenCalledWith(MIC_PERMISSION_DENIED_MESSAGE);
      expect(onPermissionError).toHaveBeenCalledTimes(1);
      expect(onPermissionError).toHaveBeenCalledWith(MIC_PERMISSION_DENIED_MESSAGE);
    },
  );

  it('non-permission errors do not trigger the permission path', () => {
    const onPermissionError = vi.fn();
    reportVoiceError('no-speech', { setError: vi.fn(), onPermissionError });
    reportVoiceError('network', { setError: vi.fn(), onPermissionError });
    expect(onPermissionError).not.toHaveBeenCalled();
    expect(isMicPermissionDenied('network')).toBe(false);
  });

  it('focuses the typed requirement input immediately', () => {
    const focus = vi.fn();
    const root = { querySelector: vi.fn(() => ({ focus })) } as unknown as Pick<Document, 'querySelector'>;
    expect(focusRequirementDescriptionInput(root)).toBe(true);
    expect(root.querySelector).toHaveBeenCalledWith('[data-requirement-description-input]');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('Tier 1 wires permission denial to the focus helper and marks the textarea as the target', () => {
    const src = read('components/Tier1TellOtpCard.tsx');
    expect(src).toMatch(/onPermissionError=\{focusDescriptionInput\}/);

    const html = renderToStaticMarkup(React.createElement(Tier1TellOtpCard, tier1Props()));
    expect(html).toMatch(/<textarea[^>]*data-requirement-description-input=""/);
  });

  it('modal focuses synchronously (no deferred timer) and shows the passed message', () => {
    const src = read('components/VoiceTextRequirementIntakeModal.tsx');
    const handler = src.slice(src.indexOf('const handlePermissionError'), src.indexOf('const handleLaunchIntake'));
    expect(handler).toContain('textareaRef.current?.focus()');
    expect(handler).not.toContain('setTimeout');
    expect(src).toContain('{permissionError}');
  });

  it('unsupported browsers get a type-instead message, never a fake sample transcript', () => {
    const src = read('components/VoiceRequirementDictation.tsx');
    const toggle = src.slice(src.indexOf('const toggleListening'), src.indexOf('const handleClearTranscript'));
    expect(toggle).toContain('VOICE_UNSUPPORTED_MESSAGE');
    expect(toggle).not.toContain('samplePhrase');
    expect(VOICE_UNSUPPORTED_MESSAGE).toContain('type your requirement below');
  });
});

describe('Issue 06: Tier 1 never injects a hard-coded PIN or city', () => {
  it('source contains no 6-digit PIN literals and GPS does not default to Bengaluru', () => {
    const src = read('components/Tier1TellOtpCard.tsx');
    // Quoted PIN literals, "City 560001" in sample text, or "e.g. 560001" placeholders.
    expect(src).not.toMatch(/(['"]|[A-Za-z.] )[1-9][0-9]{5}\b/);
    const gps = src.slice(src.indexOf('async function handleAutoDetectLocation'), src.indexOf('function focusDescriptionInput'));
    expect(gps).not.toMatch(/onCityChange\('/);
    expect(gps).not.toMatch(/onPincodeChange\(/);
  });

  it('city pills clear a stale PIN instead of inventing one', () => {
    const src = read('components/Tier1TellOtpCard.tsx');
    expect(src).toContain("onPincodeChange('')");
  });

  it('primary-address prefill runs once and never falls back to a non-primary address', () => {
    const src = read('components/UnifiedThreeTierIntake.tsx');
    expect(src).not.toMatch(/\}, \[user\?\.id, city, pincode\]\)/);
    expect(src).not.toMatch(/data\.addresses\[0\]/);
    expect(src).toContain('fetchPrimaryDeliveryLocation(context.organizationId)');
  });
});

function tier1Props() {
  const taxonomy: TaxonomySnapshot = {
    categories: [],
    subcategories: [],
    capabilities: [],
    attributes: [],
    criteria: [],
    cities: [],
  };
  return {
    text: '',
    title: '',
    categoryId: '',
    subcategoryId: '',
    mode: '' as const,
    city: '',
    pincode: '',
    fulfilment: 'SUPPLIER_DELIVERY',
    timing: 'WITHIN_DAYS',
    days: 7,
    date: '',
    budgetAmount: null,
    taxonomy,
    parsed: null,
    isParsing: false,
    errors: {},
    onTextChange: vi.fn(),
    onTitleChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onSubcategoryChange: vi.fn(),
    onModeChange: vi.fn(),
    onCityChange: vi.fn(),
    onPincodeChange: vi.fn(),
    onFulfilmentChange: vi.fn(),
    onTimingChange: vi.fn(),
    onBudgetChange: vi.fn(),
    onParse: vi.fn(),
  };
}
