import { describe, expect, it } from 'vitest';
import { extractQuantity } from './extractors';
import { normalizeUnit } from '../taxonomy/units';

describe('Multi-Lingual Regional Procurement NLP & Extraction', () => {
  it('normalizes Hindi Devnagari unit tokens to canonical procurement units', () => {
    expect(normalizeUnit('लीटर')).toBe('L');
    expect(normalizeUnit('किलोग्राम')).toBe('KG');
    expect(normalizeUnit('मीटर')).toBe('M');
    expect(normalizeUnit('टन')).toBe('MT');
    expect(normalizeUnit('नग')).toBe('PCS');
  });

  it('extracts quantity and units from Hindi procurement requirement prompts', () => {
    const hindiPrompt = 'अपार्टमेंट के लिए 5000 लीटर पानी का टैंकर चाहिए';
    const extracted = extractQuantity(hindiPrompt);

    expect(extracted).toBeDefined();
    expect(extracted?.value.quantity).toBe(5000);
    expect(extracted?.value.unit).toBe('L');
  });

  it('extracts quantity from Hinglish transliterated prompts', () => {
    const prompt = 'Need 1200 kgs of structural steel rod for building foundation';
    const extracted = extractQuantity(prompt);

    expect(extracted).toBeDefined();
    expect(extracted?.value.quantity).toBe(1200);
    expect(extracted?.value.unit).toBe('KG');
  });
});
