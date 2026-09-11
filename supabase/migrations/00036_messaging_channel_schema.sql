-- WhatsApp/SMS supplier access layer — schema.
--
-- A local contractor with a phone and no patience for a signup form is still a
-- capable bidder. This lets one receive an enquiry and answer it with a price,
-- then finish the structured quote on the web only if they want to.
--
-- The messaging channel is an ACCESS layer, not a second procurement system.
-- Everything it produces lands in the existing quotes / quote_versions tables,
-- goes through the existing evaluation engine, and is subject to the same blind
-- rules. There is no parallel bidding path to keep in sync.
--
-- Two boundaries this schema exists to hold:
--
--   1. Buyers must never reach a supplier's phone number or identity through
--      this layer. Every table here is keyed by supplier, so none of them grant
--      buyer access at all; buyers see delivery state through one alias-only
--      view instead.
--
--   2. A provider that retries a webhook must not produce a second quote.
--      Idempotency is a uniqueness constraint in the database, not a check in
--      application code that a concurrent retry could race past.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE messaging_channel AS ENUM ('SMS', 'WHATSAPP');

-- MOCK is a first-class provider, not a test fixture: the demo has to run a
-- complete supplier journey on a laptop with no messaging credentials.
CREATE TYPE messaging_provider AS ENUM ('TWILIO', 'META', 'MOCK');

CREATE TYPE messaging_direction AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE messaging_channel_status AS ENUM (
  'PENDING',
  'VERIFIED',
  'SUSPENDED',
  'RETIRED'
);

CREATE TYPE messaging_processing_status AS ENUM (
  'RECEIVED',
  'ACCEPTED',
  'REJECTED',
  'UNPARSEABLE',
  'DUPLICATE',
  'FAILED'
);

CREATE TYPE notification_delivery_status AS ENUM (
  'QUEUED',
  'SENT',
  'DELIVERED',
  'READ',
  'FAILED'
);

-- Where a quote came from. Recorded for audit and for the supplier's own
-- history; deliberately NOT an input to evaluation or ranking, because how a
-- bid arrived says nothing about whether it is the best bid.
CREATE TYPE quote_source AS ENUM ('WEB', 'WHATSAPP', 'SMS', 'DEMO_GENERATED');

-- An indicative price texted in is not a submitted quote. It needs its own
-- status so it can be held out of the buyer's comparison until the supplier
-- completes and submits it.
ALTER TYPE quote_status ADD VALUE IF NOT EXISTS 'DRAFT_FROM_MESSAGING' AFTER 'DRAFT';

-- ---------------------------------------------------------------------------
-- Supplier phone mapping
-- ---------------------------------------------------------------------------

CREATE TABLE supplier_messaging_channels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  channel     messaging_channel NOT NULL,
  phone_e164  text NOT NULL,
  verified_at timestamptz,
  status      messaging_channel_status NOT NULL DEFAULT 'PENDING',
  /** Which provider last confirmed we can reach this number. */
  last_provider messaging_provider,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- E.164 and nothing else. Inbound routing looks a supplier up by this exact
  -- string, so a number stored in any other shape is a number that can never
  -- receive a reply.
  CONSTRAINT supplier_messaging_channels_e164
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- VERIFIED means someone proved they hold the number. One-directional on
  -- purpose: a supplier who texts STOP is suspended but stays proven, so
  -- texting START later restores them instead of restarting verification.
  CONSTRAINT supplier_messaging_channels_verified_has_timestamp
    CHECK (status <> 'VERIFIED' OR verified_at IS NOT NULL),
  UNIQUE (supplier_id, channel, phone_e164)
);

-- One live owner per number per channel. Without this, an inbound message could
-- match two suppliers and the gateway would have to guess whose bid it is.
-- Retired rows are excluded so a number can legitimately move businesses.
CREATE UNIQUE INDEX idx_supplier_messaging_channels_live_number
  ON supplier_messaging_channels (channel, phone_e164)
  WHERE status <> 'RETIRED';

CREATE INDEX idx_supplier_messaging_channels_supplier
  ON supplier_messaging_channels (supplier_id, status);

CREATE TRIGGER supplier_messaging_channels_updated_at
  BEFORE UPDATE ON supplier_messaging_channels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE supplier_messaging_channels IS
  'Verified phone numbers a supplier can bid from. Never exposed to buyers.';

-- ---------------------------------------------------------------------------
-- Inbound message log
-- ---------------------------------------------------------------------------

CREATE TABLE messaging_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            messaging_provider NOT NULL,
  channel             messaging_channel NOT NULL,
  direction           messaging_direction NOT NULL,
  external_message_id text,
  phone_e164          text,
  supplier_id         uuid REFERENCES suppliers (id) ON DELETE SET NULL,
  rfq_id              uuid REFERENCES rfqs (id) ON DELETE SET NULL,
  /**
   * Exactly what the provider sent, for dispute resolution. Credentials and
   * signature headers are stripped before this is written: the payload is
   * evidence of what a supplier said, not a place to keep secrets.
   */
  raw_payload         jsonb NOT NULL DEFAULT '{}',
  normalized_message  text,
  processing_status   messaging_processing_status NOT NULL DEFAULT 'RECEIVED',
  error_code          text,
  /** The quote this message created or revised, when it produced one. */
  quote_id            uuid REFERENCES quotes (id) ON DELETE SET NULL,
  is_demo             boolean NOT NULL DEFAULT false,
  /**
   * Which demo run this belongs to, following the audit trail's approach: a
   * reset starts a new run rather than deleting history, so a message thread
   * from the last demo stays attributable and simply stops being shown.
   */
  demo_run_id         uuid DEFAULT private.demo_run_id(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  processed_at        timestamptz
);

-- The idempotency key. A provider retrying delivery of the same message must
-- collide here rather than produce a second quote.
CREATE UNIQUE INDEX idx_messaging_events_provider_message
  ON messaging_events (provider, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX idx_messaging_events_supplier ON messaging_events (supplier_id, created_at DESC);
CREATE INDEX idx_messaging_events_rfq ON messaging_events (rfq_id, created_at DESC);
CREATE INDEX idx_messaging_events_phone ON messaging_events (phone_e164, created_at DESC);

COMMENT ON TABLE messaging_events IS
  'Every inbound supplier message, with provider + external_message_id as the idempotency key.';

-- ---------------------------------------------------------------------------
-- Outbound notification log
-- ---------------------------------------------------------------------------

CREATE TABLE supplier_notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id              uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  supplier_id         uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  invitation_id       uuid REFERENCES rfq_invitations (id) ON DELETE SET NULL,
  channel             messaging_channel NOT NULL,
  provider            messaging_provider NOT NULL,
  template_id         text,
  external_message_id text,
  status              notification_delivery_status NOT NULL DEFAULT 'QUEUED',
  /**
   * The message as sent. Kept so we can prove what a supplier was told about
   * the enquiry — and so a policy regression is visible in the record rather
   * than only in a diff.
   */
  body                text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  failure_reason      text,
  is_demo             boolean NOT NULL DEFAULT false,
  demo_run_id         uuid DEFAULT private.demo_run_id(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_notifications_failure_has_reason
    CHECK (status <> 'FAILED' OR failure_reason IS NOT NULL)
);

CREATE UNIQUE INDEX idx_supplier_notifications_provider_message
  ON supplier_notifications (provider, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE INDEX idx_supplier_notifications_rfq ON supplier_notifications (rfq_id, status);
CREATE INDEX idx_supplier_notifications_supplier
  ON supplier_notifications (supplier_id, created_at DESC);

CREATE TRIGGER supplier_notifications_updated_at
  BEFORE UPDATE ON supplier_notifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE supplier_notifications IS
  'Outbound RFQ notifications and their delivery state. Buyers read this only through rfq_notification_status.';

-- ---------------------------------------------------------------------------
-- One-time supplier access links
-- ---------------------------------------------------------------------------

CREATE TABLE supplier_magic_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  rfq_id      uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  /**
   * SHA-256 of the token. The plaintext exists only in the message we sent, so
   * a copy of this table is not a set of working keys, and it carries nothing
   * about the supplier — the mapping is here, not in the token.
   */
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  /** Recorded on redemption so a stolen link leaves a trace. */
  used_from   text,
  channel     messaging_channel,
  is_demo     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supplier_magic_links_hash_shape CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  -- Short-lived by construction. A link that outlives the enquiry is a standing
  -- key to someone else's bid.
  CONSTRAINT supplier_magic_links_short_lived
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')
);

CREATE INDEX idx_supplier_magic_links_supplier_rfq
  ON supplier_magic_links (supplier_id, rfq_id, created_at DESC);

COMMENT ON TABLE supplier_magic_links IS
  'Single-use, short-lived supplier access tokens, stored only as hashes.';

-- ---------------------------------------------------------------------------
-- Scoped quoting sessions
--
-- A supplier who arrived by SMS has no account, so redeeming a magic link
-- cannot produce a normal sign-in. Rather than manufacture an auth user for
-- someone who never registered — and hand them a session that could read their
-- whole supplier record — redemption issues a capability scoped to exactly one
-- enquiry: quote on this RFQ as this supplier, and nothing else.
--
-- That is the least authority that makes the journey work, and it expires.
-- ---------------------------------------------------------------------------

CREATE TABLE supplier_quote_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  rfq_id        uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  magic_link_id uuid REFERENCES supplier_magic_links (id) ON DELETE SET NULL,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  is_demo       boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,

  CONSTRAINT supplier_quote_sessions_hash_shape CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT supplier_quote_sessions_short_lived
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 day')
);

CREATE INDEX idx_supplier_quote_sessions_supplier
  ON supplier_quote_sessions (supplier_id, rfq_id, created_at DESC);

COMMENT ON TABLE supplier_quote_sessions IS
  'Short-lived capability tokens scoped to one supplier and one RFQ. Stored only as hashes.';

-- ---------------------------------------------------------------------------
-- Rate limiting
--
-- Counted in the database rather than in a process, because the webhook and the
-- magic-link endpoint are stateless functions that may run on different
-- instances. A limiter that lives in one instance's memory is not a limiter.
-- ---------------------------------------------------------------------------

CREATE TABLE messaging_rate_limits (
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX idx_messaging_rate_limits_window ON messaging_rate_limits (window_start);

COMMENT ON TABLE messaging_rate_limits IS
  'Fixed-window counters for messaging endpoints. Rows older than a day are disposable.';

-- ---------------------------------------------------------------------------
-- Quote provenance
--
-- Reusing the existing quote model, as the channel is an access layer. Only the
-- provenance is new: money and terms stay in quote_versions.snapshot so the
-- evaluation engine, the blind views and the audit trail keep working unchanged.
-- ---------------------------------------------------------------------------

ALTER TABLE quotes
  ADD COLUMN source quote_source NOT NULL DEFAULT 'WEB',
  ADD COLUMN received_at timestamptz;

COMMENT ON COLUMN quotes.source IS
  'How the quote reached us. Audit and supplier history only — never an evaluation input.';

-- A bid that arrived by SMS was authored by a verified handset, not by an
-- account, and a contractor who has never signed in has no profile to point at.
-- The honest record is NULL here plus the messaging_events row that links the
-- phone, the message text and the quote — so attribution is not lost, it is kept
-- where it actually exists. Web quotes are unaffected and still name their author.
ALTER TABLE quote_versions
  ALTER COLUMN created_by DROP NOT NULL;

COMMENT ON COLUMN quote_versions.created_by IS
  'Profile that authored this version. NULL when the version arrived through the messaging gateway; see messaging_events.quote_id for the sender.';

-- ---------------------------------------------------------------------------
-- RLS
--
-- The shape of every policy below: suppliers see their own rows, platform
-- admins see everything, buyers see nothing. Writes happen through the
-- SECURITY DEFINER gateway functions in the next migration, so there are no
-- INSERT or UPDATE policies for authenticated users at all.
-- ---------------------------------------------------------------------------

ALTER TABLE supplier_messaging_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_magic_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_quote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messaging_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_messaging_channels_select ON supplier_messaging_channels
  FOR SELECT TO authenticated
  USING (private.is_supplier_user_for(supplier_id) OR private.is_platform_admin());

CREATE POLICY messaging_events_select ON messaging_events
  FOR SELECT TO authenticated
  USING (
    (supplier_id IS NOT NULL AND private.is_supplier_user_for(supplier_id))
    OR private.is_platform_admin()
  );

CREATE POLICY supplier_notifications_select ON supplier_notifications
  FOR SELECT TO authenticated
  USING (private.is_supplier_user_for(supplier_id) OR private.is_platform_admin());

-- Not even the owning supplier reads its own token hashes. Nothing needs to,
-- and a readable hash is a hash someone can grind offline.
CREATE POLICY supplier_magic_links_admin_select ON supplier_magic_links
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

CREATE POLICY supplier_quote_sessions_admin_select ON supplier_quote_sessions
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

-- Counters are infrastructure. No client has any reason to read them, and a
-- readable limiter tells an attacker exactly how much room is left.
CREATE POLICY messaging_rate_limits_admin_select ON messaging_rate_limits
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

GRANT SELECT ON supplier_messaging_channels, messaging_events,
  supplier_notifications, supplier_magic_links, supplier_quote_sessions,
  messaging_rate_limits TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_messaging_channels,
  messaging_events, supplier_notifications, supplier_magic_links,
  supplier_quote_sessions, messaging_rate_limits TO service_role;
