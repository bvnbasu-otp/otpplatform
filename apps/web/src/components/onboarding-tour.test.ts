import { describe, expect, it } from 'vitest';
import { TOUR_STEPS } from './OnboardingTourModal';

describe('Interactive Onboarding Tour Steps & Content', () => {
  it('contains exactly 3 structured onboarding steps', () => {
    expect(TOUR_STEPS.length).toBe(3);
  });

  it('verifies step 1 explains identity masking protection', () => {
    expect(TOUR_STEPS[0].title).toContain('Identity-Protected');
    expect(TOUR_STEPS[0].description).toContain('Supplier-XXXX');
  });

  it('verifies step 2 explains 1-click committee voting', () => {
    expect(TOUR_STEPS[1].title).toContain('Voting');
    expect(TOUR_STEPS[1].description).toContain('weighted ballots');
  });

  it('verifies step 3 explains irrevocable award and reveal', () => {
    expect(TOUR_STEPS[2].title).toContain('Award & Reveal');
    expect(TOUR_STEPS[2].description).toContain('Purchase Orders');
  });
});
