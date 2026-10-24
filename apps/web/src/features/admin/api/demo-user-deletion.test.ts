import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeDemoUserDeletion,
  fetchDemoQaAccountIds,
  previewDemoUserDeletion,
} from './demo-user-deletion';

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from } }));

const TARGET = '11111111-2222-4333-8444-555555555555';
const eligiblePayload = {
  targetProfileId: TARGET,
  targetAuthUserId: TARGET,
  trustedDemoQa: true,
  eligible: true,
  blockerCount: 0,
  fingerprint: 'f'.repeat(64),
  policyBlockers: [],
  dependencies: [],
  confirmationToken: 'a'.repeat(64),
  expiresAt: '2026-10-23T10:10:00Z',
};

describe('demo/QA user deletion admin API', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('previews through the server-authorized RPC only', async () => {
    rpc.mockResolvedValue({ data: eligiblePayload, error: null });
    const result = await previewDemoUserDeletion(TARGET);
    expect(rpc).toHaveBeenCalledWith('preview_demo_user_deletion', { p_target_profile_id: TARGET });
    expect(result).toMatchObject({ ok: true, preview: { eligible: true, confirmationToken: 'a'.repeat(64) } });
    expect(from).not.toHaveBeenCalled();
  });

  it('reads only trusted demo markers to identify accounts that may show the UI action', async () => {
    const is = vi.fn().mockResolvedValue({
      data: [{ id: TARGET }, { id: '22222222-2222-4222-8222-222222222222' }],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    from.mockReturnValue({ select });

    expect(await fetchDemoQaAccountIds()).toEqual({
      ok: true,
      ids: [TARGET, '22222222-2222-4222-8222-222222222222'],
    });
    expect(from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('id');
    expect(eq).toHaveBeenCalledWith('is_demo', true);
    expect(is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('surfaces a server authorization denial', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'DEMO_USER_DELETE_DENIED: effective active SUPER_ADMIN holding required' },
    });
    expect(await previewDemoUserDeletion(TARGET)).toEqual({
      ok: false,
      error: 'DEMO_USER_DELETE_DENIED: effective active SUPER_ADMIN holding required',
    });
  });

  it('never exposes a confirmation token for a blocked preview', async () => {
    rpc.mockResolvedValue({
      data: {
        ...eligiblePayload,
        eligible: false,
        blockerCount: 1,
        policyBlockers: [{ code: 'FOUNDER_IDENTITY_PROTECTED', category: 'identity' }],
      },
      error: null,
    });
    const result = await previewDemoUserDeletion(TARGET);
    expect(result).toMatchObject({ ok: true, preview: { eligible: false, confirmationToken: null, expiresAt: null } });
  });

  it('fails closed on a malformed preview', async () => {
    rpc.mockResolvedValue({ data: { eligible: true }, error: null });
    expect(await previewDemoUserDeletion(TARGET)).toEqual({
      ok: false,
      error: 'The server did not return a deletion preview.',
    });
  });

  it('refuses blank reason, outcome, or confirmation before calling the server', async () => {
    const base = { targetProfileId: TARGET, confirmationToken: 'a'.repeat(64), reason: 'QA cleanup', outcome: 'removed' };
    expect(await executeDemoUserDeletion({ ...base, reason: '   ' })).toEqual({ ok: false, error: 'A reason is required.' });
    expect(await executeDemoUserDeletion({ ...base, outcome: '' })).toEqual({ ok: false, error: 'An outcome is required.' });
    expect(await executeDemoUserDeletion({ ...base, confirmationToken: ' ' })).toEqual({
      ok: false,
      error: 'Run a fresh preview before deleting.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes trimmed confirmation, reason, and outcome to the execute RPC', async () => {
    rpc.mockResolvedValue({
      data: { ok: true, targetProfileId: TARGET, deletedProfileCount: 1, deletedAuthUserCount: 1, auditEventId: 'evt-1', outcome: 'removed' },
      error: null,
    });
    const result = await executeDemoUserDeletion({
      targetProfileId: TARGET,
      confirmationToken: ` ${'a'.repeat(64)} `,
      reason: ' QA cleanup ',
      outcome: ' removed ',
    });
    expect(rpc).toHaveBeenCalledWith('execute_demo_user_deletion', {
      p_target_profile_id: TARGET,
      p_confirmation_token: 'a'.repeat(64),
      p_reason: 'QA cleanup',
      p_outcome: 'removed',
    });
    expect(result).toEqual({ ok: true, result: { targetProfileId: TARGET, auditEventId: 'evt-1', outcome: 'removed' } });
  });

  it('surfaces stale-preview and blocker errors from the server', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'DEMO_USER_DELETE_STALE_PREVIEW' } });
    expect(
      await executeDemoUserDeletion({ targetProfileId: TARGET, confirmationToken: 'x', reason: 'r', outcome: 'o' }),
    ).toEqual({ ok: false, error: 'DEMO_USER_DELETE_STALE_PREVIEW' });
  });

  it('does not report success without server-confirmed counts and an audit event', async () => {
    for (const data of [
      { ok: true, targetProfileId: TARGET, deletedProfileCount: 0, deletedAuthUserCount: 1, auditEventId: 'e' },
      { ok: true, targetProfileId: TARGET, deletedProfileCount: 1, deletedAuthUserCount: 0, auditEventId: 'e' },
      { ok: true, targetProfileId: TARGET, deletedProfileCount: 1, deletedAuthUserCount: 1 },
      { ok: true, targetProfileId: 'other', deletedProfileCount: 1, deletedAuthUserCount: 1, auditEventId: 'e' },
      { ok: false },
      null,
    ]) {
      rpc.mockResolvedValueOnce({ data, error: null });
      expect(
        await executeDemoUserDeletion({ targetProfileId: TARGET, confirmationToken: 'x', reason: 'r', outcome: 'o' }),
      ).toEqual({ ok: false, error: 'The server did not confirm the deletion.' });
    }
  });

  it('uses the browser session client only and never a service-role key or direct table delete', () => {
    const source = readFileSync(resolve(__dirname, 'demo-user-deletion.ts'), 'utf8');
    expect(source).toContain("from '@/lib/supabase'");
    expect(source).not.toMatch(/service[_-]?role|SERVICE_ROLE|createClient/i);
    expect(source).not.toMatch(/\.delete\(/);
  });
});
