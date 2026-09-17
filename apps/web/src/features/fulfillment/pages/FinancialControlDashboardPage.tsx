import React, { useEffect, useState } from 'react';
import {
  calculateReconciliationSummary,
  exportToTallyJournalVoucher,
  exportToZohoJournalEntry,
  type FinancialObservabilitySummary,
  type BankReconciliationRecord,
  type SettlementReconciliationRecord,
  type SettlementExceptionRecord,
  type TrialBalanceSummary,
  type LedgerAccount,
  type AccountingPeriod,
  type JournalEntry,
} from '@otp/domain';
import { supabase } from '@/lib/supabase';
import {
  fetchFinancialObservabilitySummaryApi,
  fetchSettlementReconciliationsApi,
  fetchSettlementExceptionsApi,
  fetchSettlementExceptionEventsApi,
  fetchErpExportManifestsApi,
  fetchLedgerAccountsApi,
  fetchAccountingPeriodsApi,
  fetchJournalEntriesApi,
  fetchLedgerBalanceSummaryRpc,
  postJournalEntryRpc,
  reverseJournalEntryRpc,
  closeAccountingPeriodRpc,
  reopenAccountingPeriodRpc,
  reconcileBankUtrRpc,
  invalidateBankReconciliationRpc,
  syncPoSettlementReconciliationsRpc,
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
  const [manifests, setManifests] = useState<any[]>([]);
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
  const [dateDriftWarning, setDateDriftWarning] = useState<string | null>(null);
  const [acknowledgeDateDrift, setAcknowledgeDateDrift] = useState(false);

  // Bank Invalidation Modal
  const [invalidatingRecord, setInvalidatingRecord] = useState<BankReconciliationRecord | null>(null);
  const [invalidationReasonInput, setInvalidationReasonInput] = useState('');
  const [invalidationLoading, setInvalidationLoading] = useState(false);
  const [invalidationError, setInvalidationError] = useState<string | null>(null);

  // Exception resolution modal
  const [resolvingException, setResolvingException] = useState<SettlementExceptionRecord | null>(null);
  const [resolutionNotesInput, setResolutionNotesInput] = useState('');
  const [resolvingLoading, setResolvingLoading] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // Exception Timeline Drawer
  const [selectedExceptionForTimeline, setSelectedExceptionForTimeline] = useState<SettlementExceptionRecord | null>(null);
  const [exceptionEvents, setExceptionEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // PO Batch Sync Modal / Input
  const [syncingPoId, setSyncingPoId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'GENERAL_LEDGER' | 'SETTLEMENT_RECON' | 'EXCEPTION_QUEUE' | 'BANK_RECON' | 'ERP_MANIFESTS'>('OVERVIEW');

  // Phase 5D: General Ledger & Double-Entry State
  const [ledgerAccounts, setLedgerAccounts] = useState<LedgerAccount[]>([]);
  const [accountingPeriods, setAccountingPeriods] = useState<AccountingPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceSummary | null>(null);
  const [selectedJournalForDetail, setSelectedJournalForDetail] = useState<JournalEntry | null>(null);

  // Journal Reversal Modal
  const [reversingJournal, setReversingJournal] = useState<JournalEntry | null>(null);
  const [reversalReasonInput, setReversalReasonInput] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Period Reopen / Close Modal
  const [managingPeriod, setManagingPeriod] = useState<AccountingPeriod | null>(null);
  const [periodAction, setPeriodAction] = useState<'CLOSE' | 'REOPEN' | null>(null);
  const [reopenReasonInput, setReopenReasonInput] = useState('');
  const [periodLoading, setPeriodLoading] = useState(false);
  const [periodError, setPeriodError] = useState<string | null>(null);

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

    const [sumRes, bankRes, setRecRes, excRes, manRes, accRes, perRes, jrnRes, balRes] = await Promise.all([
      fetchFinancialObservabilitySummaryApi(targetOrgId),
      supabase
        .from('bank_reconciliation_records')
        .select('*')
        .eq('organization_id', targetOrgId)
        .order('bank_cleared_date', { ascending: false }),
      fetchSettlementReconciliationsApi(targetOrgId),
      fetchSettlementExceptionsApi(targetOrgId),
      fetchErpExportManifestsApi(targetOrgId),
      fetchLedgerAccountsApi(targetOrgId),
      fetchAccountingPeriodsApi(targetOrgId),
      fetchJournalEntriesApi(targetOrgId, selectedPeriodId || undefined),
      fetchLedgerBalanceSummaryRpc({ organizationId: targetOrgId, periodId: selectedPeriodId || undefined }),
    ]);

    setLoading(false);
    if (sumRes.ok) {
      setSummary(sumRes.summary);
    } else {
      setErrorMsg(sumRes.error);
    }

    if (accRes.ok) {
      setLedgerAccounts(accRes.accounts);
    }

    if (perRes.ok) {
      setAccountingPeriods(perRes.periods);
      if (!selectedPeriodId && perRes.periods.length > 0) {
        setSelectedPeriodId(perRes.periods[0].id);
      }
    }

    if (jrnRes.ok) {
      setJournalEntries(jrnRes.journals);
    }

    if (balRes.ok) {
      setTrialBalance(balRes.summary);
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

    if (manRes.ok) {
      setManifests(manRes.manifests);
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
          schemaVersion: '5C.6',
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
      setDateDriftWarning(null);
      setAcknowledgeDateDrift(false);
      loadData(orgId);
    } else {
      const isDateDrift =
        res.error?.includes('DATE_DRIFT') ||
        res.error?.includes('DATE_DRIFT_EXCEEDED') ||
        res.error?.toLowerCase().includes('date drift');

      if (isDateDrift && !acknowledgeDateDrift) {
        setDateDriftWarning(res.error || 'Bank cleared date drift exceeds allowable 30-day window. Explicit acknowledgment required.');
        setRecError(null);
      } else {
        setRecError(res.error);
      }
    }
  };

  const handleInvalidateBankRec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invalidatingRecord || invalidationReasonInput.trim().length < 5) return;
    setInvalidationLoading(true);
    setInvalidationError(null);

    const res = await invalidateBankReconciliationRpc({
      reconciliationId: invalidatingRecord.id,
      reason: invalidationReasonInput,
    });

    setInvalidationLoading(false);
    if (res.ok) {
      setInvalidatingRecord(null);
      setInvalidationReasonInput('');
      loadData(orgId);
    } else {
      setInvalidationError(res.error);
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

  const handleViewExceptionTimeline = async (exc: SettlementExceptionRecord) => {
    setSelectedExceptionForTimeline(exc);
    setEventsLoading(true);
    const res = await fetchSettlementExceptionEventsApi(exc.id);
    setEventsLoading(false);
    if (res.ok) {
      setExceptionEvents(res.events);
    } else {
      setExceptionEvents([]);
    }
  };

  const handleSyncPoSettlement = async (poId: string) => {
    setSyncingPoId(poId);
    setSyncMessage(null);
    const res = await syncPoSettlementReconciliationsRpc({ purchaseOrderId: poId });
    setSyncingPoId(null);
    if (res.ok) {
      setSyncMessage(`Successfully synchronized settlement reconciliations for PO ${poId.slice(0, 8)}`);
      loadData(orgId);
      setTimeout(() => setSyncMessage(null), 4000);
    } else {
      setErrorMsg(res.error);
    }
  };

  const handleReverseJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingJournal || reversalReasonInput.trim().length < 5) return;
    setReversalLoading(true);
    setReversalError(null);

    const res = await reverseJournalEntryRpc({
      organizationId: orgId,
      journalId: reversingJournal.id,
      reason: reversalReasonInput,
    });

    setReversalLoading(false);
    if (res.ok) {
      setReversingJournal(null);
      setReversalReasonInput('');
      loadData(orgId);
    } else {
      setReversalError(res.error);
    }
  };

  const handlePeriodAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingPeriod || !periodAction) return;
    setPeriodLoading(true);
    setPeriodError(null);

    let res: any;
    if (periodAction === 'CLOSE') {
      // DEF-010: Pre-close validation check and warning if unposted DRAFT journal vouchers exist in the period being closed
      const unpostedDrafts = journalEntries.filter(
        (j: any) =>
          (j.periodId === managingPeriod.id || j.period_id === managingPeriod.id) &&
          (j.status === 'DRAFT' || j.postingStatus === 'DRAFT' || j.posting_status === 'DRAFT')
      );

      if (unpostedDrafts.length > 0) {
        setPeriodError(
          `Cannot close accounting period: ${unpostedDrafts.length} unposted DRAFT journal voucher(s) exist in this period. Please post or discard them before closing.`
        );
        setPeriodLoading(false);
        return;
      }

      res = await closeAccountingPeriodRpc({
        organizationId: orgId,
        periodId: managingPeriod.id,
      });
    } else {
      if (reopenReasonInput.trim().length < 5) {
        setPeriodError('Reopen explanation of at least 5 characters is required');
        setPeriodLoading(false);
        return;
      }
      res = await reopenAccountingPeriodRpc({
        organizationId: orgId,
        periodId: managingPeriod.id,
        reason: reopenReasonInput,
      });
    }

    setPeriodLoading(false);
    if (res.ok) {
      setManagingPeriod(null);
      setPeriodAction(null);
      setReopenReasonInput('');
      loadData(orgId);
    } else {
      setPeriodError(res.error);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">
        Loading Financial Observability Radar &amp; General Ledger (Phase 5D)…
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
            Real-time procurement commitment tracking, duplicate export guard &amp; settlement execution controls (Phase 5C.6)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRecError(null);
              setDateDriftWarning(null);
              setAcknowledgeDateDrift(false);
              setShowRecModal(true);
            }}
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

      {syncMessage && (
        <div className="p-3 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg border border-emerald-300 text-xs font-medium">
          ✓ {syncMessage}
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
      <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('OVERVIEW')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'OVERVIEW' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📊 Overview &amp; Aging
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('GENERAL_LEDGER')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'GENERAL_LEDGER' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📖 General Ledger &amp; Double-Entry ({journalEntries.length})
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
        <button
          type="button"
          onClick={() => setActiveTab('ERP_MANIFESTS')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
            activeTab === 'ERP_MANIFESTS' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          📑 ERP Export Registry ({manifests.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & FINANCIAL AGING */}
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

          {/* GAP-5C6-04: Financial Aging Observability Matrix */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span>⏱️</span> Financial Aging Observability Matrix (Phase 5C.6)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Temporal risk stratification across unpaid invoices, unallocated advances, and disputed exceptions
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Unpaid Invoices Aging */}
              <div className="border border-border/80 rounded-lg p-3.5 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Unpaid Invoices</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    Total: ₹{(
                      (summary.financial_aging?.unpaid_invoices_aging.bucket_0_7d || 0) +
                      (summary.financial_aging?.unpaid_invoices_aging.bucket_8_15d || 0) +
                      (summary.financial_aging?.unpaid_invoices_aging.bucket_16_30d || 0) +
                      (summary.financial_aging?.unpaid_invoices_aging.bucket_over_30d || 0)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">0 - 7 Days (Current)</span>
                    <span className="font-semibold text-emerald-600">₹{(summary.financial_aging?.unpaid_invoices_aging.bucket_0_7d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">8 - 15 Days</span>
                    <span className="font-semibold text-foreground">₹{(summary.financial_aging?.unpaid_invoices_aging.bucket_8_15d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">16 - 30 Days</span>
                    <span className="font-semibold text-amber-600">₹{(summary.financial_aging?.unpaid_invoices_aging.bucket_16_30d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">&gt; 30 Days (Critical)</span>
                    <span className="font-semibold text-destructive font-bold">₹{(summary.financial_aging?.unpaid_invoices_aging.bucket_over_30d || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Stuck Advances Aging */}
              <div className="border border-border/80 rounded-lg p-3.5 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Stuck Advance Floats</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    Total: ₹{(
                      (summary.financial_aging?.stuck_advances_aging.bucket_0_7d || 0) +
                      (summary.financial_aging?.stuck_advances_aging.bucket_8_15d || 0) +
                      (summary.financial_aging?.stuck_advances_aging.bucket_16_30d || 0) +
                      (summary.financial_aging?.stuck_advances_aging.bucket_over_30d || 0)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">0 - 7 Days</span>
                    <span className="font-semibold text-emerald-600">₹{(summary.financial_aging?.stuck_advances_aging.bucket_0_7d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">8 - 15 Days</span>
                    <span className="font-semibold text-foreground">₹{(summary.financial_aging?.stuck_advances_aging.bucket_8_15d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">16 - 30 Days</span>
                    <span className="font-semibold text-amber-600">₹{(summary.financial_aging?.stuck_advances_aging.bucket_16_30d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">&gt; 30 Days (Stuck)</span>
                    <span className="font-semibold text-destructive font-bold">₹{(summary.financial_aging?.stuck_advances_aging.bucket_over_30d || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Unresolved Exceptions Aging */}
              <div className="border border-border/80 rounded-lg p-3.5 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">Unresolved Discrepancies</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    Total: ₹{(
                      (summary.financial_aging?.unresolved_exceptions_aging.bucket_0_7d || 0) +
                      (summary.financial_aging?.unresolved_exceptions_aging.bucket_8_15d || 0) +
                      (summary.financial_aging?.unresolved_exceptions_aging.bucket_16_30d || 0) +
                      (summary.financial_aging?.unresolved_exceptions_aging.bucket_over_30d || 0)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">0 - 7 Days</span>
                    <span className="font-semibold text-emerald-600">₹{(summary.financial_aging?.unresolved_exceptions_aging.bucket_0_7d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">8 - 15 Days</span>
                    <span className="font-semibold text-foreground">₹{(summary.financial_aging?.unresolved_exceptions_aging.bucket_8_15d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">16 - 30 Days</span>
                    <span className="font-semibold text-amber-600">₹{(summary.financial_aging?.unresolved_exceptions_aging.bucket_16_30d || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between p-1.5 bg-background rounded">
                    <span className="text-muted-foreground font-sans">&gt; 30 Days (Escalated)</span>
                    <span className="font-semibold text-destructive font-bold">₹{(summary.financial_aging?.unresolved_exceptions_aging.bucket_over_30d || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GENERAL LEDGER & DOUBLE-ENTRY JOURNALS (Phase 5D) */}
      {activeTab === 'GENERAL_LEDGER' && (
        <div className="space-y-6">
          {/* Trial Balance & Period Controls Header */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <span>📖</span> Double-Entry General Ledger &amp; Trial Balance
                </h3>
                <p className="text-xs text-muted-foreground">
                  Auditable double-entry ledger reflection of authorized procurement events, period controls, and trial balances
                </p>
              </div>

              {/* Accounting Period Selector & Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Period:</span>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => {
                    setSelectedPeriodId(e.target.value);
                    if (orgId) loadData(orgId);
                  }}
                  className="bg-background border border-border rounded-lg px-2.5 py-1 text-xs font-semibold text-foreground"
                >
                  <option value="">All Historical Periods</option>
                  {accountingPeriods.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.period_name || p.periodName || p.period_code || p.periodCode} ({p.status})
                    </option>
                  ))}
                </select>

                {/* Period Close / Reopen Action */}
                {selectedPeriodId && (() => {
                  const currPeriod: any = accountingPeriods.find((p: any) => p.id === selectedPeriodId);
                  if (!currPeriod) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setManagingPeriod(currPeriod);
                        setPeriodAction(currPeriod.status === 'OPEN' ? 'CLOSE' : 'REOPEN');
                        setReopenReasonInput('');
                        setPeriodError(null);
                      }}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
                        currPeriod.status === 'OPEN'
                          ? 'border-amber-500/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                          : 'border-emerald-500/40 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                      }`}
                    >
                      {currPeriod.status === 'OPEN' ? '🔒 Close Period' : '🔓 Reopen Period'}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Trial Balance High-Level Classification Summary */}
            {trialBalance && (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
                <div className="p-2.5 bg-muted/30 border border-border rounded-lg space-y-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Total Debits</span>
                  <div className="text-xs font-mono font-bold text-foreground">
                    ₹{Number(trialBalance.totalDebits || (trialBalance as any).total_debits || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-2.5 bg-muted/30 border border-border rounded-lg space-y-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Total Credits</span>
                  <div className="text-xs font-mono font-bold text-foreground">
                    ₹{Number(trialBalance.totalCredits || (trialBalance as any).total_credits || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-2.5 bg-muted/30 border border-border rounded-lg space-y-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Trial Balance</span>
                  <div className={`text-xs font-bold ${trialBalance.isBalanced || (trialBalance as any).is_balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                    {(trialBalance.isBalanced || (trialBalance as any).is_balanced) ? '✓ BALANCED (0.00)' : `⚠️ DIFF: ₹${trialBalance.difference || (trialBalance as any).difference}`}
                  </div>
                </div>
                <div className="p-2.5 bg-muted/30 border border-border rounded-lg space-y-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Total Assets</span>
                  <div className="text-xs font-mono font-bold text-foreground">
                    ₹{Number(trialBalance.totalAssets || (trialBalance as any).total_assets || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-2.5 bg-muted/30 border border-border rounded-lg space-y-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Total Liabilities</span>
                  <div className="text-xs font-mono font-bold text-foreground">
                    ₹{Number(trialBalance.totalLiabilities || (trialBalance as any).total_liabilities || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-2.5 bg-muted/30 border border-border rounded-lg space-y-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Total Revenue</span>
                  <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{Number(trialBalance.totalRevenue || (trialBalance as any).total_revenue || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="p-2.5 bg-muted/30 border border-border rounded-lg space-y-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Total Expense</span>
                  <div className="text-xs font-mono font-bold text-foreground">
                    ₹{Number(trialBalance.totalExpense || (trialBalance as any).total_expense || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Journal Entries Register Table */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="text-sm font-semibold text-foreground">
                Journal Entries Register ({journalEntries.length})
              </h4>
              <span className="text-xs text-muted-foreground">
                Double-Entry Audited Vouchers
              </span>
            </div>

            {journalEntries.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
                No posted journal entries found for the selected period. Journals are generated automatically upon authorized procurement, invoice, tax, and settlement events.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Journal #</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Entry Type</th>
                      <th className="px-3 py-2">Source Ref</th>
                      <th className="px-3 py-2 text-right">Debit Total</th>
                      <th className="px-3 py-2 text-right">Credit Total</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                    {journalEntries.map((j: any) => (
                      <tr key={j.id} className="hover:bg-muted/20 transition">
                        <td className="px-3 py-2.5 font-bold text-primary cursor-pointer hover:underline" onClick={() => setSelectedJournalForDetail(j)}>
                          {j.journal_number || j.journalNumber}
                        </td>
                        <td className="px-3 py-2.5 font-sans text-muted-foreground">
                          {j.entry_date || j.entryDate}
                        </td>
                        <td className="px-3 py-2.5 font-sans">
                          <span className="inline-block px-2 py-0.5 rounded bg-muted text-foreground text-[10px] font-semibold">
                            {j.entry_type || j.entryType}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground text-[10px] max-w-[120px] truncate">
                          {j.source_entity_type || j.sourceEntityType || '—'}: {j.source_entity_id || j.sourceEntityId || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-foreground">
                          ₹{Number(j.total_debit || j.totalDebit || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-foreground">
                          ₹{Number(j.total_credit || j.totalCredit || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              (j.status === 'POSTED')
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : (j.status === 'REVERSED')
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {j.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-sans space-x-1">
                          <button
                            type="button"
                            onClick={() => setSelectedJournalForDetail(j)}
                            className="px-2 py-0.5 text-[10px] text-primary hover:bg-primary/10 border border-primary/20 rounded font-semibold"
                          >
                            View Lines
                          </button>
                          {j.status === 'POSTED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingJournal(j);
                                setReversalReasonInput('');
                                setReversalError(null);
                              }}
                              className="px-2 py-0.5 text-[10px] text-destructive hover:bg-destructive/10 border border-destructive/20 rounded font-semibold"
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SETTLEMENT RECONCILIATIONS LEDGER */}
      {activeTab === 'SETTLEMENT_RECON' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Settlement Reconciliation Read Model (Phase 5C.6)
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
                    <th className="px-3 py-2 text-right">Sync PO</th>
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
                      <td className="px-3 py-2.5 text-right font-sans">
                        <button
                          type="button"
                          onClick={() => handleSyncPoSettlement(rec.purchaseOrderId)}
                          disabled={syncingPoId === rec.purchaseOrderId}
                          className="px-2 py-0.5 border border-border text-[10px] font-semibold rounded hover:bg-muted disabled:opacity-50"
                        >
                          {syncingPoId === rec.purchaseOrderId ? 'Syncing…' : '🔄 Sync PO'}
                        </button>
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
                Financial Exception Queue (Phase 5C.6)
              </h3>
              <p className="text-xs text-muted-foreground">
                Immutable audit queue of settlement discrepancies with multi-stage event forensics
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
                      <td className="px-3 py-2.5 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleViewExceptionTimeline(exc)}
                          className="px-2 py-1 border border-border rounded text-[11px] font-semibold hover:bg-muted"
                        >
                          📜 Timeline
                        </button>
                        {exc.status !== 'RESOLVED' && (
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
                    <th className="px-3 py-2 text-right">Actions</th>
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
                        {r.discrepancyType === 'MANUALLY_INVALIDATED' ? (
                          <span className="text-amber-600 font-bold">⚠️ INVALIDATED: {r.resolutionNotes || r.discrepancyDetails}</span>
                        ) : (
                          r.discrepancyDetails || 'Fully cleared'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-sans">
                        {r.status === 'MATCHED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setInvalidatingRecord(r);
                              setInvalidationReasonInput('');
                              setInvalidationError(null);
                            }}
                            className="px-2 py-1 text-[10px] text-destructive hover:bg-destructive/10 border border-destructive/20 rounded font-semibold"
                          >
                            Invalidate / Chargeback
                          </button>
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

      {/* TAB 5: ERP EXPORT REGISTRY (GAP-5C6-01) */}
      {activeTab === 'ERP_MANIFESTS' && (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>📑</span> ERP Export Manifest Registry &amp; Deduplication Audit
              </h3>
              <p className="text-xs text-muted-foreground">
                Authoritative register of statutory exports with cryptographic SHA-256 payload integrity guarantees
              </p>
            </div>
          </div>

          {manifests.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground border border-dashed rounded-lg">
              No statutory ERP export manifests generated yet. Manifests are recorded upon Tally, Zoho, or Audit Pack exports.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Export Type</th>
                    <th className="px-3 py-2">Batch Reference</th>
                    <th className="px-3 py-2 text-center">Version</th>
                    <th className="px-3 py-2 text-right">Records</th>
                    <th className="px-3 py-2 text-right">Total Amount</th>
                    <th className="px-3 py-2">SHA-256 Checksum</th>
                    <th className="px-3 py-2">Exported At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                  {manifests.map((m) => (
                    <tr key={m.id} className="hover:bg-muted/20 transition">
                      <td className="px-3 py-2.5 font-bold font-sans">
                        <span className="inline-block px-2 py-0.5 rounded bg-muted text-foreground text-[10px]">
                          {m.export_type}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-foreground">
                        {m.batch_reference}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.export_version > 1 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-muted'
                        }`}>
                          v{m.export_version}
                          {m.export_version > 1 && ' (Re-export)'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">{m.record_count}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        ₹{Number(m.total_amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-[10px] max-w-[140px] truncate">
                        {m.payload_checksum_sha256}
                      </td>
                      <td className="px-3 py-2.5 font-sans text-muted-foreground text-[10px]">
                        {new Date(m.exported_at).toLocaleString('en-IN')}
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

      {/* Bank Reconciliation Invalidate Modal (GAP-5C6-06) */}
      {invalidatingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-destructive flex items-center gap-1.5">
                <span>⚠️</span> Invalidate Bank Reconciliation / Chargeback
              </h3>
              <button
                type="button"
                onClick={() => setInvalidatingRecord(null)}
                className="text-muted-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 bg-destructive/10 rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bank UTR:</span>
                <span className="font-mono font-bold text-foreground">{invalidatingRecord.utrNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cleared Amount:</span>
                <span className="font-mono font-bold text-foreground">₹{invalidatingRecord.bankClearedAmount.toLocaleString('en-IN')}</span>
              </div>
              <p className="text-[11px] text-destructive font-medium pt-1">
                Invalidating this record will transition it to DISCREPANCY with MANUALLY_INVALIDATED type and clear matched payment linkage.
              </p>
            </div>

            {invalidationError && (
              <div className="text-xs p-2.5 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-medium">
                {invalidationError}
              </div>
            )}

            <form onSubmit={handleInvalidateBankRec} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Invalidation / Chargeback Audit Reason (min. 5 chars)
                </label>
                <textarea
                  required
                  rows={3}
                  value={invalidationReasonInput}
                  onChange={(e) => setInvalidationReasonInput(e.target.value)}
                  placeholder="e.g. Bank chargeback issued by vendor or UTR mistakenly applied to incorrect PO."
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInvalidatingRecord(null)}
                  className="px-3 py-1.5 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={invalidationLoading || invalidationReasonInput.trim().length < 5}
                  className="px-4 py-1.5 bg-destructive text-destructive-foreground font-semibold rounded-md hover:bg-destructive/90 disabled:opacity-50"
                >
                  {invalidationLoading ? 'Invalidating…' : 'Confirm Invalidation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Exception Event Timeline Drawer (GAP-5C6-05) */}
      {selectedExceptionForTimeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs">
          <div className="bg-card border-l border-border h-full max-w-md w-full p-6 space-y-4 overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>📜</span> Investigation Timeline
                </h3>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">
                  Exception: {selectedExceptionForTimeline.id.slice(0, 8)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedExceptionForTimeline(null)}
                className="text-muted-foreground hover:text-foreground font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-muted/40 rounded-lg space-y-1 text-xs">
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground font-sans">Type:</span>
                <span className="font-bold">{selectedExceptionForTimeline.exceptionType}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground font-sans">Disputed:</span>
                <span className="font-bold text-destructive">₹{selectedExceptionForTimeline.amountInDispute.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-muted-foreground font-sans">Status:</span>
                <span className="font-bold">{selectedExceptionForTimeline.status}</span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Event History ({exceptionEvents.length})
              </h4>

              {eventsLoading ? (
                <div className="text-center py-6 text-xs text-muted-foreground animate-pulse">
                  Loading investigation event logs…
                </div>
              ) : exceptionEvents.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed rounded-lg">
                  No historical event milestones recorded.
                </div>
              ) : (
                <div className="relative border-l-2 border-border/80 ml-3 space-y-4 text-xs">
                  {exceptionEvents.map((ev) => (
                    <div key={ev.id} className="relative pl-4 space-y-1">
                      <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-primary" />
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground text-[11px]">
                          {ev.event_type}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(ev.created_at).toLocaleString('en-IN')}
                        </span>
                      </div>
                      {ev.from_status && ev.to_status && (
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {ev.from_status} → {ev.to_status}
                        </div>
                      )}
                      {ev.notes && (
                        <p className="text-[11px] bg-muted/30 p-2 rounded text-foreground">
                          {ev.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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

            {dateDriftWarning && (
              <div className="text-xs p-2.5 bg-amber-500/10 text-amber-800 dark:text-amber-300 rounded-md border border-amber-500/30 space-y-2">
                <div className="flex items-start gap-1.5 font-semibold">
                  <span>⚠️</span>
                  <span>{dateDriftWarning}</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none text-foreground pt-1 border-t border-amber-500/20">
                  <input
                    type="checkbox"
                    checked={acknowledgeDateDrift}
                    onChange={(e) => setAcknowledgeDateDrift(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span className="font-bold text-[11px]">Acknowledge bank cleared date drift &gt; 30 days</span>
                </label>
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
                  {recLoading ? 'Reconciling…' : 'Match & Reconcile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Journal Lines Drawer / Modal (Phase 5D) */}
      {selectedJournalForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <span>📖</span> Journal Entry #{selectedJournalForDetail.journalNumber || (selectedJournalForDetail as any).journal_number}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {selectedJournalForDetail.entryType || (selectedJournalForDetail as any).entry_type} • {selectedJournalForDetail.entryDate || (selectedJournalForDetail as any).entry_date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJournalForDetail(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
              <span className="font-semibold text-muted-foreground block text-[10px] uppercase">Narration</span>
              <p className="text-foreground">{selectedJournalForDetail.narration}</p>
            </div>

            {/* Debit & Credit Lines Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Debit (₹)</th>
                    <th className="px-3 py-2 text-right">Credit (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 font-mono text-[11px]">
                  {(selectedJournalForDetail.lines || []).map((l: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">{l.lineNumber || l.line_number || (idx + 1)}</td>
                      <td className="px-3 py-2 font-sans font-semibold">
                        {l.account?.account_name || l.accountName || l.account_code || l.accountCode || l.account_id || l.accountId}
                      </td>
                      <td className="px-3 py-2 font-sans text-muted-foreground text-[10px]">{l.description || '—'}</td>
                      <td className="px-3 py-2 text-right font-bold">
                        {Number(l.debitAmount || l.debit_amount || 0) > 0 ? `₹${Number(l.debitAmount || l.debit_amount).toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-bold">
                        {Number(l.creditAmount || l.credit_amount || 0) > 0 ? `₹${Number(l.creditAmount || l.credit_amount).toLocaleString('en-IN')}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40 font-mono text-xs font-bold border-t">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 font-sans text-right">Total:</td>
                    <td className="px-3 py-2 text-right text-foreground">
                      ₹{Number(selectedJournalForDetail.totalDebit || (selectedJournalForDetail as any).total_debit || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right text-foreground">
                      ₹{Number(selectedJournalForDetail.totalCredit || (selectedJournalForDetail as any).total_credit || 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedJournalForDetail(null)}
                className="px-4 py-1.5 bg-primary text-primary-foreground font-semibold rounded-md text-xs hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Journal Reversal Modal (Phase 5D) */}
      {reversingJournal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-foreground">
                Reverse Journal Entry ({reversingJournal.journalNumber || (reversingJournal as any).journal_number})
              </h3>
              <button
                type="button"
                onClick={() => setReversingJournal(null)}
                className="text-muted-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-700 dark:text-amber-300">
              ⚠️ Journal reversal creates an exact mirrored double-entry record with swapped debits and credits, preserving full ledger auditability.
            </div>

            {reversalError && (
              <div className="text-xs p-2.5 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-medium">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleReverseJournal} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-muted-foreground mb-1">
                  Reversal Reason (min. 5 characters)
                </label>
                <textarea
                  required
                  rows={3}
                  value={reversalReasonInput}
                  onChange={(e) => setReversalReasonInput(e.target.value)}
                  placeholder="e.g. Authorized cancellation of erroneous commercial invoice."
                  className="w-full bg-background border border-border rounded-md px-3 py-1.5"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReversingJournal(null)}
                  className="px-3 py-1.5 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversalLoading}
                  className="px-4 py-1.5 bg-destructive text-destructive-foreground font-semibold rounded-md hover:bg-destructive/90 disabled:opacity-50"
                >
                  {reversalLoading ? 'Reversing…' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Period Close / Reopen Modal (Phase 5D) */}
      {managingPeriod && periodAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-foreground">
                {periodAction === 'CLOSE' ? 'Close Accounting Period' : 'Reopen Accounting Period'} ({managingPeriod.periodName || (managingPeriod as any).period_name || managingPeriod.periodCode || (managingPeriod as any).period_code})
              </h3>
              <button
                type="button"
                onClick={() => {
                  setManagingPeriod(null);
                  setPeriodAction(null);
                }}
                className="text-muted-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {periodError && (
              <div className="text-xs p-2.5 bg-destructive/10 text-destructive rounded-md border border-destructive/20 font-medium">
                {periodError}
              </div>
            )}

            <form onSubmit={handlePeriodAction} className="space-y-3 text-xs">
              {periodAction === 'CLOSE' ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground">
                    Closing this accounting period will lock all journal entries and prevent further postings without explicit Owner reopening.
                  </p>
                  {journalEntries.some(
                    (j: any) =>
                      (j.periodId === managingPeriod.id || j.period_id === managingPeriod.id) &&
                      (j.status === 'DRAFT' || j.postingStatus === 'DRAFT' || j.posting_status === 'DRAFT')
                  ) && (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-md text-amber-900 dark:text-amber-300 font-semibold">
                      ⚠️ Warning: Unposted DRAFT journal vouchers detected in this period. They must be posted or discarded before closing.
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block font-medium text-muted-foreground mb-1">
                    Reopening Reason &amp; Audit Justification (min. 5 chars)
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={reopenReasonInput}
                    onChange={(e) => setReopenReasonInput(e.target.value)}
                    placeholder="e.g. Authorized reopening for post-audit statutory adjustment."
                    className="w-full bg-background border border-border rounded-md px-3 py-1.5"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setManagingPeriod(null);
                    setPeriodAction(null);
                  }}
                  className="px-3 py-1.5 border border-border rounded-md hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={periodLoading}
                  className={`px-4 py-1.5 font-semibold rounded-md disabled:opacity-50 ${
                    periodAction === 'CLOSE'
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700'
                  }`}
                >
                  {periodLoading ? 'Processing…' : periodAction === 'CLOSE' ? 'Confirm Close' : 'Confirm Reopen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default FinancialControlDashboardPage;
