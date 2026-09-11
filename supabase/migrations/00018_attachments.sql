-- Attachments: drawings, handwritten notes, photos, spec documents and voice
-- notes on requirements and on quotes.
--
-- Identity protection is the hard part here, and it cuts both ways:
--   * A quote file named "CoimbatorePrecisionWorks-quote.pdf" would identify
--     the bidder to the committee before award.
--   * A requirement file named "GreenviewApartments-drawing.pdf" would identify
--     the buyer to the suppliers.
-- So original_filename and uploaded_by are NEVER exposed across the party
-- boundary before award reveal. Each file also carries a neutral display_name
-- ("Drawing 1", "Voice note 2") that is always safe to show, and storage paths
-- are built from ids only so a signed URL leaks nothing either.

CREATE TYPE attachment_scope AS ENUM ('REQUIREMENT', 'QUOTE');

CREATE TYPE attachment_kind AS ENUM (
  'DRAWING',
  'PHOTO',
  'HANDWRITTEN',
  'DOCUMENT',
  'VOICE_NOTE'
);

-- ---------------------------------------------------------------------------
-- Private storage bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'otp-attachments',
  'otp-attachments',
  false,
  26214400,  -- 25 MiB
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'application/pdf',
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/vnd.dwg', 'application/acad', 'image/vnd.dxf'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = false;

-- ---------------------------------------------------------------------------
-- Attachment metadata
-- ---------------------------------------------------------------------------

CREATE TABLE attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope             attachment_scope NOT NULL,
  requirement_id    uuid REFERENCES requirements (id) ON DELETE CASCADE,
  quote_id          uuid REFERENCES quotes (id) ON DELETE CASCADE,
  -- Denormalized so storage policies and blind views avoid extra joins.
  rfq_id            uuid REFERENCES rfqs (id) ON DELETE CASCADE,
  storage_path      text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  -- Neutral, party-safe label assigned by trigger.
  display_name      text NOT NULL DEFAULT '',
  content_type      text NOT NULL,
  size_bytes        bigint NOT NULL DEFAULT 0,
  kind              attachment_kind NOT NULL,
  duration_seconds  numeric(8, 2),
  uploaded_at       timestamptz,
  uploaded_by       uuid NOT NULL REFERENCES profiles (id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_scope_target CHECK (
    (scope = 'REQUIREMENT' AND requirement_id IS NOT NULL AND quote_id IS NULL)
    OR (scope = 'QUOTE' AND quote_id IS NOT NULL AND requirement_id IS NULL)
  ),
  CONSTRAINT attachments_size_non_negative CHECK (size_bytes >= 0),
  CONSTRAINT attachments_voice_note_duration CHECK (
    kind <> 'VOICE_NOTE' OR duration_seconds IS NULL OR duration_seconds > 0
  )
);

CREATE INDEX idx_attachments_requirement ON attachments (requirement_id);
CREATE INDEX idx_attachments_quote ON attachments (quote_id);
CREATE INDEX idx_attachments_rfq ON attachments (rfq_id);

COMMENT ON COLUMN attachments.original_filename IS
  'Buyer/supplier private. Never exposed across the party boundary before award reveal — filenames routinely carry company names.';
COMMENT ON COLUMN attachments.display_name IS
  'Neutral label safe to show to any authorized party at any stage.';

-- ---------------------------------------------------------------------------
-- Path and display name are assigned server-side, never chosen by the client
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.attachments_prepare()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq_id uuid;
  v_seq    int;
  v_label  text;
BEGIN
  IF NEW.scope = 'REQUIREMENT' THEN
    SELECT id INTO v_rfq_id FROM rfqs WHERE requirement_id = NEW.requirement_id;
    NEW.rfq_id := v_rfq_id;
    NEW.storage_path := 'requirements/' || NEW.requirement_id || '/' || NEW.id;

    SELECT count(*) + 1 INTO v_seq
    FROM attachments
    WHERE requirement_id = NEW.requirement_id AND kind = NEW.kind AND id <> NEW.id;
  ELSE
    SELECT rfq_id INTO v_rfq_id FROM quotes WHERE id = NEW.quote_id;
    NEW.rfq_id := v_rfq_id;
    NEW.storage_path := 'quotes/' || v_rfq_id || '/' || NEW.quote_id || '/' || NEW.id;

    SELECT count(*) + 1 INTO v_seq
    FROM attachments
    WHERE quote_id = NEW.quote_id AND kind = NEW.kind AND id <> NEW.id;
  END IF;

  v_label := CASE NEW.kind
    WHEN 'DRAWING'     THEN 'Drawing'
    WHEN 'PHOTO'       THEN 'Photo'
    WHEN 'HANDWRITTEN' THEN 'Handwritten note'
    WHEN 'VOICE_NOTE'  THEN 'Voice note'
    ELSE 'Document'
  END;

  NEW.display_name := v_label || ' ' || v_seq;

  RETURN NEW;
END;
$$;

CREATE TRIGGER attachments_prepare
  BEFORE INSERT ON attachments
  FOR EACH ROW EXECUTE FUNCTION private.attachments_prepare();

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------

-- Requirement files must reach invited suppliers: a machining job cannot be
-- quoted without the drawing.
CREATE OR REPLACE FUNCTION private.can_read_attachment(p_attachment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a attachments%ROWTYPE;
  v_org uuid;
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
    RETURN private.is_org_member(v_org)
      OR (a.rfq_id IS NOT NULL AND private.has_rfq_invitation(a.rfq_id));
  END IF;

  RETURN EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = a.quote_id AND private.is_supplier_user_for(q.supplier_id)
    )
    OR private.can_access_rfq_as_buyer(a.rfq_id)
    OR private.can_access_rfq_as_committee(a.rfq_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.can_write_attachment(
  p_scope          attachment_scope,
  p_requirement_id uuid,
  p_quote_id       uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_scope = 'REQUIREMENT' THEN
    SELECT organization_id INTO v_org FROM requirements WHERE id = p_requirement_id;
    RETURN v_org IS NOT NULL
      AND private.is_org_member(v_org)
      AND private.get_org_role(v_org) IN ('OWNER', 'MANAGER', 'BUYER');
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = p_quote_id AND private.is_supplier_user_for(q.supplier_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cross-party views — identity-safe projections
-- ---------------------------------------------------------------------------

-- What an invited supplier may see of the buyer's requirement files.
-- No uploaded_by, no original_filename: both can identify the buyer.
CREATE OR REPLACE VIEW requirement_attachments_shared
WITH (security_barrier = true) AS
SELECT
  a.id AS attachment_id,
  a.requirement_id,
  a.rfq_id,
  a.scope,
  a.kind,
  a.display_name,
  a.content_type,
  a.size_bytes,
  a.duration_seconds,
  a.storage_path,
  a.created_at
FROM attachments a
WHERE a.scope = 'REQUIREMENT'
  AND (
    private.has_rfq_invitation(a.rfq_id)
    OR private.can_access_rfq_as_buyer(a.rfq_id)
    OR private.can_access_rfq_as_committee(a.rfq_id)
  );

-- What the buyer and committee may see of supplier quote files while blind.
-- Keyed by anonymous_label only.
CREATE OR REPLACE VIEW quote_attachments_blind
WITH (security_barrier = true) AS
SELECT
  a.id AS attachment_id,
  a.quote_id,
  a.rfq_id,
  ri.anonymous_label,
  a.kind,
  a.display_name,
  a.content_type,
  a.size_bytes,
  a.duration_seconds,
  a.storage_path,
  a.created_at
FROM attachments a
JOIN quotes q ON q.id = a.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = a.rfq_id
WHERE a.scope = 'QUOTE'
  AND r.reveal_status = 'BLIND'
  AND (
    private.can_access_rfq_as_buyer(a.rfq_id)
    OR private.can_access_rfq_as_committee(a.rfq_id)
  );

-- After award reveal the real filename and the supplier become visible.
CREATE OR REPLACE VIEW quote_attachments_revealed
WITH (security_barrier = true) AS
SELECT
  a.id AS attachment_id,
  a.quote_id,
  a.rfq_id,
  ri.anonymous_label,
  q.supplier_id,
  s.business_name,
  a.kind,
  a.display_name,
  a.original_filename,
  a.content_type,
  a.size_bytes,
  a.duration_seconds,
  a.storage_path,
  a.created_at
FROM attachments a
JOIN quotes q ON q.id = a.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = a.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
WHERE a.scope = 'QUOTE'
  AND r.reveal_status = 'REVEALED'
  AND private.can_access_rfq_as_buyer(a.rfq_id);

-- ---------------------------------------------------------------------------
-- Slot creation — the client never picks a storage path
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_attachment_slot(
  p_scope            attachment_scope,
  p_requirement_id   uuid,
  p_quote_id         uuid,
  p_kind             attachment_kind,
  p_original_filename text,
  p_content_type     text,
  p_size_bytes       bigint DEFAULT 0,
  p_duration_seconds numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      uuid;
  v_path    text;
  v_display text;
  v_profile uuid;
BEGIN
  v_profile := private.get_profile_id();
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT private.can_write_attachment(p_scope, p_requirement_id, p_quote_id) THEN
    RAISE EXCEPTION 'Not allowed to attach files here';
  END IF;

  IF p_original_filename IS NULL OR btrim(p_original_filename) = '' THEN
    RAISE EXCEPTION 'A filename is required';
  END IF;

  INSERT INTO attachments (
    scope, requirement_id, quote_id, storage_path, original_filename,
    content_type, size_bytes, kind, duration_seconds, uploaded_by
  ) VALUES (
    p_scope, p_requirement_id, p_quote_id, 'pending', p_original_filename,
    p_content_type, COALESCE(p_size_bytes, 0), p_kind, p_duration_seconds, v_profile
  )
  RETURNING id, storage_path, display_name INTO v_id, v_path, v_display;

  RETURN jsonb_build_object(
    'attachment_id', v_id,
    'storage_path', v_path,
    'display_name', v_display,
    'bucket', 'otp-attachments'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_attachment_slot(
  attachment_scope, uuid, uuid, attachment_kind, text, text, bigint, numeric
) TO authenticated;

-- Confirms the bytes landed, so half-finished uploads are easy to sweep.
CREATE OR REPLACE FUNCTION public.confirm_attachment_upload(
  p_attachment_id uuid,
  p_size_bytes    bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE attachments
  SET uploaded_at = now(),
      size_bytes = COALESCE(p_size_bytes, size_bytes)
  WHERE id = p_attachment_id
    AND uploaded_by = private.get_profile_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found or not yours';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_attachment_upload(uuid, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS on the metadata table — own-side rows only; cross-party reads go
-- through the views above
-- ---------------------------------------------------------------------------

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY attachments_select_own_side ON attachments
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR uploaded_by = private.get_profile_id()
    OR (
      scope = 'REQUIREMENT'
      AND private.is_org_member(
        (SELECT organization_id FROM requirements WHERE id = attachments.requirement_id)
      )
    )
    OR (
      scope = 'QUOTE'
      AND EXISTS (
        SELECT 1 FROM quotes q
        WHERE q.id = attachments.quote_id
          AND private.is_supplier_user_for(q.supplier_id)
      )
    )
  );

CREATE POLICY attachments_insert ON attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = private.get_profile_id()
    AND private.can_write_attachment(scope, requirement_id, quote_id)
  );

CREATE POLICY attachments_delete_own ON attachments
  FOR DELETE TO authenticated
  USING (uploaded_by = private.get_profile_id() OR private.is_platform_admin());

GRANT SELECT, INSERT, DELETE ON attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON attachments TO service_role;
GRANT SELECT ON requirement_attachments_shared, quote_attachments_blind,
  quote_attachments_revealed TO authenticated;

-- ---------------------------------------------------------------------------
-- Storage object policies — authorization is delegated to the attachment row,
-- so a signed URL can never be minted for a file the caller cannot read
-- ---------------------------------------------------------------------------

CREATE POLICY otp_attachments_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'otp-attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.storage_path = storage.objects.name
        AND a.uploaded_by = private.get_profile_id()
    )
  );

CREATE POLICY otp_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'otp-attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.storage_path = storage.objects.name
        AND private.can_read_attachment(a.id)
    )
  );

CREATE POLICY otp_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'otp-attachments'
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.storage_path = storage.objects.name
        AND (a.uploaded_by = private.get_profile_id() OR private.is_platform_admin())
    )
  );
