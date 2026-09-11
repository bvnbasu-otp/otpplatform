-- Row Level Security policies (see docs/OTP-BUSINESS-RULES.md INV-031+)

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rfq_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_of_interest_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE committee_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_performance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------

CREATE POLICY organizations_select ON organizations
  FOR SELECT TO authenticated
  USING (private.is_org_member(id) OR private.is_platform_admin());

CREATE POLICY organizations_insert ON organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY organizations_update ON organizations
  FOR UPDATE TO authenticated
  USING (private.get_org_role(id) = 'OWNER' OR private.is_platform_admin())
  WITH CHECK (private.get_org_role(id) = 'OWNER' OR private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR private.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM organization_members om1
      JOIN organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.profile_id = profiles.id
        AND om2.profile_id = private.get_profile_id()
    )
    OR EXISTS (
      SELECT 1
      FROM supplier_users su1
      JOIN supplier_users su2 ON su1.supplier_id = su2.supplier_id
      WHERE su1.profile_id = profiles.id
        AND su2.profile_id = private.get_profile_id()
    )
  );

CREATE POLICY profiles_insert ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR private.is_platform_admin())
  WITH CHECK (auth_user_id = auth.uid() OR private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------

CREATE POLICY org_members_select ON organization_members
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

CREATE POLICY org_members_insert ON organization_members
  FOR INSERT TO authenticated
  WITH CHECK (
    private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
    OR private.is_platform_admin()
  );

CREATE POLICY org_members_update ON organization_members
  FOR UPDATE TO authenticated
  USING (private.get_org_role(organization_id) = 'OWNER' OR private.is_platform_admin())
  WITH CHECK (private.get_org_role(organization_id) = 'OWNER' OR private.is_platform_admin());

CREATE POLICY org_members_delete ON organization_members
  FOR DELETE TO authenticated
  USING (private.get_org_role(organization_id) = 'OWNER' OR private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- suppliers — identity hidden from buyers until reveal (via views / PO path)
-- ---------------------------------------------------------------------------

CREATE POLICY suppliers_select_supplier_user ON suppliers
  FOR SELECT TO authenticated
  USING (
    private.is_supplier_user_for(id)
    OR private.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM purchase_orders po
      WHERE po.supplier_id = suppliers.id
        AND private.is_org_member(po.organization_id)
        AND private.rfq_reveal_status(po.rfq_id) = 'REVEALED'
    )
  );

CREATE POLICY suppliers_insert ON suppliers
  FOR INSERT TO authenticated
  WITH CHECK (private.is_platform_admin());

CREATE POLICY suppliers_update ON suppliers
  FOR UPDATE TO authenticated
  USING (private.is_supplier_user_for(id) OR private.is_platform_admin())
  WITH CHECK (private.is_supplier_user_for(id) OR private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- supplier_users
-- ---------------------------------------------------------------------------

CREATE POLICY supplier_users_select ON supplier_users
  FOR SELECT TO authenticated
  USING (
    profile_id = private.get_profile_id()
    OR private.is_supplier_user_for(supplier_id)
    OR private.is_platform_admin()
  );

CREATE POLICY supplier_users_insert ON supplier_users
  FOR INSERT TO authenticated
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- requirements — org isolation
-- ---------------------------------------------------------------------------

CREATE POLICY requirements_select ON requirements
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

CREATE POLICY requirements_insert ON requirements
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_org_member(organization_id)
    AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER', 'BUYER')
  );

CREATE POLICY requirements_update ON requirements
  FOR UPDATE TO authenticated
  USING (
    private.is_org_member(organization_id)
    AND (
      private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
      OR (created_by = private.get_profile_id() AND status = 'DRAFT')
    )
  )
  WITH CHECK (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- rfqs
-- ---------------------------------------------------------------------------

CREATE POLICY rfqs_select_buyer ON rfqs
  FOR SELECT TO authenticated
  USING (private.can_access_rfq_as_buyer(id));

CREATE POLICY rfqs_select_supplier ON rfqs
  FOR SELECT TO authenticated
  USING (private.has_rfq_invitation(id));

CREATE POLICY rfqs_insert ON rfqs
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_org_member(organization_id)
    AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER', 'BUYER')
  );

CREATE POLICY rfqs_update ON rfqs
  FOR UPDATE TO authenticated
  USING (
    private.is_org_member(organization_id)
    AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER', 'BUYER')
  )
  WITH CHECK (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- rfq_invitations — NO direct buyer SELECT (use blind/manager views)
-- ---------------------------------------------------------------------------

CREATE POLICY rfq_invitations_select_supplier ON rfq_invitations
  FOR SELECT TO authenticated
  USING (private.is_supplier_user_for(supplier_id));

CREATE POLICY rfq_invitations_insert ON rfq_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_org_manager_or_above(private.rfq_org_id(rfq_id))
    OR private.is_platform_admin()
  );

CREATE POLICY rfq_invitations_update_supplier ON rfq_invitations
  FOR UPDATE TO authenticated
  USING (private.is_supplier_user_for(supplier_id))
  WITH CHECK (private.is_supplier_user_for(supplier_id));

-- ---------------------------------------------------------------------------
-- quotes — suppliers only on base table; buyers use blind views
-- ---------------------------------------------------------------------------

CREATE POLICY quotes_select_supplier ON quotes
  FOR SELECT TO authenticated
  USING (private.is_supplier_user_for(supplier_id));

CREATE POLICY quotes_insert_supplier ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (private.is_supplier_user_for(supplier_id));

CREATE POLICY quotes_update_supplier ON quotes
  FOR UPDATE TO authenticated
  USING (private.is_supplier_user_for(supplier_id))
  WITH CHECK (private.is_supplier_user_for(supplier_id));

-- ---------------------------------------------------------------------------
-- quote_versions — INSERT only for supplier; NO UPDATE/DELETE
-- ---------------------------------------------------------------------------

CREATE POLICY quote_versions_select_supplier ON quote_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_versions.quote_id
        AND private.is_supplier_user_for(q.supplier_id)
    )
  );

CREATE POLICY quote_versions_insert_supplier ON quote_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = quote_versions.quote_id
        AND private.is_supplier_user_for(q.supplier_id)
    )
    AND created_by = private.get_profile_id()
  );

-- ---------------------------------------------------------------------------
-- quote_evaluations — buyer org + committee
-- ---------------------------------------------------------------------------

CREATE POLICY quote_evaluations_select ON quote_evaluations
  FOR SELECT TO authenticated
  USING (
    private.can_access_rfq_as_buyer(rfq_id)
    OR private.can_access_rfq_as_committee(rfq_id)
  );

CREATE POLICY quote_evaluations_insert ON quote_evaluations
  FOR INSERT TO authenticated
  WITH CHECK (private.is_platform_admin());

CREATE POLICY quote_evaluations_update ON quote_evaluations
  FOR UPDATE TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- committee_assignments
-- ---------------------------------------------------------------------------

CREATE POLICY committee_assignments_select ON committee_assignments
  FOR SELECT TO authenticated
  USING (
    private.can_access_rfq_as_buyer(rfq_id)
    OR profile_id = private.get_profile_id()
  );

CREATE POLICY committee_assignments_insert ON committee_assignments
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_manager_or_above(private.rfq_org_id(rfq_id)));

-- ---------------------------------------------------------------------------
-- conflict_of_interest_declarations
-- ---------------------------------------------------------------------------

CREATE POLICY coi_select ON conflict_of_interest_declarations
  FOR SELECT TO authenticated
  USING (private.can_access_rfq_as_buyer(rfq_id));

CREATE POLICY coi_insert ON conflict_of_interest_declarations
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = private.get_profile_id()
    AND (
      private.can_access_rfq_as_committee(rfq_id)
      OR private.get_org_role(private.rfq_org_id(rfq_id)) = 'APPROVER'
    )
  );

CREATE POLICY coi_update_waive ON conflict_of_interest_declarations
  FOR UPDATE TO authenticated
  USING (private.is_org_manager_or_above(private.rfq_org_id(rfq_id)))
  WITH CHECK (private.is_org_manager_or_above(private.rfq_org_id(rfq_id)));

-- ---------------------------------------------------------------------------
-- committee_votes — INSERT only; NO UPDATE/DELETE (INV-026 / INV-095)
-- ---------------------------------------------------------------------------

CREATE POLICY committee_votes_select ON committee_votes
  FOR SELECT TO authenticated
  USING (
    private.can_access_rfq_as_buyer(rfq_id)
    AND private.get_org_role(private.rfq_org_id(rfq_id)) IN (
      'OWNER', 'MANAGER', 'APPROVER', 'COMMITTEE_MEMBER'
    )
  );

CREATE POLICY committee_votes_insert ON committee_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id = private.get_profile_id()
    AND private.can_access_rfq_as_committee(rfq_id)
    AND NOT private.is_vote_locked(rfq_id)
    AND EXISTS (
      SELECT 1 FROM rfqs r
      WHERE r.id = rfq_id AND r.status = 'EVALUATING'
    )
  );

-- ---------------------------------------------------------------------------
-- approval_policies & instances
-- ---------------------------------------------------------------------------

CREATE POLICY approval_policies_select ON approval_policies
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

CREATE POLICY approval_policies_insert ON approval_policies
  FOR INSERT TO authenticated
  WITH CHECK (private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'));

CREATE POLICY approval_instances_select ON approval_instances
  FOR SELECT TO authenticated
  USING (private.can_access_rfq_as_buyer(rfq_id));

CREATE POLICY approval_instances_insert ON approval_instances
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_manager_or_above(private.rfq_org_id(rfq_id)));

CREATE POLICY approval_instances_update ON approval_instances
  FOR UPDATE TO authenticated
  USING (private.can_access_rfq_as_buyer(rfq_id))
  WITH CHECK (private.can_access_rfq_as_buyer(rfq_id));

-- ---------------------------------------------------------------------------
-- awards
-- ---------------------------------------------------------------------------

CREATE POLICY awards_select ON awards
  FOR SELECT TO authenticated
  USING (
    private.can_access_rfq_as_buyer(rfq_id)
    OR EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.id = awards.quote_id
        AND private.is_supplier_user_for(q.supplier_id)
        AND awards.status = 'REVEALED'
    )
  );

CREATE POLICY awards_insert ON awards
  FOR INSERT TO authenticated
  WITH CHECK (
    private.get_org_role(private.rfq_org_id(rfq_id)) IN ('OWNER', 'MANAGER', 'APPROVER')
  );

CREATE POLICY awards_update ON awards
  FOR UPDATE TO authenticated
  USING (private.is_org_manager_or_above(private.rfq_org_id(rfq_id)))
  WITH CHECK (private.is_org_manager_or_above(private.rfq_org_id(rfq_id)));

-- ---------------------------------------------------------------------------
-- purchase_orders, work_orders, invoices, payments
-- ---------------------------------------------------------------------------

CREATE POLICY purchase_orders_select ON purchase_orders
  FOR SELECT TO authenticated
  USING (
    private.is_org_member(organization_id)
    OR private.is_supplier_user_for(supplier_id)
  );

CREATE POLICY purchase_orders_insert ON purchase_orders
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_manager_or_above(organization_id));

CREATE POLICY purchase_orders_update ON purchase_orders
  FOR UPDATE TO authenticated
  USING (
    private.is_org_manager_or_above(organization_id)
    OR private.is_supplier_user_for(supplier_id)
  )
  WITH CHECK (
    private.is_org_manager_or_above(organization_id)
    OR private.is_supplier_user_for(supplier_id)
  );

CREATE POLICY work_orders_select ON work_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = work_orders.purchase_order_id
        AND (
          private.is_org_member(po.organization_id)
          OR private.is_supplier_user_for(work_orders.supplier_id)
        )
    )
  );

CREATE POLICY work_orders_update ON work_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = work_orders.purchase_order_id
        AND (
          private.is_org_manager_or_above(po.organization_id)
          OR private.is_supplier_user_for(work_orders.supplier_id)
        )
    )
  )
  WITH CHECK (true);

CREATE POLICY invoices_select ON invoices
  FOR SELECT TO authenticated
  USING (
    private.is_supplier_user_for(supplier_id)
    OR EXISTS (
      SELECT 1
      FROM work_orders wo
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = invoices.work_order_id
        AND private.is_org_member(po.organization_id)
    )
  );

CREATE POLICY invoices_insert ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (private.is_supplier_user_for(supplier_id));

CREATE POLICY invoices_update ON invoices
  FOR UPDATE TO authenticated
  USING (
    private.is_supplier_user_for(supplier_id)
    OR EXISTS (
      SELECT 1
      FROM work_orders wo
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = invoices.work_order_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER', 'APPROVER')
    )
  )
  WITH CHECK (true);

CREATE POLICY payments_select ON payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM invoices i
      JOIN work_orders wo ON wo.id = i.work_order_id
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE i.id = payments.invoice_id
        AND (
          private.is_org_member(po.organization_id)
          OR private.is_supplier_user_for(i.supplier_id)
        )
    )
  );

CREATE POLICY payments_insert ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM invoices i
      JOIN work_orders wo ON wo.id = i.work_order_id
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE i.id = payments.invoice_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
    )
  );

CREATE POLICY payments_update ON payments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM invoices i
      JOIN work_orders wo ON wo.id = i.work_order_id
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE i.id = payments.invoice_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
    )
  )
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- procurement_performance_records
-- ---------------------------------------------------------------------------

CREATE POLICY performance_select ON procurement_performance_records
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

CREATE POLICY performance_insert ON procurement_performance_records
  FOR INSERT TO authenticated
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- audit_events — INSERT only; NO UPDATE/DELETE (INV-071–073)
-- ---------------------------------------------------------------------------

CREATE POLICY audit_events_select ON audit_events
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR (
      organization_id IS NOT NULL
      AND private.is_org_manager_or_above(organization_id)
    )
  );

CREATE POLICY audit_events_insert ON audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id IS NULL
    OR actor_id = private.get_profile_id()
    OR private.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

CREATE POLICY notifications_select ON notifications
  FOR SELECT TO authenticated
  USING (profile_id = private.get_profile_id());

CREATE POLICY notifications_insert ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (private.is_platform_admin());

CREATE POLICY notifications_update ON notifications
  FOR UPDATE TO authenticated
  USING (profile_id = private.get_profile_id())
  WITH CHECK (profile_id = private.get_profile_id());

-- ---------------------------------------------------------------------------
-- subscription_plans — read-only for authenticated
-- ---------------------------------------------------------------------------

CREATE POLICY subscription_plans_select ON subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY subscription_plans_admin ON subscription_plans
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Immutability triggers (quote_versions, committee_votes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.prevent_quote_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'quote_versions are append-only: UPDATE and DELETE forbidden (INV-064)';
END;
$$;

CREATE TRIGGER quote_versions_no_update
  BEFORE UPDATE ON quote_versions
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_quote_version_mutation();

CREATE TRIGGER quote_versions_no_delete
  BEFORE DELETE ON quote_versions
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_quote_version_mutation();

CREATE OR REPLACE FUNCTION private.prevent_committee_vote_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'committee_votes are immutable: UPDATE and DELETE forbidden (INV-095)';
END;
$$;

CREATE TRIGGER committee_votes_no_update
  BEFORE UPDATE ON committee_votes
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_committee_vote_mutation();

CREATE TRIGGER committee_votes_no_delete
  BEFORE DELETE ON committee_votes
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_committee_vote_mutation();
