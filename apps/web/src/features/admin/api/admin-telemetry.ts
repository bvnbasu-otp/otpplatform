import { supabase } from '@/lib/supabase';

export interface AdminTelemetryEventInput {
  eventType: string;
  entityType: 'REQUIREMENT' | 'RFQ' | 'QUOTE' | 'PURCHASE_ORDER' | 'INVOICE' | 'SUPPLIER' | 'BUYER' | 'SYSTEM';
  entityId: string;
  action: string;
  reason?: string;
  fromState?: string;
  toState?: string;
  metadata?: Record<string, unknown>;
}

export interface StalledOrderAlert {
  id: string;
  requirementId: string;
  title: string;
  currentState: string;
  idleHours: number;
  reason: string;
  buyerOrg: string;
  severity: 'WARN' | 'ERROR';
}

/**
 * Emits a structured telemetry audit event into public.audit_events
 */
export async function emitAdminTelemetryEvent(input: AdminTelemetryEventInput): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const { data: userResp } = await supabase.auth.getUser();
    const actorId = userResp?.user?.id || null;

    const { error } = await supabase.from('audit_events').insert({
      event_type: input.eventType,
      entity_type: input.entityType,
      entity_id: input.entityId,
      actor_id: actorId,
      payload: {
        action: input.action,
        from_state: input.fromState,
        to_state: input.toState,
        reason: input.reason || 'Admin Diagnostic Override',
        metadata: input.metadata || {},
        timestamp: new Date().toISOString(),
      },
    });

    if (error) {
      console.warn('Telemetry event failed to persist to audit_events:', error.message);
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err: any) {
    console.error('emitAdminTelemetryEvent error:', err);
    return { ok: false, error: err?.message || 'Unknown error emitting telemetry' };
  }
}

/**
 * Queries for orders stalled > 24 hours or with GST verification blocks
 */
export async function fetchStalledOrderAlerts(): Promise<{
  ok: boolean;
  alerts: StalledOrderAlert[];
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('admin_run_sql', {
      p_sql: `
        SELECT 
          r.id AS req_id,
          r.title,
          r.status AS req_status,
          rfq.status AS rfq_status,
          po.status AS po_status,
          ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(wo.updated_at, po.updated_at, rfq.updated_at, r.updated_at))) / 3600, 1) AS idle_hours,
          COALESCE(o.name, 'Unknown Buyer') AS buyer_org,
          CASE 
            WHEN r.status = 'CANCELLED' OR rfq.status = 'CANCELLED' THEN 'Order marked as STALLED / Cancelled'
            WHEN po.status = 'ISSUED' AND po.acknowledged_at IS NULL AND NOW() - po.created_at > INTERVAL '24 HOURS' THEN 'PO Issued >24h without Supplier Acceptance'
            WHEN rfq.status = 'EVALUATING' AND (SELECT count(*) FROM committee_votes cv WHERE cv.rfq_id = rfq.id) = 0 THEN 'Evaluation Quorum Inactive'
            WHEN po.status = 'ISSUED' AND NOT COALESCE(s.gst_verified, false) THEN 'GST Verification Pending on PO_ISSUED -> INVOICED'
            ELSE 'Idle in current stage >24h'
          END AS alert_reason
        FROM requirements r
        LEFT JOIN organizations o ON o.id = r.organization_id
        LEFT JOIN rfqs rfq ON rfq.requirement_id = r.id
        LEFT JOIN purchase_orders po ON po.rfq_id = rfq.id
        LEFT JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN work_orders wo ON wo.purchase_order_id = po.id
        WHERE 
          (r.status NOT IN ('COMPLETED', 'DRAFT') AND COALESCE(wo.updated_at, po.updated_at, rfq.updated_at, r.updated_at) < NOW() - INTERVAL '24 HOURS')
          OR r.status = 'CANCELLED'
          OR (po.status = 'ISSUED' AND NOT COALESCE(s.gst_verified, false))
        ORDER BY idle_hours DESC
        LIMIT 15;
      `,
    });

    if (error || !data) {
      return { ok: false, alerts: [], error: error?.message };
    }

    const rows = Array.isArray(data) ? data : [];
    const alerts: StalledOrderAlert[] = rows.map((row: any) => ({
      id: row.req_id,
      requirementId: row.req_id,
      title: row.title || 'Untitled Requirement',
      currentState: row.po_status || row.rfq_status || row.req_status || 'UNKNOWN',
      idleHours: Number(row.idle_hours) || 0,
      reason: row.alert_reason || 'Pending action',
      buyerOrg: row.buyer_org || 'Buyer Org',
      severity: Number(row.idle_hours) > 48 || row.alert_reason?.includes('STALLED') ? 'ERROR' : 'WARN',
    }));

    return { ok: true, alerts };
  } catch (err: any) {
    return { ok: false, alerts: [], error: err?.message || 'Failed to check stalled orders' };
  }
}
