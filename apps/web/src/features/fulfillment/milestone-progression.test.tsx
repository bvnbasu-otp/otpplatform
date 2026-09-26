import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import {
  nextMilestonePercent,
  reachedMilestone,
  validateMilestoneTransition,
} from './lib/milestone-progress';
import { updateWorkOrderProgress } from './api/work-orders';
import { SupplierMilestoneStepper } from './components/SupplierMilestoneStepper';
import type { WorkOrderSummary } from './types/fulfillment';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

function workOrder(progressPercent: number, status: WorkOrderSummary['status'] = 'IN_PROGRESS'): WorkOrderSummary {
  return {
    id: 'wo-1',
    purchaseOrderId: 'po-1',
    supplierId: 'sup-1',
    status,
    title: 'Install',
    progressPercent,
    completedAt: null,
    buyerAcceptedAt: null,
  } as WorkOrderSummary;
}

function render(props: Partial<React.ComponentProps<typeof SupplierMilestoneStepper>>) {
  return renderToStaticMarkup(
    React.createElement(SupplierMilestoneStepper, {
      workOrder: workOrder(0),
      totalAmount: 100000,
      role: 'supplier',
      onUpdateProgress: async () => {},
      ...props,
    }),
  );
}

describe('Milestone progression 0 → 25 → 50 → 75 → 100 (deliberate only)', () => {
  describe('pure transition rule', () => {
    it('allows only the next 25% step', () => {
      expect(validateMilestoneTransition(0, 25)).toEqual({ ok: true });
      expect(validateMilestoneTransition(25, 50)).toEqual({ ok: true });
      expect(validateMilestoneTransition(50, 75)).toEqual({ ok: true });
      expect(validateMilestoneTransition(75, 100)).toEqual({ ok: true });
    });

    it('rejects skipping, including a 1-tap jump to 100%', () => {
      expect(validateMilestoneTransition(0, 100).ok).toBe(false);
      expect(validateMilestoneTransition(0, 50).ok).toBe(false);
      expect(validateMilestoneTransition(25, 75).ok).toBe(false);
    });

    it('rejects going backwards, re-recording the same step, and anything after 100', () => {
      expect(validateMilestoneTransition(50, 25).ok).toBe(false);
      expect(validateMilestoneTransition(50, 50).ok).toBe(false);
      expect(validateMilestoneTransition(75, 0).ok).toBe(false);
      expect(validateMilestoneTransition(100, 100).ok).toBe(false);
    });

    it('rejects non-milestone values', () => {
      expect(validateMilestoneTransition(0, 10).ok).toBe(false);
      expect(validateMilestoneTransition(0, 25.5).ok).toBe(false);
    });

    it('snaps legacy off-step values down to the reached milestone', () => {
      expect(reachedMilestone(30)).toBe(25);
      expect(nextMilestonePercent(30)).toBe(50);
      expect(nextMilestonePercent(100)).toBeNull();
      expect(nextMilestonePercent(undefined)).toBe(25);
    });
  });

  describe('updateWorkOrderProgress (authoritative read + compare-and-set write)', () => {
    let updateChain: any;
    let updatePatches: any[];

    function mockDb(currentPercent: number | null, updatedRows: any[] = [{ id: 'wo-1' }]) {
      updatePatches = [];
      vi.mocked(supabase.from).mockImplementation(((table: string) => {
        expect(table).toBe('work_orders');
        const chain = createSupabaseQueryMock({
          data: currentPercent === null ? null : { id: 'wo-1', progress_percent: currentPercent, status: 'IN_PROGRESS' },
          error: null,
        });
        chain.update = vi.fn((patch: any) => {
          updatePatches.push(patch);
          updateChain = createSupabaseQueryMock({ data: updatedRows, error: null });
          return updateChain;
        });
        return chain;
      }) as any);
    }

    beforeEach(() => {
      vi.mocked(supabase.from).mockReset();
    });

    it('rejects a 0 → 100 jump without writing', async () => {
      mockDb(0);
      const res = await updateWorkOrderProgress('wo-1', 100);
      expect(res.ok).toBe(false);
      expect(updatePatches).toEqual([]);
    });

    it('writes the next step conditionally on the value it read', async () => {
      mockDb(25);
      const res = await updateWorkOrderProgress('wo-1', 50);
      expect(res).toEqual({ ok: true });
      expect(updatePatches).toHaveLength(1);
      expect(updatePatches[0]).toMatchObject({ progress_percent: 50, status: 'IN_PROGRESS' });
      expect(updatePatches[0].completed_at).toBeUndefined();
      expect(updateChain.eq).toHaveBeenCalledWith('id', 'wo-1');
      expect(updateChain.eq).toHaveBeenCalledWith('progress_percent', 25);
    });

    it('a double tap that loses the race reports failure instead of success', async () => {
      mockDb(25, []);
      const res = await updateWorkOrderProgress('wo-1', 50);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toMatch(/already updated/i);
    });

    it('records 100% on the deliberate 75 → 100 step but leaves completion to buyer inspection', async () => {
      mockDb(75);
      const res = await updateWorkOrderProgress('wo-1', 100);
      expect(res).toEqual({ ok: true });
      expect(updatePatches[0]).toMatchObject({ progress_percent: 100, status: 'IN_PROGRESS' });
      expect(updatePatches[0].status).not.toBe('COMPLETED');
      expect(updatePatches[0].completed_at).toBeUndefined();
      expect(updateChain.eq).toHaveBeenCalledWith('progress_percent', 75);
    });

    it('the supplier progress API never writes COMPLETED or completed_at', () => {
      const src = readFileSync(resolve(__dirname, 'api/work-orders.ts'), 'utf8');
      const fn = src.slice(src.indexOf('export async function updateWorkOrderProgress'), src.indexOf('export async function acceptDeliveryInspection'));
      expect(fn).not.toMatch(/'COMPLETED'/);
      expect(fn).not.toMatch(/completed_at/);
    });

    it('fails when the work order cannot be read', async () => {
      mockDb(null);
      const res = await updateWorkOrderProgress('wo-1', 25);
      expect(res.ok).toBe(false);
    });
  });

  describe('SupplierMilestoneStepper rendering', () => {
    it('shows exactly one next-milestone action and no direct 100% shortcuts', () => {
      const html = render({ workOrder: workOrder(25) });
      expect(html.match(/data-testid="milestone-record-next-btn"/g)).toHaveLength(1);
      expect(html).toContain('Record 50%');
      expect(html).not.toContain('Confirm Delivery (100%)');
      expect(html).not.toContain('Mark progress at 100%');
      expect(html).not.toMatch(/Record progress at \d+%/);
    });

    it('checkpoint markers are display-only (not buttons)', () => {
      const html = render({ workOrder: workOrder(50) });
      for (const step of [0, 25, 50, 75, 100]) {
        expect(html).toMatch(new RegExp(`<span[^>]*data-testid="milestone-marker-${step}"`));
      }
    });

    it('buyers cannot record supplier progress', () => {
      const html = render({ role: 'buyer', workOrder: workOrder(25) });
      expect(html).not.toContain('milestone-record-next-btn');
    });

    it('no progress action once work is complete', () => {
      const html = render({ workOrder: workOrder(100, 'COMPLETED') });
      expect(html).not.toContain('milestone-next-action');
    });

    it('contains no fake sealing, upload or escrow claims', () => {
      const src = readFileSync(resolve(__dirname, 'components/SupplierMilestoneStepper.tsx'), 'utf8');
      expect(src).not.toMatch(/markCompleteOnSave/);
      expect(src).not.toMatch(/Cryptographically/i);
      expect(src).not.toMatch(/escrow/i);
      expect(src).not.toMatch(/onUpdateProgress\((0|25|50|75|100)\)/);
    });
  });

  it('invoice submission never changes work-order progress or completion', () => {
    const src = readFileSync(resolve(__dirname, 'api/invoices.ts'), 'utf8');
    expect(src).not.toMatch(/progress_percent/);
    expect(src).not.toMatch(/from\('work_orders'\)\s*\.update/);
    expect(src).not.toMatch(/status:\s*'COMPLETED'/);
  });
});
