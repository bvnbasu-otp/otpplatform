-- OTP core schema (see docs/OTP-DOMAIN-MODEL.md)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Identity & tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  org_type        org_type NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id      uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  email             text NOT NULL,
  full_name         text NOT NULL,
  is_platform_admin boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  profile_id      uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  role            org_member_role NOT NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, profile_id)
);

CREATE INDEX idx_org_members_org ON organization_members (organization_id);
CREATE INDEX idx_org_members_profile ON organization_members (profile_id);

CREATE TABLE suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  source        supplier_source NOT NULL DEFAULT 'DIRECT',
  source_ref    text,
  status        supplier_status NOT NULL DEFAULT 'PENDING',
  service_area  jsonb,
  address       jsonb,
  contact_phone text,
  contact_email text,
  categories    text[] NOT NULL DEFAULT '{}',
  capabilities  jsonb,
  rating_avg    numeric(3, 2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_status ON suppliers (status);
CREATE INDEX idx_suppliers_categories ON suppliers USING gin (categories);

CREATE TABLE supplier_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  role        supplier_user_role NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, profile_id)
);

CREATE INDEX idx_supplier_users_profile ON supplier_users (profile_id);

-- ---------------------------------------------------------------------------
-- Procurement core
-- ---------------------------------------------------------------------------

CREATE TABLE requirements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  created_by       uuid NOT NULL REFERENCES profiles (id),
  requirement_type requirement_type NOT NULL,
  status           requirement_status NOT NULL DEFAULT 'DRAFT',
  title            text NOT NULL,
  description      text,
  structured_specs jsonb,
  published_at     timestamptz,
  closed_at        timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_requirements_org ON requirements (organization_id);
CREATE INDEX idx_requirements_status ON requirements (status);

CREATE TABLE rfqs (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id               uuid NOT NULL UNIQUE REFERENCES requirements (id) ON DELETE CASCADE,
  organization_id              uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  status                       rfq_status NOT NULL DEFAULT 'DRAFT',
  reveal_status                rfq_reveal_status NOT NULL DEFAULT 'BLIND',
  title                        text NOT NULL,
  quote_deadline               timestamptz,
  evaluation_deadline          timestamptz,
  buyer_anonymous_to_suppliers boolean NOT NULL DEFAULT false,
  min_quotes_required          integer NOT NULL DEFAULT 1,
  created_by                   uuid NOT NULL REFERENCES profiles (id),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfqs_org ON rfqs (organization_id);
CREATE INDEX idx_rfqs_status ON rfqs (status);

CREATE TABLE rfq_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id           uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  anonymous_label  text NOT NULL,
  status           invite_status NOT NULL DEFAULT 'INVITED',
  match_score      numeric(5, 2),
  match_reasons    text[],
  invited_at       timestamptz NOT NULL DEFAULT now(),
  viewed_at        timestamptz,
  declined_at      timestamptz,
  decline_reason   text,
  UNIQUE (rfq_id, supplier_id),
  UNIQUE (rfq_id, anonymous_label)
);

CREATE INDEX idx_rfq_invitations_rfq ON rfq_invitations (rfq_id);
CREATE INDEX idx_rfq_invitations_supplier ON rfq_invitations (supplier_id);

CREATE TABLE quotes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id           uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  supplier_id      uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  invitation_id    uuid NOT NULL REFERENCES rfq_invitations (id) ON DELETE CASCADE,
  status           quote_status NOT NULL DEFAULT 'DRAFT',
  current_version  integer NOT NULL DEFAULT 0,
  evaluation_score numeric(5, 2),
  submitted_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, supplier_id),
  UNIQUE (invitation_id)
);

CREATE INDEX idx_quotes_rfq ON quotes (rfq_id);
CREATE INDEX idx_quotes_supplier ON quotes (supplier_id);

CREATE TABLE quote_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id   uuid NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  version    integer NOT NULL,
  snapshot   jsonb NOT NULL,
  notes      text,
  created_by uuid NOT NULL REFERENCES profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, version)
);

CREATE INDEX idx_quote_versions_quote ON quote_versions (quote_id);

CREATE TABLE quote_evaluations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          uuid NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  rfq_id            uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  version_evaluated integer NOT NULL,
  evaluation_score  numeric(5, 2) NOT NULL,
  breakdown         jsonb,
  status            evaluation_status NOT NULL DEFAULT 'PENDING',
  computed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_evaluations_rfq ON quote_evaluations (rfq_id);
CREATE INDEX idx_quote_evaluations_quote ON quote_evaluations (quote_id);

-- ---------------------------------------------------------------------------
-- Governance
-- ---------------------------------------------------------------------------

CREATE TABLE committee_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id, profile_id)
);

CREATE INDEX idx_committee_assignments_rfq ON committee_assignments (rfq_id);

CREATE TABLE conflict_of_interest_declarations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id      uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  status      coi_status NOT NULL,
  description text,
  declared_at timestamptz NOT NULL DEFAULT now(),
  waived_by   uuid REFERENCES profiles (id),
  waived_at   timestamptz
);

CREATE INDEX idx_coi_rfq ON conflict_of_interest_declarations (rfq_id);

CREATE TABLE committee_votes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id               uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  profile_id           uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  recommended_quote_id uuid REFERENCES quotes (id),
  choice               vote_choice NOT NULL,
  comment              text,
  cast_at              timestamptz NOT NULL DEFAULT now(),
  locked_at            timestamptz,
  UNIQUE (rfq_id, profile_id)
);

CREATE INDEX idx_committee_votes_rfq ON committee_votes (rfq_id);

CREATE TABLE approval_policies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  policy_type     approval_policy_type NOT NULL,
  threshold       jsonb NOT NULL DEFAULT '{}',
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approval_policies_org ON approval_policies (organization_id);

CREATE TABLE approval_instances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id       uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  policy_id    uuid NOT NULL REFERENCES approval_policies (id),
  status       approval_instance_status NOT NULL DEFAULT 'PENDING',
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

CREATE INDEX idx_approval_instances_rfq ON approval_instances (rfq_id);

-- ---------------------------------------------------------------------------
-- Decision & fulfillment
-- ---------------------------------------------------------------------------

CREATE TABLE awards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id        uuid NOT NULL UNIQUE REFERENCES rfqs (id) ON DELETE CASCADE,
  quote_id      uuid NOT NULL REFERENCES quotes (id),
  awarded_by    uuid NOT NULL REFERENCES profiles (id),
  justification jsonb NOT NULL,
  status        award_status NOT NULL DEFAULT 'PENDING_REVEAL',
  awarded_at    timestamptz NOT NULL DEFAULT now(),
  revealed_at   timestamptz
);

CREATE INDEX idx_awards_quote ON awards (quote_id);

CREATE TABLE purchase_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id        uuid NOT NULL UNIQUE REFERENCES awards (id),
  rfq_id          uuid NOT NULL REFERENCES rfqs (id),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  supplier_id     uuid NOT NULL REFERENCES suppliers (id),
  po_number       text NOT NULL,
  status          purchase_order_status NOT NULL DEFAULT 'DRAFT',
  total_amount    numeric(14, 2) NOT NULL,
  currency        text NOT NULL DEFAULT 'INR',
  issued_at       timestamptz,
  acknowledged_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_purchase_orders_org ON purchase_orders (organization_id);
CREATE INDEX idx_purchase_orders_supplier ON purchase_orders (supplier_id);

CREATE TABLE work_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
  supplier_id       uuid NOT NULL REFERENCES suppliers (id),
  status            work_order_status NOT NULL DEFAULT 'NOT_STARTED',
  title             text NOT NULL,
  scheduled_start   timestamptz,
  actual_start      timestamptz,
  completed_at      timestamptz,
  progress_percent  integer NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  dispute_status    dispute_status NOT NULL DEFAULT 'NONE',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_orders_po ON work_orders (purchase_order_id);

CREATE TABLE invoices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id  uuid NOT NULL REFERENCES work_orders (id) ON DELETE CASCADE,
  supplier_id    uuid NOT NULL REFERENCES suppliers (id),
  invoice_number text NOT NULL,
  amount         numeric(14, 2) NOT NULL,
  currency       text NOT NULL DEFAULT 'INR',
  status         invoice_status NOT NULL DEFAULT 'SUBMITTED',
  document_url   text,
  submitted_at   timestamptz NOT NULL DEFAULT now(),
  approved_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_work_order ON invoices (work_order_id);

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  amount          numeric(14, 2) NOT NULL,
  currency        text NOT NULL DEFAULT 'INR',
  method          payment_method NOT NULL,
  status          payment_status NOT NULL DEFAULT 'RECORDED',
  gateway_status  payment_gateway_status NOT NULL DEFAULT 'NOT_APPLICABLE',
  reference       text,
  recorded_by     uuid NOT NULL REFERENCES profiles (id),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  verified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_invoice ON payments (invoice_id);

CREATE TABLE procurement_performance_records (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id          uuid NOT NULL REFERENCES suppliers (id),
  rfq_id               uuid NOT NULL REFERENCES rfqs (id),
  organization_id      uuid NOT NULL REFERENCES organizations (id),
  quoted_total         numeric(14, 2) NOT NULL,
  actual_total         numeric(14, 2),
  quoted_delivery_days integer NOT NULL,
  actual_delivery_days integer,
  quality_rating       numeric(2, 1) CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
  variance             jsonb,
  recorded_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_performance_supplier ON procurement_performance_records (supplier_id);
CREATE INDEX idx_performance_rfq ON procurement_performance_records (rfq_id);

-- ---------------------------------------------------------------------------
-- Observability & billing schema
-- ---------------------------------------------------------------------------

CREATE TABLE audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  actor_id        uuid REFERENCES profiles (id),
  organization_id uuid REFERENCES organizations (id),
  entity_type     text NOT NULL,
  entity_id       text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}',
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  correlation_id  text
);

CREATE INDEX idx_audit_events_org ON audit_events (organization_id);
CREATE INDEX idx_audit_events_entity ON audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_events_occurred ON audit_events (occurred_at DESC);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  channel    notification_channel NOT NULL,
  status     notification_status NOT NULL DEFAULT 'PENDING',
  event_type text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_profile ON notifications (profile_id);

CREATE TABLE subscription_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text,
  price_monthly numeric(14, 2) NOT NULL DEFAULT 0,
  currency      text NOT NULL DEFAULT 'INR',
  features      jsonb NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Append-only enforcement (audit_events)
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only: UPDATE and DELETE forbidden (INV-071, INV-072)';
END;
$$;

CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_audit_mutation();

CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_audit_mutation();

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER suppliers_updated_at
  BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER requirements_updated_at
  BEFORE UPDATE ON requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER rfqs_updated_at
  BEFORE UPDATE ON rfqs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quotes_updated_at
  BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER approval_policies_updated_at
  BEFORE UPDATE ON approval_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER work_orders_updated_at
  BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
