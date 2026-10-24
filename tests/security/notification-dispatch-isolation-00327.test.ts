import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SQL = readFileSync(
  resolve(ROOT, 'supabase/migrations/00327_notification_dispatch_isolation.sql'),
  'utf8',
);
const WORKER = readFileSync(
  resolve(ROOT, 'packages/services/src/notifications/notification-queue-worker.ts'),
  'utf8',
);

describe('00327 notification dispatch isolation', () => {
  it('reports incompatible legacy rows and requires idempotency thereafter', () => {
    expect(SQL).toContain('NOTIFICATION_IDEMPOTENCY_INCOMPATIBLE');
    expect(SQL).toContain('ALTER COLUMN idempotency_key SET NOT NULL');
    const precondition =
      SQL.match(/DO \$preconditions\$[\s\S]*?\$preconditions\$;/)?.[0] ?? '';
    expect(precondition).not.toMatch(/\b(?:UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
  });

  it('does not expose recipient addresses or delivery state to tenant peers', () => {
    expect(SQL).toMatch(
      /CREATE POLICY notification_queue_select[\s\S]*recipient_user_id = private\.get_profile_id\(\)[\s\S]*private\.is_platform_admin\(\)/,
    );
    expect(SQL).not.toContain('organization_id IN (SELECT private.get_user_org_ids())');
    expect(SQL).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.notification_dispatch_queue FROM authenticated;',
    );
  });

  it('allows enqueue only from the trusted service role', () => {
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.dispatch_notification_event_atomic\([\s\S]*?\) FROM PUBLIC, anon, authenticated;/,
    );
    expect(SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.dispatch_notification_event_atomic\([\s\S]*?\) TO service_role;/,
    );
  });

  it('retains explicit email, WhatsApp and in-app adapters with persisted retry outcomes', () => {
    expect(WORKER).toContain("readonly channel: NotificationChannel = 'EMAIL'");
    expect(WORKER).toContain("readonly channel: NotificationChannel = 'WHATSAPP'");
    expect(WORKER).toContain("readonly channel: NotificationChannel = 'IN_APP'");
    expect(WORKER).toContain('calculateExponentialBackoffWithJitter');
    expect(WORKER).toContain("item.status = 'DEAD_LETTER'");
    expect(WORKER).toContain("item.status = 'DELIVERED'");
  });
});
