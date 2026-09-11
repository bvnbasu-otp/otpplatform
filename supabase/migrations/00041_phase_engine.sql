-- The time-gated phase engine.
--
-- An enquiry runs through four phases with explicit windows: bidding,
-- clarification and revision, evaluation and voting, then award. Before this
-- migration the lifecycle was real but the clock was not, and the gap was not
-- uniform: the messaging gateway refused a late quote, while the web path
-- checked the deadline in the browser and the database accepted whatever
-- arrived. Two rules for one deadline means the rule is whichever route you took.
--
-- So the deadline moves into the database, on the write itself, where every
-- route passes through: the web form, the WhatsApp reply, the magic-link page and
-- anything built later. The client-side checks stay — they produce a better error
-- message than a constraint violation — but they are now a courtesy rather than
-- the control.
--
-- ---------------------------------------------------------------------------
-- On quote_deadline
--
-- The column already existed and the messaging gateway already reads it, so
-- rather than introduce a second, competing deadline this migration gives it one
-- precise meaning: THE MOMENT THE CURRENT QUOTING WINDOW CLOSES. It is bidding's
-- end while the enquiry is OPEN and revision's end once it moves to
-- CLARIFICATION, and a trigger moves it forward on that transition so no caller
-- has to remember to.
--
-- The planned dates are kept separately — bid_deadline, revision_deadline,
-- evaluation_deadline — so the schedule an enquiry was published with survives
-- the enquiry running. An explicit write to quote_deadline always wins, because
-- extending a window by a day is a thing a buyer legitimately does and the engine
-- should not argue with it.

-- ---------------------------------------------------------------------------
-- Phase columns
-- ---------------------------------------------------------------------------

ALTER TABLE rfqs
  -- Phase 1's end, kept for the record once quote_deadline has moved past it.
  ADD COLUMN bid_deadline        timestamptz,
  -- Phase 2's end: the last moment a price may change or a question be asked.
  ADD COLUMN revision_deadline   timestamptz,
  -- Phase starts, so a window can be shown as a window rather than a countdown.
  ADD COLUMN opened_at           timestamptz,
  ADD COLUMN clarification_at    timestamptz,
  ADD COLUMN evaluation_at       timestamptz;

COMMENT ON COLUMN rfqs.quote_deadline IS
  'The moment the CURRENT quoting window closes: bidding while OPEN, revision while CLARIFICATION. Enforced on every write path. Moved forward by the phase trigger unless a caller sets it explicitly.';
COMMENT ON COLUMN rfqs.bid_deadline IS
  'Planned end of phase 1. Retained after quote_deadline moves on, so the published schedule stays visible.';
COMMENT ON COLUMN rfqs.revision_deadline IS
  'Planned end of phase 2 — clarification and revised pricing. NULL means no window beyond the bid deadline was granted.';
COMMENT ON COLUMN rfqs.evaluation_deadline IS
  'End of phase 3. After this no committee vote is accepted. The award itself is not automatic and never will be.';

-- Existing rows. Anything already open has been quoting since it was created,
-- which is the best available answer and better than a NULL the interface would
-- have to apologise for.
UPDATE rfqs
SET bid_deadline = quote_deadline,
    opened_at = COALESCE(opened_at, created_at)
WHERE status <> 'DRAFT';

UPDATE rfqs SET bid_deadline = quote_deadline WHERE bid_deadline IS NULL;

-- ---------------------------------------------------------------------------
-- Keeping the window in step with the phase
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.sync_rfq_phase_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  -- An explicit write wins. A buyer extending a deadline by hand is the one case
  -- where the engine must not have an opinion, and on INSERT everything is
  -- explicit by definition.
  v_deadline_set boolean := TG_OP = 'INSERT'
    OR NEW.quote_deadline IS DISTINCT FROM OLD.quote_deadline;
BEGIN
  IF NEW.bid_deadline IS NULL THEN
    NEW.bid_deadline := NEW.quote_deadline;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'OPEN' THEN
    NEW.opened_at := COALESCE(NEW.opened_at, now());
    IF NOT v_deadline_set THEN
      NEW.quote_deadline := COALESCE(NEW.bid_deadline, NEW.quote_deadline);
    END IF;

  ELSIF NEW.status = 'CLARIFICATION' THEN
    NEW.clarification_at := COALESCE(NEW.clarification_at, now());
    IF v_deadline_set THEN
      -- The caller named the new window, so that is the revision deadline.
      NEW.revision_deadline := COALESCE(NEW.revision_deadline, NEW.quote_deadline);
    ELSE
      -- No revision window was granted, so prices stay frozen at the bid
      -- deadline. Deliberately not "bid deadline plus a few days": silently
      -- extending a window suppliers were given a date for is how a deadline
      -- stops meaning anything.
      NEW.quote_deadline := COALESCE(NEW.revision_deadline, NEW.bid_deadline, NEW.quote_deadline);
    END IF;

  ELSIF NEW.status = 'EVALUATING' THEN
    NEW.evaluation_at := COALESCE(NEW.evaluation_at, now());
    NEW.evaluation_deadline := COALESCE(
      NEW.evaluation_deadline,
      now() + interval '7 days'
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rfqs_phase_window
  BEFORE INSERT OR UPDATE ON rfqs
  FOR EACH ROW EXECUTE FUNCTION private.sync_rfq_phase_window();

-- ---------------------------------------------------------------------------
-- Reading the phase
-- ---------------------------------------------------------------------------

/**
 * Whether a price may be written right now, and why not if it may not.
 *
 * Returns a reason code rather than a boolean so the caller can say something
 * useful: "quoting has not opened", "the enquiry is being evaluated" and "you are
 * four hours late" are three different conversations.
 */
CREATE OR REPLACE FUNCTION private.quoting_refusal(p_rfq_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN 'NO_SUCH_RFQ';
  END IF;

  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION') THEN
    RETURN CASE v_rfq.status::text
      WHEN 'DRAFT' THEN 'NOT_OPEN_YET'
      ELSE 'QUOTING_CLOSED'
    END;
  END IF;

  IF v_rfq.quote_deadline IS NOT NULL AND v_rfq.quote_deadline <= now() THEN
    RETURN 'DEADLINE_PASSED';
  END IF;

  RETURN NULL;
END;
$$;

/** The end of the clarification phase, which is also the end of the Q&A thread. */
CREATE OR REPLACE FUNCTION private.clarification_ends(p_rfq_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(r.revision_deadline, r.quote_deadline, r.bid_deadline)
  FROM rfqs r WHERE r.id = p_rfq_id;
$$;

-- ---------------------------------------------------------------------------
-- Enforcement
--
-- On quote_versions rather than only on quotes, because the version row is where
-- a price actually lives: a revision inserts a version and updates a status, and
-- guarding the status alone would let a new number in after the window shut.
--
-- Two exemptions, and it is worth being precise about why each one is safe.
--
-- The demo write window: staging and reset replay a whole lifecycle inside one
-- transaction, where "now" is not the clock the scenario is describing.
--
-- A session that is not an API request at all: seeds, migrations, the scheduler
-- and an operator at a psql prompt, all of which legitimately write history —
-- a fixture describing an enquiry that closed last month has to be insertable.
-- Note what this does NOT exempt: a service-role API call. The messaging webhook
-- runs as service_role, and it is precisely the second route in that this
-- migration exists to hold to the same deadline as the first.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_api_call()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true), '') IS NOT NULL
      OR NULLIF(current_setting('request.method', true), '') IS NOT NULL;
$$;

COMMENT ON FUNCTION private.is_api_call() IS
  'True when the statement arrived over the API, false for a direct database session such as a seed, a migration or the scheduler. Used to exempt fixture writes from time gating without exempting service-role callers.';

CREATE OR REPLACE FUNCTION private.enforce_quoting_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq_id  uuid;
  v_refusal text;
BEGIN
  IF private.in_demo_write_window() OR NOT private.is_api_call() THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'quote_versions' THEN
    SELECT q.rfq_id INTO v_rfq_id FROM quotes q WHERE q.id = NEW.quote_id;
  ELSE
    v_rfq_id := NEW.rfq_id;
  END IF;

  v_refusal := private.quoting_refusal(v_rfq_id);

  IF v_refusal IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '%', CASE v_refusal
    WHEN 'NOT_OPEN_YET' THEN 'This enquiry is not open for quoting yet'
    WHEN 'DEADLINE_PASSED' THEN 'The quoting deadline for this enquiry has passed'
    WHEN 'NO_SUCH_RFQ' THEN 'No such enquiry'
    ELSE 'This enquiry is no longer accepting quotes'
  END
  USING ERRCODE = 'check_violation',
        HINT = 'Deadlines are enforced when the price is written, on every route in.';
END;
$$;

COMMENT ON FUNCTION private.enforce_quoting_window() IS
  'Refuses a quote or a quote version outside the enquiry''s quoting window. The authoritative deadline check: fires on the web path, the messaging gateway and any future one.';

CREATE TRIGGER quotes_quoting_window
  BEFORE INSERT ON quotes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_quoting_window();

CREATE TRIGGER quote_versions_quoting_window
  BEFORE INSERT ON quote_versions
  FOR EACH ROW EXECUTE FUNCTION private.enforce_quoting_window();

-- Q&A closes with its phase. A buyer who wants longer extends the revision
-- deadline, which is visible to every bidder, rather than answering privately
-- after the window everyone else was held to.
CREATE OR REPLACE FUNCTION private.enforce_clarification_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ends timestamptz;
BEGIN
  IF private.in_demo_write_window() OR NOT private.is_api_call() THEN
    RETURN NEW;
  END IF;

  v_ends := private.clarification_ends(NEW.rfq_id);

  IF v_ends IS NOT NULL AND v_ends <= now() THEN
    RAISE EXCEPTION 'The clarification window for this enquiry has closed'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER clarification_messages_window
  BEFORE INSERT ON rfq_clarification_messages
  FOR EACH ROW EXECUTE FUNCTION private.enforce_clarification_window();

-- Voting closes on the evaluation deadline. Until now the only thing that closed
-- voting was the award, which meant a committee could sit on a decision
-- indefinitely and suppliers had no date to be told.
CREATE OR REPLACE FUNCTION private.enforce_voting_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline timestamptz;
BEGIN
  IF private.in_demo_write_window() OR NOT private.is_api_call() THEN
    RETURN NEW;
  END IF;

  SELECT evaluation_deadline INTO v_deadline FROM rfqs WHERE id = NEW.rfq_id;

  IF v_deadline IS NOT NULL AND v_deadline <= now() THEN
    RAISE EXCEPTION 'The voting window for this enquiry closed on %',
      to_char(v_deadline, 'DD Mon YYYY HH24:MI')
      USING ERRCODE = 'check_violation',
            HINT = 'Ask the procurement lead to extend the evaluation deadline.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER committee_votes_voting_window
  BEFORE INSERT ON committee_votes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_voting_window();

-- ---------------------------------------------------------------------------
-- Advancing a phase when its window runs out
--
-- Idempotent and deterministic: it applies a rule that has already come true,
-- so calling it twice, or from two places at once, changes nothing. That is what
-- makes it safe to expose to any signed-in caller and to run from a scheduler at
-- the same time.
--
-- What it deliberately does NOT do is award. An award is a decision, and a
-- decision with no person attached to it is exactly the thing this platform
-- exists to prevent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.advance_rfq_phases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq       record;
  v_live      integer;
  v_moved     jsonb := '[]'::jsonb;
  v_next      rfq_status;
  v_reason    text;
BEGIN
  FOR v_rfq IN
    SELECT r.id, r.status, r.quote_deadline, r.revision_deadline, r.bid_deadline,
           r.public_ref
    FROM rfqs r
    WHERE r.status IN ('OPEN', 'CLARIFICATION')
    ORDER BY r.quote_deadline
  LOOP
    -- Whether anyone actually bid decides where an expired enquiry goes. A round
    -- with no bids has nothing to evaluate, and parking it in EVALUATING would
    -- leave a committee waiting for cards that will never arrive.
    SELECT count(*) INTO v_live
    FROM quotes q
    WHERE q.rfq_id = v_rfq.id
      AND q.status IN ('SUBMITTED', 'REVISED', 'FINAL');

    v_next := NULL;

    IF v_rfq.status = 'OPEN'
       AND v_rfq.quote_deadline IS NOT NULL
       AND v_rfq.quote_deadline <= now() THEN
      IF v_live = 0 THEN
        v_next := 'CLOSED';
        v_reason := 'bidding closed with no quotes';
      ELSIF COALESCE(v_rfq.revision_deadline, v_rfq.quote_deadline) > now() THEN
        v_next := 'CLARIFICATION';
        v_reason := 'bidding closed, revision window open';
      ELSE
        v_next := 'EVALUATING';
        v_reason := 'bidding closed, no revision window';
      END IF;

    ELSIF v_rfq.status = 'CLARIFICATION'
       AND private.clarification_ends(v_rfq.id) IS NOT NULL
       AND private.clarification_ends(v_rfq.id) <= now() THEN
      IF v_live = 0 THEN
        v_next := 'CLOSED';
        v_reason := 'clarification closed with no quotes';
      ELSE
        v_next := 'EVALUATING';
        v_reason := 'clarification closed';
      END IF;
    END IF;

    IF v_next IS NULL THEN
      CONTINUE;
    END IF;

    -- A price that was never finalised is still the supplier's last word. Asking
    -- them to have clicked one more button to be considered would disqualify the
    -- careful ones and reward nobody.
    IF v_next = 'EVALUATING' THEN
      UPDATE quotes
      SET status = 'FINAL', updated_at = now()
      WHERE rfq_id = v_rfq.id AND status IN ('SUBMITTED', 'REVISED');
    END IF;

    UPDATE rfqs SET status = v_next, updated_at = now() WHERE id = v_rfq.id;

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('rfq.phase_advanced', 'rfq', v_rfq.id::text,
            jsonb_build_object('from', v_rfq.status, 'to', v_next,
                               'reason', v_reason, 'automatic', true,
                               'quotes', v_live));

    v_moved := v_moved || jsonb_build_object(
      'rfqId', v_rfq.id, 'ref', v_rfq.public_ref,
      'from', v_rfq.status, 'to', v_next, 'reason', v_reason
    );
  END LOOP;

  RETURN jsonb_build_object('advanced', jsonb_array_length(v_moved), 'rfqs', v_moved);
END;
$$;

COMMENT ON FUNCTION public.advance_rfq_phases() IS
  'Moves enquiries past a window whose deadline has gone. Idempotent; never awards. Safe to call from a scheduler and from the application at the same time.';

GRANT EXECUTE ON FUNCTION public.advance_rfq_phases() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- What the interface needs to show a phase
-- ---------------------------------------------------------------------------

/**
 * The current phase of one enquiry, with its window.
 *
 * Access is the same question as anywhere else: the buying organization, an
 * assigned committee member, or a supplier who was invited. A supplier learns
 * the dates and nothing about the committee, which is already true of every
 * other thing they can read.
 */
CREATE OR REPLACE FUNCTION public.rfq_phase(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq     rfqs%ROWTYPE;
  v_ordinal integer;
  v_label   text;
  v_starts  timestamptz;
  v_ends    timestamptz;
BEGIN
  IF NOT (
    private.can_access_rfq_as_buyer(p_rfq_id)
    OR private.can_access_rfq_as_committee(p_rfq_id)
    OR private.has_rfq_invitation(p_rfq_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this enquiry';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such enquiry';
  END IF;

  CASE v_rfq.status
    WHEN 'DRAFT' THEN
      v_ordinal := 0; v_label := 'Not published';
      v_starts := NULL; v_ends := NULL;
    WHEN 'OPEN' THEN
      v_ordinal := 1; v_label := 'Blind bidding';
      v_starts := v_rfq.opened_at; v_ends := v_rfq.quote_deadline;
    WHEN 'CLARIFICATION' THEN
      v_ordinal := 2; v_label := 'Clarification and revision';
      v_starts := v_rfq.clarification_at;
      v_ends := private.clarification_ends(p_rfq_id);
    WHEN 'EVALUATING' THEN
      v_ordinal := 3; v_label := 'Evaluation and committee voting';
      v_starts := v_rfq.evaluation_at; v_ends := v_rfq.evaluation_deadline;
    WHEN 'AWARDED' THEN
      v_ordinal := 4; v_label := 'Awarded';
      v_starts := v_rfq.updated_at; v_ends := NULL;
    ELSE
      v_ordinal := 0; v_label := 'Closed';
      v_starts := NULL; v_ends := NULL;
  END CASE;

  RETURN jsonb_build_object(
    'rfqId', v_rfq.id,
    'ref', v_rfq.public_ref,
    'status', v_rfq.status,
    'ordinal', v_ordinal,
    'label', v_label,
    'startsAt', v_starts,
    'endsAt', v_ends,
    -- The one thing a countdown must not get wrong: whether the window is
    -- already over. Computed here so every client agrees, on whatever clock the
    -- device happens to be set to.
    'overdue', v_ends IS NOT NULL AND v_ends <= now(),
    'secondsRemaining', CASE
      WHEN v_ends IS NULL THEN NULL
      ELSE GREATEST(0, floor(EXTRACT(EPOCH FROM (v_ends - now())))::bigint)
    END,
    'schedule', jsonb_build_object(
      'openedAt', v_rfq.opened_at,
      'bidDeadline', v_rfq.bid_deadline,
      'clarificationAt', v_rfq.clarification_at,
      'revisionDeadline', v_rfq.revision_deadline,
      'evaluationAt', v_rfq.evaluation_at,
      'evaluationDeadline', v_rfq.evaluation_deadline
    ),
    'quotingOpen', private.quoting_refusal(p_rfq_id) IS NULL,
    'quotingRefusal', private.quoting_refusal(p_rfq_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rfq_phase(uuid) TO authenticated;

/**
 * Setting the schedule.
 *
 * One call for all three dates, because they only make sense in order and
 * validating them one at a time would let an enquiry sit in an impossible state
 * between two saves.
 */
CREATE OR REPLACE FUNCTION public.set_rfq_schedule(
  p_rfq_id             uuid,
  p_bid_deadline       timestamptz DEFAULT NULL,
  p_revision_deadline  timestamptz DEFAULT NULL,
  p_evaluation_deadline timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq  rfqs%ROWTYPE;
  v_bid  timestamptz;
  v_rev  timestamptz;
  v_eval timestamptz;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such enquiry';
  END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager of the buying organisation can change the schedule';
  END IF;

  IF v_rfq.status IN ('AWARDED', 'CLOSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'This enquiry is finished; its schedule cannot be changed';
  END IF;

  v_bid  := COALESCE(p_bid_deadline, v_rfq.bid_deadline);
  v_rev  := COALESCE(p_revision_deadline, v_rfq.revision_deadline);
  v_eval := COALESCE(p_evaluation_deadline, v_rfq.evaluation_deadline);

  IF v_rev IS NOT NULL AND v_bid IS NOT NULL AND v_rev < v_bid THEN
    RAISE EXCEPTION 'The revision deadline cannot be before the bid deadline';
  END IF;

  IF v_eval IS NOT NULL AND COALESCE(v_rev, v_bid) IS NOT NULL
     AND v_eval < COALESCE(v_rev, v_bid) THEN
    RAISE EXCEPTION 'The voting deadline cannot be before quoting closes';
  END IF;

  UPDATE rfqs
  SET bid_deadline = v_bid,
      revision_deadline = v_rev,
      evaluation_deadline = v_eval,
      -- The live window follows the phase the enquiry is actually in.
      quote_deadline = CASE status
        WHEN 'CLARIFICATION' THEN COALESCE(v_rev, v_bid, quote_deadline)
        WHEN 'OPEN' THEN COALESCE(v_bid, quote_deadline)
        ELSE quote_deadline
      END,
      updated_at = now()
  WHERE id = p_rfq_id;

  INSERT INTO audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('rfq.schedule_set', private.get_profile_id(), 'rfq', p_rfq_id::text,
          jsonb_build_object('bidDeadline', v_bid, 'revisionDeadline', v_rev,
                             'evaluationDeadline', v_eval));

  RETURN public.rfq_phase(p_rfq_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_rfq_schedule(uuid, timestamptz, timestamptz, timestamptz)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Running it on a clock
--
-- pg_cron if the deployment has it, and the RPC either way. The guard is not
-- defensive habit: pg_cron has to be preloaded at server start, which is true of
-- hosted Supabase and not guaranteed of every local or self-hosted instance, and
-- a migration that cannot run is worse than a schedule that has to be arranged
-- another way.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;

  PERFORM cron.unschedule('otp-advance-rfq-phases')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'otp-advance-rfq-phases');

  PERFORM cron.schedule(
    'otp-advance-rfq-phases',
    '*/5 * * * *',
    $job$SELECT public.advance_rfq_phases()$job$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE
      'pg_cron unavailable (%). Phases will advance when advance_rfq_phases() is called.',
      SQLERRM;
END;
$$;
