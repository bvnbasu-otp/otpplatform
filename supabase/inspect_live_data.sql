SELECT 
  json_build_object(
    '1_requirements', (
      SELECT json_agg(json_build_object(
        'id', r.id,
        'title', r.title,
        'status', r.status,
        'org_id', r.organization_id,
        'created_at', r.created_at
      )) FROM requirements r
    ),
    '2_rfqs', (
      SELECT json_agg(json_build_object(
        'id', rfq.id,
        'status', rfq.status,
        'reveal_status', rfq.reveal_status,
        'min_quotes_required', rfq.min_quotes_required
      )) FROM rfqs rfq
    ),
    '3_rfq_invitations', (
      SELECT json_agg(json_build_object(
        'id', ri.id,
        'supplier_id', ri.supplier_id,
        'supplier_name', s.business_name,
        'status', ri.status,
        'anonymous_label', ri.anonymous_label
      )) FROM rfq_invitations ri
      LEFT JOIN suppliers s ON s.id = ri.supplier_id
    ),
    '4_quotes', (
      SELECT json_agg(json_build_object(
        'quote_id', q.id,
        'supplier_name', s.business_name,
        'status', q.status,
        'score', q.evaluation_score,
        'submitted_at', q.submitted_at,
        'commercials', qv.snapshot
      )) FROM quotes q
      LEFT JOIN suppliers s ON s.id = q.supplier_id
      LEFT JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
    ),
    '5_awards', (
      SELECT json_agg(json_build_object(
        'award_id', a.id,
        'status', a.status,
        'awarded_by', a.awarded_by,
        'justification', a.justification,
        'awarded_at', a.awarded_at,
        'revealed_at', a.revealed_at
      )) FROM awards a
    ),
    '6_purchase_orders', (
      SELECT json_agg(json_build_object(
        'po_id', po.id,
        'po_number', po.po_number,
        'status', po.status,
        'total_amount', po.total_amount,
        'currency', po.currency,
        'supplier_name', s.business_name,
        'created_at', po.created_at
      )) FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
    ),
    '7_work_orders', (
      SELECT json_agg(json_build_object(
        'wo_id', wo.id,
        'title', wo.title,
        'status', wo.status,
        'progress_percent', wo.progress_percent,
        'created_at', wo.created_at
      )) FROM work_orders wo
    ),
    '8_audit_events_count', (
      SELECT count(*) FROM audit_events
    ),
    '8_audit_events_recent', (
      SELECT json_agg(json_build_object(
        'event_type', ae.event_type,
        'entity_type', ae.entity_type,
        'occurred_at', ae.occurred_at,
        'payload', ae.payload
      )) FROM (
        SELECT * FROM audit_events ORDER BY occurred_at DESC LIMIT 10
      ) ae
    )
  ) AS live_database_state;
