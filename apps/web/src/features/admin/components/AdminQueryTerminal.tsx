import React, { useState } from 'react';
import { runDiagnosticQuery } from '../api/admin-ops';
import type { DiagnosticQueryResult } from '../types/admin';

const QUERY_TEMPLATES = [
  {
    name: '1. Stalled Order Diagnostics (STALLED / Idle >24h)',
    sql: `SELECT 
  r.id AS req_id,
  r.title,
  r.status AS req_status,
  rfq.status AS rfq_status,
  po.status AS po_status,
  ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(wo.updated_at, po.updated_at, rfq.updated_at, r.updated_at))) / 3600, 1) AS idle_hours,
  o.name AS buyer_org,
  s.business_name AS supplier_name,
  CASE 
    WHEN r.status = 'CANCELLED' OR rfq.status = 'CANCELLED' THEN 'STALLED (Cancelled)'
    WHEN po.status = 'ISSUED' AND po.acknowledged_at IS NULL AND NOW() - po.created_at > INTERVAL '24 HOURS' THEN 'STALLED (PO Unacknowledged > 24h)'
    WHEN rfq.status = 'EVALUATING' AND (SELECT count(*) FROM committee_votes cv WHERE cv.rfq_id = rfq.id) = 0 THEN 'STALLED (Evaluation Quorum Missing)'
    WHEN rfq.status IN ('OPEN', 'CLARIFICATION') AND rfq.updated_at < NOW() - INTERVAL '24 HOURS' THEN 'STALLED (Quoting Idle > 24h)'
    ELSE 'PENDING_ACTION'
  END AS diagnostic_flag
FROM requirements r
LEFT JOIN organizations o ON o.id = r.organization_id
LEFT JOIN rfqs rfq ON rfq.requirement_id = r.id
LEFT JOIN purchase_orders po ON po.rfq_id = rfq.id
LEFT JOIN suppliers s ON s.id = po.supplier_id
LEFT JOIN work_orders wo ON wo.purchase_order_id = po.id
WHERE 
  r.status NOT IN ('COMPLETED', 'DRAFT')
  OR r.status = 'CANCELLED'
ORDER BY idle_hours DESC
LIMIT 20;`,
  },
  {
    name: '2. Quote Submission Integrity (QUOTING / EVALUATING)',
    sql: `SELECT 
  rfq.id AS rfq_id,
  r.title AS requirement_title,
  rfq.status AS rfq_status,
  COUNT(q.id) AS total_quotes_created,
  COUNT(CASE WHEN q.status = 'SUBMITTED' THEN 1 END) AS submitted_quotes_count,
  COUNT(CASE WHEN q.status = 'DRAFT' THEN 1 END) AS unsubmitted_draft_quotes,
  COUNT(qv.id) AS quote_versions_count,
  COUNT(CASE WHEN (qv.snapshot->>'pricing_total')::numeric > 0 THEN 1 END) AS valid_priced_payloads,
  COUNT(CASE WHEN qv.snapshot IS NULL OR (qv.snapshot->>'pricing_total') IS NULL THEN 1 END) AS sealed_or_unpriced_locks,
  CASE 
    WHEN rfq.status = 'EVALUATING' AND COUNT(CASE WHEN q.status = 'SUBMITTED' THEN 1 END) = 0 
      THEN 'CRITICAL: In Evaluation but 0 Submitted Quotes'
    WHEN COUNT(CASE WHEN q.status = 'DRAFT' THEN 1 END) > 0 
      THEN 'WARN: Unsubmitted Supplier Drafts Detected'
    ELSE 'HEALTHY'
  END AS integrity_status
FROM rfqs rfq
JOIN requirements r ON r.id = rfq.requirement_id
LEFT JOIN quotes q ON q.rfq_id = rfq.id
LEFT JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE rfq.status IN ('OPEN', 'CLARIFICATION', 'EVALUATING')
GROUP BY rfq.id, r.title, rfq.status
ORDER BY rfq.created_at DESC
LIMIT 20;`,
  },
  {
    name: '3. Awarding & Lock Verification (AWARDED / PO_ISSUED)',
    sql: `SELECT 
  aw.id AS award_id,
  aw.rfq_id,
  r.title AS requirement_title,
  aw.quote_id AS winning_quote_id,
  s.business_name AS awarded_supplier,
  aw.awarded_at,
  po.id AS po_id,
  po.po_number,
  po.status AS po_status,
  po.created_at AS po_created_at,
  po.acknowledged_at,
  ROUND(EXTRACT(EPOCH FROM (COALESCE(po.acknowledged_at, NOW()) - po.created_at)) / 3600, 1) AS ack_delay_hours,
  CASE 
    WHEN po.id IS NULL THEN 'ERROR: Awarded without Purchase Order'
    WHEN po.status = 'ISSUED' AND po.acknowledged_at IS NULL THEN 'ACTION_REQUIRED: Pending Supplier Acceptance'
    WHEN po.status = 'ACCEPTED' THEN 'HEALTHY: Accepted'
    ELSE po.status::text
  END AS lock_status
FROM awards aw
JOIN rfqs rfq ON rfq.id = aw.rfq_id
JOIN requirements r ON r.id = rfq.requirement_id
JOIN quotes q ON q.id = aw.quote_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN purchase_orders po ON po.award_id = aw.id
ORDER BY aw.awarded_at DESC
LIMIT 20;`,
  },
  {
    name: '4. Financial & GST Reconciliation (INVOICED / SETTLED)',
    sql: `SELECT 
  po.po_number,
  po.total_amount AS po_total,
  inv.invoice_number,
  inv.amount AS invoice_amount,
  inv.status AS invoice_status,
  pay.amount AS payment_amount,
  pay.status AS payment_status,
  wo.status AS wo_status,
  (wo.status = 'COMPLETED') AS is_settled,
  (COALESCE(inv.amount, 0) - po.total_amount) AS amount_variance,
  CASE 
    WHEN inv.id IS NULL THEN 'PO_AWAITING_INVOICE'
    WHEN inv.amount <> po.total_amount THEN 'VARIANCE_MISMATCH: Invoice <> PO'
    WHEN pay.status = 'VERIFIED' AND wo.status <> 'COMPLETED' THEN 'ANOMALY: Paid but Not Settled'
    WHEN pay.status = 'VERIFIED' AND wo.status = 'COMPLETED' THEN 'HEALTHY: Reconciled & Settled'
    ELSE 'IN_PROGRESS'
  END AS financial_health
FROM purchase_orders po
JOIN work_orders wo ON wo.purchase_order_id = po.id
LEFT JOIN invoices inv ON inv.work_order_id = wo.id
LEFT JOIN payments pay ON pay.invoice_id = inv.id
WHERE po.status IN ('ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED')
ORDER BY po.created_at DESC
LIMIT 20;`,
  },
  {
    name: '5. GST Verification Diagnostics (Buyer & Supplier)',
    sql: `SELECT 
  po.po_number,
  r.title AS order_title,
  o.name AS buyer_name,
  COALESCE(o.tax_registration, 'MISSING_BUYER_GSTIN') AS buyer_gstin,
  COALESCE(o.gst_verified, false) AS buyer_gst_verified,
  COALESCE(o.tax_exempt, false) AS buyer_tax_exempt,
  s.business_name AS supplier_name,
  COALESCE(s.gstin, 'MISSING_SUPPLIER_GSTIN') AS supplier_gstin,
  COALESCE(s.gst_status, 'UNVERIFIED') AS supplier_gst_status,
  COALESCE(s.gst_verified, false) AS supplier_gst_verified,
  inv.invoice_number,
  inv.status AS invoice_status,
  CASE 
    WHEN s.gstin IS NULL OR LENGTH(s.gstin) < 15 THEN 'BLOCKER: Supplier Missing 15-digit GSTIN'
    WHEN NOT COALESCE(s.gst_verified, false) THEN 'BLOCKER: Supplier GST Unverified'
    WHEN o.tax_registration IS NULL AND NOT COALESCE(o.tax_exempt, false) THEN 'WARN: Buyer Tax Registration Missing'
    ELSE 'GST_COMPLIANT'
  END AS gst_compliance_gate
FROM purchase_orders po
JOIN organizations o ON o.id = po.organization_id
JOIN suppliers s ON s.id = po.supplier_id
JOIN rfqs rfq ON rfq.id = po.rfq_id
JOIN requirements r ON r.id = rfq.requirement_id
LEFT JOIN work_orders wo ON wo.purchase_order_id = po.id
LEFT JOIN invoices inv ON inv.work_order_id = wo.id
ORDER BY po.created_at DESC
LIMIT 20;`,
  },
  {
    name: '6. State Transition Audit Trail',
    sql: `SELECT 
  ae.id AS audit_event_id,
  ae.occurred_at,
  ae.event_type,
  ae.entity_type,
  ae.entity_id,
  ae.actor_id,
  p.full_name AS actor_name,
  ae.payload->>'reason' AS reason,
  ae.payload->>'from_state' AS from_state,
  ae.payload->>'to_state' AS to_state,
  ae.payload->>'error' AS error_message,
  ae.payload
FROM audit_events ae
LEFT JOIN profiles p ON p.id = ae.actor_id
WHERE 
  ae.event_type LIKE '%transition%' 
  OR ae.event_type LIKE '%state%' 
  OR ae.event_type LIKE '%troubleshoot%'
  OR ae.event_type LIKE '%override%'
  OR ae.event_type LIKE '%advance%'
  OR ae.event_type LIKE '%revert%'
  OR ae.event_type LIKE '%admin%'
ORDER BY ae.occurred_at DESC
LIMIT 30;`,
  },
];

export function AdminQueryTerminal() {
  const [sql, setSql] = useState(QUERY_TEMPLATES[0]?.sql ?? '');
  const [result, setResult] = useState<DiagnosticQueryResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [viewMode, setViewMode] = useState<'TABLE' | 'JSON'>('TABLE');

  const handleExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!sql.trim()) return;

    setIsRunning(true);
    try {
      const res = await runDiagnosticQuery(sql.trim());
      if (res.result) {
        setResult(res.result);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const columns = result?.data && result.data.length > 0 ? Object.keys(result.data[0]) : [];

  return (
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Top Banner */}
      <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl shrink-0">💻</span>
            <h3 className="text-sm sm:text-base font-bold text-foreground">Interactive Diagnostic SQL Query Terminal</h3>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Safely execute read-only PostgreSQL queries across all schemas to inspect raw database states and troubleshoot reported issues.
          </p>
        </div>
      </div>

      {/* Query Template Chips */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
          Quick Diagnostic Query Templates:
        </span>
        <div className="flex flex-wrap gap-2">
          {QUERY_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.name}
              type="button"
              onClick={() => {
                setSql(tmpl.sql);
              }}
              className="rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
            >
              📄 {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Query Editor & Run Form */}
      <form onSubmit={handleExecute} className="rounded-xl border bg-card p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span>SQL Query (SELECT only):</span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSql('')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>

        <textarea
          rows={6}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="SELECT * FROM rfqs LIMIT 10;"
          className="w-full rounded-lg border bg-muted/20 p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary leading-relaxed"
        />

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">
            🛡️ Safety Guard: Only SELECT / WITH inspection queries are accepted.
          </span>
          <button
            type="submit"
            disabled={isRunning}
            className="rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition disabled:opacity-50"
          >
            {isRunning ? 'Executing SQL…' : '▶ Run Diagnostic Query'}
          </button>
        </div>
      </form>

      {/* Query Results View */}
      {result && (
        <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4 animate-in fade-in duration-200">
          {/* Query Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-0.5 text-[11px] font-black uppercase tracking-wider ${
                  result.success
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-red-100 text-red-900 border border-red-300'
                }`}
              >
                {result.success ? '✓ QUERY PASSED' : '✕ QUERY FAILED'}
              </span>

              {result.success ? (
                <span className="text-xs font-semibold text-foreground">
                  {result.rowsCount} row(s) returned · {result.executionTimeMs ?? 0}ms
                </span>
              ) : (
                <span className="text-xs font-semibold text-red-700">
                  Execution Error · {result.executionTimeMs ?? 0}ms
                </span>
              )}
            </div>

            {result.success && result.rowsCount > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('TABLE')}
                  className={`rounded px-2.5 py-1 font-semibold transition ${
                    viewMode === 'TABLE' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                  }`}
                >
                  Table View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('JSON')}
                  className={`rounded px-2.5 py-1 font-semibold transition ${
                    viewMode === 'JSON' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
                  }`}
                >
                  Raw JSON
                </button>
              </div>
            )}
          </div>

          {/* Failure Error Card */}
          {!result.success ? (
            <div className="rounded-lg border border-red-300 bg-red-50/50 p-4 text-xs text-red-950 space-y-2">
              <div className="font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>Database Error: {result.error}</span>
              </div>
              {result.errorDetail && (
                <p className="font-mono text-[11px] text-red-900 bg-red-100/60 p-2 rounded">
                  Detail: {result.errorDetail}
                </p>
              )}
              {result.errorHint && (
                <p className="text-[11px] text-red-800">
                  Hint: {result.errorHint}
                </p>
              )}
            </div>
          ) : result.rowsCount === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground font-medium">
              Query executed successfully and returned 0 rows.
            </p>
          ) : viewMode === 'TABLE' ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="p-2.5 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y text-foreground font-mono text-[11px]">
                  {result.data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/10">
                      {columns.map((col) => (
                        <td key={col} className="p-2.5 whitespace-nowrap max-w-xs truncate">
                          {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre className="rounded-lg bg-muted/40 p-4 text-[11px] font-mono text-foreground overflow-x-auto max-h-96 border">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
