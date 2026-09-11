/**
 * The four cities the product is demonstrated in, parsed the way a buyer
 * actually writes them. Each case is one enquiry typed as prose, and the
 * assertions are what the intake wizard would put on screen.
 */
import { describe, expect, it } from 'vitest';
import { RequirementMode } from '../enums/requirement-mode';
import { attributeValue } from './requirement-parser-port';
import { RuleBasedRequirementParser } from './rule-based-requirement-parser';
import { TEST_TAXONOMY } from './taxonomy.fixture';

const parser = new RuleBasedRequirementParser();

const parse = (text: string) =>
  parser.parse({ text, taxonomy: TEST_TAXONOMY });

describe('Bengaluru — a burnt submersible motor', () => {
  const text =
    'Block B borewell motor stopped working. Electrician says the winding has burnt. ' +
    'It is a 12.5 HP three phase submersible motor, needs rewinding with copper ' +
    'winding and pickup from site. Bengaluru 560076. Urgent.';

  it('reads it as a repair, not as a pump purchase or a man-hire', async () => {
    const parsed = await parse(text);

    expect(parsed.subcategoryCode).toBe('motor_rewinding');
    expect(parsed.categoryCode).toBe('water_environmental');
    expect(parsed.requirementMode).toBe(RequirementMode.REPAIR_MAINTENANCE);
  });

  it('keeps the motor rating as a rating and leaves the order size empty', async () => {
    const parsed = await parse(text);

    expect(attributeValue(parsed, 'motor_hp')).toBe(12.5);
    // "12.5 HP" is one motor, not twelve and a half of anything.
    expect(parsed.quantity).toBeNull();
    expect(parsed.unit).toBeNull();
  });

  it('lifts the details a rewinder needs to quote', async () => {
    const parsed = await parse(text);

    expect(attributeValue(parsed, 'phase')).toBe('Three phase');
    expect(attributeValue(parsed, 'pump_type')).toBe('Submersible');
    expect(attributeValue(parsed, 'winding_type')).toBe('Copper');
    expect(attributeValue(parsed, 'failure_symptom')).toBe('Burnt / smoking');
    expect(attributeValue(parsed, 'pickup_required')).toBe(true);
  });

  it('reads the site and the urgency', async () => {
    const parsed = await parse(text);

    expect(parsed.deliveryCity).toBe('Bengaluru');
    expect(parsed.deliveryPincode).toBe('560076');
    expect(parsed.timing.isImmediate).toBe(true);
    expect(parsed.timing.requiredByDays).toBe(0);
  });

  it('has nothing left to ask, and says why it matched', async () => {
    const parsed = await parse(text);

    expect(parsed.missingRequired).toEqual([]);
    expect(parsed.matchedKeywords).toContain('winding has burnt');
    expect(parsed.confidence).toBeGreaterThan(0.8);
  });
});

describe('Coimbatore — CNC turning job work', () => {
  const text =
    'Need 500 nos of EN8 shafts, CNC turning and milling, 25mm dia, ' +
    '±0.05mm tolerance, inspection report needed. Delivery to Coimbatore in 3 weeks.';

  it('reads it as job work under machinery', async () => {
    const parsed = await parse(text);

    expect(parsed.subcategoryCode).toBe('cnc_machining');
    expect(parsed.categoryCode).toBe('machinery_engineering');
    expect(parsed.requirementMode).toBe(RequirementMode.JOB_WORK);
  });

  it('takes the piece count as the order size', async () => {
    const parsed = await parse(text);

    expect(parsed.quantity).toBe(500);
    expect(parsed.unit).toBe('PCS');
  });

  it('reads material, tolerance and the operations asked for', async () => {
    const parsed = await parse(text);

    expect(attributeValue(parsed, 'material')).toBe('EN8');
    expect(attributeValue(parsed, 'tolerance_mm')).toBe(0.05);
    expect(attributeValue(parsed, 'operations')).toEqual(['Turning', 'Milling']);
    expect(attributeValue(parsed, 'inspection_report')).toBe(true);
  });

  it('reads the destination and converts weeks to days', async () => {
    const parsed = await parse(text);

    expect(parsed.deliveryCity).toBe('Coimbatore');
    expect(parsed.timing.requiredByDays).toBe(21);
    expect(parsed.timing.isImmediate).toBe(false);
  });
});

describe('Tiruppur — combed cotton yarn', () => {
  const text =
    'Need 2000 kg of 40s combed compact cotton yarn in cone packing for our ' +
    'knitting unit. Delivery to Tiruppur in 10 days.';

  it('reads it as a material purchase of yarn', async () => {
    const parsed = await parse(text);

    expect(parsed.subcategoryCode).toBe('cotton_yarn');
    expect(parsed.requirementMode).toBe(RequirementMode.PRODUCT_MATERIAL);
  });

  it('separates the count from the weight', async () => {
    const parsed = await parse(text);

    // "40s" is the yarn, "2000 kg" is how much of it.
    expect(attributeValue(parsed, 'yarn_count')).toBe('40');
    expect(parsed.quantity).toBe(2000);
    expect(parsed.unit).toBe('KG');
  });

  it('reads the packing and the window', async () => {
    const parsed = await parse(text);

    expect(attributeValue(parsed, 'package_type')).toBe('Cone');
    expect(parsed.deliveryCity).toBe('Tiruppur');
    expect(parsed.timing.requiredByDays).toBe(10);
  });
});

describe('Erode — turmeric fingers', () => {
  const text =
    'Buying 5000 kg Erode turmeric finger, FAQ grade, below 8% moisture, ' +
    'gunny bags. Delivery to Erode within 2 weeks.';

  it('reads it as commodity trading', async () => {
    const parsed = await parse(text);

    expect(parsed.subcategoryCode).toBe('turmeric');
    expect(parsed.requirementMode).toBe(RequirementMode.COMMODITY_TRADING);
    expect(parsed.quantity).toBe(5000);
    expect(parsed.unit).toBe('KG');
  });

  it('reads grade, form, moisture and packaging', async () => {
    const parsed = await parse(text);

    expect(attributeValue(parsed, 'quality_grade')).toBe('FAQ (Fair Average Quality)');
    expect(attributeValue(parsed, 'form')).toBe('Whole finger');
    expect(attributeValue(parsed, 'moisture_percent')).toBe(8);
    expect(attributeValue(parsed, 'packaging_type')).toBe('Gunny bag');
  });

  it('reads the delivery city and window', async () => {
    const parsed = await parse(text);

    expect(parsed.deliveryCity).toBe('Erode');
    expect(parsed.timing.requiredByDays).toBe(14);
  });
});

describe('what the parser does when it is not sure', () => {
  it('asks for the details a supplier cannot quote without', async () => {
    const parsed = await parse(
      'Submersible motor winding needs redoing at our Bengaluru site.',
    );

    expect(parsed.subcategoryCode).toBe('motor_rewinding');
    expect(parsed.missingRequired.map((a) => a.code)).toEqual(['motor_hp']);
  });

  it('classifies nothing rather than guessing, when nothing matches', async () => {
    const parsed = await parse('Please send someone about the thing we discussed.');

    expect(parsed.subcategoryCode).toBeNull();
    expect(parsed.categoryCode).toBeNull();
    expect(parsed.confidence).toBe(0);
    expect(parsed.matchedKeywords).toEqual([]);
  });

  it('matches the tradesman only when the buyer is hiring one', async () => {
    const parsed = await parse('Need an electrician for the clubhouse on Saturday.');

    expect(parsed.subcategoryCode).toBe('electrician_technician');
  });

  it('lets what the buyer corrected win over what it inferred', async () => {
    const parsed = await parser.parse({
      text: 'Need 2000 kg of 40s combed cotton yarn, Tiruppur.',
      taxonomy: TEST_TAXONOMY,
      hints: { quantity: 2500, deliveryCity: 'Coimbatore' },
    });

    expect(parsed.quantity).toBe(2500);
    expect(parsed.deliveryCity).toBe('Coimbatore');
    expect(parsed.unit).toBe('KG');
  });

  it('titles the requirement from the first sentence', async () => {
    const parsed = await parse(
      'Rewind 10 HP submersible motor. Site is in Bengaluru, access from the rear gate.',
    );

    expect(parsed.title).toBe('Rewind 10 HP submersible motor.');
  });
});
