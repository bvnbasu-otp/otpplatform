import React, { useState } from 'react';
import { useLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';

export interface PersonalInfoData {
  fullName: string;
  preferredLanguage: SupportedLanguage;
  photoUrl?: string;
  pan?: string;
  gstin?: string;
  upiId?: string;
}

export interface WizardStep6PersonalInfoProps {
  initialData?: Partial<PersonalInfoData>;
  onNext: (data: PersonalInfoData) => void;
  onBack: () => void;
}

export function WizardStep6PersonalInfo({
  initialData,
  onNext,
  onBack,
}: WizardStep6PersonalInfoProps) {
  const { language, setLanguage, t } = useLanguage();
  const [fullName, setFullName] = useState(initialData?.fullName || '');
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(
    initialData?.preferredLanguage || language
  );
  const [photoPreview, setPhotoPreview] = useState<string | null>(initialData?.photoUrl || null);
  const [isFinancialsOpen, setIsFinancialsOpen] = useState(false);
  const [pan, setPan] = useState(initialData?.pan || '');
  const [gstin, setGstin] = useState(initialData?.gstin || '');
  const [upiId, setUpiId] = useState(initialData?.upiId || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    }
  }

  function handleLanguageChange(code: SupportedLanguage) {
    setSelectedLanguage(code);
    setLanguage(code);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name');
      return;
    }
    setErrorMessage(null);
    onNext({
      fullName: fullName.trim(),
      preferredLanguage: selectedLanguage,
      photoUrl: photoPreview || undefined,
      pan: pan.trim().toUpperCase() || undefined,
      gstin: gstin.trim().toUpperCase() || undefined,
      upiId: upiId.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      <div>
        <WizardProgress step={6} total={8} label="Personal Info" onBack={onBack} />

        <div className="space-y-1 mb-6">
          <h2 className="text-xl font-black text-foreground">Personal Information</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Let&apos;s get to know you better.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground block">
              Full Name *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              required
              data-testid="input-full-name"
            />
          </div>

          {/* Profile Photo (Optional) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground block">
              Profile Photo <span className="text-muted-foreground font-normal">(Optional)</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/30">
                {photoPreview ? (
                  <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <Icon name="person" size={28} className="text-muted-foreground" />
                )}
              </div>
              <div>
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-bold text-foreground cursor-pointer shadow-2xs transition">
                  <Icon name="photo_camera" size={16} />
                  <span>{photoPreview ? 'Change Photo' : 'Add Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] text-muted-foreground mt-1">JPG or PNG up to 5MB</p>
              </div>
            </div>
          </div>

          {/* Preferred Language */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground block">
              Preferred Language
            </label>
            <select
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value as SupportedLanguage)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              data-testid="select-preferred-language"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.nativeName} ({lang.name})
                </option>
              ))}
            </select>
          </div>

          {/* Optional One-Time Tax & UPI/Bank Details Accordion */}
          <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setIsFinancialsOpen((prev) => !prev)}
              className="w-full p-3 flex items-center justify-between text-left text-xs font-bold text-foreground hover:bg-muted/40 transition"
            >
              <div className="flex items-center gap-2">
                <Icon name="account_balance" size={16} className="text-primary" />
                <span>Tax &amp; Payment Details <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span></span>
              </div>
              <Icon name={isFinancialsOpen ? 'expand_less' : 'expand_more'} size={18} className="text-muted-foreground" />
            </button>

            {isFinancialsOpen && (
              <div className="p-3 pt-0 border-t border-border/40 space-y-3 mt-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-foreground block">PAN Number</label>
                  <input
                    type="text"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className="w-full px-3 py-2 rounded-lg border border-border text-xs font-mono font-semibold uppercase text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-foreground block">GSTIN</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="29ABCDE1234F1Z5"
                    maxLength={15}
                    className="w-full px-3 py-2 rounded-lg border border-border text-xs font-mono font-semibold uppercase text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-foreground block">UPI ID / VPA</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="name@okaxis / mobile@upi"
                    className="w-full px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">For instant milestone escrow payments and refunds.</p>
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <p className="text-xs text-destructive font-medium bg-destructive/10 p-2.5 rounded-xl">
              {errorMessage}
            </p>
          )}

          <div className="pt-4 pb-2">
            <Button
              type="submit"
              className="w-full py-3.5 text-sm font-bold shadow-sm"
              data-testid="btn-next-personal-info"
            >
              Next
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
