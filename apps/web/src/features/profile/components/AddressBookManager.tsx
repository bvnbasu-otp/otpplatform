import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/features/auth';
import {
  type BuyerAddress,
  type LocationType,
  type AddressClassification,
  type BuyerPersona,
  getAllowedLocationTypes,
  getDefaultLocationType,
} from '@otp/domain';
import {
  deactivateBuyerAddress,
  fetchBuyerAddresses,
  saveBuyerAddress,
  setPrimaryBuyerAddress,
} from '../api/buyer-addresses';
import { BuyerAddressCard } from './BuyerAddressCard';

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
  const [editingStateCode, setEditingStateCode] = useState<string | null>(null);

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
    const res = await fetchBuyerAddresses(organizationId, persona);
    if (res.ok) {
      setAddresses(res.addresses);
    } else {
      setError(res.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAddresses();
  }, [user?.id, organizationId, persona]);

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await saveBuyerAddress({
      addressId: editingId,
      organizationId,
      persona,
      label,
      line1,
      line2,
      landmark,
      city,
      state,
      stateCode: editingStateCode,
      pincode,
      addressType,
      recipientName,
      contactPerson,
      contactPhone,
      isPrimary,
      isFirstAddress: addresses.length === 0,
    });

    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    resetForm();
    setShowAddModal(false);
    await fetchAddresses();
  };

  const handleSetPrimary = async (addressId: string) => {
    const target = addresses.find((a) => a.id === addressId);
    if (!target) return;
    const res = await setPrimaryBuyerAddress(target, organizationId, persona);
    if (!res.ok) {
      setError(res.error || 'Error updating primary address');
      return;
    }
    await fetchAddresses();
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm('Are you sure you want to deactivate this address? (Historical procurement records will remain 100% intact.)')) {
      return;
    }
    const res = await deactivateBuyerAddress(addressId);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await fetchAddresses();
  };

  const startEdit = (addr: BuyerAddress) => {
    setEditingId(addr.id);
    setEditingStateCode(addr.stateCode ?? null);
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
    setEditingStateCode(null);
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
          {addresses.map((addr) => (
            <BuyerAddressCard
              key={addr.id}
              address={addr}
              isSelected={selectedAddressId === addr.id}
              onSetPrimary={handleSetPrimary}
              onSelect={onAddressSelected}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ))}
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

              {/* Secondary Address & Landmark Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Sub-locality / Area (Line 2)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Perundurai Road / Sector 4"
                    value={line2}
                    onChange={(e) => setLine2(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Landmark / Delivery Instructions
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Near Toll Gate / Security Gate 2"
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
