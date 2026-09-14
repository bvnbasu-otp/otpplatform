import { useState, useEffect } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  PRESET_CAPABILITY_CATEGORIES,
  PRESET_SLA_OPTIONS,
  PRESET_CERTIFICATIONS,
  type SupplierCapabilityProfile,
} from '../types/capability-profile';
import { useSupplierRadarCapabilities } from '../hooks/use-supplier-radar';
import { validateGstin } from '@otp/domain';

export interface SupplierCapabilityModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (profile: SupplierCapabilityProfile) => void;
}

export function SupplierCapabilityModal({
  open,
  onClose,
  onSaved,
}: SupplierCapabilityModalProps) {
  const { profile, updateProfile, visibilityScore } = useSupplierRadarCapabilities();

  const [selectedCategories, setSelectedCategories] = useState<string[]>(profile.categories);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(profile.radiusKm);
  const [isPanIndia, setIsPanIndia] = useState<boolean>(profile.isPanIndia);
  const [baseCity, setBaseCity] = useState<string>(profile.baseCity || 'Bengaluru');
  const [pincode, setPincode] = useState<string>(profile.pincode || '560001');
  const [selectedSlas, setSelectedSlas] = useState<string[]>(profile.slaBadges);
  const [selectedCerts, setSelectedCerts] = useState<string[]>(profile.certifications);
  const [gstin, setGstin] = useState<string>(profile.gstin || '');
  const [capacityNotes, setCapacityNotes] = useState<string>(profile.capacityNotes || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state with profile whenever opened
  useEffect(() => {
    if (open) {
      setSelectedCategories(profile.categories);
      setRadiusKm(profile.radiusKm);
      setIsPanIndia(profile.isPanIndia);
      setBaseCity(profile.baseCity || 'Bengaluru');
      setPincode(profile.pincode || '560001');
      setSelectedSlas(profile.slaBadges);
      setSelectedCerts(profile.certifications);
      setGstin(profile.gstin || '');
      setCapacityNotes(profile.capacityNotes || '');
      setSaveSuccess(false);
    }
  }, [open, profile]);

  const toggleCategory = (catName: string) => {
    setSelectedCategories((prev) =>
      prev.includes(catName) ? prev.filter((c) => c !== catName) : [...prev, catName],
    );
  };

  const handleAddCustomCategory = () => {
    const trimmed = customCategoryInput.trim();
    if (trimmed && !selectedCategories.includes(trimmed)) {
      setSelectedCategories((prev) => [...prev, trimmed]);
      setCustomCategoryInput('');
    }
  };

  const toggleSla = (slaLabel: string) => {
    setSelectedSlas((prev) =>
      prev.includes(slaLabel) ? prev.filter((s) => s !== slaLabel) : [...prev, slaLabel],
    );
  };

  const toggleCert = (certLabel: string) => {
    setSelectedCerts((prev) =>
      prev.includes(certLabel) ? prev.filter((c) => c !== certLabel) : [...prev, certLabel],
    );
  };

  const handleSave = () => {
    const updated: SupplierCapabilityProfile = {
      categories: selectedCategories.length > 0 ? selectedCategories : ['General Services'],
      radiusKm,
      isPanIndia,
      baseCity: baseCity.trim() || 'Bengaluru',
      pincode: pincode.trim() || '560001',
      slaBadges: selectedSlas,
      certifications: selectedCerts,
      gstin: gstin.trim().toUpperCase(),
      capacityNotes: capacityNotes.trim(),
      updatedAt: new Date().toISOString(),
    };

    const saved = updateProfile(updated);
    setSaveSuccess(true);
    if (onSaved) {
      onSaved(saved);
    }

    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 600);
  };

  // Preview projected reach boost
  const projectedBoost = Math.min(
    99,
    Math.round(
      selectedCategories.length * 8 +
        (isPanIndia ? 25 : Math.min(25, radiusKm / 3)) +
        selectedSlas.length * 6 +
        selectedCerts.length * 8,
    ),
  );

  const gstinValidation = gstin ? validateGstin(gstin.trim()) : null;

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-300 font-black text-sm">
            📡
          </span>
          <div>
            <span className="font-extrabold text-foreground text-sm block">
              Supplier Capabilities &amp; Radar Scope
            </span>
          </div>
        </div>
      }
      subtitle="Maximize Business Reach — Update your categories, travel radius, SLAs, and verified credentials to rank higher in buyer RFQ discovery."
      className="sm:max-w-2xl max-h-[92vh]"
    >
      <div className="space-y-4 pb-2" data-testid="supplier-capability-modal">
        {/* 1. Live Match Radar Impact Banner */}
        <section className="rounded-2xl bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-950 text-white p-3.5 shadow-md space-y-2 border border-purple-500/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-xs font-black tracking-wide text-purple-200 uppercase">
                Radar Match Readiness
              </span>
            </div>
            <span className="rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2.5 py-0.5 text-[10px] font-black">
              ★ {projectedBoost}% Visibility Boost
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="rounded-xl bg-white/10 p-2 backdrop-blur-xs">
              <span className="text-[10px] text-purple-200 block font-bold">Categories</span>
              <span className="text-sm font-black text-white">{selectedCategories.length} Active</span>
            </div>
            <div className="rounded-xl bg-white/10 p-2 backdrop-blur-xs">
              <span className="text-[10px] text-purple-200 block font-bold">Coverage</span>
              <span className="text-sm font-black text-white">
                {isPanIndia ? 'Pan-India' : `${radiusKm} km`}
              </span>
            </div>
            <div className="rounded-xl bg-white/10 p-2 backdrop-blur-xs">
              <span className="text-[10px] text-purple-200 block font-bold">Trust Badges</span>
              <span className="text-sm font-black text-white">
                {selectedCerts.length + selectedSlas.length} Active
              </span>
            </div>
          </div>
        </section>

        {/* 2. Domain Taxonomy & Product/Service Categories */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
              <span>🏷️</span> Product &amp; Service Categories ({selectedCategories.length})
            </label>
            <span className="text-[10px] font-medium text-muted-foreground">Select all that apply</span>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 border rounded-xl bg-muted/20 scrollbar-thin">
            {PRESET_CAPABILITY_CATEGORIES.map((cat) => {
              const isSelected = selectedCategories.includes(cat.label);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.label)}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 mobile-touch-target ${
                    isSelected
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-card border text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                  data-testid={`category-chip-${cat.id}`}
                >
                  <span className="text-sm">{cat.icon}</span>
                  <span>{cat.label}</span>
                  {isSelected && <span className="font-bold">✓</span>}
                </button>
              );
            })}

            {/* Custom Added Categories */}
            {selectedCategories
              .filter(
                (cat) => !PRESET_CAPABILITY_CATEGORIES.some((preset) => preset.label === cat),
              )
              .map((customCat) => (
                <button
                  key={customCat}
                  type="button"
                  onClick={() => toggleCategory(customCat)}
                  className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-purple-600 text-white shadow-xs active:scale-95 mobile-touch-target"
                >
                  <span>✨</span>
                  <span>{customCat}</span>
                  <span>✕</span>
                </button>
              ))}
          </div>

          {/* Quick Add Custom Category */}
          <div className="flex gap-1.5 pt-0.5">
            <input
              type="text"
              value={customCategoryInput}
              onChange={(e) => setCustomCategoryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomCategory();
                }
              }}
              placeholder="Add other category (e.g., Heavy Generator Repair)"
              className="flex-1 rounded-xl border px-3 py-1.5 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-purple-500/30"
            />
            <button
              type="button"
              disabled={!customCategoryInput.trim()}
              onClick={handleAddCustomCategory}
              className="rounded-xl border bg-card px-3 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-40 transition shadow-2xs"
            >
              + Add
            </button>
          </div>
        </section>

        {/* 3. Delivery Radius / Geo-Coverage Preferences */}
        <section className="space-y-2 rounded-xl border p-3 bg-card shadow-2xs">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
              <span>📍</span> Delivery Radius &amp; Operating Geo-Coverage
            </label>
            <span className="text-xs font-black text-purple-600 dark:text-purple-400">
              {isPanIndia ? 'Pan-India Reach' : `${radiusKm} km radius`}
            </span>
          </div>

          {/* Quick Radius Chips */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: '5 km (Hyperlocal)', km: 5, pan: false },
              { label: '15 km (City Zone)', km: 15, pan: false },
              { label: '50 km (Metro)', km: 50, pan: false },
              { label: '200 km (State-wide)', km: 200, pan: false },
              { label: '🇮🇳 Pan-India (National)', km: 1000, pan: true },
            ].map((r) => {
              const active = r.pan ? isPanIndia : !isPanIndia && radiusKm === r.km;
              return (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => {
                    setIsPanIndia(r.pan);
                    if (!r.pan) setRadiusKm(r.km);
                  }}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold transition mobile-touch-target ${
                    active
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {!isPanIndia && (
            <div className="pt-1.5 space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>5 km</span>
                <span className="font-bold text-foreground">{radiusKm} km</span>
                <span>200 km</span>
              </div>
              <input
                type="range"
                min={5}
                max={200}
                step={5}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer"
                aria-label="Operating delivery radius in kilometers"
              />
            </div>
          )}

          {/* Location Inputs */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <span className="text-[10px] font-bold text-muted-foreground block">Operating Base City:</span>
              <input
                type="text"
                value={baseCity}
                onChange={(e) => setBaseCity(e.target.value)}
                placeholder="Bengaluru"
                className="mt-0.5 w-full rounded-xl border px-2.5 py-1.5 text-xs bg-card"
              />
            </div>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground block">PIN Code:</span>
              <input
                type="text"
                value={pincode}
                maxLength={6}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                placeholder="560001"
                className="mt-0.5 w-full rounded-xl border px-2.5 py-1.5 text-xs font-mono bg-card"
              />
            </div>
          </div>
        </section>

        {/* 4. Available Capacity & Turnaround SLA Badges */}
        <section className="space-y-2">
          <label className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
            <span>⚡</span> Capacity &amp; Turnaround SLA Badges ({selectedSlas.length})
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {PRESET_SLA_OPTIONS.map((sla) => {
              const isSelected = selectedSlas.includes(sla.label);
              return (
                <button
                  key={sla.id}
                  type="button"
                  onClick={() => toggleSla(sla.label)}
                  className={`p-2.5 rounded-xl border text-left transition flex items-start justify-between gap-2 mobile-touch-target ${
                    isSelected
                      ? 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/40 text-purple-950 dark:text-purple-200'
                      : 'bg-card text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  <div>
                    <span className="font-bold text-xs flex items-center gap-1.5 text-foreground">
                      <span>{sla.icon}</span>
                      <span>{sla.label}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground block mt-0.5 leading-tight">
                      {sla.description}
                    </span>
                  </div>
                  <span className={`text-xs font-bold ${isSelected ? 'text-purple-600' : 'text-muted'}`}>
                    {isSelected ? '✓' : '○'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 5. GSTIN & Business Certifications */}
        <section className="space-y-2 rounded-xl border p-3 bg-card shadow-2xs">
          <label className="text-xs font-extrabold text-foreground flex items-center gap-1.5">
            <span>🛡️</span> GSTIN &amp; Verified Business Badges
          </label>

          {/* GSTIN Input */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground block">
              15-Digit GSTIN (Increases Buyer Match Score +30%):
            </span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={15}
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
                placeholder="29ABCDE1234F1Z5"
                className="flex-1 rounded-xl border px-3 py-1.5 text-xs font-mono bg-card"
              />
              {gstin && (
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                  gstinValidation?.valid ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-300' : 'text-muted-foreground'
                }`}>
                  {gstinValidation?.valid ? `✓ ${gstinValidation.stateName}` : `${15 - gstin.length} chars`}
                </span>
              )}
            </div>
          </div>

          {/* Trust Badges */}
          <div className="pt-1 flex flex-wrap gap-1.5">
            {PRESET_CERTIFICATIONS.map((cert) => {
              const isSelected = selectedCerts.includes(cert.label);
              return (
                <button
                  key={cert.id}
                  type="button"
                  onClick={() => toggleCert(cert.label)}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 mobile-touch-target ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                  data-testid={`cert-chip-${cert.id}`}
                >
                  <span>{cert.icon}</span>
                  <span>{cert.label}</span>
                  {isSelected && <span className="font-bold">✓</span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* 6. Capacity & Machinery Notes */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-muted-foreground block">
            Specialized Equipment / Machinery Specifications (Optional):
          </span>
          <textarea
            rows={2}
            value={capacityNotes}
            onChange={(e) => setCapacityNotes(e.target.value)}
            placeholder="e.g. 4-axis VMC machining center, 50HP test bed, clean room assembly"
            className="w-full rounded-xl border px-3 py-1.5 text-xs bg-card resize-none"
          />
        </div>

        {/* Save & Feedback Notification */}
        {saveSuccess && (
          <div
            className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-2.5 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in"
            data-testid="modal-save-success"
          >
            <span>✓</span>
            <span>Capabilities updated! Supplier Radar match scores recalculated.</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 text-xs font-extrabold shadow-md transition flex items-center gap-1.5 active:scale-98 mobile-touch-target"
            data-testid="save-capabilities-btn"
          >
            <span>💾 Save &amp; Recalculate Radar</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
