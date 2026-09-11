-- The anonymised Q&A thread could not be written to.
--
-- Migration 00005 grants DML on every table in public, and it runs once, so a
-- table created after it starts life with no privileges at all. The clarification
-- thread arrived in 00012 and never got any: it has three carefully written
-- policies for `authenticated` and no grant for `authenticated` to satisfy them
-- against, which means every post came back "permission denied for table
-- rfq_clarification_messages" before RLS was ever consulted. Reads happened to
-- keep working, because they go through two views owned by postgres, which is
-- why the thread looked alive while being impossible to add to.
--
-- Worth being precise about what a policy is and is not: a policy narrows a
-- privilege that has already been granted. It never grants one. A table with
-- policies and no grants is not locked down, it is unreachable, and the two are
-- easy to confuse from a migration diff.
--
-- SELECT and INSERT only. The thread is a negotiation record between two parties
-- who cannot see each other's names, and a record that can be edited after the
-- fact is not a record — it is a draft with an audit trail attached. There are no
-- UPDATE or DELETE policies on this table, so those statements were already dead;
-- withholding the privilege as well says the same thing twice, on purpose.

GRANT SELECT, INSERT ON rfq_clarification_messages TO authenticated;

-- service_role for the same reason it holds every other table here: the messaging
-- gateway posts on behalf of a supplier who replied by SMS and has no session.
-- Note that this buys it nothing else — the phase window and the contact-detail
-- redaction in 00041 and 00042 both fire on the write regardless of who made it.
GRANT SELECT, INSERT ON rfq_clarification_messages TO service_role;

COMMENT ON TABLE rfq_clarification_messages IS
  'Append-only masked Q&A between a buyer organisation and one invited supplier. SELECT and INSERT only, by design: the thread is evidence. Every insert passes the clarification window check and the contact-detail redaction.';
