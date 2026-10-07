import { validateGstin, type GstTaxpayerInfo } from '@otp/domain';

export interface GstinAutofillFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Retained so existing callers compile. Format validation never calls this:
   * a checksum-valid GSTIN is not a taxpayer record and must not overwrite
   * business name, city, or PIN.
   */
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
  describedBy,
  className = '',
  placeholder = '15-character GSTIN',
}: GstinAutofillFieldProps) {
  const cleanGstin = value.trim().toUpperCase();
  const validation = cleanGstin.length > 0 ? validateGstin(cleanGstin) : null;

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
      </div>

      {cleanGstin.length > 0 && (
        <div className="text-xs">
          {validation?.valid ? (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50/90 p-3 shadow-2xs dark:border-amber-800/80 dark:bg-amber-950/40"
              data-testid="gstin-format-only"
            >
              <p className="text-xs font-bold text-amber-950 dark:text-amber-100">
                Valid GSTIN format — not a government registry lookup. Not GST verified.
              </p>
              <p className="mt-1 text-[11px] text-amber-900 dark:text-amber-200">
                The state code in this number is {validation.stateName}. No legal name, trade name, city, or PIN is filled from this check.
              </p>
            </div>
          ) : cleanGstin.length === 15 ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              ✕ {validation?.error || 'Invalid GSTIN'}
            </div>
          ) : (
            <div className="text-[11px] text-muted-foreground">
              {15 - cleanGstin.length} characters remaining. A complete number is checked for format only.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
