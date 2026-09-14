import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  runSellerDiagnostics,
  fixSellerIssue,
  searchAdminEntities,
  toggleEntityGstCompliance,
  unblockSealedQuote,
  simulatePoAcceptance,
  retryInvoicePaymentWebhook,
  fetchEntityAuditTrail,
} from '../api/admin-ops';
import { supabase } from '@/lib/supabase';
import type { TargetedDiagnosticReport, AdminSearchResultItem } from '../types/admin';

export function AdminSellerTroubleshooter({
  onRefreshTelemetry,
  initialTargetId,
}: {
  onRefreshTelemetry: () => void;
  initialTargetId?: string;
}) {
  const [searchParams] = useSearchParams();
  const urlTarget = searchParams.get('id') || searchParams.get('target') || initialTargetId || '';

  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  const [selectedSuppId, setSelectedSuppId] = useState(urlTarget);
  const [manualSuppId, setManualSuppId] = useState(urlTarget);
  const [report, setReport] = useState<TargetedDiagnosticReport | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Name & UUID search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AdminSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<{
    name: string;
    uuid: string;
    gstin?: string;
    gstStatus?: string;
    gstVerified?: boolean;
    status?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Operational items state for this supplier
  const [supplierQuotes, setSupplierQuotes] = useState<any[]>([]);
  const [supplierPOs, setSupplierPOs] = useState<any[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    async function loadSuppliers() {
      const { data } = await supabase
        .from('suppliers')
        .select('id, business_name, legal_name, gstin, gst_status, gst_verified, is_demo')
        .limit(50);
      if (data) setSuppliersList(data);
    }
    void loadSuppliers();
  }, []);

  const loadSupplierDetails = async (suppId: string) => {
    if (!suppId) return;
    setIsLoadingDetails(true);
    try {
      // 1. Fetch supplier record
      const { data: sData } = await supabase
        .from('suppliers')
        .select('id, business_name, legal_name, gstin, gst_status, gst_verified')
        .eq('id', suppId)
        .maybeSingle();

      if (sData) {
        setSelectedSupplier({
          name: sData.business_name || sData.legal_name || 'Supplier',
          uuid: sData.id,
          gstin: sData.gstin,
          gstStatus: sData.gst_status,
          gstVerified: Boolean(sData.gst_verified),
          status: sData.gst_status,
        });
      }

      // 2. Fetch supplier quotes
      const { data: qData } = await supabase
        .from('quotes')
        .select(`
          id,
          rfq_id,
          status,
          current_version,
          submitted_at,
          rfqs (
            id,
            status,
            requirements (title)
          )
        `)
        .eq('supplier_id', suppId)
        .order('created_at', { ascending: false })
        .limit(10);
      setSupplierQuotes(qData || []);

      // 3. Fetch purchase orders
      const { data: poData } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          status,
          total_amount,
          created_at,
          acknowledged_at,
          rfqs (
            requirements (title)
          )
        `)
        .eq('supplier_id', suppId)
        .order('created_at', { ascending: false })
        .limit(10);
      setSupplierPOs(poData || []);

      // 4. Fetch invoices
      const { data: invData } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          amount,
          status,
          submitted_at,
          payments (id, status, gateway_status)
        `)
        .eq('supplier_id', suppId)
        .order('created_at', { ascending: false })
        .limit(10);
      setSupplierInvoices(invData || []);

      // 5. Fetch audit trail
      const auditRes = await fetchEntityAuditTrail(suppId);
      if (auditRes.ok) {
        setAuditEvents(auditRes.events);
      }
    } catch (err) {
      console.error('loadSupplierDetails error:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Auto-run diagnostics directly without asking for UUID if ID is provided
  useEffect(() => {
    if (urlTarget) {
      setSelectedSuppId(urlTarget);
      setManualSuppId(urlTarget);
      const match = suppliersList.find((s) => s.id === urlTarget);
      if (match) {
        setSelectedSupplier({
          name: match.business_name || match.legal_name,
          uuid: match.id,
          gstin: match.gstin,
          gstStatus: match.gst_status,
          gstVerified: Boolean(match.gst_verified),
          status: match.gst_status,
        });
      }
      void handleRunDiagnostics(urlTarget);
      void loadSupplierDetails(urlTarget);
    }
  }, [urlTarget, suppliersList]);

  const handleRunDiagnostics = async (suppIdToUse?: string) => {
    const target = suppIdToUse || selectedSuppId || manualSuppId || selectedSupplier?.uuid || undefined;

    setIsDiagnosing(true);
    setReport(null);
    setStatusMessage(null);
    try {
      const res = await runSellerDiagnostics(target);
      if (res.ok && res.report) {
        setReport(res.report);
      } else {
        alert(res.error || 'Seller diagnostics failed');
      }
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleEntitySearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await searchAdminEntities(q);
      if (res.ok) {
        setSearchResults(
          res.results.filter(
            (r: AdminSearchResultItem) =>
              r.entity_type === 'SUPPLIER' || r.entity_type === 'PURCHASE_ORDER'
          )
        );
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (item: AdminSearchResultItem) => {
    const targetUuid = item.supplier_id || item.id;
    setSelectedSupplier({
      name: item.title,
      uuid: targetUuid,
      gstin: item.gstin,
      status: [item.city, item.gst_status || item.status].filter(Boolean).join(' · '),
    });
    setSelectedSuppId(targetUuid);
    setManualSuppId(targetUuid);
    setSearchResults([]);
    setSearchQuery(`${item.title} (${targetUuid.slice(0, 8)}...)`);
    void handleRunDiagnostics(targetUuid);
    void loadSupplierDetails(targetUuid);
  };

  const handleApplyFix = async (fixAction: string, issueTitle: string) => {
    const target = selectedSuppId || manualSuppId || selectedSupplier?.uuid || report?.target;
    if (!target) return;
    if (!window.confirm(`Execute automatic fix [${issueTitle}] for this supplier?`)) return;

    setActionInProgress(fixAction);
    try {
      const res = await fixSellerIssue(fixAction, target, undefined, `Applied via Seller Troubleshooter: ${issueTitle}`);
      if (res.ok) {
        setStatusMessage(res.message);
        await handleRunDiagnostics(target);
        await loadSupplierDetails(target);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Fix failed');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // 1. Force Verify Supplier GSTIN Action
  const handleForceVerifyGst = async () => {
    const suppId = selectedSupplier?.uuid || selectedSuppId;
    if (!suppId) return;
    const reason = window.prompt(
      'Enter audit reason for manual Supplier GSTIN verification:',
      'Verified via Official GST Portal API inspection by Admin'
    );
    if (!reason || reason.trim().length < 5) {
      alert('Valid reason is required to verify GST.');
      return;
    }

    setActionInProgress('GST_VERIFY');
    try {
      const res = await toggleEntityGstCompliance(suppId, 'SUPPLIER', true, false, reason.trim());
      if (res.ok) {
        setStatusMessage(res.message);
        await handleRunDiagnostics(suppId);
        await loadSupplierDetails(suppId);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Failed to verify GST');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // 2. Unblock Sealed Quote Action
  const handleUnblockQuote = async (quoteId: string) => {
    const reason = window.prompt(
      'Enter audit reason to unblock and submit sealed quote:',
      'Supplier sealed quote payload validated; unblocking for buyer evaluation'
    );
    if (!reason || reason.trim().length < 5) return;

    setActionInProgress(`UNBLOCK_${quoteId}`);
    try {
      const res = await unblockSealedQuote(quoteId, reason.trim());
      if (res.ok) {
        setStatusMessage(res.message);
        const suppId = selectedSupplier?.uuid || selectedSuppId;
        if (suppId) await loadSupplierDetails(suppId);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Failed to unblock quote');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // 3. Simulate PO Acceptance Action
  const handleSimulatePoAck = async (poId: string, poNumber: string) => {
    const reason = window.prompt(
      `Enter reason to simulate acceptance for ${poNumber}:`,
      'Manual acknowledgment confirmed via supplier dispatch line'
    );
    if (!reason || reason.trim().length < 5) return;

    setActionInProgress(`PO_ACK_${poId}`);
    try {
      const res = await simulatePoAcceptance(poId, reason.trim());
      if (res.ok) {
        setStatusMessage(res.message);
        const suppId = selectedSupplier?.uuid || selectedSuppId;
        if (suppId) await loadSupplierDetails(suppId);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Failed to simulate PO acceptance');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // 4. Invoice & Payment Webhook Retry Action
  const handleRetryPaymentWebhook = async (invoiceId: string, invoiceNumber: string) => {
    const reason = window.prompt(
      `Trigger payment webhook retry for invoice ${invoiceNumber}:`,
      'Manual payment verification retry triggered by SuperAdmin'
    );
    if (!reason || reason.trim().length < 5) return;

    setActionInProgress(`WEBHOOK_${invoiceId}`);
    try {
      const res = await retryInvoicePaymentWebhook(invoiceId, reason.trim());
      if (res.ok) {
        setStatusMessage(res.message);
        const suppId = selectedSupplier?.uuid || selectedSuppId;
        if (suppId) await loadSupplierDetails(suppId);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Failed to retry payment webhook');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Header Banner */}
      <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl shrink-0">🏪</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Supplier Verification &amp; Operational Console</h3>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                Verify GSTIN, MSME certificates, bank accounts, unblock sealed quotes, and trigger 1-tap approvals.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isDiagnosing}
            onClick={() => void handleRunDiagnostics()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 active:scale-98 transition disabled:opacity-50 whitespace-nowrap"
          >
            <span>⚡</span> {isDiagnosing ? 'Scanning…' : 'Run Fleet Scan'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-950 dark:text-emerald-200 flex items-center justify-between font-semibold">
          <span>✓ {statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
      )}

      {/* Target Selector */}
      <div className="rounded-xl border bg-card p-3.5 sm:p-5 shadow-2xs space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Step 1: Select or Search Supplier to Diagnose (Input Name or UUID)
        </h4>

        {/* Selected Target Supplier Banner */}
        {selectedSupplier && (
          <div className="rounded-xl border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150 shadow-2xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-md bg-purple-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  SUPPLIER
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-foreground">{selectedSupplier.name}</h4>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    selectedSupplier.gstVerified
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}
                >
                  {selectedSupplier.gstVerified ? '✓ GST Verified' : 'GST Pending'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground font-semibold">Supplier UUID:</span>
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-bold text-purple-700 dark:text-purple-400 select-all border">
                  {selectedSupplier.uuid}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(selectedSupplier.uuid);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-bold hover:bg-muted text-foreground transition shadow-2xs active:scale-98"
                >
                  {copied ? '✓ Copied!' : '📋 Copy UUID'}
                </button>
                {selectedSupplier.gstin && (
                  <span className="text-muted-foreground font-mono">· GSTIN: {selectedSupplier.gstin}</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRunDiagnostics(selectedSupplier.uuid)}
                disabled={isDiagnosing}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 active:scale-98 transition whitespace-nowrap"
              >
                <span>🔍</span> {isDiagnosing ? 'Diagnosing…' : 'Run Diagnostics'}
              </button>

              <button
                type="button"
                onClick={() => void handleForceVerifyGst()}
                disabled={actionInProgress === 'GST_VERIFY'}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-card px-3.5 py-2 text-xs font-bold text-foreground shadow-xs hover:bg-muted active:scale-98 transition whitespace-nowrap"
              >
                <span>🛡️</span> {selectedSupplier.gstVerified ? 'Re-verify GSTIN' : '1-Tap Verify GSTIN'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Select Active Supplier from Fleet:
            </label>
            <select
              value={selectedSuppId}
              onChange={(e) => {
                const suppId = e.target.value;
                setSelectedSuppId(suppId);
                const match = suppliersList.find((s) => s.id === suppId);
                if (match) {
                  setSelectedSupplier({
                    name: match.business_name || match.legal_name,
                    uuid: match.id,
                    gstin: match.gstin,
                    gstStatus: match.gst_status,
                    gstVerified: Boolean(match.gst_verified),
                    status: match.gst_status,
                  });
                  setManualSuppId(match.id);
                }
                if (suppId) {
                  void handleRunDiagnostics(suppId);
                  void loadSupplierDetails(suppId);
                }
              }}
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            >
              <option value="">-- Choose supplier from list --</option>
              {suppliersList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.business_name || s.legal_name} — [UUID: {s.id.slice(0, 8)}...] ({s.gst_verified ? '✓ Verified' : 'Pending GST'})
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="block text-xs font-semibold text-foreground mb-1">
              Search by Name, GSTIN, or UUID:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => void handleEntitySearch(e.target.value)}
                placeholder="e.g. 'Apex', '29AABCT1332L', or UUID..."
                className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
              />
              <button
                type="button"
                disabled={isDiagnosing || !searchQuery.trim()}
                onClick={() => void handleRunDiagnostics(searchQuery.trim())}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-98 transition whitespace-nowrap"
              >
                {isDiagnosing ? 'Scanning…' : 'Search & Run 🔍'}
              </button>
            </div>

            {/* Live Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg text-xs space-y-1">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectSearchResult(item)}
                    className="w-full text-left rounded-md p-2 hover:bg-muted transition flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">{item.title}</span>
                      <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                        {item.entity_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                      <span className="font-mono text-purple-600 dark:text-purple-400">{item.id}</span>
                      {item.gstin && <span className="font-mono">· GSTIN: {item.gstin}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {isSearching && (
              <p className="text-[11px] text-muted-foreground mt-1">Searching supplier registry…</p>
            )}
          </div>
        </div>
      </div>

      {/* Step 2: Operational Troubleshooting Panels for Selected Supplier */}
      {selectedSupplier && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Sealed Quotes Unblocker Panel */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>🔐</span> Sealed Quotes &amp; Submission Unblocker
              </h4>
              <span className="text-xs text-muted-foreground font-mono">
                {supplierQuotes.length} quotes
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Inspect draft or locked quotes from this supplier. If a quote is stuck in DRAFT due to client disconnects or encryption locks, force submission directly.
            </p>

            {supplierQuotes.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 italic">No quotes created by this supplier yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {supplierQuotes.map((q) => {
                  const reqTitle = (q.rfqs as any)?.requirements?.title || 'RFQ';
                  return (
                    <div
                      key={q.id}
                      className="rounded-lg border bg-muted/20 p-3 text-xs flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-foreground">{reqTitle}</div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="font-mono">{q.id.slice(0, 8)}...</span>
                          <span
                            className={`rounded px-1.5 py-0.2 font-bold text-[10px] ${
                              q.status === 'SUBMITTED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}
                          >
                            {q.status}
                          </span>
                        </div>
                      </div>

                      {q.status === 'DRAFT' && (
                        <button
                          type="button"
                          disabled={actionInProgress === `UNBLOCK_${q.id}`}
                          onClick={() => handleUnblockQuote(q.id)}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-purple-600 px-3.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-purple-700 active:scale-98 transition disabled:opacity-50"
                        >
                          {actionInProgress === `UNBLOCK_${q.id}` ? 'Submitting…' : '⚡ Unblock & Submit'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PO Acknowledgment Simulator & Invoice Retry Panel */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>📦</span> PO Acknowledgment &amp; Payment Webhook Retry
              </h4>
              <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                Fulfillment Recovery
              </span>
            </div>

            {/* Purchase Orders Section */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-foreground block">Purchase Orders Pending Acceptance:</span>
              {supplierPOs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No purchase orders assigned to this supplier.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {supplierPOs.map((po) => (
                    <div
                      key={po.id}
                      className="rounded-lg border bg-muted/20 p-2.5 text-xs flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-2">
                          <span>{po.po_number}</span>
                          <span className="font-mono text-emerald-600 font-bold">
                            ₹{Number(po.total_amount).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Status: <span className="font-bold">{po.status}</span> · {po.acknowledged_at ? '✓ Acknowledged' : '⚠️ Pending Ack'}
                        </div>
                      </div>

                      {po.status === 'ISSUED' && !po.acknowledged_at && (
                        <button
                          type="button"
                          disabled={actionInProgress === `PO_ACK_${po.id}`}
                          onClick={() => handleSimulatePoAck(po.id, po.po_number)}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-foreground text-background px-3.5 py-1 text-xs font-bold shadow hover:bg-foreground/90 active:scale-98 transition disabled:opacity-50"
                        >
                          {actionInProgress === `PO_ACK_${po.id}` ? 'Accepting…' : '⚡ Simulate Acceptance'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices & Webhook Retry Section */}
            <div className="space-y-2 pt-2 border-t">
              <span className="text-xs font-bold text-foreground block">Invoices &amp; Settlement Webhook:</span>
              {supplierInvoices.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No invoices submitted by this supplier.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {supplierInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="rounded-lg border bg-muted/20 p-2.5 text-xs flex flex-wrap items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-foreground flex items-center gap-2">
                          <span>{inv.invoice_number}</span>
                          <span className="font-mono text-emerald-600 font-bold">
                            ₹{Number(inv.amount).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Status: <span className="font-bold">{inv.status}</span>
                        </div>
                      </div>

                      {inv.status !== 'PAID' && (
                        <button
                          type="button"
                          disabled={actionInProgress === `WEBHOOK_${inv.id}`}
                          onClick={() => handleRetryPaymentWebhook(inv.id, inv.invoice_number)}
                          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 text-white px-3.5 py-1 text-xs font-bold shadow hover:bg-emerald-700 active:scale-98 transition disabled:opacity-50"
                        >
                          {actionInProgress === `WEBHOOK_${inv.id}` ? 'Retrying…' : '⚡ Retry Payment Webhook'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Report View */}
      {report && (
        <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-foreground">Diagnostic Report Findings</h4>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    report.issues.length === 0
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}
                >
                  {report.issues.length === 0 ? '✓ No Issues Detected (Healthy)' : `⚠️ ${report.issues.length} Issues Identified`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Target: <span className="font-mono">{report.target}</span> · Analyzed at {new Date(report.timestamp).toLocaleTimeString()}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleRunDiagnostics()}
              className="rounded-md border bg-card px-3 py-1 text-xs font-semibold hover:bg-muted text-foreground"
            >
              Re-run Analysis ↺
            </button>
          </div>

          {report.issues.length === 0 ? (
            <div className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-6 text-center text-xs text-emerald-900 dark:text-emerald-200">
              <span className="text-2xl block mb-2">🎉</span>
              <p className="font-bold text-sm">All Supplier Lifecycle Invariants &amp; Trust Badges Passed</p>
              <p className="text-muted-foreground mt-1">This supplier account is in good standing and able to participate in tenders.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {report.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`rounded-lg border p-4 text-xs space-y-2 ${
                    issue.severity === 'ERROR'
                      ? 'border-red-300 bg-red-50/30 dark:bg-red-950/20'
                      : 'border-amber-300 bg-amber-50/30 dark:bg-amber-950/20'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">{issue.title}</span>
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {issue.category}
                      </span>
                    </div>

                    {issue.autoFixAvailable && (
                      <button
                        type="button"
                        disabled={actionInProgress === issue.fixAction}
                        onClick={() => handleApplyFix(issue.fixAction, issue.title)}
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-foreground text-background px-4 py-2 text-xs font-bold shadow hover:bg-foreground/90 active:scale-98 transition disabled:opacity-50"
                      >
                        {actionInProgress === issue.fixAction ? 'Applying Fix…' : '⚡ 1-Click Auto Fix'}
                      </button>
                    )}
                  </div>

                  <p className="text-muted-foreground">{issue.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Entity Ops Activity Trace */}
      {selectedSupplier && (
        <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2.5">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span>📜</span> Operational Activity &amp; Audit Trail Timeline
            </h4>
            <span className="text-xs text-muted-foreground font-mono">
              {auditEvents.length} recorded events
            </span>
          </div>

          {isLoadingDetails ? (
            <p className="text-xs text-muted-foreground py-3">Loading supplier audit events…</p>
          ) : auditEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">
              No manual overrides or troubleshooting actions recorded for this supplier yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {auditEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="rounded-xl border bg-muted/20 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-bold text-foreground flex-wrap">
                      <span className="rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-300 px-2 py-0.5 text-[10px] font-mono">
                        {evt.event_type}
                      </span>
                      {evt.payload?.action && <span>{evt.payload.action}</span>}
                    </div>
                    {evt.payload?.reason && (
                      <p className="text-muted-foreground text-[11px]">
                        Reason: <span className="italic">"{evt.payload.reason}"</span>
                      </p>
                    )}
                  </div>

                  <div className="text-left sm:text-right text-[11px] text-muted-foreground border-t sm:border-t-0 pt-1 sm:pt-0">
                    <div className="font-semibold text-foreground">{evt.actor_name || 'SuperAdmin'}</div>
                    <div className="font-mono">{new Date(evt.occurred_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
