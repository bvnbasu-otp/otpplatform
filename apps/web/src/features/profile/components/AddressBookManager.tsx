import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import {
  type BuyerAddress,
  type LocationType,
  type AddressClassification,
  type BuyerPersona,
  getAllowedLocationTypes,
  getDefaultLocationType,
  isAddressValid,
  isPincodeValid,
} from '@otp/domain';

interface AddressBookManagerProps {
  organizationId?: string | null;
  persona?: BuyerPersona;
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
  const [locationType, setLocationType] = useState<LocationType>(getDefaultLocationType(persona));
  const [addressType, setAddressType] = useState<AddressClassification>('DELIVERY');
  const [recipientName, setRecipientName] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [locality, setLocality] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);

  const allowedLocationTypes = useMemo(() => {
    return getAllowedLocationTypes(persona);
  }, [persona]);

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
            locationType: row.location_type || getDefaultLocationType(persona),
            recipientName: row.recipient_name,
            line1: row.address_line1,
            line2: row.address_line2,
            locality: row.locality,
            landmark: row.landmark,
            city: row.city,
            district: row.district,
            state: row.state,
            stateCode: row.state_code,
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
            locationType: row.location_type || getDefaultLocationType(persona),
            recipientName: row.recipient_name,
            line1: row.address_line1,
            line2: row.address_line2,
            locality: row.locality,
            landmark: row.landmark,
            city: row.city,
            district: row.district,
            state: row.state,
            stateCode: row.state_code,
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
  }, [user?.id, organizationId, persona]);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = isAddressValid({
      line1,
      city,
      state,
      pincode,
    });

    if (!validation.valid) {
      setError(validation.errors.join(' '));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await supabase.rpc('upsert_buyer_address_atomic', {
        p_label:
          label.trim() ||
          (persona === 'RWA'
            ? 'Society Premises'
            : persona === 'MSME'
            ? 'Operational Site'
            : 'Home Delivery'),
        p_line1: line1.trim(),
        p_line2: line2.trim() || null,
        p_landmark: landmark.trim() || null,
        p_city: city.trim(),
        p_state: state.trim(),
        p_pincode: pincode.trim(),
        p_country: 'India',
        p_is_primary: isPrimary || addresses.length === 0,
        p_address_type: addressType,
        p_org_id: organizationId || null,
        p_address_id: editingId || null,
        p_contact_person: (contactPerson || recipientName).trim() || null,
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
    if (!confirm('Are you sure you want to deactivate this address? (Historical procurement records will remain 100% intact.)')) {
      return;
    }
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
    setLocationType(addr.locationType || getDefaultLocationType(persona));
    setAddressType(addr.addressType || 'DELIVERY');
    setRecipientName(addr.recipientName || '');
    setLine1(addr.line1);
    setLine2(addr.line2 || '');
    setLocality(addr.locality || '');
    setLandmark(addr.landmark || '');
    setCity(addr.city);
    setDistrict(addr.district || '');
    setState(addr.state);
    setPincode(addr.pincode);
    setContactPerson(addr.contactPerson || '');
    setContactPhone(addr.contactPhone || '');
    setIsPrimary(addr.isPrimary);
    setShowAddModal(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setLocationType(getDefaultLocationType(persona));
    setAddressType('DELIVERY');
    setRecipientName('');
    setLine1('');
    setLine2('');
    setLocality('');
    setLandmark('');
    setCity('');
    setDistrict('');
    setState('');
    setPincode('');
    setContactPerson('');
    setContactPhone('');
    setIsPrimary(false);
  };

  const personaLabel =
    persona === 'RWA'
      ? 'Society / Community Operational Premises'
      : persona === 'MSME'
      ? 'Business, Factory & Warehouse Locations'
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
              ? 'Manage society operational sites (Clubhouse, Sump, STP, Gates). Primary site is auto-inherited during requirement intake.'
              : persona === 'MSME'
              ? 'Manage multi-location business addresses (Registered GST office, factories, warehouses, delivery points).'
              : 'Your primary address is automatically selected for 1-click intake.'}
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
          + Add Location
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
          <p className="text-sm font-medium text-foreground">No locations saved yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Add your primary site address so you never have to re-enter delivery and service details.
          </p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
          >
            Add Primary Location
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
                    {addr.locationType && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                        {addr.locationType.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      {addr.addressType}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-foreground/80 space-y-1 mb-3">
                  {addr.recipientName && (
                    <p className="font-semibold text-foreground">{addr.recipientName}</p>
                  )}
                  <p className="font-medium">{addr.line1}</p>
                  {addr.line2 && <p>{addr.line2}</p>}
                  {addr.locality && <p className="text-muted-foreground">Area: {addr.locality}</p>}
                  {addr.landmark && <p className="text-muted-foreground">Landmark: {addr.landmark}</p>}
                  <p className="text-muted-foreground">
                    {addr.city}{addr.district ? `, ${addr.district}` : ''}, {addr.state} —{' '}
                    <span className="font-mono font-medium text-foreground">{addr.pincode}</span>
                  </p>
                  {(addr.contactPerson || addr.contactPhone) && (
                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/40 mt-1">
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
                      title="Edit Location"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(addr.id)}
                      className="text-xs text-destructive hover:text-destructive/80 p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center touch-manipulation"
                      title="Deactivate Location"
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

      {/* Add / Edit Location Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 my-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h4 className="font-semibold text-base text-foreground">
                  {editingId ? 'Edit Location' : 'Add New Location'}
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Changes apply to future requirements. Past contracts retain frozen snapshots.
                </p>
              </div>
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
                    Location Label *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Gate, Tower B, Hosur Plant"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Location Type
                  </label>
                  <select
                    value={locationType}
                    onChange={(e) => setLocationType(e.target.value as LocationType)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  >
                    {allowedLocationTypes.map((lt) => (
                      <option key={lt} value={lt}>
                        {lt.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Address Classification
                  </label>
                  <select
                    value={addressType}
                    onChange={(e) => setAddressType(e.target.value as AddressClassification)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  >
                    <option value="DELIVERY">Delivery / Operational Site</option>
                    <option value="BILLING">Billing / Registered Office</option>
                    <option value="BOTH">Delivery & Billing</option>
                    <option value="REGISTERED">Registered Statutory Office</option>
                    <option value="SITE">Project Site / Staging</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Recipient / Entity Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Durga Rainbow RWA / Precision Gears Ltd"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Address Line 1 (Building, Street, Plot) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plot 100, Sector 4, SIPCOT Phase 1"
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
                    placeholder="e.g. Perundurai Road"
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
                    placeholder="e.g. Near Toll Gate"
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
                    placeholder="e.g. Senthil Kumar (Estate Mgr)"
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
                  Set as Primary Default Location
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
                  {saving ? 'Saving...' : editingId ? 'Update Location' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
