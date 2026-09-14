import { useState, useEffect } from 'react';
import { validateGstin, lookupGstinBusinessDetails, type GstTaxpayerInfo } from '@otp/domain';

export interface GstinAutofillFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onAutofill?: (details: GstTaxpayerInfo) => void;
  describedBy?: string;
  className?: string;
  placeholder?: string;
  autoApplyOnValid?: boolean;
}

export function GstinAutofillField({
  id,
  value,
  onChange,
  onAutofill,
  describedBy,
  className = '',
  placeholder = '29ABCDE1234F1Z5',
  autoApplyOnValid = true,
}: GstinAutofillFieldProps) {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [gstDetails, setGstDetails] = useState<GstTaxpayerInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [hasApplied, setHasApplied] = useState(false);

  const cleanGstin = value.trim().toUpperCase();
  const validation = cleanGstin.length > 0 ? validateGstin(cleanGstin) : null;

  useEffect(() => {
    let active = true;

    if (cleanGstin.length === 15 && validation?.valid) {
      setIsLookingUp(true);
      setLookupError(null);

      void lookupGstinBusinessDetails(cleanGstin).then((res) => {
        if (!active) return;
        setIsLookingUp(false);
        if (res.verified && res.details) {
          setGstDetails(res.details);
          if (autoApplyOnValid && onAutofill && !hasApplied) {
            onAutofill(res.details);
            setHasApplied(true);
          }
        } else {
          setLookupError(res.error ?? 'Failed to retrieve GSTIN details');
          setGstDetails(null);
        }
      });
    } else {
      setGstDetails(null);
      setLookupError(null);
      setHasApplied(false);
    }

    return () => {
      active = false;
    };
  }, [cleanGstin, validation?.valid, autoApplyOnValid, onAutofill, hasApplied]);

  const handleManualApply = () => {
    if (gstDetails && onAutofill) {
      onAutofill(gstDetails);
      setHasApplied(true);
    }
  };

  return (
    <div className="space-y-2" data-testid="gstin-autofill-container">
      <div className="relative">
        <input
          id={id}
          value={value}
          maxLength={15}
          onChange={(e) => {
            const nextVal = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
            onChange(nextVal);
          }}
          aria-describedby={describedBy}
          placeholder={placeholder}
          className={`${className} font-mono uppercase tracking-wider`}
        />
        {isLookingUp && (
          <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[11px] font-semibold text-primary">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Validating GSTIN…</span>
          </div>
        )}
      </div>

      {cleanGstin.length > 0 && (
        <div className="text-xs">
          {validation?.valid && gstDetails ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 shadow-2xs dark:border-emerald-800/80 dark:bg-emerald-950/40 animate-in fade-in-50">
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-emerald-200 dark:border-emerald-800/60 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-black text-white">
                    ✓
                  </span>
                  <strong className="text-xs font-black text-emerald-900 dark:text-emerald-200">
                    Live Verified GSTIN ({gstDetails.status})
                  </strong>
                </div>

                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-extrabold text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                  ⚡ {gstDetails.taxpayerType || 'REGULAR'} TAXPAYER
                </span>
              </div>

              <div className="mt-2 space-y-1 text-emerald-950 dark:text-emerald-100 text-[11px]">
                <p>
                  <strong className="font-semibold text-emerald-900 dark:text-emerald-300">Legal Name:</strong>{' '}
                  <span className="font-bold">{gstDetails.legalName}</span>
                </p>
                {gstDetails.tradeName && gstDetails.tradeName !== gstDetails.legalName && (
                  <p>
                    <strong className="font-semibold text-emerald-900 dark:text-emerald-300">Trade Name:</strong>{' '}
                    <span>{gstDetails.tradeName}</span>
                  </p>
                )}
                {gstDetails.principalAddress && (
                  <p className="text-muted-foreground dark:text-emerald-300/80">
                    <strong className="font-semibold text-emerald-900 dark:text-emerald-300">Registered Place:</strong>{' '}
                    <span>
                      {[
                        gstDetails.principalAddress.line1,
                        gstDetails.principalAddress.city,
                        gstDetails.principalAddress.state,
                        gstDetails.principalAddress.pincode ? `PIN: ${gstDetails.principalAddress.pincode}` : '',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </p>
                )}
              </div>

              {onAutofill && (
                <div className="mt-2.5 flex items-center justify-between pt-1 border-t border-emerald-200 dark:border-emerald-800/60">
                  <span className="text-[10px] text-emerald-800 dark:text-emerald-300">
                    {hasApplied ? '✓ Legal details populated into form' : 'Autofill available'}
                  </span>
                  <button
                    type="button"
                    onClick={handleManualApply}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition min-h-[44px] mobile-touch-target"
                  >
                    <span>⚡</span>
                    <span>{hasApplied ? 'Re-apply Details' : 'Autofill Name & Address'}</span>
                  </button>
                </div>
              )}
            </div>
          ) : cleanGstin.length === 15 && (!validation?.valid || lookupError) ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              ✕ {lookupError || validation?.error}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              {15 - cleanGstin.length} characters remaining (e.g. 29 for Karnataka, 33 for Tamil Nadu, 27 for Maharashtra)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
