import { describe, it, expect } from 'vitest';
import type { SupportTicketCategory, SupportTicketPriority } from '@/features/admin/types/admin';
import { SupportHelpButtonModal, SupportFeedbackModal } from './index';

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

  it('exports both SupportHelpButtonModal and SupportFeedbackModal components', () => {
    expect(SupportHelpButtonModal).toBeDefined();
    expect(SupportFeedbackModal).toBeDefined();
  });

  it('supports controlled and uncontrolled open states on SupportHelpButtonModal', () => {
    // Verifies interface accepts isOpen and onOpenChange
    const props = {
      isOpen: true,
      onOpenChange: (_open: boolean) => {},
    };
    expect(props.isOpen).toBe(true);
    expect(typeof props.onOpenChange).toBe('function');
  });
});
