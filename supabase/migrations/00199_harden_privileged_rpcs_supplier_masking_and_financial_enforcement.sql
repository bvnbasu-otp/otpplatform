-- Migration 00199: Harden privileged RPCs, supplier identity masking and
-- server-side financial / milestone / allowance enforcement
--
-- Every function below is re-created from its latest definition in the chain;
-- only the stated fix changes.
--
-- A. Privileged RPC access
--  1. Always-true admin guards. 41 overloads (38 names) across 00072..00186 checked
--     `private.is_platform_admin() OR auth.role() = 'authenticated'
--     [OR auth.role() = 'anon']`, `current_user IN ('postgres','service_role')`
--     (always true inside SECURITY DEFINER) or `auth.role() IN
--     ('authenticated','anon')`. The always-true disjuncts are stripped from
--     the live definition, the result is asserted clean, and EXECUTE is
--     revoked from anon/PUBLIC. Covers SEC-3 (admin_execute_service_action)
--     and SEC-4 (admin_get_users_and_organizations).
--  2. admin_database_snapshots RLS (00072) was readable/writable by anon.
--  3. admin_mark_notification_read: owner-scoped for normal users.
--  4. SEC-2 admin_bulk_delete_users: platform admin / service_role only;
--     never hard-deletes (deactivates instead); audit row no longer lost.
--  5. SEC-1 lock_and_reveal_award_atomic: buyer org OWNER/MANAGER, platform
--     admin or service_role only (the 00151 check dropped in 00156).
--  6. SEC-5 upsert_buyer_address_atomic: ownership enforced on update.
--  7. Anon-granted readers without caller checks.
--
-- B. Supplier identity masking (SEC-6 / SEC-7, Issues 20 & 28)
--  8. rfqs address snapshots are no longer selectable by API roles.
--  9. rfqs_supplier_masked / supplier_rfq_message_payload hide the buyer name
--     until the award is revealed to that supplier.
--
-- C. Server-side enforcement
-- 10. Issue 13 TDS: server-derived base, one live deduction per invoice,
--     balance_due nets live TDS so an invoice with TDS can reach PAID.
-- 11. Issue 11 milestones: sequential 25/50/75/100 by an authorized actor,
--     COMPLETED only through buyer inspection sign-off, audited.
-- 12. Issue 22 pilot allowance: 3 RFQs per UTC calendar month per org.
--
-- Idempotent and non-destructive: no table, column or row is dropped or
-- deleted. Policies are replaced with DROP POLICY IF EXISTS + CREATE POLICY.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Always-true admin guards
-- ---------------------------------------------------------------------------

DO $sweep$
DECLARE
  v_names text[] := ARRAY[
    'admin_bypass_approval_gate',
    'admin_clear_audit_logs_and_notifications',
    'admin_clear_notifications',
    'admin_create_db_backup',
    'admin_execute_service_action',
    'admin_fix_buyer_issue',
    'admin_fix_seller_issue',
    'admin_force_transition_order_state',
    'admin_generate_proactive_maintenance_alerts',
    'admin_get_all_notifications',
    'admin_get_audit_trail',
    'admin_get_db_backups',
    'admin_get_entity_audit_trail',
    'admin_get_live_transactions',
    'admin_get_seller_orders',
    'admin_get_signup_requests',
    'admin_get_support_tickets',
    'admin_get_system_alerts',
    'admin_get_system_health',
    'admin_get_users_and_organizations',
    'admin_mark_all_notifications_read',
    'admin_purge_all_transactional_records',
    'admin_resolve_support_ticket',
    'admin_restore_db_backup',
    'admin_retry_invoice_payment_webhook',
    'admin_review_signup_request',
    'admin_run_buyer_diagnostics',
    'admin_run_diagnostic_query',
    'admin_run_seller_diagnostics',
    'admin_run_test_case',
    'admin_search_entities',
    'admin_simulate_po_acceptance',
    'admin_toggle_demo_mode',
    'admin_toggle_entity_gst_compliance',
    'admin_toggle_maintenance_mode',
    'admin_unblock_sealed_quote'
  ];
  -- Thin wrappers that delegate to a guarded overload above.
  v_wrappers text[] := ARRAY['clear_all_transactional_data', 'review_signup_request'];
  r record;
  v_def text;
  v_new text;
  v_rewritten integer := 0;
  v_seen text[] := ARRAY[]::text[];
  v_missing text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY (v_names || v_wrappers)
    ORDER BY p.proname, p.oid
  LOOP
    v_seen := v_seen || r.proname::text;
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, '\s+OR\s+auth\.role\(\)\s*=\s*''(authenticated|anon)''', '', 'gi');
    v_new := regexp_replace(v_new, 'current_user\s+IN\s*\(\s*''postgres''\s*,\s*''service_role''\s*\)\s+OR\s+', '', 'gi');
    v_new := regexp_replace(v_new, 'auth\.role\(\)\s+IN\s*\(\s*''authenticated''\s*,\s*''anon''\s*\)', 'false', 'gi');

    IF v_new ~* 'auth\.role\(\)\s*=\s*''(authenticated|anon)'''
       OR v_new ~* 'auth\.role\(\)\s+IN\s*\([^)]*''(authenticated|anon)'''
       OR v_new ~* 'current_user\s+IN\s*\(' THEN
      RAISE EXCEPTION '00199: residual always-true guard in %', r.oid::regprocedure;
    END IF;

    IF v_new <> v_def THEN
      IF v_new !~ 'private\.is_platform_admin\(\)' THEN
        RAISE EXCEPTION '00199: % lost its platform-admin check during rewrite', r.oid::regprocedure;
      END IF;
      EXECUTE v_new;
      v_rewritten := v_rewritten + 1;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.oid::regprocedure);
  END LOOP;

  SELECT string_agg(x, ', ') INTO v_missing
  FROM unnest(v_names) AS x
  WHERE NOT (x = ANY (v_seen));
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE '00199: listed admin functions not present (nothing to harden): %', v_missing;
  END IF;

  RAISE NOTICE '00199: rewrote % always-true admin guard(s)', v_rewritten;
END
$sweep$;

-- ---------------------------------------------------------------------------
-- 2. admin_database_snapshots: full-database snapshots, platform admin only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS admin_snapshots_select ON public.admin_database_snapshots;
DROP POLICY IF EXISTS admin_snapshots_all ON public.admin_database_snapshots;

CREATE POLICY admin_snapshots_select ON public.admin_database_snapshots
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

CREATE POLICY admin_snapshots_all ON public.admin_database_snapshots
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

REVOKE ALL ON public.admin_database_snapshots FROM anon;

-- ---------------------------------------------------------------------------
-- 3. admin_mark_notification_read: admins mark any, users only their own
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_mark_notification_read(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_count integer := 0;
  v_is_admin boolean := private.is_platform_admin();
  v_profile_id uuid := private.get_profile_id();
BEGIN
  IF NOT v_is_admin AND v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: cannot mark notification';
  END IF;

  UPDATE public.notifications
  SET
    status = 'READ',
    read_at = COALESCE(read_at, now()),
    updated_at = now()
  WHERE id = p_notification_id
    AND (v_is_admin OR profile_id = v_profile_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'id', p_notification_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_notification_read(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. SEC-2 admin_bulk_delete_users: admin only, deactivate, never hard delete
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_bulk_delete_users(
  p_user_ids uuid[],
  p_soft_delete boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_admin_id uuid := private.get_profile_id();
  v_count int := 0;
  v_target_profile_ids uuid[];
  v_target_auth_ids uuid[];
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required';
  END IF;

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL OR array_length(p_user_ids, 1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No user IDs specified');
  END IF;

  -- Filter out protected platform admins
  SELECT array_agg(p.id), array_agg(COALESCE(p.auth_user_id, p.id))
  INTO v_target_profile_ids, v_target_auth_ids
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    AND COALESCE(p.is_platform_admin, false) = false
    AND lower(p.email) NOT IN (
      'bvnbasu@gmail.com',
      'admin@otp.test',
      'ops@otp.test',
      'superadmin@otp.test',
      'admin@otp.ai',
      'ops@otp.ai',
      'admin@procureos.test'
    );

  IF v_target_profile_ids IS NULL OR array_length(v_target_profile_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'count', 0,
      'message', 'No non-admin user accounts matched for deletion.'
    );
  END IF;

  -- Accounts are deactivated, never hard-deleted: memberships, signup
  -- history, auth identities and every procurement/audit/financial row that
  -- references the profile are kept. p_soft_delete = false is accepted for
  -- signature compatibility and handled the same way.
  UPDATE public.profiles
  SET status = 'DELETED',
      deleted_at = COALESCE(deleted_at, now()),
      updated_at = now()
  WHERE id = ANY(v_target_profile_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.signup_requests sr
  SET status = 'REJECTED',
      review_notes = 'Soft-deleted by SuperAdmin'
  FROM public.profiles p
  WHERE p.id = ANY(v_target_profile_ids)
    AND lower(sr.email) = lower(p.email);

  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'admin.bulk_delete_users',
    v_admin_id,
    'profile',
    v_target_profile_ids[1]::text,
    jsonb_build_object(
      'targetProfileIds', v_target_profile_ids,
      'targetAuthIds', v_target_auth_ids,
      'affectedCount', v_count,
      'requestedSoftDelete', p_soft_delete,
      'appliedMode', 'DEACTIVATED'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'count', v_count,
    'mode', 'DEACTIVATED',
    'hardDeleteRefused', (p_soft_delete IS FALSE),
    'message', format('Deactivated %s user account(s). Records are retained for audit.', v_count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_delete_users(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_users(uuid[], boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. SEC-1 lock_and_reveal_award_atomic: buyer OWNER/MANAGER or admin only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text,
  p_auto_reveal   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq             rfqs%ROWTYPE;
  v_quote           quotes%ROWTYPE;
  v_org             organizations%ROWTYPE;
  v_award_id        uuid;
  v_now             timestamptz := now();
  v_tally           jsonb;
  v_po_res          jsonb;
  v_po_id           uuid;
  v_po_number       text;
  v_supplier_id     uuid;
  v_supplier        suppliers%ROWTYPE;
  v_business        text;
  v_phone           text;
  v_email           text;
  v_alias           text;
  v_existing_award  awards%ROWTYPE;
  v_pending_stages  integer := 0;
  v_can_reveal      boolean := false;
BEGIN
  -- 1. Strict row-level lock on RFQ
  SELECT * INTO v_rfq
  FROM public.rfqs
  WHERE id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  -- Authorization: buying organization OWNER/MANAGER, platform admin or service_role
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (auth.uid() IS NOT NULL AND COALESCE(private.is_org_manager_or_above(v_rfq.organization_id), false))
  ) THEN
    RAISE EXCEPTION 'Only an owner or manager of the buying organization can lock an award (AWARD-UNAUTHORIZED)';
  END IF;

  -- 2. Verify RFQ Status
  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;

  -- 3. Fail-Closed Multi-Tier Approval Gate
  SELECT COUNT(*) INTO v_pending_stages
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND status != 'APPROVED';

  IF v_pending_stages > 0 THEN
    RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction.';
  END IF;

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_rfq.organization_id;

  -- 4. Verify Quote belongs to this RFQ
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id AND rfq_id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ');
  END IF;

  -- Verify Supplier verification status
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED' THEN
    v_can_reveal := p_auto_reveal;
  ELSE
    -- If supplier is not verified, require onboarding and block reveal
    v_can_reveal := false;
    IF v_supplier.lifecycle_state = 'QUOTE_PARTICIPANT' THEN
      UPDATE public.suppliers
      SET lifecycle_state = 'ONBOARDING_REQUIRED', updated_at = v_now
      WHERE id = v_supplier.id;
    END IF;
  END IF;

  -- 5. Check or Create Award Record
  SELECT * INTO v_existing_award
  FROM public.awards
  WHERE rfq_id = p_rfq_id;

  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    -- Compute final frozen vote tally snapshot
    SELECT jsonb_build_object(
      'locked_at', v_now,
      'votes', COALESCE(jsonb_agg(jsonb_build_object(
        'quote_id', v.recommended_quote_id,
        'choice', v.choice,
        'voting_power', v.voting_power,
        'buyer_type', v.buyer_type
      )), '[]'::jsonb)
    )
    INTO v_tally
    FROM (
      SELECT DISTINCT ON (cv.profile_id) cv.*
      FROM public.committee_votes cv
      WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
      ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
    ) v;

    -- Insert Frozen Award Record
    INSERT INTO public.awards (
      rfq_id,
      quote_id,
      awarded_by,
      justification,
      status,
      awarded_at,
      revealed_at,
      votes_locked_at,
      vote_snapshot
    ) VALUES (
      p_rfq_id,
      p_quote_id,
      COALESCE(private.get_profile_id(), v_rfq.created_by),
      jsonb_build_object('text', p_justification),
      CASE WHEN v_can_reveal THEN 'REVEALED'::public.award_status ELSE 'PENDING_REVEAL'::public.award_status END,
      v_now,
      CASE WHEN v_can_reveal THEN v_now ELSE NULL END,
      v_now,
      COALESCE(v_tally, '{}'::jsonb)
    )
    RETURNING id INTO v_award_id;
  END IF;

  -- 6. Update Quote Statuses
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;

  -- 7. Update RFQ and Requirement Status
  UPDATE rfqs
  SET 
    status = 'AWARDED',
    reveal_status = CASE WHEN v_can_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now
  WHERE id = p_rfq_id;

  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;

  -- Notify outcome
  PERFORM private.notify_bidders_of_outcome(p_rfq_id);

  -- 8. Audit Log
  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.locked',
    COALESCE(private.get_profile_id(), v_rfq.created_by),
    v_rfq.organization_id,
    'award',
    v_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'can_reveal', v_can_reveal,
      'locked_at', v_now
    )
  );

  -- 9. If reveal is allowed, atomically generate PO and return mutual reveal payload
  IF v_can_reveal THEN
    v_po_res := public.create_purchase_order_from_award(v_award_id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';

    SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
    INTO v_supplier_id, v_business, v_phone, v_email, v_alias
    FROM quotes q
    JOIN suppliers s ON s.id = q.supplier_id
    JOIN rfq_invitations ri ON ri.id = q.invitation_id
    WHERE q.id = p_quote_id;

    RETURN jsonb_build_object(
      'ok', true,
      'award_id', v_award_id,
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'status', 'REVEALED',
      'revealed', true,
      'po_id', v_po_id,
      'po_number', v_po_number,
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'contact_phone', v_phone,
      'contact_email', v_email,
      'alias_before_reveal', v_alias,
      'buyer_organization_id', v_org.id,
      'buyer_organization_name', v_org.name,
      'buyer_org_type', v_org.org_type,
      'buyer_gstin', v_org.tax_registration,
      'buyer_contact_person', v_org.contact_person,
      'buyer_contact_phone', v_org.contact_phone,
      'buyer_contact_email', v_org.contact_email,
      'buyer_address', v_org.address,
      'buyer_city', v_org.city
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'award_id', v_award_id,
    'rfq_id', p_rfq_id,
    'quote_id', p_quote_id,
    'status', 'PENDING_REVEAL',
    'revealed', false,
    'supplier_verification_required', (v_supplier.lifecycle_state <> 'VERIFIED'),
    'votes_locked_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. SEC-5 upsert_buyer_address_atomic: ownership enforced on update
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_buyer_address_atomic(
  p_label          text,
  p_line1          text,
  p_city           text,
  p_state          text,
  p_pincode        text,
  p_line2          text DEFAULT NULL,
  p_landmark       text DEFAULT NULL,
  p_country        text DEFAULT 'India',
  p_is_primary     boolean DEFAULT false,
  p_address_type   text DEFAULT 'DELIVERY',
  p_org_id         uuid DEFAULT NULL,
  p_address_id     uuid DEFAULT NULL,
  p_contact_person text DEFAULT NULL,
  p_contact_phone  text DEFAULT NULL,
  p_state_code     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller_id    uuid;
  v_res_id       uuid;
  v_now          timestamptz := now();
  v_existing     public.buyer_addresses%ROWTYPE;
  v_can_edit     boolean := false;
BEGIN
  v_caller_id := COALESCE(auth.uid(), private.get_profile_id());
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  -- Validation
  IF p_line1 IS NULL OR trim(p_line1) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Address line 1 is required');
  END IF;
  IF p_city IS NULL OR trim(p_city) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'City is required');
  END IF;
  IF p_state IS NULL OR trim(p_state) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'State is required');
  END IF;
  IF p_pincode IS NULL OR NOT (p_pincode ~ '^[0-9]{6}$') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid 6-digit Indian PIN code is required');
  END IF;

  -- Check Org Access if organization address
  IF p_org_id IS NOT NULL THEN
    IF NOT private.is_org_member(p_org_id) AND NOT private.is_platform_admin() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Access denied to organization');
    END IF;
  END IF;

  -- Ownership of an existing address is checked before any row is touched.
  IF p_address_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.buyer_addresses WHERE id = p_address_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Address record not found');
    END IF;

    v_can_edit := COALESCE(
      private.is_platform_admin()
      OR (v_existing.organization_id IS NULL
          AND (v_existing.profile_id = auth.uid() OR v_existing.profile_id = private.get_profile_id()))
      OR (v_existing.organization_id IS NOT NULL AND private.is_org_member(v_existing.organization_id)),
      false
    );
    IF NOT v_can_edit THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Address record not found');
    END IF;

    IF v_existing.organization_id IS DISTINCT FROM p_org_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'An address cannot be moved between a personal profile and an organization');
    END IF;
  END IF;

  -- If setting as primary, unset other primaries for this profile/org
  IF p_is_primary THEN
    IF p_org_id IS NOT NULL THEN
      UPDATE public.buyer_addresses
      SET is_primary = false, updated_at = v_now
      WHERE organization_id = p_org_id AND is_primary = true;
    ELSE
      UPDATE public.buyer_addresses
      SET is_primary = false, updated_at = v_now
      WHERE profile_id = v_caller_id AND organization_id IS NULL AND is_primary = true;
    END IF;
  END IF;

  IF p_address_id IS NOT NULL THEN
    UPDATE public.buyer_addresses
    SET
      label = COALESCE(trim(p_label), label),
      address_line1 = trim(p_line1),
      address_line2 = trim(p_line2),
      landmark = trim(p_landmark),
      city = trim(p_city),
      state = trim(p_state),
      state_code = trim(p_state_code),
      pincode = trim(p_pincode),
      country = COALESCE(trim(p_country), 'India'),
      contact_person = trim(p_contact_person),
      contact_phone = trim(p_contact_phone),
      is_primary = p_is_primary,
      address_type = COALESCE(p_address_type, 'DELIVERY'),
      is_active = true,
      updated_at = v_now
    WHERE id = p_address_id
    RETURNING id INTO v_res_id;
  ELSE
    INSERT INTO public.buyer_addresses (
      profile_id,
      organization_id,
      label,
      address_line1,
      address_line2,
      landmark,
      city,
      state,
      state_code,
      pincode,
      country,
      contact_person,
      contact_phone,
      is_primary,
      address_type,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      v_caller_id,
      p_org_id,
      COALESCE(trim(p_label), 'Primary Site'),
      trim(p_line1),
      trim(p_line2),
      trim(p_landmark),
      trim(p_city),
      trim(p_state),
      trim(p_state_code),
      trim(p_pincode),
      COALESCE(trim(p_country), 'India'),
      trim(p_contact_person),
      trim(p_contact_phone),
      p_is_primary,
      COALESCE(p_address_type, 'DELIVERY'),
      true,
      v_now,
      v_now
    )
    RETURNING id INTO v_res_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'address_id', v_res_id,
    'is_primary', p_is_primary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_buyer_address_atomic(text, text, text, text, text, text, text, text, boolean, text, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_buyer_address_atomic(text, text, text, text, text, text, text, text, boolean, text, uuid, uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_buyer_addresses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buyer_addresses(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Anon-granted readers without a caller check
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_organization_subscription(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_now timestamptz := now();
  v_is_expired boolean;
  v_days_left integer;
  v_tier text;
BEGIN
  IF NOT (
    COALESCE(private.is_org_member(p_organization_id), false)
    OR private.is_platform_admin()
    OR COALESCE(auth.role(), '') = 'service_role'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  v_tier := COALESCE(v_org.subscription_tier, 
    CASE WHEN v_org.org_type::text IN ('COMMUNITY', 'ENTERPRISE', 'INSTITUTION') 
      THEN 'TIER_2_ENTERPRISE' 
      ELSE 'TIER_1_MSME' 
    END
  );

  v_is_expired := (v_org.subscription_expires_at IS NOT NULL AND v_org.subscription_expires_at < v_now);
  
  IF v_org.subscription_expires_at IS NOT NULL THEN
    v_days_left := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_org.subscription_expires_at - v_now)) / 86400)::integer);
  ELSE
    v_days_left := 0;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'org_type', v_org.org_type,
    'tier', v_tier,
    'status', CASE WHEN v_is_expired THEN 'EXPIRED' ELSE COALESCE(v_org.subscription_status, 'ACTIVE') END,
    'plan', COALESCE(v_org.subscription_plan, 'MONTHLY'),
    'started_at', v_org.subscription_started_at,
    'expires_at', v_org.subscription_expires_at,
    'days_remaining', v_days_left,
    'is_expired', v_is_expired,
    'free_rfq_credits', COALESCE(v_org.free_rfq_credits, 1),
    'rfq_credits_used', COALESCE(v_org.rfq_credits_used, 0),
    'payment_reference', v_org.payment_reference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_subscription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_subscription(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_purchase_order_invoicing_summary(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_total_invoiced numeric(14, 2) := 0.00;
  v_approved_invoiced numeric(14, 2) := 0.00;
  v_remaining numeric(14, 2) := 0.00;
  v_invoice_count integer := 0;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found');
  END IF;

  IF NOT COALESCE(
    private.is_platform_admin()
    OR private.is_org_member(v_po.organization_id)
    OR private.is_supplier_user_for(v_po.supplier_id),
    false
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found');
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status <> 'REJECTED'), 0.00),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('APPROVED', 'PAID')), 0.00),
    COUNT(*) FILTER (WHERE status <> 'REJECTED')
  INTO v_total_invoiced, v_approved_invoiced, v_invoice_count
  FROM public.invoices
  WHERE purchase_order_id = p_po_id
     OR (purchase_order_id IS NULL AND work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = p_po_id));

  v_remaining := GREATEST(0.00, v_po.total_amount - v_total_invoiced);

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_order_id', p_po_id,
    'total_authorized_amount', v_po.total_amount,
    'already_invoiced_amount', v_total_invoiced,
    'approved_invoiced_amount', v_approved_invoiced,
    'remaining_invoiceable_amount', v_remaining,
    'invoice_count', v_invoice_count,
    'is_fully_invoiced', (v_remaining <= 0.01)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_purchase_order_invoicing_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_order_invoicing_summary(uuid) TO authenticated, service_role;

DO $readers$
DECLARE
  r record;
BEGIN
  -- Only ever called from SECURITY DEFINER triggers/RPCs (owner privileges).
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_system_notification'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
  END LOOP;

  -- Signed-in callers only.
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_current_procurement_step', 'check_supplier_award_eligibility_atomic')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.oid::regprocedure);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.oid::regprocedure);
  END LOOP;
END
$readers$;

-- ---------------------------------------------------------------------------
-- 8. SEC-6: rfqs address snapshots are not selectable by API roles
-- ---------------------------------------------------------------------------
-- RLS cannot hide columns, so SELECT is granted column-by-column without the
-- two snapshot columns. Buyers keep every other column; suppliers keep the
-- rows their invitation policy allows. Pincode/city stay available through
-- requirements.delivery_city and the masked view. A column added to rfqs
-- later must be granted to authenticated explicitly.

DO $cols$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'rfqs'
    AND column_name NOT IN ('delivery_address_snapshot', 'billing_address_snapshot');

  IF v_cols IS NULL THEN
    RAISE EXCEPTION '00199: public.rfqs has no columns to grant';
  END IF;

  REVOKE SELECT ON public.rfqs FROM PUBLIC, anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.rfqs TO authenticated', v_cols);
END
$cols$;

-- ---------------------------------------------------------------------------
-- 9. SEC-7: buyer name hidden from suppliers until reveal to that supplier
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.rfqs_supplier_masked
WITH (security_barrier = true) AS
SELECT
    r.id AS rfq_id,
    r.public_ref,
    r.title,
    req.description,
    r.status,
    r.sourcing_mode,
    r.quote_deadline,
    r.min_quotes_required,
    r.created_at,
    ri.id AS invitation_id,
    ri.anonymous_label AS my_alias,
    ri.status AS my_invitation_status,
    ri.invited_at,
    cat.name AS category,
    sub.name AS subcategory,
    req.requirement_mode,
    req.quantity,
    req.unit,
    req.attributes,
    req.quality,
    req.commercial,
    req.required_by_mode,
    req.required_by_days,
    req.required_by_date,
    req.fulfilment_mode,
    req.delivery_city,
    r.evaluation_weights,
    CASE
        WHEN r.reveal_status = 'REVEALED' AND EXISTS (
          SELECT 1
          FROM awards a
          JOIN quotes q ON q.id = a.quote_id
          WHERE a.rfq_id = r.id
            AND a.status = 'REVEALED'
            AND q.supplier_id = ri.supplier_id
        ) THEN o.name
        ELSE 'Identity protected'::text
    END AS buyer_display_name,
    CASE
        WHEN r.buyer_anonymous_to_suppliers THEN NULL::public.org_type
        ELSE o.org_type
    END AS buyer_type
FROM rfqs r
JOIN requirements req ON req.id = r.requirement_id
JOIN organizations o ON o.id = r.organization_id
JOIN rfq_invitations ri ON ri.rfq_id = r.id
LEFT JOIN requirement_categories cat ON cat.id = req.category_id
LEFT JOIN requirement_subcategories sub ON sub.id = req.subcategory_id
WHERE private.is_supplier_user_for(ri.supplier_id);

REVOKE ALL ON public.rfqs_supplier_masked FROM anon;
GRANT SELECT ON public.rfqs_supplier_masked TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supplier_rfq_message_payload(
  p_rfq_id uuid,
  p_supplier_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'publicRef',        r.public_ref,
    'alias',            ri.anonymous_label,
    'title',            r.title,
    'category',         c.name,
    'subcategory',      sc.name,
    'quantity',         req.quantity,
    'unit',             req.unit,
    'location',         req.delivery_city,
    'requiredByDays',   req.required_by_days,
    'requiredByDate',   req.required_by_date,
    'quoteDeadline',    r.quote_deadline,
    'minQuotes',        r.min_quotes_required,
    'buyerDisplay',     CASE
                          WHEN r.reveal_status = 'REVEALED' AND EXISTS (
                            SELECT 1
                            FROM awards a
                            JOIN quotes q ON q.id = a.quote_id
                            WHERE a.rfq_id = r.id
                              AND a.status = 'REVEALED'
                              AND q.supplier_id = p_supplier_id
                          ) THEN o.name
                          ELSE 'IDENTITY PROTECTED'
                        END,
    'isDemo',           r.is_demo
  ))
  INTO v_payload
  FROM rfqs r
  JOIN rfq_invitations ri ON ri.rfq_id = r.id AND ri.supplier_id = p_supplier_id
  JOIN requirements req ON req.id = r.requirement_id
  LEFT JOIN organizations o ON o.id = r.organization_id
  LEFT JOIN requirement_categories c ON c.id = req.category_id
  LEFT JOIN requirement_subcategories sc ON sc.id = req.subcategory_id
  WHERE r.id = p_rfq_id;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'No invitation for this supplier on this RFQ';
  END IF;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_rfq_message_payload(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_rfq_message_payload(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. Issue 13: TDS computed and enforced on the server
-- ---------------------------------------------------------------------------

DO $tds_idx$
BEGIN
  IF EXISTS (
    SELECT invoice_id FROM public.tds_deductions
    WHERE status <> 'VOIDED'
    GROUP BY invoice_id HAVING count(*) > 1
  ) THEN
    RAISE WARNING '00199: invoices with more than one live TDS deduction exist; uq_tds_deductions_one_live_per_invoice not created. Void the duplicates, then re-run this block.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tds_deductions_one_live_per_invoice
      ON public.tds_deductions (invoice_id)
      WHERE status <> 'VOIDED';
  END IF;
END
$tds_idx$;

-- Buyers write TDS only through apply_tds_withholding_atomic.
DROP POLICY IF EXISTS tds_deductions_mutate ON public.tds_deductions;
CREATE POLICY tds_deductions_mutate ON public.tds_deductions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE OR REPLACE FUNCTION public.apply_tds_withholding_atomic(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_section text,
  p_taxable_amount numeric(14, 2),
  p_tds_rate numeric(5, 2),
  p_deductee_pan text DEFAULT NULL,
  p_pan_status text DEFAULT 'VALID',
  p_is_lower_deduction boolean DEFAULT false,
  p_lower_deduction_cert text DEFAULT NULL,
  p_law_version text DEFAULT 'INCOME_TAX_ACT_2025'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_invoice RECORD;
  v_po_id uuid;
  v_org_id uuid;
  v_gross numeric(14, 2);
  v_gst numeric(14, 2);
  v_taxable numeric(14, 2);
  v_outstanding numeric(14, 2);
  v_statutory_tds numeric(14, 2);
  v_existing public.tds_deductions%ROWTYPE;
  v_fy text;
  v_ay text;
  v_record_id uuid;
  v_created_rec RECORD;
BEGIN
  -- 1. Lock the invoice; the buyer organization comes from its purchase order.
  --    p_taxable_amount is kept for signature compatibility and ignored.
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  v_po_id := v_invoice.purchase_order_id;
  IF v_po_id IS NULL AND v_invoice.work_order_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = v_invoice.work_order_id;
  END IF;

  SELECT organization_id INTO v_org_id FROM public.purchase_orders WHERE id = v_po_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % is not linked to a buyer purchase order (TDS-5C4-NO-PO)', p_invoice_id;
  END IF;

  IF p_organization_id IS NOT NULL AND p_organization_id <> v_org_id THEN
    RAISE EXCEPTION 'Invoice does not belong to this organization (TDS-5C4-ORG-MISMATCH)';
  END IF;

  -- 2. Authorization: buyer OWNER / MANAGER of the invoice's organization
  IF NOT v_is_admin
     AND COALESCE(private.get_org_role(v_org_id)::text, '') NOT IN ('OWNER', 'MANAGER') THEN
    RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can apply statutory TDS withholding (TDS-5C4-UNAUTHORIZED)';
  END IF;

  -- 3. At most one live deduction per invoice: a retry returns the original.
  SELECT * INTO v_existing
  FROM public.tds_deductions
  WHERE invoice_id = p_invoice_id AND status <> 'VOIDED'
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'tds_deduction_id', v_existing.id,
      'taxable_amount', v_existing.taxable_amount,
      'tds_deduction', row_to_json(v_existing)
    );
  END IF;

  IF v_invoice.status::text NOT IN ('SUBMITTED', 'APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Cannot apply TDS to invoice with status % (TDS-5C4-INVALID-STATUS)', v_invoice.status;
  END IF;

  IF p_tds_rate IS NULL OR p_tds_rate < 0 OR p_tds_rate > 20 THEN
    RAISE EXCEPTION 'TDS rate must be between 0 and 20 percent (TDS-5C4-INVALID-RATE)';
  END IF;

  -- 4. Base excludes separately stated GST (CBDT Circular 23/2017); same
  --    precedence as deriveInvoiceTdsBase: GST split, then taxable_total, then gross.
  v_gross := ROUND(GREATEST(COALESCE(v_invoice.amount, 0), 0), 2);
  v_gst := ROUND(
    GREATEST(COALESCE(v_invoice.cgst_total, 0), 0)
    + GREATEST(COALESCE(v_invoice.sgst_total, 0), 0)
    + GREATEST(COALESCE(v_invoice.utgst_total, 0), 0)
    + GREATEST(COALESCE(v_invoice.igst_total, 0), 0),
    2
  );

  IF v_gst > 0 AND v_gst < v_gross THEN
    v_taxable := v_gross - v_gst;
  ELSIF COALESCE(v_invoice.taxable_total, 0) > 0 AND v_invoice.taxable_total < v_gross THEN
    v_taxable := ROUND(v_invoice.taxable_total, 2);
  ELSE
    v_taxable := v_gross;
  END IF;

  -- 5. Statutory Rounding (Section 288B: nearest whole rupee, ₹1 floor)
  IF v_taxable > 0 AND p_tds_rate > 0 THEN
    v_statutory_tds := ROUND((v_taxable * p_tds_rate) / 100.0);
    IF v_statutory_tds <= 0 THEN
      v_statutory_tds := 1.00;
    END IF;
  ELSE
    v_statutory_tds := 0.00;
  END IF;

  v_outstanding := GREATEST(0, v_gross - COALESCE(v_invoice.paid_amount, 0));
  IF v_statutory_tds > v_outstanding THEN
    RAISE EXCEPTION 'Statutory TDS amount ₹% exceeds the outstanding invoice balance ₹% (TDS-5C4-EXCEEDS-OUTSTANDING)',
      v_statutory_tds, v_outstanding;
  END IF;

  -- 6. Derive FY & AY
  v_fy := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 4
    THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
    ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
  END;

  v_ay := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 4
    THEN (EXTRACT(YEAR FROM now()) + 1)::text || '-' || (EXTRACT(YEAR FROM now()) + 2)::text
    ELSE EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
  END;

  -- 7. Insert TDS deduction record
  INSERT INTO public.tds_deductions (
    organization_id,
    supplier_id,
    purchase_order_id,
    invoice_id,
    law_version,
    section,
    taxable_amount,
    tds_rate,
    tds_amount,
    status,
    deductee_pan,
    pan_status,
    is_lower_deduction,
    lower_deduction_cert_number,
    financial_year,
    assessment_year,
    created_by
  ) VALUES (
    v_org_id,
    v_invoice.supplier_id,
    v_po_id,
    v_invoice.id,
    p_law_version,
    p_section,
    v_taxable,
    p_tds_rate,
    v_statutory_tds,
    'DEDUCTED',
    p_deductee_pan,
    p_pan_status,
    p_is_lower_deduction,
    p_lower_deduction_cert,
    v_fy,
    v_ay,
    v_caller_profile_id
  )
  RETURNING id INTO v_record_id;

  -- 8. Recompute balance_due / status (enforce_invoice_tds_balance)
  UPDATE public.invoices SET updated_at = now() WHERE id = p_invoice_id;

  SELECT * INTO v_created_rec FROM public.tds_deductions WHERE id = v_record_id;

  -- 9. Audit Event
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'tds.deducted',
    v_caller_profile_id,
    v_org_id,
    'tds_deduction',
    v_record_id::text,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_po_id,
      'section', p_section,
      'gross_amount', v_gross,
      'gst_excluded', v_gross - v_taxable,
      'taxable_amount', v_taxable,
      'client_taxable_amount', p_taxable_amount,
      'tds_rate', p_tds_rate,
      'tds_amount', v_statutory_tds,
      'deductee_pan', p_deductee_pan,
      'pan_status', p_pan_status
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'tds_deduction_id', v_record_id,
    'taxable_amount', v_taxable,
    'tds_deduction', row_to_json(v_created_rec)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_tds_withholding_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_tds_withholding_atomic(uuid, uuid, text, numeric, numeric, text, text, boolean, text, text) TO authenticated, service_role;

-- Every writer of invoices (allocation sync, reversal, TDS) goes through this,
-- so balance_due always nets live TDS. Invoices without TDS are untouched.
CREATE OR REPLACE FUNCTION private.enforce_invoice_tds_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_tds numeric(14, 2);
BEGIN
  SELECT COALESCE(SUM(tds_amount), 0.00)
  INTO v_tds
  FROM public.tds_deductions
  WHERE invoice_id = NEW.id AND status <> 'VOIDED';

  IF v_tds <= 0 THEN
    RETURN NEW;
  END IF;

  NEW.balance_due := GREATEST(0.00, COALESCE(NEW.amount, 0) - COALESCE(NEW.paid_amount, 0) - v_tds);

  IF NEW.status::text IN ('APPROVED', 'PARTIALLY_PAID')
     AND COALESCE(NEW.paid_amount, 0) + v_tds >= COALESCE(NEW.amount, 0) THEN
    NEW.status := 'PAID';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_invoice_tds_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_invoice_tds_balance ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_tds_balance
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.enforce_invoice_tds_balance();

CREATE OR REPLACE FUNCTION private.touch_invoice_after_tds_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  UPDATE public.invoices SET updated_at = now() WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.touch_invoice_after_tds_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_invoice_after_tds_change ON public.tds_deductions;
CREATE TRIGGER trg_touch_invoice_after_tds_change
  AFTER UPDATE OF status, tds_amount ON public.tds_deductions
  FOR EACH ROW EXECUTE FUNCTION private.touch_invoice_after_tds_change();

-- ---------------------------------------------------------------------------
-- 11. Issue 11: sequential milestones, completion only by inspection sign-off
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enforce_work_order_milestone_progression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_from integer := COALESCE(OLD.progress_percent, 0);
  v_to integer := COALESCE(NEW.progress_percent, 0);
  v_reached integer;
  v_po purchase_orders%ROWTYPE;
  v_is_demo boolean := false;
  v_signoff boolean := COALESCE(current_setting('otp.wo_inspection_signoff', true), '') = 'on';
BEGIN
  IF v_to = v_from AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Platform admin tooling (force-transition, diagnostics) and service_role.
  IF private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = NEW.purchase_order_id;

  -- The demo-only fulfillment simulator runs inside another trigger.
  IF pg_trigger_depth() > 1 THEN
    v_is_demo := COALESCE(NEW.is_demo, false)
      OR COALESCE(v_po.is_demo, false)
      OR COALESCE((SELECT r.is_demo FROM public.rfqs r WHERE r.id = v_po.rfq_id), false);
    IF v_is_demo THEN
      RETURN NEW;
    END IF;
  END IF;

  IF OLD.status = 'COMPLETED' THEN
    -- Re-running the inspection sign-off on a completed order stays allowed.
    IF v_signoff AND NEW.status = 'COMPLETED' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This work order is already completed; its milestones can no longer change (WO-MILESTONE-LOCKED)';
  END IF;

  IF v_to <> v_from THEN
    IF NOT COALESCE(
      private.is_supplier_user_for(NEW.supplier_id)
      OR private.is_org_manager_or_above(v_po.organization_id),
      false
    ) THEN
      RAISE EXCEPTION 'Only the supplier or a buyer owner/manager can record work progress (WO-MILESTONE-UNAUTHORIZED)';
    END IF;

    v_reached := (GREATEST(v_from, 0) / 25) * 25;

    IF v_to NOT IN (25, 50, 75, 100) THEN
      RAISE EXCEPTION 'Progress can only be recorded in 25%% milestones (WO-MILESTONE-STEP)';
    END IF;
    IF v_to <= v_reached THEN
      RAISE EXCEPTION 'Progress cannot go back from % to % (WO-MILESTONE-BACKWARD)', v_reached || '%', v_to || '%';
    END IF;
    IF v_to <> v_reached + 25 THEN
      RAISE EXCEPTION 'Complete the % milestone before recording % (WO-MILESTONE-SKIP)', (v_reached + 25) || '%', v_to || '%';
    END IF;
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    IF NOT v_signoff THEN
      RAISE EXCEPTION 'A work order is completed only by the buyer''s delivery inspection sign-off (WO-COMPLETION-REQUIRES-INSPECTION)';
    END IF;
    IF v_to < 100 THEN
      RAISE EXCEPTION 'A work order can be completed only at 100%% progress (WO-COMPLETION-BEFORE-100)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_work_order_milestone_progression() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_work_order_milestone_progression ON public.work_orders;
CREATE TRIGGER trg_enforce_work_order_milestone_progression
  BEFORE UPDATE OF progress_percent, status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION private.enforce_work_order_milestone_progression();

CREATE OR REPLACE FUNCTION private.audit_work_order_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NEW.progress_percent IS NOT DISTINCT FROM OLD.progress_percent
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org_id FROM public.purchase_orders WHERE id = NEW.purchase_order_id;

  INSERT INTO public.audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    CASE
      WHEN NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN 'work_order.completed'
      ELSE 'work_order.milestone_recorded'
    END,
    private.get_profile_id(),
    v_org_id,
    'work_order',
    NEW.id::text,
    jsonb_build_object(
      'purchaseOrderId', NEW.purchase_order_id,
      'fromPercent', OLD.progress_percent,
      'toPercent', NEW.progress_percent,
      'fromStatus', OLD.status,
      'toStatus', NEW.status,
      'inspectionSignoff', COALESCE(current_setting('otp.wo_inspection_signoff', true), '') = 'on'
    )
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_work_order_milestone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_audit_work_order_milestone ON public.work_orders;
CREATE TRIGGER trg_audit_work_order_milestone
  AFTER UPDATE OF progress_percent, status ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION private.audit_work_order_milestone();

CREATE OR REPLACE FUNCTION public.accept_delivery_inspection(
  p_work_order_id uuid,
  p_notes text DEFAULT NULL,
  p_rating numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $BODY$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_po purchase_orders%ROWTYPE;
  v_rfq rfqs%ROWTYPE;
  v_avg_rating numeric;
  v_completed_count integer;
  v_inv_count integer := 0;
  v_unpaid_count integer := 0;
  v_cum_paid numeric(14, 2) := 0.00;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_wo.purchase_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  -- Allow any authorized buyer organization member or platform admin
  IF NOT private.is_org_member(v_po.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only authorized buyer organization members can accept delivery';
  END IF;

  IF v_wo.status <> 'COMPLETED' AND COALESCE(v_wo.progress_percent, 0) < 100 THEN
    RAISE EXCEPTION 'Delivery can be inspected only after the supplier records 100%% completion (WO-INSPECTION-BEFORE-100)';
  END IF;

  -- 1. Update Work Order with star rating & review
  PERFORM set_config('otp.wo_inspection_signoff', 'on', true);

  UPDATE work_orders
  SET buyer_accepted_at = COALESCE(buyer_accepted_at, now()),
      inspection_notes = COALESCE(p_notes, inspection_notes),
      review_text = COALESCE(p_notes, review_text),
      rating = COALESCE(p_rating, rating),
      status = 'COMPLETED',
      progress_percent = 100,
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = p_work_order_id;

  PERFORM set_config('otp.wo_inspection_signoff', '', true);

  -- 2. Recalculate Supplier's Average Rating & Completed Jobs
  IF p_rating IS NOT NULL THEN
    SELECT COALESCE(AVG(rating), p_rating), COUNT(*)
    INTO v_avg_rating, v_completed_count
    FROM work_orders
    WHERE supplier_id = v_wo.supplier_id AND rating IS NOT NULL;

    UPDATE suppliers
    SET rating_avg = ROUND(v_avg_rating, 2),
        completed_jobs = GREATEST(COALESCE(completed_jobs, 0), v_completed_count),
        updated_at = now()
    WHERE id = v_wo.supplier_id;
  END IF;

  -- 3. Check Phase 5C.2 financial settlement status
  -- Count valid non-rejected invoices
  SELECT COUNT(*) INTO v_inv_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED';

  -- Count any unpaid or partial invoices
  SELECT COUNT(*) INTO v_unpaid_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED'
    AND (status <> 'PAID' OR balance_due > 0.00);

  -- Cumulative allocated payments
  SELECT COALESCE(SUM(pa.allocated_amount), 0.00) INTO v_cum_paid
  FROM public.payment_allocations pa
  JOIN public.invoices i ON i.id = pa.invoice_id
  WHERE (i.purchase_order_id = v_po.id OR i.work_order_id = v_wo.id)
    AND i.status <> 'REJECTED'
    AND pa.status = 'ALLOCATED';

  -- Only transition PO to COMPLETED if financial settlement criteria are fully satisfied
  IF v_inv_count > 0 AND v_unpaid_count = 0 AND v_cum_paid >= v_po.total_amount THEN
    UPDATE purchase_orders
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE id = v_po.id;

    SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
    IF FOUND THEN
      UPDATE requirements
      SET status = 'COMPLETED',
          updated_at = now()
      WHERE id = v_rfq.requirement_id;
    END IF;
  ELSE
    -- Keep PO in active/in-progress state; do not trigger premature PO-5C2-NOT-SETTLED guard
    UPDATE purchase_orders
    SET updated_at = now()
    WHERE id = v_po.id;
  END IF;
END;
$BODY$;

REVOKE ALL ON FUNCTION public.accept_delivery_inspection(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery_inspection(uuid, text, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. Issue 22: pilot RFQ allowance enforced at RFQ creation
-- ---------------------------------------------------------------------------
-- Same rule the dashboard and publish gate display (evaluatePilotRfqAllowance:
-- INDIVIDUAL tier, MONTHLY plan, PILOT_FREE): 3 RFQs per organization per UTC
-- calendar month. The annual-plan bonus applies only to YEARLY plans, which
-- the pilot never evaluates. Covers publish_requirement and direct inserts.

CREATE OR REPLACE FUNCTION private.enforce_pilot_rfq_allowance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_allowance CONSTANT integer := 3;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_used integer;
BEGIN
  IF private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent publishes for the same organization.
  PERFORM 1 FROM public.organizations WHERE id = NEW.organization_id FOR UPDATE;

  SELECT count(*) INTO v_used
  FROM public.rfqs
  WHERE organization_id = NEW.organization_id
    AND created_at >= v_month_start
    AND created_at < v_month_start + interval '1 month';

  IF v_used >= v_allowance THEN
    RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). You have used all RFQs in this month''s pilot allowance. It resets on the 1st of next month.', v_allowance
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_pilot_rfq_allowance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_pilot_rfq_allowance ON public.rfqs;
CREATE TRIGGER trg_enforce_pilot_rfq_allowance
  BEFORE INSERT ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.enforce_pilot_rfq_allowance();

-- ---------------------------------------------------------------------------
-- 13. Post-condition: no always-true guard left on any public SECURITY DEFINER
-- ---------------------------------------------------------------------------

DO $verify$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
  INTO v_left
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND (
      p.prosrc ~* 'auth\.role\(\)\s*=\s*''(authenticated|anon)'''
      OR p.prosrc ~* 'auth\.role\(\)\s+IN\s*\([^)]*''(authenticated|anon)'''
      OR p.prosrc ~* 'current_user\s+IN\s*\(\s*''postgres'''
    );

  IF v_left IS NOT NULL THEN
    RAISE WARNING '00199: SECURITY DEFINER functions outside the migration chain still reference anon/authenticated role checks, review manually: %', v_left;
  END IF;
END
$verify$;

COMMIT;
