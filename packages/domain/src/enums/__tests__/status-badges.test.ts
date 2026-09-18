import { describe, it, expect } from 'vitest';
import {
  CanonicalStatusKey,
  CANONICAL_STATUS_REGISTRY,
  resolveCanonicalStatus,
} from '../status-badges';
import {
  AnnouncementCategory,
  AnnouncementSeverity,
  AnnouncementAudience,
  AnnouncementStatus,
} from '../announcements';
import { PlatformRole } from '../roles';

describe('Canonical Status Registry & Visual Language', () => {
  it('defines all 11 canonical states with proper icons and tone tokens', () => {
    const keys = Object.values(CanonicalStatusKey);
    expect(keys).toHaveLength(11);

    expect(CANONICAL_STATUS_REGISTRY.OPEN.icon).toBe('🟢');
    expect(CANONICAL_STATUS_REGISTRY.ACTION_REQUIRED.icon).toBe('🔴');
    expect(CANONICAL_STATUS_REGISTRY.EVALUATION.icon).toBe('📊');
    expect(CANONICAL_STATUS_REGISTRY.VOTING.icon).toBe('🗳️');
    expect(CANONICAL_STATUS_REGISTRY.AWARDED.icon).toBe('🏆');
    expect(CANONICAL_STATUS_REGISTRY.IDENTITY_PROTECTED.icon).toBe('🔒');
    expect(CANONICAL_STATUS_REGISTRY.IDENTITY_REVEALED.icon).toBe('🔓');
    expect(CANONICAL_STATUS_REGISTRY.IN_PROGRESS.icon).toBe('📦');
    expect(CANONICAL_STATUS_REGISTRY.INVOICE_PENDING.icon).toBe('🧾');
    expect(CANONICAL_STATUS_REGISTRY.PAYMENT_PENDING.icon).toBe('💳');
    expect(CANONICAL_STATUS_REGISTRY.COMPLETED_SETTLED.icon).toBe('✅');
  });

  it('resolves arbitrary domain status strings to canonical visual definitions', () => {
    expect(resolveCanonicalStatus('OPEN').key).toBe('OPEN');
    expect(resolveCanonicalStatus('EVALUATING').key).toBe('EVALUATION');
    expect(resolveCanonicalStatus('BLIND').key).toBe('IDENTITY_PROTECTED');
    expect(resolveCanonicalStatus('REVEALED').key).toBe('IDENTITY_REVEALED');
    expect(resolveCanonicalStatus('PO_ISSUED').key).toBe('IN_PROGRESS');
    expect(resolveCanonicalStatus('INVOICED').key).toBe('INVOICE_PENDING');
    expect(resolveCanonicalStatus('SETTLED').key).toBe('COMPLETED_SETTLED');
    expect(resolveCanonicalStatus('DISPUTED').key).toBe('ACTION_REQUIRED');
  });
});

describe('Announcement & Role Enums', () => {
  it('exports valid announcement enums and founder platform role', () => {
    expect(AnnouncementCategory.PLATFORM_NOTICE).toBe('PLATFORM_NOTICE');
    expect(AnnouncementSeverity.CRITICAL).toBe('CRITICAL');
    expect(AnnouncementAudience.BUYER).toBe('BUYER');
    expect(AnnouncementStatus.PUBLISHED).toBe('PUBLISHED');
    expect(PlatformRole.FOUNDER).toBe('FOUNDER');
  });
});
