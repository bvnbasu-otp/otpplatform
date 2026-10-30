import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Screen 9: OrderTrackingTimeline Component', () => {
  it('implements 5-step vertical milestone progression and contact shortcuts matching Infographic Screen 9', () => {
    const filePath = resolve(__dirname, 'components/OrderTrackingTimeline.tsx');
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('data-testid="screen-9-order-tracking"');
    expect(content).toContain('Work Order Created');
    expect(content).toContain('Work in Progress');
    expect(content).toContain('Completion Update');
    expect(content).toContain('Invoice');
    expect(content).toContain('Payment');
    expect(content).toContain('Call');
    expect(content).toContain('WhatsApp');
  });
});
