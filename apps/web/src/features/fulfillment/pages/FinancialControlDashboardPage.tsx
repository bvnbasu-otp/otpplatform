import React, { useEffect, useState } from 'react';
import {
  calculateReconciliationSummary,
  type FinancialObservabilitySummary,
  type BankReconciliationRecord,
  type SettlementReconciliationRecord,
  type SettlementExceptionRecord,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';
import {
  fetchFinancialObservabilitySummaryApi,
  fetchSettlementReconciliationsApi,
  fetchSettlementExceptionsApi,
  reconcileBankUtrRpc,
  executeSettlementReconciliationRpc,
  resolveSettlementExceptionRpc,
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
  const [settlementRecs, setSettlementRecs] = useState<SettlementReconciliationRecord[]>(
    [],
  );
  const [exceptions, setExceptions] = useState<SettlementExceptionRecord[]>(
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

  // Exception resolution modal
  const [resolvingException, setResolvingException] = useState<SettlementExceptionRecord | null>(null);
  const [resolutionNotesInput, setResolutionNotesInput] = useState('');
  const [resolvingLoading, setResolvingLoading] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SETTLEMENT_RECON' | 'EXCEPTION_QUEUE' | 'BANK_RECON'>('OVERVIEW');

  useEffect(() => {
    async function initOrg() {
      if (orgId) {
        loadData(orgId);
        return;
      }
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

    const [sumRes, bankRes, setRecRes, excRes] = await Promise.all([
      fetchFinancialObservabilitySummaryApi(targetOrgId),
      supabase
        .from('bank_reconciliation_records')
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('bank_cleared_date', { ascending: false }),
      fetchSettlementReconciliationsApi(targetOrgId),
      fetchSettlementExceptionsApi(targetOrgId),
    ]);

    setLoading(false);
    if (sumRes.ok) {
      setSummary(sumRes.summary);
    } else {
      setErrorMsg(sumRes.error);
    }

    if (bankRes.data) {
      setBankRecords(
        bankRes.data.map((r: any) => ({
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

    if (setRecRes.ok) {
      setSettlementRecs(
        setRecRes.reconciliations.map((r: any) => ({
          id: r.id,
          organizationId: r.organization_id,
          supplierId: r.supplier_id,
          purchaseOrderId: r.purchase_order_id,
          invoiceId: r.invoice_id,
          paymentId: r.payment_id,
          invoiceGrossAmount: Number(r.invoice_gross_amount),
          adjustedGrossAmount: Number(r.adjusted_gross_amount),
          tdsAmount: Number(r.tds_amount),
          platformFeeAmount: Number(r.platform_fee_amount),
          paidAllocatedAmount: Number(r.paid_allocated_amount),
          supplierNetSettlementAmount: Number(r.supplier_net_settlement_amount),
          utrNumber: r.utr_number,
          utrClearedAmount: r.utr_cleared_amount ? Number(r.utr_cleared_amount) : null,
          varianceAmount: Number(r.variance_amount),
          status: r.status,
          discrepancyType: r.discrepancy_type,
          discrepancyDetails: r.discrepancy_details,
          notes: r.notes,
          reconciledAt: r.reconciled_at,
          reconciledBy: r.reconciled_by,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      );
    }

    if (excRes.ok) {
      setExceptions(
        excRes.exceptions.map((e: any) => ({
          id: e.id,
          organizationId: e.organization_id,
          reconciliationId: e.reconciliation_id,
          purchaseOrderId: e.purchase_order_id,
          invoiceId: e.invoice_id,
          paymentId: e.payment_id,
          exceptionType: e.exception_type,
          severity: e.severity,
          status: e.status,
          amountInDispute: Number(e.amount_in_dispute),
          reason: e.reason,
          resolutionNotes: e.resolution_notes,
          assignedTo: e.assigned_to,
          resolvedBy: e.resolved_by,
          resolvedAt: e.resolved_at,
          createdAt: e.created_at,
          updatedAt: e.updated_at,
        })),
      );
    }
  }

  const handleExportAuditPack = async (format: 'JSON' | 'CSV') => {
    if (!orgId) return;
    setExporting(format);

    try {
      const summaryRes = await fetchFinancialObservabilitySummaryApi(orgId);
      const [posRes, invRes, payRes, tdsRes, recRes, feeRes, setRecRes, excRes] = await Promise.all([
        supabase.from('purchase_orders').select('*').eq('organization_id', orgId),
        supabase.from('invoices').select('*').eq('organization_id', orgId),
        supabase.from('payments').select('*').eq('organization_id', orgId),
        supabase.from('tds_deductions').select('*').eq('organization_id', orgId),
        supabase.from('bank_reconciliation_records').select('*').eq('organization_id', orgId),
        supabase.from('platform_fee_transactions').select('*').eq('organization_id', orgId),
        supabase.from('settlement_reconciliations').select('*').eq('organization_id', orgId),
        supabase.from('settlement_exceptions').select('*').eq('organization_id', orgId),
      ]);

      const pack = {
        metadata: {
          exportId: `AUDIT-${orgId.slice(0, 8)}-${Date.now()}`,
          organizationId: orgId,
          generatedAt: new Date().toISOString(),
          environment: 'PRODUCTION',
          schemaVersion: '5C.5',
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
        platformFeeTransactions: (feeRes.data || []).map((f: any) => ({
          id: f.id,
          purchaseOrderId: f.purchase_order_id,
          invoiceId: f.invoice_id,
          feeRate: Number(f.fee_rate),
          grossAmount: Number(f.gross_amount),
          feeAmount: Number(f.fee_amount),
          netSettlementAmount: Number(f.net_settlement_amount),
          status: f.status,
          settledAt: f.settled_at,
        })),
        settlementReconciliations: (setRecRes.data || []).map((s: any) => ({
          id: s.id,
          purchaseOrderId: s.purchase_order_id,
          invoiceId: s.invoice_id,
          invoiceGrossAmount: Number(s.invoice_gross_amount),
          paidAllocatedAmount: Number(s.paid_allocated_amount),
          platformFeeAmount: Number(s.platform_fee_amount),
          supplierNetSettlementAmount: Number(s.supplier_net_settlement_amount),
          utrNumber: s.utr_number,
          status: s.status,
          discrepancyType: s.discrepancy_type,
        })),
        settlementExceptions: (excRes.data || []).map((e: any) => ({
          id: e.id,
          reconciliationId: e.reconciliation_id,
          exceptionType: e.exception_type,
          severity: e.severity,
          status: e.status,
          amountInDispute: Number(e.amount_in_dispute),
          reason: e.reason,
          resolutionNotes: e.resolution_notes,
          resolvedBy: e.resolved_by,
          resolvedAt: e.resolved_at,
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

      const filename = `OTP_Financial_Audit_Pack_${orgId.slice(0, 8)}_${new Date().toISOString().split('T')[0] ?? 'export'}`;
      if (format === 'JSON') {
        const jsonStr = JSON.stringify(pack, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const csvBlob = new Blob([JSON.stringify(pack)], { type: 'text/csv' });
        const url = URL.createObjectURL(csvBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleReconcileUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !utrInput || !clearedAmountInput) return;
    setRecLoading(true);
    setRecError(null);

    const res = await reconcileBankUtrRpc({
      organizationId: orgId,
      utrNumber: utrInput,
      clearedAmount: parseFloat(clearedAmountInput),
      clearedDate: new Date().toISOString().split('T')[0] ?? '',
      bankName: bankNameInput,
    });

    setRecLoading(false);
    if (res.ok) {
      setShowRecModal(false);
      setUtrInput('');
      setClearedAmountInput('');
      loadData(orgId);
    } else {
      setRecError(res.error);
    }
  };

  const handleResolveException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvingException || resolutionNotesInput.trim().length < 5) return;
    setResolvingLoading(true);
    setResolutionError(null);

    const res = await resolveSettlementExceptionRpc({
      exceptionId: resolvingException.id,
      resolutionNotes: resolutionNotesInput,
    });

    setResolvingLoading(false);
    if (res.ok) {
      setResolvingException(null);
      setResolutionNotesInput('');
      if (orgId) loadData(orgId);
    } else {
      setResolutionError(res.error);
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
            Real-time procurement commitment tracking, supplier platform fees &amp; settlement execution controls (Phase 5C.5)
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
              Platform Fees: ₹{(summary.totalPlatformFeeSettled || 0).toLocaleString('en-IN')}
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

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border">
        <button
          type="button"
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'OVERVIEW' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📊 Overview Radar
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('SETTLEMENT_RECON')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'SETTLEMENT_RECON' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          ⚖️ Settlement Reconciliations ({settlementRecs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('EXCEPTION_QUEUE')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'EXCEPTION_QUEUE' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🚨 Financial Exceptions ({exceptions.filter((e) => e.status !== 'RESOLVED').length} Open)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('BANK_RECON')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'BANK_RECON' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          🏦 Bank Remittance Advice ({bankRecords.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'OVERVIEW' && summary && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-semibold text-foreground">
                Financial Exposure &amp; Net Outstanding Position
              </h3>
              <span className="text-xs font-mono font-bold text-primary">
                Net Outstanding: ₹{summary.totalOutstandingObligations.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="text-muted-foreground block font-medium">Adjusted Gross Invoiced</span>
                <span className="text-sm font-bold font-mono">
                  ₹{(summary.totalInvoiced - summary.totalDebitNotes + summary.totalCreditNotes).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="text-muted-foreground block font-medium">Platform Fee Deductions</span>
                <span className="text-sm font-bold font-mono text-primary">
                  ₹{(summary.totalPlatformFeeCalculated || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg space-y-1">
                <span className="text-muted-foreground block font-medium">Bank Cleared Remittances</span>
                <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  ₹{summary.totalUtrCleared.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SETTLEMENT RECONCILIATIONS LEDGER */}
      {activeTab === 'SETTLEMENT_RECON' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Settlement Reconciliation Read Model (Phase 5C.5)
              </h3>
              <p className="text-xs text-muted-foreground">
                Authoritative conservation ledger tracking Invoice Gross, TDS, Platform Fee, and Supplier Net Settlement
              </p>
            </div>
          </div>

          {settlementRecs.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
              No settlement reconciliations recorded yet. Reconciliations are automatically generated upon payment allocations.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Invoice / PO</th>
                    <th className="px-3 py-2 text-right">Gross Amount</th>
                    <th className="px-3 py-2 text-right">TDS (Withheld)</th>
                    <th className="px-3 py-2 text-right">Platform Fee</th>
                    <th className="px-3 py-2 text-right">Net Settlement</th>
                    <th className="px-3 py-2 text-right">Paid Amount</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2">Discrepancy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                  {settlementRecs.map((rec) => (
                    <tr key={rec.id} className="hover:bg-muted/20 transition">
                      <td className="px-3 py-2.5 font-sans">
                        <div className="font-bold text-foreground">PO: {rec.purchaseOrderId.slice(0, 8)}</div>
                        <div className="text-[10px] text-muted-foreground">Inv: {rec.invoiceId.slice(0, 8)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        ₹{rec.invoiceGrossAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">
                        -₹{rec.tdsAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-right text-amber-600 dark:text-amber-400">
                        -₹{rec.platformFeeAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{rec.supplierNetSettlementAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold">
                        ₹{rec.paidAllocatedAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-center font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            rec.status === 'MATCHED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : rec.status === 'MISMATCH'
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {rec.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-sans text-muted-foreground text-[10px]">
                        {rec.discrepancyType !== 'NONE' ? (
                          <span className="text-destructive font-bold">{rec.discrepancyType}</span>
                        ) : (
                          <span className="text-emerald-600">Matched ✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FINANCIAL EXCEPTION QUEUE */}
      {activeTab === 'EXCEPTION_QUEUE' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Financial Exception Queue (Phase 5C.5)
              </h3>
              <p className="text-xs text-muted-foreground">
                Immutable audit queue of settlement discrepancies requiring authorized buyer review and resolution
              </p>
            </div>
          </div>

          {exceptions.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
              No financial exceptions open. All settlements are clean and reconciled.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Exception Type</th>
                    <th className="px-3 py-2 text-center">Severity</th>
                    <th className="px-3 py-2 text-right">Disputed Amount</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 text-[11px]">
                  {exceptions.map((exc) => (
                    <tr key={exc.id} className="hover:bg-muted/20 transition">
                      <td className="px-3 py-2.5 font-bold font-mono">
                        {exc.exceptionType}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            exc.severity === 'CRITICAL'
                              ? 'bg-destructive text-destructive-foreground'
                              : exc.severity === 'HIGH'
                              ? 'bg-destructive/15 text-destructive'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {exc.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold">
                        ₹{exc.amountInDispute.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-xs truncate">
                        {exc.reason}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            exc.status === 'RESOLVED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {exc.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {exc.status !== 'RESOLVED' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setResolvingException(exc);
                              setResolutionNotesInput('');
                              setResolutionError(null);
                            }}
                            className="px-2.5 py-1 bg-primary text-primary-foreground rounded text-[11px] font-bold hover:bg-primary/90"
                          >
                            Resolve
                          </button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Resolved ✓</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BANK REMITTANCE ADVICE */}
      {activeTab === 'BANK_RECON' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Bank Remittance Reconciliations
              </h3>
              <p className="text-xs text-muted-foreground">
                Matched Bank UTR Clearances against Recorded Buyer Outflows
              </p>
            </div>
          </div>

          {bankRecords.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
              No bank remittance reconciliation records available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Bank UTR</th>
                    <th className="px-3 py-2">Bank</th>
                    <th className="px-3 py-2 text-right">Recorded Amount</th>
                    <th className="px-3 py-2 text-right">Cleared Amount</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2">Discrepancy Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                  {bankRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition">
                      <td className="px-3 py-2.5 font-bold">{r.utrNumber}</td>
                      <td className="px-3 py-2.5 font-sans">{r.bankName || 'HDFC Bank'}</td>
                      <td className="px-3 py-2.5 text-right">₹{r.buyerRecordedAmount.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{r.bankClearedAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-center font-sans">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.status === 'MATCHED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-destructive/10 text-destructive'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-sans text-muted-foreground text-[10px]">
                        {r.discrepancyDetails || 'Fully cleared'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Exception Resolution Modal */}
      {resolvingException && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-foreground">
                Resolve Financial Exception ({resolvingException.exceptionType})
              </h3>
              <button
                type="button"
                onClick={() => setResolvingException(null)}
                className="text-muted-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 bg-muted/40 rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Disputed Amount:</span>
                <span className="font-mono font-bold text-destructive">₹{resolvingException.amountInDispute.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Reason:</span>
                <p className="font-medium text-foreground mt-0.5">{resolvingException.reason}</p>
              </div>
            </div>

            {resolutionError && (
              <div className="text-xs p-2.5 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-medium">
                {resolutionError}
              </div>
            )}

            <form onSubmit={handleResolveException} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Resolution Explanation / Audit Notes (min. 5 chars)
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionNotesInput}
                  onChange={(e) => setResolutionNotesInput(e.target.value)}
                  placeholder="e.g. Discrepancy reconciled via supplementary remittance advice UTR-882910."
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResolvingException(null)}
                  className="px-3 py-1.5 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolvingLoading || resolutionNotesInput.trim().length < 5}
                  className="px-4 py-1.5 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {resolvingLoading ? 'Resolving…' : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
