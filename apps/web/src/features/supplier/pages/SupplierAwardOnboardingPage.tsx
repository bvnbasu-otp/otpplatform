import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button, Input, Field } from '@/components/ui';

export function SupplierAwardOnboardingPage() {
  const { token: paramToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const token = paramToken || searchParams.get('token') || '';
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [supplierData, setSupplierData] = useState<any>(null);

  // Form states
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Auto derive PAN from GSTIN if 15 chars typed
  useEffect(() => {
    const cleanGst = gstin.trim().toUpperCase();
    if (cleanGst.length === 15 && !pan) {
      const derivedPan = cleanGst.substring(2, 12);
      setPan(derivedPan);
    }
  }, [gstin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Missing onboarding invitation token');
      return;
    }

    if (!legalName.trim() || !line1.trim() || !city.trim() || !state.trim() || !pincode.trim()) {
      setError('Please provide legal business name, address line 1, city, state, and PIN code.');
      return;
    }

    if (!/^[0-9]{6}$/.test(pincode.trim())) {
      setError('PIN code must be a valid 6-digit Indian postal code.');
      return;
    }

    const cleanPan = pan.trim().toUpperCase();
    if (cleanPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      setError('PAN format is invalid. Must be 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).');
      return;
    }

    const cleanGst = gstin.trim().toUpperCase();
    if (cleanGst && cleanPan && cleanGst.substring(2, 12) !== cleanPan) {
      setError('PAN does not match the PAN characters (positions 3-12) of the provided GSTIN.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const registeredAddress = {
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
        country: 'India',
      };

      const { data, error: rpcErr } = await supabase.rpc('complete_supplier_onboarding_atomic', {
        p_token: token.trim(),
        p_legal_name: legalName.trim(),
        p_trade_name: tradeName.trim() || legalName.trim(),
        p_gstin: cleanGst || null,
        p_pan: cleanPan || null,
        p_address: registeredAddress,
        p_contact_person: contactPerson.trim() || null,
        p_contact_phone: contactPhone.trim() || null,
        p_contact_email: contactEmail.trim() || null,
      });

      if (rpcErr) throw rpcErr;
      if (data && !data.ok) throw new Error(data.error || 'Failed to complete supplier verification');

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error completing onboarding submission');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 shadow-xl text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-3xl">
            ✓
          </div>
          <h2 className="text-xl font-bold text-foreground">Supplier Onboarding Verified!</h2>
          <p className="text-sm text-muted-foreground">
            Your statutory business identity and address have been truthfully verified. The buyer has been notified and downstream Purchase Order issuance is unlocked.
          </p>
          <div className="p-3 bg-muted rounded-xl text-xs font-mono text-muted-foreground">
            Status: <span className="text-emerald-500 font-bold">VERIFIED & ACTIVE</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/supplier/quotes')}
            className="w-full py-3 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm min-h-[44px]"
          >
            Go to Supplier Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]">
      <div className="max-w-xl w-full bg-card border border-border rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20">
            Award Gate • Step 2 of 2
          </span>
          <h1 className="text-xl font-bold text-foreground mt-2">
            Supplier Identity & Statutory Onboarding
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Congratulations! Your quotation was selected for contract award. Complete your legal profile to unlock buyer identity reveal, purchase order generation, and milestone settlement.
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              1. Business & Legal Identity
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Legal Entity Name (per PAN/GST) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Electricals Pvt Ltd"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Trade / Brand Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Power"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  GSTIN (15 Digits)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="29ABCDE1234F1Z5"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Permanent Account Number (PAN)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="ABCDE1234F"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              2. Registered Business Address
            </h3>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Address Line 1 *
              </label>
              <input
                type="text"
                required
                placeholder="Building No, Industrial Area, Street"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Address Line 2
              </label>
              <input
                type="text"
                placeholder="Area / Landmark"
                value={line2}
                onChange={(e) => setLine2(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
              />
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
                  placeholder="560100"
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
          </div>

          <div className="space-y-3 pt-3 border-t border-border">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              3. Operational Contact Person
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  placeholder="contact@company.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.99] min-h-[44px] shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Verifying & Submitting...' : 'Submit Profile & Verify Identity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
