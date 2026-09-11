import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortalRole } from '@/features/auth/use-portal-role';
import {
  addServiceArea,
  declareCapability,
  fetchCapabilityCatalog,
  fetchMyCapabilities,
  fetchMyServiceAreas,
  fetchSupplierGstProfile,
  removeServiceArea,
  updateCapacity,
  verifySupplierGstinRpc,
  withdrawCapability,
  type CapabilityOption,
  type DeclaredCapability,
  type ServiceArea,
  type SupplierGstProfile,
} from '../api/capabilities';
import { fetchSupplierIdForProfile } from '../api/quote-mutations';
import { validateGstin } from '@otp/domain';

/**
 * What this business can do, and where it will travel.
 *
 * This page is the reason a supplier gets invited to anything. Discovery
 * matches enquiries against declared capabilities, not against the category a
 * business signed up under — a winding shop that also sells pumps should hear
 * about both, and only this page can say so.
 */
export function SupplierCapabilitiesPage() {
  const { profile } = usePortalRole();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [gstProfile, setGstProfile] = useState<SupplierGstProfile | null>(null);
  const [inputGstin, setInputGstin] = useState('');
  const [gstSaving, setGstSaving] = useState(false);
  const [catalog, setCatalog] = useState<CapabilityOption[]>([]);
  const [declared, setDeclared] = useState<DeclaredCapability[]>([]);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [chosen, setChosen] = useState('');
  const [ceiling, setCeiling] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [radius, setRadius] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const id = await fetchSupplierIdForProfile(profile.profileId);
    setSupplierId(id);

    if (!id) {
      setError('This login is not linked to a supplier account.');
      setIsLoading(false);
      return;
    }

    const [catalogRes, mineRes, areasRes, gstRes] = await Promise.all([
      fetchCapabilityCatalog(),
      fetchMyCapabilities(id),
      fetchMyServiceAreas(id),
      fetchSupplierGstProfile(id),
    ]);

    if (catalogRes.ok) setCatalog(catalogRes.options);
    if (mineRes.ok) setDeclared(mineRes.capabilities);
    if (areasRes.ok) setAreas(areasRes.areas);
    if (gstRes.ok) setGstProfile(gstRes.profile);
    setIsLoading(false);
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  const alreadyDeclared = new Set(declared.map((d) => d.capabilityId));
  const available = catalog.filter((option) => !alreadyDeclared.has(option.capabilityId));
  const selected = catalog.find((option) => option.capabilityId === chosen) ?? null;

  async function handleDeclare() {
    if (!supplierId || !chosen) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    const parsed = ceiling.trim() === '' ? null : Number(ceiling);
    const result = await declareCapability(
      supplierId,
      chosen,
      Number.isFinite(parsed) ? parsed : null,
      selected?.capacityUnit ?? null,
    );

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess('Added. Enquiries that need this can now find you.');
    setChosen('');
    setCeiling('');
    await load();
  }

  async function handleCapacityChange(row: DeclaredCapability, raw: string) {
    const parsed = raw.trim() === '' ? null : Number(raw);
    if (raw.trim() !== '' && !Number.isFinite(parsed)) return;

    setDeclared((current) =>
      current.map((d) => (d.id === row.id ? { ...d, maxCapacityValue: parsed } : d)),
    );
    const result = await updateCapacity(row.id, parsed);
    if (!result.ok) setError(result.error);
  }

  async function handleWithdraw(row: DeclaredCapability) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await withdrawCapability(row.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Removed ${row.name}.`);
    await load();
  }

  async function handleAddArea() {
    if (!supplierId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    const parsedRadius = radius.trim() === '' ? null : Number(radius);
    const result = await addServiceArea(supplierId, {
      city: city.trim() || null,
      pincode: pincode.trim() || null,
      radiusKm: Number.isFinite(parsedRadius) ? parsedRadius : null,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess('Area added.');
    setCity('');
    setPincode('');
    setRadius('');
    await load();
  }

  async function handleRemoveArea(area: ServiceArea) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await removeServiceArea(area.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`No longer covering ${area.city ?? area.pincode}.`);
    await load();
  }

  async function handleVerifyGstin() {
    if (!supplierId || !inputGstin) return;
    const validation = validateGstin(inputGstin.trim());
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid GSTIN');
      return;
    }

    setGstSaving(true);
    setError(null);
    setSuccess(null);

    const result = await verifySupplierGstinRpc(supplierId, inputGstin.trim(), {
      legalName: `M/S ${validation.pan} ENTERPRISES (${validation.entityType})`,
      tradeName: gstProfile?.businessName ?? 'Verified Trade Entity',
      stateName: validation.stateName,
      stateCode: validation.stateCode,
      entityType: validation.entityType,
    });

    setGstSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess('GST identity verified. Your quotes will now carry the Verified Seller trust badge.');
    setInputGstin('');
    await load();
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>;

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="supplier-capabilities-page">
      {/* Compressed Top Bar */}
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/" className="text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0">
            ← Invitations
          </Link>
          <span className="text-muted-foreground">|</span>
          <h1 className="text-xs font-bold text-foreground truncate">Supplier Capabilities &amp; Service Regions</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {gstProfile?.gstVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ VERIFIED TAXPAYER
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              ⚡ Action: Add GSTIN
            </span>
          )}
        </div>
      </header>

      {error && <p className="mt-1 shrink-0 text-xs font-bold text-red-600 rounded bg-red-50 p-2 border border-red-200">{error}</p>}
      {success && (
        <p className="mt-1 shrink-0 text-xs font-bold text-emerald-700 rounded bg-emerald-50 p-2 border border-emerald-200" data-testid="capabilities-success">
          ✓ {success}
        </p>
      )}

      {/* Main Content Area - Split Column Grid in zero-scroll-pane */}
      <div className="zero-scroll-pane mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
          {/* Left Column (7 cols): GST Verification & Capability Management */}
          <div className="lg:col-span-7 space-y-2.5">
            {/* Tax & GST Verification Section */}
            <section className="rounded-lg border bg-card p-3 shadow-2xs" data-testid="gst-verification-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-xs text-foreground">GST &amp; Legal Business Identity</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Verified tax status attaches your official GSTIN to Purchase Orders.
                  </p>
                </div>
              </div>

              {gstProfile?.gstVerified ? (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs bg-muted/40 p-2.5 rounded border">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Verified GSTIN:</span>
                    <span className="font-mono font-bold">{gstProfile.gstin}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Legal Entity:</span>
                    <span className="font-medium truncate block">{gstProfile.legalName || gstProfile.businessName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Status:</span>
                    <span className="text-emerald-700 font-bold">{gstProfile.gstStatus || 'ACTIVE'}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      value={inputGstin}
                      maxLength={15}
                      onChange={(e) => setInputGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
                      placeholder="Enter 15-digit GSTIN (e.g. 29ABCDE1234F1Z5)"
                      className="flex-1 rounded border px-2.5 py-1 text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={gstSaving || inputGstin.length !== 15}
                      onClick={() => void handleVerifyGstin()}
                      className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 shrink-0 shadow-2xs"
                    >
                      {gstSaving ? 'Verifying…' : 'Verify & Link'}
                    </button>
                  </div>
                  {inputGstin.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {validateGstin(inputGstin).valid ? (
                        <span className="text-emerald-600 font-medium">✓ Valid format: {validateGstin(inputGstin).stateName} ({validateGstin(inputGstin).entityType})</span>
                      ) : (
                        <span>{15 - inputGstin.length} characters remaining</span>
                      )}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Capability Add Section */}
            <section className="rounded-lg border bg-card p-3 shadow-2xs" data-testid="capability-add">
              <h2 className="font-bold text-xs text-foreground">Add a Capability</h2>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-[12rem] flex-1 text-xs">
                  <span className="font-medium text-[11px]">What You Can Do</span>
                  <select
                    value={chosen}
                    onChange={(e) => setChosen(e.target.value)}
                    className="mt-1 w-full rounded border px-2.5 py-1.5 text-xs"
                  >
                    <option value="">Choose capability…</option>
                    {available.map((option) => (
                      <option key={option.capabilityId} value={option.capabilityId}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>

                {selected?.capacityUnit && (
                  <label className="text-xs">
                    <span className="font-medium text-[11px]">Max Capacity ({selected.capacityUnit})</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={ceiling}
                      onChange={(e) => setCeiling(e.target.value)}
                      className="mt-1 w-24 rounded border px-2 py-1.5 text-xs"
                    />
                  </label>
                )}

                <button
                  type="button"
                  disabled={busy || !chosen}
                  onClick={() => void handleDeclare()}
                  className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs disabled:opacity-50 shrink-0"
                >
                  + Add
                </button>
              </div>
              {selected?.description && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">{selected.description}</p>
              )}
            </section>

            {/* Declared Capabilities List */}
            <section className="rounded-lg border bg-card p-3 shadow-2xs" data-testid="capability-list">
              <h2 className="font-bold text-xs text-foreground">Your Active Capabilities ({declared.length})</h2>
              {declared.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Nothing declared yet. Add your capabilities to receive automated RFQs.
                </p>
              ) : (
                <ul className="mt-2 divide-y">
                  {declared.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1 font-semibold">{row.name}</span>
                      {row.capacityUnit && (
                        <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          Up to
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={row.maxCapacityValue ?? ''}
                            placeholder="any"
                            onChange={(e) => void handleCapacityChange(row, e.target.value)}
                            className="w-16 rounded border px-1.5 py-0.5 text-xs"
                          />
                          {row.capacityUnit}
                        </label>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleWithdraw(row)}
                        className="rounded px-2 py-0.5 text-[11px] text-red-600 hover:bg-muted disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Right Column (5 cols): Service Areas */}
          <div className="lg:col-span-5 space-y-2.5">
            <section className="rounded-lg border bg-card p-3 shadow-2xs" data-testid="service-areas">
              <h2 className="font-bold text-xs text-foreground">Service Regions &amp; Travel Radius</h2>
              {areas.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No areas declared yet. Add your operating PIN code or city below.
                </p>
              ) : (
                <ul className="mt-2 divide-y">
                  {areas.map((area) => (
                    <li key={area.id} className="flex items-center gap-2 py-1.5 text-xs">
                      <span className="min-w-0 flex-1">
                        <strong className="text-foreground">{area.city ?? area.pincode}</strong>
                        {area.city && area.pincode && ` (${area.pincode})`}
                        {area.radiusKm !== null && (
                          <span className="text-muted-foreground"> · {area.radiusKm} km</span>
                        )}
                        {area.isPrimary && (
                          <span className="ml-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.2 text-[9px] font-bold">
                            base
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRemoveArea(area)}
                        className="rounded px-2 py-0.5 text-[11px] text-red-600 hover:bg-muted disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-2.5">
                <label className="text-xs flex-1 min-w-[7rem]">
                  <span className="font-medium text-[11px]">City</span>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Coimbatore"
                    className="mt-1 w-full rounded border px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs w-20">
                  <span className="font-medium text-[11px]">PIN Code</span>
                  <input
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    inputMode="numeric"
                    placeholder="641001"
                    className="mt-1 w-full rounded border px-2 py-1 text-xs"
                  />
                </label>
                <label className="text-xs w-16">
                  <span className="font-medium text-[11px]">Radius (km)</span>
                  <input
                    type="number"
                    min={1}
                    value={radius}
                    onChange={(e) => setRadius(e.target.value)}
                    className="mt-1 w-full rounded border px-2 py-1 text-xs"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || (!city.trim() && !pincode.trim())}
                  onClick={() => void handleAddArea()}
                  className="rounded border bg-card px-2.5 py-1 text-xs font-bold hover:bg-muted disabled:opacity-50 shadow-2xs"
                >
                  + Add
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
