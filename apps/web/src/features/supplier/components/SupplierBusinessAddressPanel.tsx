import { useEffect, useId, useState, type FormEvent } from 'react';
import type { SupplierBusinessAddress } from '@otp/domain';
import { validateSupplierBusinessAddress } from '@otp/domain';
import { fetchSupplierBusinessAddress, saveSupplierBusinessAddress } from '../api/business-address';

export interface SupplierBusinessAddressPanelProps {
  supplierId: string | null;
  mode?: 'gate' | 'profile';
  onSaved?: (address: SupplierBusinessAddress) => void;
}

const EMPTY: SupplierBusinessAddress = {
  line1: '',
  line2: null,
  city: '',
  state: '',
  pincode: '',
  country: 'India',
};

export function SupplierBusinessAddressPanel({
  supplierId,
  mode = 'profile',
  onSaved,
}: SupplierBusinessAddressPanelProps) {
  const formId = useId();
  const [form, setForm] = useState<SupplierBusinessAddress>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [hasRegisteredAddress, setHasRegisteredAddress] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!supplierId) {
      setLoading(false);
      setError('This account is not linked to a supplier business profile.');
      return;
    }
    setLoading(true);
    setError(null);
    void fetchSupplierBusinessAddress(supplierId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setHasRegisteredAddress(result.snapshot.hasRegisteredAddress);
      if (result.snapshot.address) setForm(result.snapshot.address);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [supplierId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!supplierId) return;
    const validation = validateSupplierBusinessAddress(form);
    setFieldErrors(validation.errors);
    if (!validation.isValid) {
      setError('Complete the business address before continuing.');
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveSupplierBusinessAddress(supplierId, form);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setForm(result.address);
    setSaved(true);
    onSaved?.(result.address);
  }

  const heading = mode === 'gate' ? 'Add your business address' : 'Business address';

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs space-y-4"
      data-testid="supplier-business-address-panel"
      aria-labelledby={`${formId}-heading`}
    >
      <div className="space-y-1">
        <h2 id={`${formId}-heading`} className="text-sm font-extrabold text-foreground">
          {heading}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          This is your primary business or office address. OTP uses it for your supplier workspace.
          It does not replace the statutory GST registered address.
        </p>
        {hasRegisteredAddress && (
          <p className="text-[11px] text-muted-foreground" data-no-translate="true">
            A statutory registered address is already on file and will be left unchanged.
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground" role="status">Loading business address…</p>
      ) : (
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3" noValidate>
          <Field
            id={`${formId}-line1`}
            label="Address line"
            value={form.line1}
            error={fieldErrors.line1}
            autoComplete="address-line1"
            onChange={(line1) => setForm((current) => ({ ...current, line1 }))}
          />
          <Field
            id={`${formId}-line2`}
            label="Area, building, or floor (optional)"
            value={form.line2 ?? ''}
            autoComplete="address-line2"
            onChange={(line2) => setForm((current) => ({ ...current, line2: line2 || null }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              id={`${formId}-city`}
              label="City"
              value={form.city}
              error={fieldErrors.city}
              autoComplete="address-level2"
              onChange={(city) => setForm((current) => ({ ...current, city }))}
            />
            <Field
              id={`${formId}-state`}
              label="State"
              value={form.state}
              error={fieldErrors.state}
              autoComplete="address-level1"
              onChange={(state) => setForm((current) => ({ ...current, state }))}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              id={`${formId}-pincode`}
              label="PIN code"
              value={form.pincode}
              error={fieldErrors.pincode}
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              onChange={(pincode) => setForm((current) => ({ ...current, pincode: pincode.replace(/\D/g, '').slice(0, 6) }))}
            />
            <Field
              id={`${formId}-country`}
              label="Country"
              value={form.country}
              autoComplete="country-name"
              onChange={(country) => setForm((current) => ({ ...current, country }))}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
              {error}
            </p>
          )}
          {saved && !error && (
            <p className="text-xs font-semibold text-emerald-700" role="status">
              Business address saved. This is the only primary business address for this supplier.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !supplierId}
            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 mobile-touch-target"
          >
            {saving ? 'Saving…' : 'Save business address'}
          </button>
        </form>
      )}
    </section>
  );
}

function Field({
  id,
  label,
  value,
  error,
  onChange,
  autoComplete,
  inputMode,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  inputMode?: 'text' | 'numeric';
  maxLength?: number;
}) {
  return (
    <label className="block space-y-1" htmlFor={id}>
      <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
      <input
        id={id}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground min-h-[44px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
      />
      {error && (
        <span id={`${id}-error`} className="block text-[11px] font-medium text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}
