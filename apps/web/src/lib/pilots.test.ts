import { describe, expect, it } from 'vitest';
import { getPilotById, getPilotByRfqId, PILOTS } from '@/lib/pilots';

describe('pilots registry', () => {
  it('defines four horizontal pilots', () => {
    expect(PILOTS).toHaveLength(4);
    expect(PILOTS.map((p) => p.number)).toEqual([1, 2, 3, 4]);
  });

  it('resolves pilot by RFQ id', () => {
    const pilot = getPilotByRfqId('d2000021-0000-4000-8000-000000000001');
    expect(pilot?.id).toBe('pilot-2');
    expect(pilot?.orgName).toBe('Precision Tools Coimbatore');
  });

  it('pilot 1 is community borewell, not the only product vertical', () => {
    const p1 = getPilotById('pilot-1');
    expect(p1.buyerType).toBe('Community');
    expect(p1.vertical).toContain('RWA');
  });
});
