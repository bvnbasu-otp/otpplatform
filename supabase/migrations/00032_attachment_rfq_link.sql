-- Requirement files attached before publish were invisible to suppliers.
--
-- attachments.rfq_id is denormalized so storage policies and the shared view
-- avoid a join, and private.attachments_prepare fills it at insert time. But
-- the normal path is that a buyer attaches the drawing while the requirement
-- is still a DRAFT, which is before any RFQ exists — so rfq_id stayed NULL and
-- requirement_attachments_shared, which gates on has_rfq_invitation(rfq_id),
-- matched nothing. The drawing the whole job depends on never reached the
-- suppliers being asked to price it.
--
-- The column is now stamped when the RFQ appears, and the shared view falls
-- back to the requirement so a file is never withheld on a timing accident.

CREATE OR REPLACE FUNCTION private.attachments_link_rfq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE attachments
  SET rfq_id = NEW.id
  WHERE scope = 'REQUIREMENT'
    AND requirement_id = NEW.requirement_id
    AND rfq_id IS DISTINCT FROM NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rfqs_link_attachments ON rfqs;

CREATE TRIGGER rfqs_link_attachments
  AFTER INSERT ON rfqs
  FOR EACH ROW EXECUTE FUNCTION private.attachments_link_rfq();

-- Existing rows that were attached before their RFQ existed.
UPDATE attachments a
SET rfq_id = r.id
FROM rfqs r
WHERE a.scope = 'REQUIREMENT'
  AND a.rfq_id IS NULL
  AND r.requirement_id = a.requirement_id;

-- Belt and braces: resolve the RFQ through the requirement as well, so a file
-- uploaded in the window between the RFQ insert and the buyer's next action is
-- still readable by the invited suppliers.
CREATE OR REPLACE VIEW requirement_attachments_shared
WITH (security_barrier = true) AS
SELECT
  a.id AS attachment_id,
  a.requirement_id,
  COALESCE(a.rfq_id, r.id) AS rfq_id,
  a.scope,
  a.kind,
  a.display_name,
  a.content_type,
  a.size_bytes,
  a.duration_seconds,
  a.storage_path,
  a.created_at
FROM attachments a
LEFT JOIN rfqs r ON r.requirement_id = a.requirement_id
WHERE a.scope = 'REQUIREMENT'
  AND (
    private.has_rfq_invitation(COALESCE(a.rfq_id, r.id))
    OR private.can_access_rfq_as_buyer(COALESCE(a.rfq_id, r.id))
    OR private.can_access_rfq_as_committee(COALESCE(a.rfq_id, r.id))
  );

GRANT SELECT ON requirement_attachments_shared TO authenticated;

-- The storage policy could see the metadata but not the file.
--
-- otp_attachments_select tests EXISTS (SELECT 1 FROM public.attachments ...),
-- and that subquery runs under the caller's own row-level security. An invited
-- supplier is neither the uploader nor a member of the buyer's organization, so
-- attachments_select_own_side hides the row from them, the EXISTS finds
-- nothing, and no signed URL is ever minted — even though
-- requirement_attachments_shared had just told them the drawing exists.
-- Resolving the path through a SECURITY DEFINER lookup asks the question that
-- was meant all along: may this caller read this file?
CREATE OR REPLACE FUNCTION private.can_read_attachment_path(p_path text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM attachments WHERE storage_path = p_path;
  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN private.can_read_attachment(v_id);
END;
$$;

DROP POLICY IF EXISTS otp_attachments_select ON storage.objects;

CREATE POLICY otp_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'otp-attachments'
    AND private.can_read_attachment_path(storage.objects.name)
  );

CREATE OR REPLACE FUNCTION private.can_read_attachment(p_attachment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a      attachments%ROWTYPE;
  v_org  uuid;
  v_rfq  uuid;
BEGIN
  SELECT * INTO a FROM attachments WHERE id = p_attachment_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF private.is_platform_admin() THEN
    RETURN true;
  END IF;

  IF a.scope = 'REQUIREMENT' THEN
    SELECT organization_id INTO v_org FROM requirements WHERE id = a.requirement_id;
    IF private.is_org_member(v_org) THEN
      RETURN true;
    END IF;

    v_rfq := a.rfq_id;
    IF v_rfq IS NULL THEN
      SELECT id INTO v_rfq FROM rfqs WHERE requirement_id = a.requirement_id;
    END IF;

    RETURN v_rfq IS NOT NULL AND private.has_rfq_invitation(v_rfq);
  END IF;

  RETURN EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = a.quote_id AND private.is_supplier_user_for(q.supplier_id)
    )
    OR private.can_access_rfq_as_buyer(a.rfq_id)
    OR private.can_access_rfq_as_committee(a.rfq_id);
END;
$$;
