import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';

export interface SavedAddress {
  id: string;
  label: 'Home' | 'Work' | 'Other';
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

export interface WizardStep7AddressesProps {
  initialAddresses?: SavedAddress[];
  onNext: (addresses: SavedAddress[], selectedAddressId?: string) => void;
  onBack: () => void;
}

export function WizardStep7Addresses({
  initialAddresses = [],
  onNext,
  onBack,
}: WizardStep7AddressesProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>(initialAddresses);
  const [selectedId, setSelectedId] = useState<string>(initialAddresses[0]?.id || '');
  const [isAdding, setIsAdding] = useState(initialAddresses.length === 0);

  // New address form state
  const [label, setLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSaveNewAddress(e: React.FormEvent) {
    e.preventDefault();
    if (!line1.trim() || !city.trim() || !pincode.trim()) {
      setError('Please provide address line, city, and a valid PIN code');
      return;
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      setError('PIN code must be exactly 6 digits');
      return;
    }

    const newAddr: SavedAddress = {
      id: `addr_${Date.now()}`,
      label,
      line1: line1.trim(),
      line2: line2.trim() || undefined,
      city: city.trim(),
      state: state.trim() || 'Karnataka',
      pincode: pincode.trim(),
      isDefault: addresses.length === 0,
    };

    const updated = [...addresses, newAddr];
    setAddresses(updated);
    setSelectedId(newAddr.id);
    setIsAdding(false);
    setError(null);

    // Reset inputs
    setLine1('');
    setLine2('');
    setCity('');
    setState('');
    setPincode('');
  }

  function handleContinue() {
    if (addresses.length === 0) {
      setError('Please add at least one address to continue');
      return;
    }
    onNext(addresses, selectedId);
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      <div>
        <WizardProgress step={7} total={8} label="Addresses" onBack={onBack} />

        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-black text-foreground">Addresses</h2>
            <p className="text-xs text-muted-foreground">
              {addresses.length} {addresses.length === 1 ? 'address' : 'addresses'} saved
            </p>
          </div>
          {!isAdding && (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-primary/40 bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition"
              data-testid="btn-add-address-trigger"
            >
              <Icon name="add" size={16} />
              Add Address
            </button>
          )}
        </div>

        {/* New Address Form Modal/Inline */}
        {isAdding && (
          <form onSubmit={handleSaveNewAddress} className="rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-3.5 mb-4 shadow-sm animate-in fade-in-50 duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-primary">New Delivery / Service Address</span>
              {addresses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Label Pills */}
            <div className="flex items-center gap-2">
              {(['Home', 'Work', 'Other'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabel(l)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                    label === l
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-foreground block">Flat / Building / Street *</label>
              <input
                type="text"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="e.g. 12, 4th Cross, Koramangala"
                className="w-full px-3 py-2 rounded-xl border border-border text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-foreground block">City *</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Bengaluru"
                  className="w-full px-3 py-2 rounded-xl border border-border text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-foreground block">PIN Code *</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="e.g. 560034"
                  maxLength={6}
                  className="w-full px-3 py-2 rounded-xl border border-border text-xs font-mono font-semibold text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                  required
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium bg-destructive/10 p-2 rounded-lg">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full py-2.5 text-xs font-bold shadow-xs">
              Save Address
            </Button>
          </form>
        )}

        {/* Saved Addresses List */}
        <div className="space-y-2.5">
          {addresses.map((addr) => {
            const isSelected = selectedId === addr.id;
            return (
              <div
                key={addr.id}
                onClick={() => setSelectedId(addr.id)}
                className={`p-3.5 rounded-2xl border-2 transition flex items-start justify-between cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-2xs ring-1 ring-primary/20'
                    : 'border-border/80 bg-card hover:border-border hover:bg-muted/30'
                }`}
                data-testid={`addr-card-${addr.id}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon name={addr.label === 'Home' ? 'home' : addr.label === 'Work' ? 'business' : 'location_on'} size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground">{addr.label}</span>
                      {addr.isDefault && (
                        <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.2 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground font-medium mt-0.5">{addr.line1}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {addr.city}, {addr.state} — <span className="font-mono font-bold text-foreground">{addr.pincode}</span>
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 ${
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-transparent'
                  }`}
                >
                  {isSelected && <Icon name="check" size={12} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pt-6 pb-4">
        <Button
          type="button"
          onClick={handleContinue}
          disabled={addresses.length === 0}
          className="w-full py-3.5 text-sm font-bold shadow-sm"
          data-testid="btn-next-addresses"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
