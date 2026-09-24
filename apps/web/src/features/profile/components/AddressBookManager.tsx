import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { Button, Input, Field, Badge } from '@/components/ui';
import type { BuyerAddress } from '@otp/domain';

interface AddressBookManagerProps {
  organizationId?: string | null;
  persona?: 'INDIVIDUAL' | 'RWA' | 'MSME';
  onAddressSelected?: (address: BuyerAddress) => void;
  selectedAddressId?: string | null;
}

export function AddressBookManager({
  organizationId,
  persona = 'INDIVIDUAL',
  onAddressSelected,
  selectedAddressId,
}: AddressBookManagerProps) {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<BuyerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [label, setLabel] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [addressType, setAddressType] = useState<'DELIVERY' | 'BILLING' | 'BOTH' | 'REGISTERED' | 'SITE'>('DELIVERY');

  const fetchAddresses = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_buyer_addresses', {
        p_org_id: organizationId || null,
      });

      if (rpcErr) {
        // Fallback to table select if RPC error
        const query = supabase
          .from('buyer_addresses')
          .select('*')
          .eq('is_active', true)
          .order('is_primary', { ascending: false });

        if (organizationId) {
          query.eq('organization_id', organizationId);
        } else {
          query.eq('profile_id', user.id).is('organization_id', null);
        }

        const { data: tableData, error: tableErr } = await query;
        if (tableErr) throw tableErr;
        setAddresses(
          (tableData || []).map((row: any) => ({
            id: row.id,
            profileId: row.profile_id,
            organizationId: row.organization_id,
            label: row.label,
            line1: row.address_line1,
            line2: row.address_line2,
            landmark: row.landmark,
            city: row.city,
            state: row.state,
            pincode: row.pincode,
            country: row.country || 'India',
            contactPerson: row.contact_person,
            contactPhone: row.contact_phone,
            isPrimary: Boolean(row.is_primary),
            addressType: row.address_type || 'DELIVERY',
            isActive: row.is_active !== false,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }))
        );
      } else if (data && data.ok) {
        setAddresses(
          (data.addresses || []).map((row: any) => ({
            id: row.id,
            profileId: row.profile_id,
            organizationId: row.organization_id,
            label: row.label,
            line1: row.address_line1,
            line2: row.address_line2,
            landmark: row.landmark,
            city: row.city,
            state: row.state,
            pincode: row.pincode,
            country: row.country || 'India',
            contactPerson: row.contact_person,
            contactPhone: row.contact_phone,
            isPrimary: Boolean(row.is_primary),
            addressType: row.address_type || 'DELIVERY',
            isActive: row.is_active !== false,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }))
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load address book');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, [user?.id, organizationId]);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line1.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setError('Please provide address line 1, city, state, and a valid 6-digit PIN code.');
      return;
    }

    if (!/^[0-9]{6}$/.test(pincode.trim())) {
      setError('PIN code must be exactly 6 digits.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc('upsert_buyer_address_atomic', {
        p_label: label.trim() || (persona === 'RWA' ? 'Society Gate / Clubhouse' : persona === 'MSME' ? 'Factory / Office Site' : 'Home Delivery'),
        p_line1: line1.trim(),
        p_line2: line2.trim() || null,
        p_landmark: landmark.trim() || null,
        p_city: city.trim(),
        p_state: state.trim(),
        p_pincode: pincode.trim(),
        p_country: 'India',
        p_is_primary: isPrimary || addresses.length === 0, // Auto primary if first address
        p_address_type: addressType,
        p_org_id: organizationId || null,
        p_address_id: editingId || null,
        p_contact_person: contactPerson.trim() || null,
        p_contact_phone: contactPhone.trim() || null,
      });

      if (rpcErr) throw rpcErr;
      if (data && !data.ok) throw new Error(data.error || 'Failed to save address');

      resetForm();
      setShowAddModal(false);
      await fetchAddresses();
    } catch (err: any) {
      setError(err.message || 'Error saving address');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPrimary = async (addressId: string) => {
    try {
      const target = addresses.find((a) => a.id === addressId);
      if (!target) return;

      const { data, error: rpcErr } = await supabase.rpc('upsert_buyer_address_atomic', {
        p_label: target.label,
        p_line1: target.line1,
        p_line2: target.line2 || null,
        p_landmark: target.landmark || null,
        p_city: target.city,
        p_state: target.state,
        p_pincode: target.pincode,
        p_country: target.country,
        p_is_primary: true,
        p_address_type: target.addressType,
        p_org_id: organizationId || null,
        p_address_id: addressId,
        p_contact_person: target.contactPerson || null,
        p_contact_phone: target.contactPhone || null,
      });

      if (rpcErr) throw rpcErr;
      await fetchAddresses();
    } catch (err: any) {
      setError(err.message || 'Error updating primary address');
    }
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm('Are you sure you want to remove this address from your address book?')) return;
    try {
      const { error: delErr } = await supabase
        .from('buyer_addresses')
        .update({ is_active: false })
        .eq('id', addressId);

      if (delErr) throw delErr;
      await fetchAddresses();
    } catch (err: any) {
      setError(err.message || 'Error deleting address');
    }
  };

  const startEdit = (addr: BuyerAddress) => {
    setEditingId(addr.id);
    setLabel(addr.label);
    setLine1(addr.line1);
    setLine2(addr.line2 || '');
    setLandmark(addr.landmark || '');
    setCity(addr.city);
    setState(addr.state);
    setPincode(addr.pincode);
    setContactPerson(addr.contactPerson || '');
    setContactPhone(addr.contactPhone || '');
    setIsPrimary(addr.isPrimary);
    setAddressType(addr.addressType || 'DELIVERY');
    setShowAddModal(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setLine1('');
    setLine2('');
    setLandmark('');
    setCity('');
    setState('');
    setPincode('');
    setContactPerson('');
    setContactPhone('');
    setIsPrimary(false);
    setAddressType('DELIVERY');
  };

  const personaLabel =
    persona === 'RWA'
      ? 'Society / Community Premises'
      : persona === 'MSME'
      ? 'Business & Delivery Locations'
      : 'Personal Delivery Addresses';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>📍</span> {personaLabel}
          </h3>
          <p className="text-xs text-muted-foreground">
            {persona === 'RWA'
              ? 'Addresses are auto-inherited by society procurement RFQs. Snapshots are frozen at contract award.'
              : persona === 'MSME'
              ? 'Manage registered GST office, factory sites, and warehouse delivery locations.'
              : 'Your primary delivery address is auto-selected during one-click intake.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm active:scale-95 touch-manipulation"
        >
          + Add New Address
        </button>
      </div>

      {error && (
        <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-muted-foreground text-xs animate-pulse">
          Loading address book...
        </div>
      ) : addresses.length === 0 ? (
        <div className="p-6 border border-dashed border-border rounded-xl text-center bg-muted/20">
          <p className="text-sm font-medium text-foreground">No addresses saved yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Add your primary site address so you never have to re-enter delivery details.
          </p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
          >
            Add Primary Address
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {addresses.map((addr) => {
            const isSelected = selectedAddressId === addr.id;
            return (
              <div
                key={addr.id}
                className={`relative p-4 rounded-xl border transition-all ${
                  addr.isPrimary
                    ? 'border-primary/50 bg-primary/5 dark:bg-primary/10 shadow-sm'
                    : 'border-border bg-card hover:border-border/80'
                } ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{addr.label}</span>
                    {addr.isPrimary && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                        Primary Default
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      {addr.addressType}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-foreground/80 space-y-1 mb-3">
                  <p className="font-medium">{addr.line1}</p>
                  {addr.line2 && <p>{addr.line2}</p>}
                  {addr.landmark && <p className="text-muted-foreground">Landmark: {addr.landmark}</p>}
                  <p className="text-muted-foreground">
                    {addr.city}, {addr.state} — <span className="font-mono font-medium text-foreground">{addr.pincode}</span>
                  </p>
                  {(addr.contactPerson || addr.contactPhone) && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Contact: {addr.contactPerson || 'Site Incharge'} {addr.contactPhone ? `(${addr.contactPhone})` : ''}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/50 gap-2">
                  <div className="flex items-center gap-2">
                    {!addr.isPrimary && (
                      <button
                        type="button"
                        onClick={() => handleSetPrimary(addr.id)}
                        className="text-xs text-primary hover:underline min-h-[44px] py-1 px-2 touch-manipulation font-medium"
                      >
                        Set as Primary
                      </button>
                    )}
                    {onAddressSelected && (
                      <button
                        type="button"
                        onClick={() => onAddressSelected(addr)}
                        className="text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md min-h-[44px] touch-manipulation font-medium"
                      >
                        Select for RFQ
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(addr)}
                      className="text-xs text-muted-foreground hover:text-foreground p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center touch-manipulation"
                      title="Edit Address"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(addr.id)}
                      className="text-xs text-destructive hover:text-destructive/80 p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center touch-manipulation"
                      title="Delete Address"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Address Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 my-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-semibold text-base text-foreground">
                {editingId ? 'Edit Address' : 'Add New Address'}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="text-muted-foreground hover:text-foreground text-lg min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Address Label *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Gate, Tower B, Factory 1"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Address Type
                  </label>
                  <select
                    value={addressType}
                    onChange={(e) => setAddressType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  >
                    <option value="DELIVERY">Delivery / Site Location</option>
                    <option value="BILLING">Billing Office</option>
                    <option value="BOTH">Delivery & Billing</option>
                    <option value="REGISTERED">Registered GST Office</option>
                    <option value="SITE">Project Site / Staging</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Address Line 1 (Building, Street, Plot) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plot 100, Sector 4, Brigade Meadows"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Address Line 2 (Area / Locality)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kanakapura Road"
                    value={line2}
                    onChange={(e) => setLine2(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Landmark
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Near Art of Living"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    PIN Code *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="560066"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Bengaluru"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Karnataka"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Site Contact Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Facility Manager / Security"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk_is_primary"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="chk_is_primary" className="text-xs text-foreground font-medium cursor-pointer">
                  Set as Primary Default Address
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted min-h-[44px] touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] touch-manipulation shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Address' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
