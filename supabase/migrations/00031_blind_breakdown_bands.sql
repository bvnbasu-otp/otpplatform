-- Band the supplier figures inside the blind score breakdown.
--
-- quotes_blind rounds rating to the half star and on-time to the nearest five
-- precisely so an exact value cannot be used to recognise a bidder. The score
-- breakdown then handed the same buyer the unrounded numbers in its `raw`
-- field, turning four suppliers who all read "4.5 stars" in the table into
-- 4.3, 4.45, 4.6 and 4.7 in the payload behind it. That is a fingerprint, and
-- it makes two parts of the same screen disagree.
--
-- Figures that come off the quote itself (price, delivery, warranty, payment
-- terms) stay exact: the buyer is already looking at them in the comparison
-- table, and comparing offers is the entire point. Only figures that come off
-- the supplier record are banded, and the ones with no meaningful band are
-- dropped rather than approximated.

CREATE OR REPLACE FUNCTION private.band_evaluation_breakdown(p_breakdown jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(
      entry.code,
      CASE
        WHEN entry.code = '_weights' THEN entry.detail
        WHEN src.value_source = 'supplier_rating' THEN
          jsonb_set(
            entry.detail, '{raw}',
            CASE
              WHEN entry.detail ->> 'raw' IS NULL THEN 'null'::jsonb
              ELSE to_jsonb(round(round((entry.detail ->> 'raw')::numeric * 2) / 2, 1))
            END
          )
        WHEN src.value_source = 'on_time_percent' THEN
          jsonb_set(
            entry.detail, '{raw}',
            CASE
              WHEN entry.detail ->> 'raw' IS NULL THEN 'null'::jsonb
              ELSE to_jsonb(round(round((entry.detail ->> 'raw')::numeric / 5) * 5, 0))
            END
          )
        WHEN src.value_source IN ('completed_jobs', 'dispute_rate') THEN
          jsonb_set(entry.detail, '{raw}', 'null'::jsonb)
        ELSE entry.detail
      END
    ),
    '{}'::jsonb
  )
  FROM jsonb_each(COALESCE(p_breakdown, '{}'::jsonb)) AS entry(code, detail)
  LEFT JOIN evaluation_criteria src ON src.code = entry.code;
$$;

COMMENT ON FUNCTION private.band_evaluation_breakdown(jsonb) IS
  'Rounds supplier-sourced raw values in a score breakdown to the same bands quotes_blind uses, so the breakdown cannot be used to fingerprint a bidder the comparison table protects.';

CREATE OR REPLACE VIEW quote_evaluations_blind
WITH (security_barrier = true) AS
SELECT
  e.id AS evaluation_id,
  e.quote_id,
  e.rfq_id,
  ri.anonymous_label,
  e.version_evaluated,
  e.evaluation_score,
  private.band_evaluation_breakdown(e.breakdown) AS breakdown,
  e.status,
  e.computed_at
FROM quote_evaluations e
JOIN quotes q ON q.id = e.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = e.rfq_id
WHERE r.reveal_status = 'BLIND'
  AND (
    private.can_access_rfq_as_buyer(e.rfq_id)
    OR private.can_access_rfq_as_committee(e.rfq_id)
  );

GRANT SELECT ON quote_evaluations_blind TO authenticated;
