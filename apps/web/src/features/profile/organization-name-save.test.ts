import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return {
    rpc: vi.fn(),
    from: vi.fn(() => query),
    query,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

import { ORGANIZATION_RENAME_MEMBER_ROLES, planOrganizationRename, updateOrganizationName } from './api/profile';

const profileApiSource = readFileSync(resolve(__dirname, 'api/profile.ts'), 'utf8');
const profilePageSource = readFileSync(resolve(__dirname, 'pages/ProfilePage.tsx'), 'utf8');
const appliedRpc = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/00146_update_nokia_to_basu_and_org_name_edit.sql'),
  'utf8',
);
const revokeMigration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/00315_revoke_anon_update_my_organization_name.sql'),
  'utf8',
);
const renameMigration = readFileSync(
  resolve(__dirname, '../../../../../supabase/migrations/00316_organization_rename_requires_one_row.sql'),
  'utf8',
);
const profileEditModalSource = readFileSync(resolve(__dirname, 'components/ProfileEditModal.tsx'), 'utf8');

describe('updateOrganizationName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the server-confirmed name only after the authorized RPC reports one updated row', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, name: 'Server Confirmed Name', organization_id: 'org-1', rows_updated: 1 },
      error: null,
    });

    const result = await updateOrganizationName('  Caller Typed Name  ', 'org-1');

    expect(result).toEqual({ ok: true, name: 'Server Confirmed Name' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('update_my_organization_name', {
      p_organization_name: 'Caller Typed Name',
      p_organization_id: 'org-1',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.query.update).not.toHaveBeenCalled();
  });

  it('confirms a historical success payload against the stored organization name', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ok: true, name: 'Server Confirmed Name', organization_id: 'org-1' },
      error: null,
    });
    mocks.query.maybeSingle.mockResolvedValue({ data: { name: 'Server Confirmed Name' }, error: null });

    const result = await updateOrganizationName('Caller Typed Name', 'org-1');

    expect(result).toEqual({ ok: true, name: 'Server Confirmed Name' });
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith('organizations');
    expect(mocks.query.select).toHaveBeenCalledWith('name');
    expect(mocks.query.eq).toHaveBeenCalledWith('id', 'org-1');
    expect(mocks.query.update).not.toHaveBeenCalled();
    expect(mocks.query.insert).not.toHaveBeenCalled();
    expect(mocks.query.upsert).not.toHaveBeenCalled();
    expect(mocks.query.delete).not.toHaveBeenCalled();
  });

  it('returns an explicit error when the organization id is missing and does not call the server', async () => {
    const missing = await updateOrganizationName('Basu Procurement Entity');
    const blank = await updateOrganizationName('Basu Procurement Entity', '   ');
    const absent = await updateOrganizationName('Basu Procurement Entity', null);

    expect(missing).toEqual({
      ok: false,
      error: 'No organization is linked to this profile, so the name was not changed.',
    });
    expect(blank).toEqual(missing);
    expect(absent).toEqual(missing);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed when the RPC transport fails and does not update organizations directly', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function update_my_organization_name' },
    });

    const result = await updateOrganizationName('Basu Procurement Entity', 'org-1');

    expect(result).toEqual({
      ok: false,
      error: 'permission denied for function update_my_organization_name',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('fails closed when the RPC throws', async () => {
    mocks.rpc.mockRejectedValue(new Error('network down'));

    const result = await updateOrganizationName('Basu Procurement Entity', 'org-1');

    expect(result).toEqual({ ok: false, error: 'network down' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns the server authorization denial, including a signed-out response, without a table fallback', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'You do not have permission to rename this organization' },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'Authentication required' },
      error: null,
    });

    const denied = await updateOrganizationName('Basu Procurement Entity', 'org-1');
    const signedOut = await updateOrganizationName('Basu Procurement Entity', 'org-1');

    expect(denied).toEqual({
      ok: false,
      error: 'You do not have permission to rename this organization',
    });
    expect(signedOut).toEqual({ ok: false, error: 'Authentication required' });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not treat an unconfirmed or incomplete RPC payload as success', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ok: true }, error: null });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

    const missingName = await updateOrganizationName('Basu Procurement Entity', 'org-1');
    const emptyPayload = await updateOrganizationName('Basu Procurement Entity', 'org-1');

    expect(missingName.ok).toBe(false);
    expect(emptyPayload.ok).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('never reports success when the server says no organization row was updated', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'Organization was not found, so the name was not changed' },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, name: 'Basu Procurement Entity', rows_updated: 0 },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, name: 'Basu Procurement Entity', rows_updated: 2 },
      error: null,
    });

    const rejected = await updateOrganizationName('Basu Procurement Entity', 'missing-org');
    const zeroRows = await updateOrganizationName('Basu Procurement Entity', 'missing-org');
    const manyRows = await updateOrganizationName('Basu Procurement Entity', 'missing-org');

    expect(rejected).toEqual({
      ok: false,
      error: 'Organization was not found, so the name was not changed',
    });
    expect(zeroRows).toEqual({
      ok: false,
      error: 'Organization name was not confirmed by the server.',
    });
    expect(manyRows).toEqual(zeroRows);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.query.update).not.toHaveBeenCalled();
  });

  it('does not report success when a historical ok payload does not match the stored row', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, name: 'Basu Procurement Entity' },
      error: null,
    });
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: { name: 'Previous Name' }, error: null });
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, name: 'Basu Procurement Entity' },
      error: null,
    });
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    mocks.rpc.mockResolvedValueOnce({
      data: { ok: true, name: 'Basu Procurement Entity' },
      error: null,
    });
    mocks.query.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for table organizations' },
    });

    const stale = await updateOrganizationName('Basu Procurement Entity', 'org-1');
    const missingRow = await updateOrganizationName('Basu Procurement Entity', 'org-missing');
    const readError = await updateOrganizationName('Basu Procurement Entity', 'org-1');

    expect(stale).toEqual({
      ok: false,
      error: 'Organization name was not confirmed by the server.',
    });
    expect(missingRow).toEqual(stale);
    expect(readError).toEqual({ ok: false, error: 'permission denied for table organizations' });
    expect(mocks.query.update).not.toHaveBeenCalled();
    expect(mocks.query.insert).not.toHaveBeenCalled();
  });

  it('does not keep a direct organizations.name write in the profile API or profile editors', () => {
    const readerStart = profileApiSource.indexOf('async function readStoredOrganizationName');
    const readerEnd = profileApiSource.indexOf('export async function updateOrganizationName');
    const reader = profileApiSource.slice(readerStart, readerEnd);
    const renameStart = profileApiSource.indexOf('export async function updateOrganizationName');
    const renameEnd = profileApiSource.indexOf('export async function requestProfileCredentialOtp');
    const rename = profileApiSource.slice(renameStart, renameEnd);

    expect(reader).toContain(".from('organizations')");
    expect(reader).toContain(".select('name')");
    expect(reader).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
    expect(rename).not.toMatch(/\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
    expect(profileApiSource).not.toContain('.from("organizations")');
    expect(profilePageSource).not.toContain(".from('organizations')");
    expect(profileEditModalSource).not.toContain(".from('organizations')");
    expect(profilePageSource).not.toContain('.update(');
    expect(profileEditModalSource).not.toContain('.update(');
  });
});

describe('ProfilePage organization rename failure', () => {
  it('tells the user when the personal profile saved and the organization rename did not', () => {
    const start = profilePageSource.indexOf('async function handleSaveProfile');
    const end = profilePageSource.indexOf('async function handleInviteMember');
    const save = profilePageSource.slice(start, end);

    expect(save).toContain('if (!orgRes.ok)');
    expect(save).toContain('planOrganizationRename');
    expect(save).toContain('Profile updated, but organization name update failed:');
    expect(save).toContain('Profile saved. Organization name is now');
    expect(save).toContain('setOrgName(orgRes.name)');
    const failure = save.indexOf('Profile updated, but organization name update failed:');
    const success = save.indexOf('Profile saved. Organization name is now');
    expect(failure).toBeGreaterThan(-1);
    expect(success).toBeGreaterThan(failure);
  });
});

describe('profile, phone, and email verification contracts stay on their own calls', () => {
  it('keeps profile save, phone OTP, and email OTP on their existing server calls', () => {
    const profileSave = profileApiSource.slice(
      profileApiSource.indexOf('export async function updateMyProfile'),
      profileApiSource.indexOf('const ORGANIZATION_RENAME_UNCONFIRMED'),
    );
    const phoneAndEmailRequest = profileApiSource.slice(
      profileApiSource.indexOf('export async function requestProfileCredentialOtp'),
      profileApiSource.indexOf('export async function verifyAndUpdateProfileCredential'),
    );
    const verify = profileApiSource.slice(
      profileApiSource.indexOf('export async function verifyAndUpdateProfileCredential'),
    );

    expect(profileSave).toContain("supabase.rpc('update_my_profile'");
    expect(profileSave).not.toContain('update_my_organization_name');
    expect(profileSave).not.toContain(".from('organizations')");
    expect(phoneAndEmailRequest).toContain("invokeEdgeFunction('otp-dispatch'");
    expect(phoneAndEmailRequest).not.toContain('update_my_organization_name');
    expect(phoneAndEmailRequest).not.toContain(".from('organizations')");
    expect(verify).toContain("supabase.rpc('verify_and_update_profile_credential'");
    expect(verify).not.toContain('update_my_organization_name');
    expect(verify).not.toContain(".from('organizations')");
  });
});

describe('update_my_organization_name server contract', () => {
  it('authorizes from the authenticated profile, membership, and a permitted role', () => {
    expect(appliedRpc).toContain('v_uid uuid := auth.uid()');
    expect(appliedRpc).toContain('WHERE auth_user_id = v_uid');
    expect(appliedRpc).toContain('FROM public.organization_members');
    expect(appliedRpc).toContain("v_member_role NOT IN ('OWNER', 'MANAGER', 'BUYER', 'ADMIN')");
    expect(appliedRpc).not.toMatch(/p_user_id|p_profile_id|p_role/i);
    expect(renameMigration).toContain('v_uid uuid := auth.uid()');
    expect(renameMigration).toContain('WHERE auth_user_id = v_uid');
    expect(renameMigration).toContain('SELECT id, COALESCE(is_platform_admin, false), active_organization_id');
    expect(renameMigration).toContain("v_member_role NOT IN ('OWNER', 'MANAGER', 'BUYER', 'ADMIN')");
    expect(renameMigration).toContain('IF NOT v_is_admin THEN');
    expect(renameMigration).not.toMatch(/p_user_id|p_profile_id|p_actor_id|p_role/i);
  });

  it('returns success only after exactly one organization row is updated', () => {
    const historicalUpdate = appliedRpc.indexOf('UPDATE public.organizations');
    const historicalSuccess = appliedRpc.indexOf("'ok', true");
    expect(appliedRpc).not.toContain('GET DIAGNOSTICS');
    expect(historicalSuccess).toBeGreaterThan(historicalUpdate);

    const update = renameMigration.indexOf('UPDATE public.organizations');
    const counted = renameMigration.indexOf('GET DIAGNOSTICS v_updated = ROW_COUNT');
    const zeroRows = renameMigration.indexOf('Organization was not found, so the name was not changed');
    const ambiguous = renameMigration.indexOf('Organization rename matched % rows');
    const audit = renameMigration.indexOf('INSERT INTO public.audit_events');
    const success = renameMigration.lastIndexOf("'ok', true");

    expect(update).toBeGreaterThan(renameMigration.indexOf('Authentication required'));
    expect(update).toBeGreaterThan(renameMigration.indexOf('You do not have permission to rename this organization'));
    expect(counted).toBeGreaterThan(update);
    expect(zeroRows).toBeGreaterThan(counted);
    expect(ambiguous).toBeGreaterThan(zeroRows);
    expect(audit).toBeGreaterThan(ambiguous);
    expect(success).toBeGreaterThan(audit);
    expect(renameMigration).toContain("'rows_updated', v_updated");
    expect(renameMigration).toContain('cardinality_violation');
    expect(renameMigration).not.toMatch(/^\s*GRANT\s+/im);
    expect(renameMigration).not.toMatch(/^\s*REVOKE\s+/im);
    expect(renameMigration).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it('revokes anon and PUBLIC in migration 00315 before 00316 replaces the body, and grants no new role', () => {
    expect(appliedRpc).toContain(
      'GRANT EXECUTE ON FUNCTION public.update_my_organization_name(text, uuid) TO authenticated, service_role, anon;',
    );
    for (const sql of [revokeMigration, renameMigration]) {
      expect(sql).not.toContain('UNAPPLIED');
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    }
    expect(revokeMigration).toContain(
      'REVOKE ALL ON FUNCTION public.update_my_organization_name(text, uuid) FROM PUBLIC;',
    );
    expect(revokeMigration).toContain(
      'REVOKE ALL ON FUNCTION public.update_my_organization_name(text, uuid) FROM anon;',
    );
    expect(revokeMigration).not.toMatch(/^\s*GRANT\s+/im);
    expect(revokeMigration).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);

    const migrations = readdirSync(resolve(__dirname, '../../../../../supabase/migrations'))
      .filter((file) => /^\d{5}_.+\.sql$/.test(file))
      .sort();
    expect(migrations.indexOf('00315_revoke_anon_update_my_organization_name.sql')).toBe(314);
    expect(migrations.indexOf('00316_organization_rename_requires_one_row.sql')).toBe(315);
    expect(readdirSync(resolve(__dirname, '../../../../../supabase')).filter((file) => /organization_(name|rename)/.test(file)))
      .toEqual([]);
  });

  it('keeps the client role list aligned with the server membership check', () => {
    for (const role of ORGANIZATION_RENAME_MEMBER_ROLES) {
      expect(renameMigration).toContain(`'${role}'`);
      expect(appliedRpc).toContain(`'${role}'`);
    }
    expect(ORGANIZATION_RENAME_MEMBER_ROLES).toEqual(['OWNER', 'MANAGER', 'BUYER', 'ADMIN']);
  });
});

describe('planOrganizationRename', () => {
  it('skips an unchanged name and does not invent an organization for an individual account', () => {
    expect(planOrganizationRename({ nextName: '  Palm Grove  ', currentName: 'Palm Grove', organizationId: 'org-rwa' })).toEqual({
      action: 'skip',
    });
    expect(planOrganizationRename({ nextName: 'Household Supplies', currentName: '', organizationId: null })).toEqual({
      action: 'reject',
      error: 'No organization is linked to this profile, so the name was not changed.',
    });
    expect(planOrganizationRename({ nextName: 'A', currentName: 'Palm Grove', organizationId: 'org-rwa' })).toEqual({
      action: 'reject',
      error: 'Organization name must be at least 2 characters.',
    });
    expect(planOrganizationRename({ nextName: '   ', currentName: 'Palm Grove', organizationId: 'org-msme' })).toEqual({
      action: 'reject',
      error: 'Organization name must be at least 2 characters.',
    });
  });

  it('sends only the linked organization id for RWA, MSME, and supplier workspaces', () => {
    expect(planOrganizationRename({
      nextName: ' Palm Grove RWA ',
      currentName: 'Palm Grove',
      organizationId: 'org-rwa',
    })).toEqual({ action: 'save', name: 'Palm Grove RWA', organizationId: 'org-rwa' });
    expect(planOrganizationRename({
      nextName: 'Apex MSME',
      currentName: 'Apex',
      organizationId: 'org-msme',
    })).toMatchObject({ action: 'save', organizationId: 'org-msme' });
    expect(planOrganizationRename({
      nextName: 'Dual Role Supplies',
      currentName: 'Old Supplier Org',
      organizationId: 'org-supplier',
    })).toMatchObject({ action: 'save', organizationId: 'org-supplier' });
  });
});
