import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  runBuyerDiagnostics,
  fixBuyerIssue,
  searchAdminEntities,
  forceTransitionOrderState,
  bypassApprovalGate,
  toggleEntityGstCompliance,
  fetchEntityAuditTrail,
} from '../api/admin-ops';
import { emitAdminTelemetryEvent } from '../api/admin-telemetry';
import { supabase } from '@/lib/supabase';
import type { TargetedDiagnosticReport, LiveTransactionItem, AdminSearchResultItem } from '../types/admin';

interface AdminBuyerTroubleshooterProps {
  transactions: LiveTransactionItem[];
  onRefreshTelemetry: () => void;
  initialTargetId?: string;
}

const CANONICAL_STATES = [
  { value: 'DRAFT', label: '1. DRAFT - Draft Specification' },
  { value: 'QUOTING', label: '2. QUOTING - RFQ Open & Quoting' },
  { value: 'EVALUATING', label: '3. EVALUATING - Comparative Evaluation' },
  { value: 'AWARDED', label: '4. AWARDED - Award Finalized' },
  { value: 'PO_ISSUED', label: '5. PO_ISSUED - Purchase Order Issued' },
  { value: 'INVOICED', label: '6. INVOICED - Invoice & Work Order' },
  { value: 'SETTLED', label: '7. SETTLED - Fully Paid & Settled' },
  { value: 'STALLED', label: '8. STALLED - Stalled / Cancelled' },
];

export function AdminBuyerTroubleshooter({
  transactions,
  onRefreshTelemetry,
  initialTargetId,
}: AdminBuyerTroubleshooterProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlTarget = searchParams.get('id') || searchParams.get('target') || initialTargetId || '';

  const [selectedReqId, setSelectedReqId] = useState(urlTarget);
  const [manualReqId, setManualReqId] = useState(urlTarget);
  const [report, setReport] = useState<TargetedDiagnosticReport | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Name & UUID search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AdminSearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{
    name: string;
    uuid: string;
    type: string;
    organizationId?: string;
    organizationName?: string;
    buyerGstin?: string;
    gstVerified?: boolean;
    taxExempt?: boolean;
    currentState?: string;
    details?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Force-transition form state
  const [targetState, setTargetState] = useState<string>('QUOTING');
  const [transitionReason, setTransitionReason] = useState<string>('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Audit trail state
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Load detailed entity info and audit trail
  const loadTargetDetails = async (reqId: string) => {
    if (!reqId) return;
    try {
      // 1. Fetch requirement & organization details
      const { data: reqData } = await supabase
        .from('requirements')
        .select(`
          id,
          title,
          status,
          organization_id,
          organizations (
            id,
            name,
            tax_registration,
            gst_verified,
            tax_exempt
          )
        `)
        .eq('id', reqId)
        .maybeSingle();

      if (reqData) {
        const org: any = reqData.organizations;
        setSelectedEntity((prev) => ({
          name: reqData.title,
          uuid: reqData.id,
          type: 'REQUIREMENT',
          organizationId: reqData.organization_id,
          organizationName: org?.name || 'Buyer Org',
          buyerGstin: org?.tax_registration || undefined,
          gstVerified: Boolean(org?.gst_verified),
          taxExempt: Boolean(org?.tax_exempt),
          currentState: reqData.status,
          details: `${org?.name || 'Buyer Org'} · Status: ${reqData.status}`,
        }));
      }

      // 2. Fetch recent ops audit trail
      setIsLoadingAudit(true);
      const auditRes = await fetchEntityAuditTrail(reqId);
      if (auditRes.ok) {
        setAuditEvents(auditRes.events);
      }
    } catch (err) {
      console.error('loadTargetDetails error:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Auto-run diagnostics directly without asking for UUID if ID is provided
  useEffect(() => {
    if (urlTarget) {
      setSelectedReqId(urlTarget);
      setManualReqId(urlTarget);
      const match = transactions.find((t) => t.requirement_id === urlTarget);
      if (match) {
        setSelectedEntity({
          name: match.requirement_title,
          uuid: match.requirement_id,
          type: 'REQUIREMENT',
          organizationId: match.organization_id,
          organizationName: match.organization_name,
          details: `${match.organization_name} · ${match.rfq_public_ref || match.po_number || ''}`,
        });
      }
      void handleRunDiagnostics(urlTarget);
      void loadTargetDetails(urlTarget);
    }
  }, [urlTarget, transactions]);

  const handleRunDiagnostics = async (reqIdToUse?: string) => {
    const target = reqIdToUse || selectedReqId || manualReqId || selectedEntity?.uuid || undefined;

    setIsDiagnosing(true);
    setReport(null);
    setStatusMessage(null);
    try {
      const res = await runBuyerDiagnostics(target);
      if (res.ok && res.report) {
        setReport(res.report);
      } else {
        alert(res.error || 'Buyer diagnostics failed');
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
              r.entity_type === 'BUYER_ORG' ||
              r.entity_type === 'REQUIREMENT' ||
              r.entity_type === 'PURCHASE_ORDER'
          )
        );
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (item: AdminSearchResultItem) => {
    const targetUuid = item.requirement_id || item.id;
    setSelectedEntity({
      name: item.title,
      uuid: targetUuid,
      type: item.entity_type,
      details: [item.subtitle, item.city, item.status].filter(Boolean).join(' · '),
    });
    setSelectedReqId(targetUuid);
    setManualReqId(targetUuid);
    setSearchResults([]);
    setSearchQuery(`${item.title} (${targetUuid.slice(0, 8)}...)`);
    void handleRunDiagnostics(targetUuid);
    void loadTargetDetails(targetUuid);
  };

  const handleApplyFix = async (fixAction: string, issueTitle: string) => {
    const target = selectedReqId || manualReqId || selectedEntity?.uuid || report?.target;
    if (!target) return;
    if (!window.confirm(`Execute automatic fix [${issueTitle}] on this requirement?`)) return;

    setActionInProgress(fixAction);
    try {
      const res = await fixBuyerIssue(fixAction, target, undefined, `Applied via Buyer Troubleshooter: ${issueTitle}`);
      if (res.ok) {
        setStatusMessage(res.message);
        await handleRunDiagnostics(target);
        await loadTargetDetails(target);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Fix failed');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // 1. Force Transition State Action
  const handleForceTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = selectedReqId || selectedEntity?.uuid;
    if (!target) {
      alert('Please select a requirement first.');
      return;
    }
    if (!transitionReason || transitionReason.trim().length < 5) {
      alert('A mandatory operational audit reason of at least 5 characters is required.');
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to FORCE-TRANSITION this order to state [${targetState}]?\n\nReason: "${transitionReason}"\n\nThis will synchronize requirement, RFQ, and purchase order states.`
      )
    ) {
      return;
    }

    setIsTransitioning(true);
    try {
      const res = await forceTransitionOrderState(target, targetState, transitionReason.trim());
      if (res.ok) {
        setStatusMessage(res.message);
        setTransitionReason('');
        await handleRunDiagnostics(target);
        await loadTargetDetails(target);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Force transition failed');
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  // 2. Approval Gate Bypass Action
  const handleBypassApprovalGate = async () => {
    const target = selectedReqId || selectedEntity?.uuid;
    if (!target) return;
    const reason = window.prompt(
      'Enter reason for Committee Approval Gate Bypass (mandatory):',
      'Evaluation quorum unresponsive; super-admin manual clearance'
    );
    if (!reason || reason.trim().length < 5) {
      alert('Valid reason required to bypass approval gate.');
      return;
    }

    setActionInProgress('GATE_BYPASS');
    try {
      const res = await bypassApprovalGate(target, reason.trim());
      if (res.ok) {
        setStatusMessage(res.message);
        await handleRunDiagnostics(target);
        await loadTargetDetails(target);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Approval gate bypass failed');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // 3. Buyer GST Compliance Toggle Action
  const handleToggleBuyerGst = async (setVerified: boolean, setTaxExempt: boolean) => {
    const orgId = selectedEntity?.organizationId;
    if (!orgId) {
      alert('Buyer organization ID not found for this requirement.');
      return;
    }
    const reason = window.prompt(
      'Enter audit reason for updating Buyer GST compliance:',
      'Verified via State Tax Registry & SuperAdmin clearance'
    );
    if (!reason) return;

    setActionInProgress('GST_TOGGLE');
    try {
      const res = await toggleEntityGstCompliance(orgId, 'BUYER', setVerified, setTaxExempt, reason);
      if (res.ok) {
        setStatusMessage(res.message);
        const target = selectedReqId || selectedEntity?.uuid;
        if (target) await loadTargetDetails(target);
        onRefreshTelemetry();
      } else {
        alert(res.error || 'Failed to update GST compliance');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // 4. Tenant Context Switcher Action
  const handleSwitchTenantContext = async () => {
    const orgId = selectedEntity?.organizationId;
    const target = selectedReqId || selectedEntity?.uuid;
    if (!orgId) {
      alert('Organization ID not available.');
      return;
    }

    try {
      await supabase.rpc('switch_active_organization', { p_organization_id: orgId });
      await emitAdminTelemetryEvent({
        eventType: 'admin.tenant_context.switched',
        entityType: 'BUYER',
        entityId: orgId,
        action: 'SWITCH_TENANT_CONTEXT',
        reason: `Admin opened buyer view for requirement ${target}`,
        metadata: { requirementId: target, organizationId: orgId },
      });
      navigate(`/requirements/${target}`);
    } catch (err: any) {
      // Fallback navigate directly
      navigate(`/requirements/${target}`);
    }
  };

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Header Banner */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl shrink-0">🏛️</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">Buyer Governance &amp; Diagnostic Radar</h3>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                Diagnose RFQs, force state transitions across lifecycle states, bypass committee deadlocks, and verify tenant compliance.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isDiagnosing}
            onClick={() => void handleRunDiagnostics()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition disabled:opacity-50 whitespace-nowrap"
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
          Step 1: Select or Search Buyer Requirement to Diagnose (Input Name or UUID)
        </h4>

        {/* Selected Target Entity Banner */}
        {selectedEntity && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150 shadow-2xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  {selectedEntity.type}
                </span>
                <h4 className="text-xs sm:text-sm font-bold text-foreground">{selectedEntity.name}</h4>
                {selectedEntity.currentState && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-mono font-bold text-primary">
                    State: {selectedEntity.currentState}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground font-semibold">UUID:</span>
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-bold text-blue-700 dark:text-blue-400 select-all border">
                  {selectedEntity.uuid}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(selectedEntity.uuid);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-bold hover:bg-muted text-foreground transition shadow-2xs active:scale-98"
                >
                  {copied ? '✓ Copied!' : '📋 Copy UUID'}
                </button>
                {selectedEntity.details && (
                  <span className="text-muted-foreground">· {selectedEntity.details}</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRunDiagnostics(selectedEntity.uuid)}
                disabled={isDiagnosing}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 active:scale-98 transition whitespace-nowrap"
              >
                <span>🔍</span> {isDiagnosing ? 'Diagnosing…' : 'Run Diagnostics'}
              </button>

              <button
                type="button"
                onClick={() => void handleSwitchTenantContext()}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border bg-card px-3.5 py-2 text-xs font-bold text-foreground shadow-xs hover:bg-muted active:scale-98 transition whitespace-nowrap"
                title="Switch active organization and view this order from the buyer organization perspective"
              >
                <span>👁️</span> View in Buyer Perspective
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1">
              Select Active Requirement from Fleet:
            </label>
            <select
              value={selectedReqId}
              onChange={(e) => {
                const reqId = e.target.value;
                setSelectedReqId(reqId);
                const match = transactions.find((t) => t.requirement_id === reqId);
                if (match) {
                  setSelectedEntity({
                    name: match.requirement_title,
                    uuid: match.requirement_id,
                    type: 'REQUIREMENT',
                    organizationId: match.organization_id,
                    organizationName: match.organization_name,
                    details: `${match.organization_name} · ${match.po_status || match.rfq_status || match.requirement_status}`,
                  });
                  setManualReqId(match.requirement_id);
                }
                if (reqId) {
                  void handleRunDiagnostics(reqId);
                  void loadTargetDetails(reqId);
                }
              }}
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            >
              <option value="">-- Choose requirement from list --</option>
              {transactions.map((tx) => (
                <option key={tx.requirement_id} value={tx.requirement_id}>
                  {tx.requirement_title} — {tx.organization_name} — [UUID: {tx.requirement_id.slice(0, 8)}...]
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="block text-xs font-semibold text-foreground mb-1">
              Search by Name or UUID (Buyer Org, Requirement, PO#):
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => void handleEntitySearch(e.target.value)}
                placeholder="e.g. 'Greenview', 'Borewell', or UUID..."
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
                      <span className="font-mono text-blue-600 dark:text-blue-400">{item.id}</span>
                      {item.subtitle && <span>· {item.subtitle}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {isSearching && (
              <p className="text-[11px] text-muted-foreground mt-1">Searching directory by name/UUID…</p>
            )}
          </div>
        </div>
      </div>

      {/* Step 2: Advanced Operational Tools & Overrides (When Target Selected) */}
      {selectedEntity && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Order Force-Advance / Revert Tool */}
          <div className="rounded-xl border bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>🔄</span> Order Force-Advance / Revert Tool
              </h4>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                SuperAdmin Override
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Manually transition this order between adjacent or recovery states across the 8 canonical stages. Requires a mandatory audit reason.
            </p>

            <form onSubmit={handleForceTransition} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Select Target Lifecycle State:
                </label>
                <select
                  value={targetState}
                  onChange={(e) => setTargetState(e.target.value)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {CANONICAL_STATES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Mandatory Operational Audit Reason:
                </label>
                <input
                  type="text"
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  placeholder="e.g. Unblocking evaluation stage due to committee quorum timeout..."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  minLength={5}
                />
              </div>

              <button
                type="submit"
                disabled={isTransitioning || transitionReason.trim().length < 5}
                className="w-full inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-foreground text-background py-2 text-xs font-bold shadow hover:bg-foreground/90 transition active:scale-98 disabled:opacity-50"
              >
                <span>⚡</span> {isTransitioning ? 'Applying State Transition…' : `Force Move to [${targetState}]`}
              </button>
            </form>
          </div>

          {/* Governance & Compliance Overrides */}
          <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b pb-2.5">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>🛡️</span> Governance &amp; GST Compliance Overrides
              </h4>
              <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                Active Policy Gate
              </span>
            </div>

            {/* Approval Gate Bypass */}
            <div className="rounded-xl border p-3.5 bg-muted/20 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-foreground">Committee Quorum Override</span>
                <button
                  type="button"
                  disabled={actionInProgress === 'GATE_BYPASS'}
                  onClick={handleBypassApprovalGate}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 active:scale-98 transition disabled:opacity-50"
                >
                  {actionInProgress === 'GATE_BYPASS' ? 'Bypassing…' : '⚡ Bypass Quorum Gate'}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Diagnostic override to clear committee evaluation voting deadlocks when approvers are unresponsive.
              </p>
            </div>

            {/* Buyer GST Compliance Inspection & Toggle */}
            <div className="rounded-xl border p-3.5 bg-muted/20 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-xs font-bold text-foreground block">Buyer Tax Compliance Status</span>
                  <span className="text-[11px] text-muted-foreground">
                    GSTIN: <span className="font-mono">{selectedEntity.buyerGstin || 'Not Registered'}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      selectedEntity.gstVerified
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}
                  >
                    {selectedEntity.gstVerified ? '✓ GST Verified' : 'Pending Verification'}
                  </span>
                  {selectedEntity.taxExempt && (
                    <span className="rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 px-2 py-0.5 text-[10px] font-bold">
                      Tax Exempt
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={actionInProgress === 'GST_TOGGLE'}
                  onClick={() => handleToggleBuyerGst(!selectedEntity.gstVerified, Boolean(selectedEntity.taxExempt))}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-card px-3.5 py-2 text-xs font-bold hover:bg-muted text-foreground transition shadow-2xs active:scale-98"
                >
                  {selectedEntity.gstVerified ? 'Mark Unverified' : '✓ Force Mark GST Verified'}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress === 'GST_TOGGLE'}
                  onClick={() => handleToggleBuyerGst(Boolean(selectedEntity.gstVerified), !selectedEntity.taxExempt)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-card px-3.5 py-2 text-xs font-bold hover:bg-muted text-foreground transition shadow-2xs active:scale-98"
                >
                  {selectedEntity.taxExempt ? 'Remove Tax Exemption' : 'Toggle Tax Exempt'}
                </button>
              </div>
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
              <p className="font-bold text-sm">All Buyer Lifecycle Invariants &amp; Quorum Rules Passed</p>
              <p className="text-muted-foreground mt-1">This transaction is progressing normally through its macro-phase workflow.</p>
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
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-foreground text-background px-4 py-2 text-xs font-bold shadow hover:bg-foreground/90 transition active:scale-98 disabled:opacity-50"
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
      {selectedEntity && (
        <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b pb-2.5">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <span>📜</span> Operational Activity &amp; Audit Trail Timeline
            </h4>
            <span className="text-xs text-muted-foreground font-mono">
              {auditEvents.length} recorded events
            </span>
          </div>

          {isLoadingAudit ? (
            <p className="text-xs text-muted-foreground py-3">Loading recent audit events…</p>
          ) : auditEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">
              No manual overrides or troubleshooting actions recorded for this entity yet.
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
                      <span className="rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[10px] font-mono">
                        {evt.event_type}
                      </span>
                      {evt.payload?.from_state && evt.payload?.to_state && (
                        <span>
                          {evt.payload.from_state} → {evt.payload.to_state}
                        </span>
                      )}
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
