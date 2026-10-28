import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchSupplierPerformance } from './api/fetch-supplier-performance';
import { supabase } from '@/lib/supabase';
import * as authUserRole from '@/features/auth/user-role';
import * as quoteMutations from './api/quote-mutations';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('fetchSupplierPerformance business name extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts and returns the authentic business_name from the suppliers table', async () => {
    vi.spyOn(authUserRole, 'fetchCurrentProfile').mockResolvedValueOnce({
      profileId: 'prof-supp-1',
      activePortalSide: 'SUPPLIER',
      email: 'supplier@example.com',
      fullName: 'Vikram Joshi',
    });

    vi.spyOn(quoteMutations, 'fetchSupplierIdForProfile').mockResolvedValueOnce('supp-uuid-1');

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'work_orders' || table === 'purchase_orders') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        } as any;
      }
      if (table === 'suppliers') {
        return {
          select: (cols: string) => {
            const colList = cols.split(',').map((c) => c.trim());
            expect(colList).toContain('business_name');
            expect(colList).not.toContain('name');
            return {
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: 'supp-uuid-1',
                      business_name: 'Metro Electrical Contractors',
                      rating_avg: 4.8,
                      completed_jobs: 14,
                      on_time_percent: 98,
                      gst_verified: true,
                    },
                    error: null,
                  }),
              }),
            };
          },
        } as any;
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) } as any;
    });

    const result = await fetchSupplierPerformance();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.performance.supplierName).toBe('Metro Electrical Contractors');
      expect(result.performance.supplierId).toBe('supp-uuid-1');
      expect(result.performance.ratingAvg).toBe(4.8);
      expect(result.performance.isGstVerified).toBe(true);
    }
  });
});
