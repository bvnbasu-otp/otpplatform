import { describe, expect, it } from 'vitest';
import { DEMO_PERSONAS } from './DemoPersonaSwitcher';

describe('Demo Persona Switcher Component Tests', () => {
  it('contains pre-configured Buyer, Committee Voter, and Supplier personas', () => {
    const ids = DEMO_PERSONAS.map((p) => p.id);
    expect(ids).toContain('buyer');
    expect(ids).toContain('voter');
    expect(ids).toContain('supplier');
  });

  it('provides complete persona metadata, email credentials, and target routes', () => {
    for (const persona of DEMO_PERSONAS) {
      expect(persona.title).toBeTruthy();
      expect(persona.shortLabel).toBeTruthy();
      expect(persona.email).toContain('@');
      expect(persona.scenario).toBeTruthy();
      expect(persona.targetRoute.startsWith('/')).toBe(true);
      expect(persona.icon).toBeTruthy();
    }
  });

  it('correctly maps Buyer to Durga Rainbow RWA and Supplier to SunPower Tech', () => {
    const buyer = DEMO_PERSONAS.find((p) => p.id === 'buyer');
    const supplier = DEMO_PERSONAS.find((p) => p.id === 'supplier');

    expect(buyer?.email).toBe('secretary@sunrise.test');
    expect(supplier?.email).toBe('solar01@otpdemo.test');
  });
});
