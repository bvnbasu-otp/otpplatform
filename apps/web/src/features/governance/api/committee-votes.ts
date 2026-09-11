import { supabase } from '@/lib/supabase';
import type { VoteChoice } from '@otp/domain';
import type {
  CommitteeVote,
  MyVote,
  VoteTallyEntry,
  VotingSummary,
} from '../types/governance';

interface VoteRow {
  id: string;
  rfq_id: string;
  profile_id: string;
  recommended_quote_id: string | null;
  choice: VoteChoice;
  comment: string | null;
  cast_at: string;
  locked_at: string | null;
  profiles?: { full_name: string } | null;
}

function mapVote(row: VoteRow, labels: Map<string, string>): CommitteeVote {
  const quoteId = row.recommended_quote_id;
  return {
    id: row.id,
    rfqId: row.rfq_id,
    profileId: row.profile_id,
    recommendedQuoteId: quoteId,
    choice: row.choice,
    comment: row.comment,
    castAt: row.cast_at,
    lockedAt: row.locked_at,
    voterName: row.profiles?.full_name ?? undefined,
    anonymousLabel: quoteId ? labels.get(quoteId) : undefined,
  };
}

export async function fetchVotes(rfqId: string): Promise<
  { ok: true; votes: CommitteeVote[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('committee_votes')
    .select(
      'id, rfq_id, profile_id, recommended_quote_id, choice, comment, cast_at, locked_at, profiles(full_name)',
    )
    .eq('rfq_id', rfqId)
    .order('cast_at', { ascending: true });

  if (error) return { ok: false, error: error.message };

  const quoteIds = (data as unknown as VoteRow[])
    .map((v) => v.recommended_quote_id)
    .filter((id): id is string => Boolean(id));

  const labels = new Map<string, string>();
  if (quoteIds.length > 0) {
    const { data: quoteRows } = await supabase
      .from('quotes')
      .select('id, invitation_id')
      .in('id', quoteIds);

    const invitationIds = (quoteRows ?? []).map((q) => q.invitation_id).filter(Boolean);
    if (invitationIds.length > 0) {
      const { data: invRows } = await supabase
        .from('rfq_invitations_manager')
        .select('invitation_id, anonymous_label')
        .in('invitation_id', invitationIds);

      const invLabel = new Map(
        (invRows as { invitation_id: string; anonymous_label: string }[]).map((i) => [
          i.invitation_id,
          i.anonymous_label,
        ]),
      );
      for (const q of quoteRows ?? []) {
        const label = invLabel.get(q.invitation_id);
        if (label) labels.set(q.id, label);
      }
    }
  }

  return {
    ok: true,
    votes: (data as unknown as VoteRow[]).map((r) => mapVote(r, labels)),
  };
}

/**
 * Casts or revises a vote.
 *
 * Deliberately an RPC rather than an insert: voting power is read from the
 * buying organization's type server-side and stamped onto the row, so a member
 * cannot vote themselves extra weight, and the audit trail records a revision
 * as a revision rather than as a second opinion.
 */
export async function castVote(
  rfqId: string,
  recommendedQuoteId: string | null,
  choice: VoteChoice,
  comment?: string,
): Promise<
  { ok: true; revised: boolean } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('cast_committee_vote', {
    p_rfq_id: rfqId,
    p_recommended_quote_id: recommendedQuoteId,
    p_choice: choice,
    p_comment: comment?.trim() ? comment.trim() : null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, revised: Boolean((data as { revised?: boolean })?.revised) };
}

interface TallyRow {
  anonymous_label: string;
  quote_id: string | null;
  vote_count: number | string;
  weighted_total: number | string;
  recommend_count: number | string;
  recommend_weight: number | string;
  last_vote_at: string | null;
}

/** The standing of each quoting supplier, by alias, never by business name. */
export async function fetchVoteTally(rfqId: string): Promise<
  { ok: true; tally: VoteTallyEntry[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfq_vote_tally')
    .select(
      'anonymous_label, quote_id, vote_count, weighted_total, recommend_count, recommend_weight, last_vote_at',
    )
    .eq('rfq_id', rfqId);

  if (error) return { ok: false, error: error.message };

  const tally = ((data ?? []) as TallyRow[]).map((row) => ({
    anonymousLabel: row.anonymous_label,
    quoteId: row.quote_id,
    voteCount: Number(row.vote_count ?? 0),
    weightedTotal: Number(row.weighted_total ?? 0),
    recommendCount: Number(row.recommend_count ?? 0),
    recommendWeight: Number(row.recommend_weight ?? 0),
    lastVoteAt: row.last_vote_at,
  }));

  tally.sort(
    (a, b) =>
      b.recommendWeight - a.recommendWeight ||
      b.recommendCount - a.recommendCount ||
      a.anonymousLabel.localeCompare(b.anonymousLabel),
  );

  return { ok: true, tally };
}

/** Participation: who has spoken, how much weight that carries, and whether voting is still open. */
export async function fetchVotingSummary(rfqId: string): Promise<
  { ok: true; summary: VotingSummary } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('rfq_voting_summary', {
    p_rfq_id: rfqId,
  });

  if (error) return { ok: false, error: error.message };

  const row = (data ?? {}) as Record<string, unknown>;
  const leader = row.leader as Record<string, unknown> | null;

  return {
    ok: true,
    summary: {
      assignedMembers: Number(row.assigned_members ?? 0),
      membersVoted: Number(row.members_voted ?? 0),
      pendingMembers: Number(row.pending_members ?? 0),
      weightCast: Number(row.weight_cast ?? 0),
      abstained: Number(row.abstained ?? 0),
      opposed: Number(row.opposed ?? 0),
      votesLockedAt: (row.votes_locked_at as string | null) ?? null,
      votingOpen: Boolean(row.voting_open),
      leader: leader
        ? {
            anonymousLabel: String(leader.anonymous_label ?? ''),
            quoteId: (leader.quote_id as string | null) ?? null,
            recommendWeight: Number(leader.recommend_weight ?? 0),
            recommendCount: Number(leader.recommend_count ?? 0),
          }
        : null,
    },
  };
}

/** The caller's own current vote, with the weight the server gave it. */
export async function fetchMyVote(rfqId: string): Promise<
  { ok: true; vote: MyVote | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('my_committee_vote')
    .select(
      'vote_id, recommended_quote_id, recommended_alias, choice, comment, voting_power, buyer_type, cast_at',
    )
    .eq('rfq_id', rfqId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, vote: null };

  return {
    ok: true,
    vote: {
      voteId: data.vote_id as string,
      recommendedQuoteId: (data.recommended_quote_id as string | null) ?? null,
      recommendedAlias: (data.recommended_alias as string | null) ?? null,
      choice: data.choice as VoteChoice,
      comment: (data.comment as string | null) ?? null,
      votingPower: Number(data.voting_power ?? 1),
      buyerType: (data.buyer_type as MyVote['buyerType']) ?? null,
      castAt: data.cast_at as string,
    },
  };
}
