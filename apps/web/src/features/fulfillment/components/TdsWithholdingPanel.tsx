import React, { useState } from 'react';
import {
  calculateTds,
  type TdsSection,
  type TdsCalculationResult,
  generateForm16ACertificate,
} from '@otp/domain';
import { applyTdsWithholdingRpc, type TdsDeductionRecord } from '../api/payments';

interface TdsWithholdingPanelProps {
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceAmount: number;
  supplierName: string;
  supplierPan?: string | null;
  existingDeductions?: TdsDeductionRecord[];
  isBuyerUser: boolean;
  onDeductionApplied?: () => void;
}

export const TdsWithholdingPanel: React.FC<TdsWithholdingPanelProps> = ({
  organizationId,
  invoiceId,
  invoiceNumber,
  invoiceAmount,
  supplierName,
  supplierPan,
  existingDeductions = [],
  isBuyerUser,
  onDeductionApplied,
}) => {
  const [section, setSection] = useState<TdsSection>('194C');
  const [panInput, setPanInput] = useState<string>(supplierPan || '');
  const [isNonFiler, setIsNonFiler] = useState<boolean>(false);
  const [isLowerDeduction, setIsLowerDeduction] = useState<boolean>(false);
  const [lowerRate, setLowerRate] = useState<string>('0.5');
  const [lowerCert, setLowerCert] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Live calculation preview
  const preview: TdsCalculationResult = calculateTds({
    invoiceAmount,
    section,
    deducteePan: panInput,
    isNonFiler206AB: isNonFiler,
    hasLowerDeductionCert: isLowerDeduction,
    lowerDeductionRate: isLowerDeduction ? Number(lowerRate) : undefined,
  });

  const handleApplyTds = async () => {
    if (!isBuyerUser) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await applyTdsWithholdingRpc({
      organizationId,
      invoiceId,
      section,
      taxableAmount: preview.taxableAmount,
      tdsRate: preview.tdsRate,
      deducteePan: preview.pan,
      panStatus: preview.panStatus,
      isLowerDeduction,
      lowerDeductionCert: isLowerDeduction ? lowerCert : null,
    });

    setLoading(false);
    if (!res.ok) {
      setErrorMsg(res.error);
    } else {
      setSuccessMsg(`Statutory TDS of ₹${preview.statutoryTdsAmount} (${preview.tdsRate}%) applied successfully.`);
      if (onDeductionApplied) onDeductionApplied();
    }
  };

  const downloadForm16AData = (deduction: TdsDeductionRecord) => {
    const cert = generateForm16ACertificate({
      certificateNumber: `FORM16A-${deduction.id.slice(0, 8).toUpperCase()}`,
      financialYear: deduction.financialYear,
      assessmentYear: deduction.assessmentYear,
      quarter: 'Q2',
      deductor: {
        tan: 'BLR0998811',
        pan: 'AAACB1234F',
        name: 'Authorized Buyer Enterprise',
      },
      deductee: {
        pan: deduction.deducteePan || 'PANNOTAVBL',
        name: supplierName,
      },
      section: deduction.section as TdsSection,
      totalAmountPaidOrCredited: deduction.taxableAmount,
      totalTdsDeducted: deduction.tdsAmount,
      totalTdsDeposited: deduction.tdsAmount,
      challans: [
        {
          challanBsnCode: '0510304',
          challanDate: deduction.createdAt.slice(0, 10),
          challanNumber: '00123',
          amountDeposited: deduction.tdsAmount,
          minorHead: '200',
        },
      ],
    });

    const blob = new Blob([JSON.stringify(cert, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Form16A_${invoiceNumber}_${deduction.financialYear}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>🛡️</span> Statutory TDS & Form 16A Compliance
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Income-tax Act provisions, statutory withholding rates & nearest rupee rounding
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 font-medium bg-primary/10 text-primary rounded-full">
          Act 2025 Ready
        </span>
      </div>

      {/* Existing Withholdings */}
      {existingDeductions.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Deducted TDS Records
          </label>
          <div className="divide-y divide-border border border-border rounded-lg overflow-hidden bg-background">
            {existingDeductions.map((ded) => (
              <div
                key={ded.id}
                className="p-3 flex items-center justify-between text-sm hover:bg-muted/30"
              >
                <div>
                  <div className="font-medium text-foreground flex items-center gap-2">
                    <span>Sec {ded.section}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded">
                      {ded.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PAN: {ded.deducteePan || 'N/A'} ({ded.panStatus})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Rate: {ded.tdsRate}% | Taxable: ₹{ded.taxableAmount.toLocaleString('en-IN')} | FY: {ded.financialYear}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-foreground">
                    ₹{ded.tdsAmount.toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadForm16AData(ded)}
                    className="text-xs px-2.5 py-1 border border-border hover:bg-muted rounded font-medium transition"
                    title="Download Form 16A Certificate Data"
                  >
                    Form 16A JSON
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Buyer TDS Deduction Form */}
      {isBuyerUser && (
        <div className="bg-muted/40 p-4 rounded-lg border border-border space-y-3">
          <h4 className="text-sm font-semibold text-foreground">
            Apply TDS Withholding on Invoice ₹{invoiceAmount.toLocaleString('en-IN')}
          </h4>

          {errorMsg && (
            <div className="text-xs p-2.5 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-medium">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="text-xs p-2.5 bg-green-500/10 text-green-700 dark:text-green-400 rounded-md border border-green-500/20 font-medium">
              {successMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Statutory Section
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as TdsSection)}
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="194C">Sec 194C — Works Contract (1% Ind / 2% Co)</option>
                <option value="194Q">Sec 194Q — Purchase of Goods (0.1% on &gt;50L)</option>
                <option value="194J_TECH">Sec 194J — Technical / Professional (2%)</option>
                <option value="194J_PROF">Sec 194J — Professional Services (10%)</option>
                <option value="194H">Sec 194H — Commission / Brokerage (5%)</option>
                <option value="194I_LAND">Sec 194I — Rent of Land/Building (10%)</option>
                <option value="194I_PLANT">Sec 194I — Rent of Plant/Machinery (2%)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Deductee PAN (Supplier)
              </label>
              <input
                type="text"
                value={panInput}
                onChange={(e) => setPanInput(e.target.value.toUpperCase())}
                placeholder="ABCDE1234F"
                maxLength={10}
                className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-foreground font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary uppercase"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isNonFiler}
                onChange={(e) => setIsNonFiler(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
              <span className="text-muted-foreground">
                ITR Non-Filer (Higher Rate Sec 206AB)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isLowerDeduction}
                onChange={(e) => setIsLowerDeduction(e.target.checked)}
                className="rounded text-primary focus:ring-primary"
              />
              <span className="text-muted-foreground">
                Sec 197 Lower Deduction Certificate
              </span>
            </label>
          </div>

          {isLowerDeduction && (
            <div className="grid grid-cols-2 gap-3 text-xs bg-background p-3 rounded border border-border">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Certified Lower Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={lowerRate}
                  onChange={(e) => setLowerRate(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-foreground"
                />
              </div>
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Certificate Number
                </label>
                <input
                  type="text"
                  value={lowerCert}
                  onChange={(e) => setLowerCert(e.target.value)}
                  placeholder="LDC-2026-991"
                  className="w-full bg-background border border-border rounded px-2 py-1 text-foreground font-mono"
                />
              </div>
            </div>
          )}

          {/* Live Calculation Preview Banner */}
          <div className="bg-background border border-border p-3 rounded-lg flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground font-medium">Applied Rate: </span>
              <span className="font-bold text-foreground">{preview.tdsRate}%</span>
              {preview.isHigherRateApplied && (
                <span className="ml-2 text-destructive font-semibold">
                  (Sec 206AA/AB Penalty Rate)
                </span>
              )}
              <div className="text-muted-foreground mt-0.5">
                {preview.rateDetails.reason}
              </div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground">Statutory TDS (Sec 288B):</div>
              <div className="text-base font-bold text-primary">
                ₹{preview.statutoryTdsAmount.toLocaleString('en-IN')}
              </div>
              <div className="text-muted-foreground">
                Net Payable: ₹{preview.netPayableAfterTds.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleApplyTds}
              disabled={loading || preview.statutoryTdsAmount <= 0}
              className="px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-lg hover:bg-primary/90 transition disabled:opacity-50"
            >
              {loading ? 'Recording Statutory TDS...' : 'Apply & Deduct TDS'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
