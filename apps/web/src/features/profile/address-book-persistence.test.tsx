import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuyerAddress } from '@otp/domain';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import {
  buildUpsertBuyerAddressParams,
  deactivateBuyerAddress,
  fetchBuyerAddresses,
  saveBuyerAddress,
  setPrimaryBuyerAddress,
  type BuyerAddressFormInput,
} from './api/buyer-addresses';
import { BuyerAddressCard } from './components/BuyerAddressCard';

const mock = supabase as unknown as { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };

const baseInput: BuyerAddressFormInput = {
  persona: 'INDIVIDUAL',
  label: 'Home',
  line1: 'Flat 402, Tower B',
  line2: 'HSR Layout Sector 2',
  landmark: 'Near BDA Complex — ring bell twice, leave with security',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560102',
  addressType: 'DELIVERY',
  contactPerson: 'Asha',
  contactPhone: '+91 98450 00000',
  isPrimary: false,
};

const storedRow = {
  id: 'addr-1',
  profile_id: 'server-resolved-profile',
  organization_id: null,
  label: 'Home',
  address_line1: 'Flat 402, Tower B',
  address_line2: 'HSR Layout Sector 2',
  landmark: 'Near BDA Complex — ring bell twice',
  city: 'Bengaluru',
  state: 'Karnataka',
  state_code: 'KA',
  pincode: '560102',
  country: 'India',
  contact_person: 'Asha',
  contact_phone: '+91 98450 00000',
  is_primary: true,
  address_type: 'DELIVERY',
  is_active: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  mock.rpc = vi.fn();
  mock.from = vi.fn();
});

describe('Issue 05: address persistence goes through the authoritative RPC only', () => {
  it('create: sends sub-locality, landmark/instructions and no client-chosen owner id', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, address_id: 'addr-new' }, error: null });

    const res = await saveBuyerAddress({ ...baseInput, isFirstAddress: false });

    expect(res).toEqual({ ok: true, addressId: 'addr-new' });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    const [fn, params] = mock.rpc.mock.calls[0]!;
    expect(fn).toBe('upsert_buyer_address_atomic');
    expect(params.p_line2).toBe('HSR Layout Sector 2');
    expect(params.p_landmark).toBe('Near BDA Complex — ring bell twice, leave with security');
    expect(params.p_address_id).toBeNull();
    expect(params.p_is_primary).toBe(false);
    expect(Object.keys(params)).not.toContain('p_profile_id');
    expect(Object.keys(params)).not.toContain('profile_id');
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('first address is always saved as primary', () => {
    const params = buildUpsertBuyerAddressParams({ ...baseInput, isFirstAddress: true });
    expect(params.p_is_primary).toBe(true);
  });

  it('edit: passes the address id and preserves state code so the RPC does not null it', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, address_id: 'addr-1' }, error: null });
    await saveBuyerAddress({ ...baseInput, addressId: 'addr-1', stateCode: 'KA', line2: '', landmark: '  ' });
    const params = mock.rpc.mock.calls[0]![1];
    expect(params.p_address_id).toBe('addr-1');
    expect(params.p_state_code).toBe('KA');
    expect(params.p_line2).toBeNull();
    expect(params.p_landmark).toBeNull();
  });

  it('RPC failure surfaces the error and never falls back to a direct table insert/update', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    const res = await saveBuyerAddress(baseInput);
    expect(res).toEqual({ ok: false, error: 'function not found' });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('RPC business error (ok:false) is surfaced', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: false, error: 'Access denied to organization' }, error: null });
    const res = await saveBuyerAddress({ ...baseInput, organizationId: 'org-x' });
    expect(res).toEqual({ ok: false, error: 'Access denied to organization' });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('invalid input is rejected before any network call', async () => {
    const res = await saveBuyerAddress({ ...baseInput, pincode: '05600', city: ' ' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('City is mandatory');
      expect(res.error).toContain('PIN code');
    }
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('set primary: re-sends every stored field (line2, landmark, state code) with is_primary=true', async () => {
    mock.rpc.mockResolvedValue({ data: { ok: true, address_id: 'addr-2' }, error: null });
    const target: BuyerAddress = {
      id: 'addr-2',
      label: 'Office',
      line1: '12 MG Road',
      line2: 'Ashok Nagar',
      landmark: 'Opp. metro gate 3',
      city: 'Bengaluru',
      state: 'Karnataka',
      stateCode: 'KA',
      pincode: '560001',
      country: 'India',
      addressType: 'BOTH',
      contactPerson: 'Ravi',
      contactPhone: '9000000000',
      isPrimary: false,
      createdAt: '',
      updatedAt: '',
    };
    const res = await setPrimaryBuyerAddress(target, null, 'INDIVIDUAL');
    expect(res.ok).toBe(true);
    const params = mock.rpc.mock.calls[0]![1];
    expect(params).toMatchObject({
      p_address_id: 'addr-2',
      p_is_primary: true,
      p_line2: 'Ashok Nagar',
      p_landmark: 'Opp. metro gate 3',
      p_state_code: 'KA',
      p_address_type: 'BOTH',
    });
  });

  it('reload: multiple addresses come back from get_buyer_addresses with all fields mapped', async () => {
    mock.rpc.mockResolvedValue({
      data: {
        ok: true,
        addresses: [storedRow, { ...storedRow, id: 'addr-2', is_primary: false, label: 'Office', address_line2: null, landmark: null }],
      },
      error: null,
    });
    const res = await fetchBuyerAddresses(null, 'INDIVIDUAL');
    expect(mock.rpc).toHaveBeenCalledWith('get_buyer_addresses', { p_org_id: null });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.addresses).toHaveLength(2);
      expect(res.addresses[0]).toMatchObject({
        id: 'addr-1',
        isPrimary: true,
        line2: 'HSR Layout Sector 2',
        landmark: 'Near BDA Complex — ring bell twice',
        stateCode: 'KA',
      });
      expect(res.addresses[1]!.isPrimary).toBe(false);
    }
  });

  it('reload: RPC error is reported, no direct table select fallback', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const res = await fetchBuyerAddresses('org-1', 'MSME');
    expect(res).toEqual({ ok: false, error: 'boom' });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('deactivate: treats an RLS-filtered update (0 rows) as refused', async () => {
    const chain = createSupabaseQueryMock({ data: [], error: null });
    chain.update = vi.fn(() => chain);
    mock.from.mockReturnValue(chain);
    const res = await deactivateBuyerAddress('someone-elses-address');
    expect(res.ok).toBe(false);
    expect(chain.update).toHaveBeenCalledWith({ is_active: false });
    expect(chain.eq).toHaveBeenCalledWith('id', 'someone-elses-address');
  });

  it('AddressBookManager has no direct buyer_addresses insert or write fallback', () => {
    const src = readFileSync(resolve(__dirname, 'components/AddressBookManager.tsx'), 'utf8');
    expect(src).not.toMatch(/from\(['"]buyer_addresses['"]\)/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/profile_id:\s*user/);
  });
});

describe('Issue 17: sub-locality, landmark and delivery instructions are visible on the card', () => {
  const addr: BuyerAddress = {
    id: 'addr-1',
    label: 'Home',
    line1: 'Flat 402, Tower B',
    line2: 'HSR Layout Sector 2',
    landmark: 'Near BDA Complex — ring bell twice',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560102',
    country: 'India',
    addressType: 'DELIVERY',
    isPrimary: true,
    createdAt: '',
    updatedAt: '',
  };

  it('renders labelled sub-locality and landmark/instructions without any expand control', () => {
    const html = renderToStaticMarkup(React.createElement(BuyerAddressCard, { address: addr }));
    expect(html).toContain('data-testid="address-sub-locality"');
    expect(html).toContain('Sub-locality / Area:');
    expect(html).toContain('HSR Layout Sector 2');
    expect(html).toContain('data-testid="address-landmark"');
    expect(html).toContain('Landmark / Delivery Instructions:');
    expect(html).toContain('Near BDA Complex — ring bell twice');
    expect(html).not.toMatch(/aria-expanded|<details/);
  });

  it('shows the rows with "Not added" when empty so the fields are discoverable', () => {
    const html = renderToStaticMarkup(
      React.createElement(BuyerAddressCard, { address: { ...addr, line2: null, landmark: null } }),
    );
    expect(html).toContain('Sub-locality / Area:');
    expect(html).toContain('Landmark / Delivery Instructions:');
    expect((html.match(/Not added/g) ?? []).length).toBe(2);
  });
});
