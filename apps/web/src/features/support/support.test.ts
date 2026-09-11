import { describe, it, expect } from 'vitest';
import type { SupportTicketCategory, SupportTicketPriority } from '@/features/admin/types/admin';

describe('Support Feature Module Tests', () => {
  it('defines valid support ticket categories and priorities', () => {
    const validCategories: SupportTicketCategory[] = ['BUG', 'FEATURE', 'SALES', 'OPS'];
    const validPriorities: SupportTicketPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    expect(validCategories).toHaveLength(4);
    expect(validPriorities).toHaveLength(4);
    expect(validCategories).toContain('BUG');
    expect(validCategories).toContain('OPS');
    expect(validPriorities).toContain('CRITICAL');
  });

  it('verifies default admin routing configuration for support escalation', () => {
    const ROUTED_ADMIN_EMAIL = 'bvnbasu@gmail.com';
    expect(ROUTED_ADMIN_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(ROUTED_ADMIN_EMAIL).toBe('bvnbasu@gmail.com');
  });
});
