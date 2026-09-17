import React, { useEffect, useState } from 'react';
import {
  calculateReconciliationSummary,
  type FinancialObservabilitySummary,
  type BankReconciliationRecord,
  type BankRemittanceAdvice,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';
import {
  fetchFinancialObservabilitySummaryApi,
  reconcileBankUtrRpc,
} from '../api/payments';

interface FinancialControlDashboardPageProps {
  organizationId?: string;
}

export const FinancialControlDashboardPage: React.FC<
  FinancialControlDashboardPageProps
> = ({ organizationId: propOrgId }) => {
  const [orgId, setOrgId] = useState<string>(propOrgId || '');
  const [summary, setSummary] = useState<FinancialObservabilitySummary | null>(
    null,
  );
  const [bankRecords, setBankRecords] = useState<BankReconciliationRecord[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'JSON' | 'CSV' | null>(null);

  // Bank UTR modal
  const [showRecModal, setShowRecModal] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [clearedAmountInput, setClearedAmountInput] = useState('');
  const [bankNameInput, setBankNameInput] = useState('HDFC Bank');
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  useEffect(() => {
    async function initOrg() {
      if (orgId) {
        loadData(orgId);
        return;
      }
      // Fetch default user org
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        setErrorMsg('User not authenticated');
        return;
      }

      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('profile_id', user.id)
        .limit(1)
        .maybeSingle();

      const resolvedOrg = memberData?.organization_id;
      if (resolvedOrg) {
        setOrgId(resolvedOrg);
        loadData(resolvedOrg);
      } else {
        setLoading(false);
        setErrorMsg('No organization found for current user');
      }
    }

    initOrg();
  }, []);

  async function loadData(targetOrgId: string) {
    setLoading(true);
    setErrorMsg(null);

    const [sumRes, recRes] = await Promise.all([
      fetchFinancialObservabilitySummaryApi(targetOrgId),
      supabase
        .from('bank_reconciliation_records')
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('bank_cleared_date', { ascending: false }),
    ]);

    setLoading(false);
    if (sumRes.ok) {
      setSummary(sumRes.summary);
    } else {
      setErrorMsg(sumRes.error);
    }

    if (recRes.data) {
      setBankRecords(
        recRes.data.map((r: any) => ({
          id: r.id,
          organizationId: r.organization_id,
          paymentId: r.payment_id,
          utrNumber: r.utr_number,
          bankReference: r.bank_reference,
          bankName: r.bank_name,
          buyerRecordedAmount: Number(r.buyer_recorded_amount),
          bankClearedAmount: Number(r.bank_cleared_amount),
          amountDifference: Number(r.amount_difference),
          buyerRecordedDate: r.buyer_recorded_date,
          bankClearedDate: r.bank_cleared_date,
          dateDriftDays: Number(r.date_drift_days || 0),
          status: r.status,
          discrepancyType: r.discrepancy_type,
          discrepancyDetails: r.discrepancy_details,
          resolutionNotes: r.resolution_notes,
          reconciledBy: r.reconciled_by,
          reconciledAt: r.reconciled_at,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      );
    }
  }

  const handleExportAuditPack = async (format: 'JSON' | 'CSV') => {
    if (!orgId) return;
    setExporting(format);

    try {
      // In web app, generate audit pack client-side or via RPC
      const summaryRes = await fetchFinancialObservabilitySummaryApi(orgId);
      const [posRes, invRes, payRes, tdsRes, recRes] = await Promise.all([
        supabase.from('purchase_orders').select('*').eq('organization_id', orgId),
        supabase.from('invoices').select('*').eq('organization_id', orgId),
        supabase.from('payments').select('*').eq('organization_id', orgId),
        supabase.from('tds_deductions').select('*').eq('organization_id', orgId),
        supabase.from('bank_reconciliation_records').select('*').eq('organization_id', orgId),
      ]);

      const pack = {
        metadata: {
          exportId: `AUDIT-${orgId.slice(0, 8)}-${Date.now()}`,
          organizationId: orgId,
          generatedAt: new Date().toISOString(),
          environment: 'PRODUCTION',
          schemaVersion: '5C.4',
        },
        summary: summaryRes.ok ? summaryRes.summary : (summary as any),
        purchaseOrders: (posRes.data || []).map((p: any) => ({
          id: p.id,
          poNumber: p.po_number,
          supplierId: p.supplier_id,
          totalAmount: Number(p.total_amount),
          status: p.status,
          createdAt: p.created_at,
        })),
        invoices: (invRes.data || []).map((i: any) => ({
          id: i.id,
          invoiceNumber: i.invoice_number,
          purchaseOrderId: i.purchase_order_id,
          amount: Number(i.amount),
          paidAmount: Number(i.paid_amount || 0),
          status: i.status,
          createdAt: i.submitted_at,
        })),
        tdsDeductions: (tdsRes.data || []).map((t: any) => ({
          id: t.id,
          invoiceId: t.invoice_id,
          section: t.section,
          taxableAmount: Number(t.taxable_amount),
          tdsRate: Number(t.tds_rate),
          tdsAmount: Number(t.tds_amount),
          status: t.status,
          pan: t.deductee_pan,
        })),
        payments: (payRes.data || []).map((p: any) => ({
          id: p.id,
          amount: Number(p.amount),
          unallocatedAmount: Number(p.unallocated_amount || 0),
          reference: p.reference,
          method: p.method,
          recordedAt: p.recorded_at,
        })),
        bankReconciliations: (recRes.data || []).map((b: any) => ({
          id: b.id,
          utrNumber: b.utr_number,
          bankClearedAmount: Number(b.bank_cleared_amount),
          status: b.status,
          discrepancyType: b.discrepancy_type,
        })),
      };

      let fileContent = '';
      let mimeType = '';
      let fileExt = '';

      if (format === 'JSON') {
        fileContent = JSON.stringify(pack, null, 2);
        mimeType = 'application/json';
        fileExt = 'json';
      } else {
        // CSV
        const rows: string[] = [];
        rows.push('# OTP FINANCIAL AUDIT PACK');
        rows.push(`Organization ID,${orgId}`);
        rows.push(`Total Authorized,${pack.summary.totalPoAuthorized}`);
        rows.push(`Total Invoiced,${pack.summary.totalInvoiced}`);
        rows.push(`Total Paid,${pack.summary.totalPaid}`);
        rows.push(`Total TDS Withheld,${pack.summary.totalTdsWithheld}`);
        rows.push(`Total Outstanding,${pack.summary.totalOutstandingObligations}`);
        fileContent = rows.join('\n');
        mimeType = 'text/csv';
        fileExt = 'csv';
      }

      const blob = new Blob([fileContent], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FinancialAuditPack_${orgId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.${fileExt}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const handleReconcileUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setRecLoading(true);
    setRecError(null);

    const res = await reconcileBankUtrRpc({
      organizationId: orgId,
      utrNumber: utrInput,
      clearedAmount: Number(clearedAmountInput),
      clearedDate: new Date().toISOString(),
      bankName: bankNameInput,
    });

    setRecLoading(false);
    if (!res.ok) {
      setRecError(res.error);
    } else {
      setShowRecModal(false);
      setUtrInput('');
      setClearedAmountInput('');
      loadData(orgId);
    }
  };

  const recSummary = calculateReconciliationSummary(bankRecords);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">
        Loading Financial Observability Radar &amp; Controls…
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top Header & Export Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <span>🛡️</span> Financial Observability &amp; Statutory Reconciliation Radar
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time procurement commitment tracking, statutory TDS compliance &amp; bank UTR clearance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRecModal(true)}
            className="px-3 py-1.5 bg-background border border-border rounded-lg text-xs font-semibold hover:bg-muted transition"
          >
            + Reconcile Bank UTR
          </button>
          <button
            type="button"
            onClick={() => handleExportAuditPack('JSON')}
            disabled={exporting !== null}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition disabled:opacity-50"
          >
            {exporting === 'JSON' ? 'Exporting…' : '📥 Audit Pack (JSON)'}
          </button>
          <button
            type="button"
            onClick={() => handleExportAuditPack('CSV')}
            disabled={exporting !== null}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition disabled:opacity-50"
          >
            {exporting === 'CSV' ? 'Exporting…' : '📊 Audit Pack (CSV)'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Executive Key Metrics Grid */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total PO Authorized
            </span>
            <div className="text-lg font-bold text-foreground">
              ₹{summary.totalPoAuthorized.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {summary.openPoCount} Open | {summary.completedPoCount} Closed POs
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Cumulative Invoiced
            </span>
            <div className="text-lg font-bold text-foreground">
              ₹{summary.totalInvoiced.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Debit Notes: -₹{summary.totalDebitNotes.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Settled Payments
            </span>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
              ₹{summary.totalPaid.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Unallocated Advances: ₹{summary.totalUnallocatedAdvances.toLocaleString('en-IN')}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Statutory TDS Withheld
            </span>
            <div className="text-lg font-bold text-primary">
              ₹{summary.totalTdsWithheld.toLocaleString('en-IN')}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Deposited: ₹{summary.totalTdsDeposited.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
      )}

      {/* Financial Health & Outstanding Radar */}
      {summary && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Financial Exposure &amp; Net Outstanding Position
            </h3>
            <span className="text-xs font-mono font-bold text-primary">
              Net Outstanding: ₹{summary.totalOutstandingObligations.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-muted/20 rounded-lg space-y-1">
              <span className="text-muted-foreground">Invoiced Obligation:</span>
              <div className="font-semibold text-foreground">
                ₹{(summary.totalInvoiced - summary.totalDebitNotes + summary.totalCreditNotes).toLocaleString('en-IN')}
              </div>
            </div>

            <div className="p-3 bg-muted/20 rounded-lg space-y-1">
              <span className="text-muted-foreground">Statutory Deductions (TDS):</span>
              <div className="font-semibold text-primary">
                -₹{summary.totalTdsWithheld.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="p-3 bg-muted/20 rounded-lg space-y-1">
              <span className="text-muted-foreground">Total Payments Allocated:</span>
              <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                -₹{summary.totalPaid.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bank Remittance & UTR Clearance Section */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>🏦</span> Bank Remittance &amp; UTR Reconciliation Ledger
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cleared Amount: ₹{recSummary.totalClearedAmount.toLocaleString('en-IN')} | Matched: {recSummary.matchedCount} | Discrepancies: {recSummary.discrepancyCount}
            </p>
          </div>

          {recSummary.discrepancyCount > 0 && (
            <span className="text-xs px-2.5 py-1 font-bold bg-destructive/10 text-destructive rounded-full">
              {recSummary.discrepancyCount} Discrepancy (₹{recSummary.totalDiscrepancyAmount.toLocaleString('en-IN')})
            </span>
          )}
        </div>

        {bankRecords.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-6">
            No bank remittance advice records uploaded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-border rounded-lg overflow-hidden">
              <thead className="bg-muted text-muted-foreground font-semibold">
                <tr>
                  <th className="p-2.5">UTR / Reference</th>
                  <th className="p-2.5">Bank</th>
                  <th className="p-2.5 text-right">Cleared Amount</th>
                  <th className="p-2.5 text-right">Buyer Recorded</th>
                  <th className="p-2.5 text-center">Date Drift</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5">Discrepancy Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bankRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="p-2.5 font-mono font-bold text-foreground">
                      {r.utrNumber}
                    </td>
                    <td className="p-2.5 text-muted-foreground">{r.bankName || 'HDFC Bank'}</td>
                    <td className="p-2.5 text-right font-bold text-foreground">
                      ₹{r.bankClearedAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-right font-mono text-muted-foreground">
                      ₹{r.buyerRecordedAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2.5 text-center text-muted-foreground">
                      {r.dateDriftDays} days
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.status === 'MATCHED'
                            ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-muted-foreground max-w-xs truncate">
                      {r.discrepancyDetails || 'Clean clearance match'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reconcile UTR Modal */}
      {showRecModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-foreground">
                Reconcile Bank Clearance Advice
              </h3>
              <button
                type="button"
                onClick={() => setShowRecModal(false)}
                className="text-muted-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {recError && (
              <div className="text-xs p-2.5 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-medium">
                {recError}
              </div>
            )}

            <form onSubmit={handleReconcileUtr} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Bank UTR Number
                </label>
                <input
                  type="text"
                  required
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value.toUpperCase())}
                  placeholder="HDFCR520260917001"
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Cleared Amount (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={clearedAmountInput}
                  onChange={(e) => setClearedAmountInput(e.target.value)}
                  placeholder="50000"
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5"
                />
              </div>

              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankNameInput}
                  onChange={(e) => setBankNameInput(e.target.value)}
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRecModal(false)}
                  className="px-3 py-1.5 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recLoading}
                  className="px-4 py-1.5 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {recLoading ? 'Reconciling…' : 'Reconcile UTR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
