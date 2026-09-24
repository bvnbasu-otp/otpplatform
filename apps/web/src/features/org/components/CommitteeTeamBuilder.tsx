import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import type { BuyerPersona, OrgMemberClaimState } from '@otp/domain';

interface CommitteeTeamBuilderProps {
  organizationId: string;
  persona: BuyerPersona;
  organizationName?: string;
}

interface MemberRecord {
  id: string;
  profileId?: string;
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  claimStatus: OrgMemberClaimState;
  votingWeight: number;
  spendLimit?: number | null;
  joinedAt?: string;
  inviteToken?: string;
}

export function CommitteeTeamBuilder({
  organizationId,
  persona,
  organizationName,
}: CommitteeTeamBuilderProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invite Form
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState(persona === 'RWA' ? 'COMMITTEE_MEMBER' : 'BUYER');
  const [votingWeight, setVotingWeight] = useState('1.0');
  const [spendLimit, setSpendLimit] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const fetchMembers = async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch active members
      const { data: memberData, error: memErr } = await supabase
        .from('organization_members')
        .select(`
          id,
          profile_id,
          role,
          joined_at,
          profiles:profile_id (
            full_name,
            email,
            phone
          )
        `)
        .eq('organization_id', organizationId);

      if (memErr) throw memErr;

      // 2. Fetch pending invitations
      const { data: inviteData, error: invErr } = await supabase
        .from('organization_invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('status', 'PENDING');

      const activeList: MemberRecord[] = (memberData || []).map((m: any) => ({
        id: m.id,
        profileId: m.profile_id,
        fullName: m.profiles?.full_name || 'Member',
        email: m.profiles?.email || '',
        phone: m.profiles?.phone || '',
        role: m.role || 'MEMBER',
        claimStatus: 'ACTIVE' as OrgMemberClaimState,
        votingWeight: 1.0,
        joinedAt: m.joined_at,
      }));

      const pendingList: MemberRecord[] = (inviteData || []).map((inv: any) => ({
        id: inv.id,
        fullName: inv.metadata?.name || 'Invited Member',
        email: inv.email || '',
        phone: inv.phone || '',
        role: inv.role || 'MEMBER',
        claimStatus: (inv.claim_status as OrgMemberClaimState) || 'INVITED',
        votingWeight: Number(inv.voting_weight) || 1.0,
        spendLimit: inv.spend_limit ? Number(inv.spend_limit) : null,
        joinedAt: inv.created_at,
        inviteToken: inv.token,
      }));

      setMembers([...activeList, ...pendingList]);
    } catch (err: any) {
      setError(err.message || 'Failed to load organization members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [organizationId]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      setError('Email is required');
      return;
    }

    setInviting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const token = `orginv_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
      const { error: insErr } = await supabase
        .from('organization_invitations')
        .insert({
          organization_id: organizationId,
          email: inviteEmail.trim().toLowerCase(),
          phone: invitePhone.trim() || null,
          role: inviteRole,
          status: 'PENDING',
          claim_status: 'INVITED',
          token,
          voting_weight: parseFloat(votingWeight) || 1.0,
          spend_limit: spendLimit ? parseFloat(spendLimit) : null,
          invited_by: user?.id,
          metadata: {
            name: inviteName.trim() || inviteEmail.split('@')[0],
          },
        });

      if (insErr) throw insErr;

      const claimUrl = `${window.location.origin}/invite/accept?token=${token}`;
      setGeneratedLink(claimUrl);
      setSuccessMsg(`Invitation created for ${inviteEmail.trim()}`);
      await fetchMembers();
    } catch (err: any) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const getStatusBadge = (status: OrgMemberClaimState) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">ACTIVE</span>;
      case 'INVITED':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">INVITED</span>;
      case 'CLAIMED':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">CLAIMED</span>;
      case 'PROFILE_COMPLETE':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">READY</span>;
      case 'INACTIVE':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">INACTIVE</span>;
      default:
        return null;
    }
  };

  const roleLabels: Record<string, string> = {
    OWNER: persona === 'RWA' ? 'President / Secretary (Owner)' : 'Owner / MD',
    MANAGER: persona === 'RWA' ? 'Facility Manager' : 'Procurement Manager',
    COMMITTEE_MEMBER: 'Committee Member (Voting Power)',
    BUYER: persona === 'MSME' ? 'Purchasing Lead' : 'Procurement Lead',
    APPROVER: 'Financial Approver',
    VIEWER: 'Auditor / Observer',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <span>{persona === 'RWA' ? '🏛️' : '🏢'}</span>
            {persona === 'RWA' ? 'RWA Management Committee' : 'MSME Procurement Team'}
          </h3>
          <p className="text-xs text-muted-foreground">
            {persona === 'RWA'
              ? 'Multi-member governance for residential societies. Manage voting weights, quorum participation, and COI disclosure rules.'
              : 'Enterprise procurement hierarchy. Set spend caps, approval authority, and proxy delegation.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setGeneratedLink(null);
            setShowInviteModal(true);
          }}
          className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm active:scale-95 touch-manipulation"
        >
          {persona === 'RWA' ? '+ Invite Committee Member' : '+ Add Team Member'}
        </button>
      </div>

      {error && (
        <div className="p-3 text-xs bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3 text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/20">
          {successMsg}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-muted-foreground text-xs animate-pulse">
          Loading {persona === 'RWA' ? 'committee' : 'team'} members...
        </div>
      ) : members.length === 0 ? (
        <div className="p-6 border border-dashed border-border rounded-xl text-center bg-muted/20">
          <p className="text-sm font-medium text-foreground">No members onboarded yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {persona === 'RWA'
              ? 'Build your society committee to enable multi-member RFQ voting and consensus awards.'
              : 'Add team members with delegated spend limits and approval authority.'}
          </p>
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 text-xs font-semibold rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
          >
            {persona === 'RWA' ? 'Build Society Committee' : 'Build Procurement Team'}
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
          {members.map((m) => (
            <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {m.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{m.fullName}</span>
                    {getStatusBadge(m.claimStatus)}
                    <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                      {roleLabels[m.role] || m.role}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.email} {m.phone ? `• ${m.phone}` : ''}</p>
                  
                  {persona === 'RWA' && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Voting Weight: <span className="font-mono font-semibold text-foreground">{m.votingWeight}x</span>
                    </p>
                  )}
                  {persona === 'MSME' && m.spendLimit && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Spend Authorization Cap: <span className="font-mono font-semibold text-foreground">₹{m.spendLimit.toLocaleString('en-IN')}</span>
                    </p>
                  )}
                </div>
              </div>

              {m.claimStatus !== 'ACTIVE' && m.inviteToken && (
                <div className="flex items-center gap-2 pt-2 sm:pt-0">
                  <button
                    type="button"
                    onClick={() => {
                      const link = `${window.location.origin}/invite/accept?token=${m.inviteToken}`;
                      navigator.clipboard.writeText(link);
                      alert('Claim link copied to clipboard!');
                    }}
                    className="text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-lg min-h-[44px] touch-manipulation font-medium border border-border"
                  >
                    🔗 Copy Claim Link
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4 my-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h4 className="font-semibold text-base text-foreground">
                {persona === 'RWA' ? 'Invite Committee Member' : 'Invite Team Member'}
              </h4>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="text-muted-foreground hover:text-foreground text-lg min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {generatedLink ? (
              <div className="space-y-3 py-2">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs">
                  Invitation created successfully! Share the tokenized claim link with the member:
                </div>
                <div className="p-3 bg-muted rounded-lg font-mono text-xs break-all select-all border border-border">
                  {generatedLink}
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink);
                      alert('Copied to clipboard!');
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px]"
                  >
                    Copy Link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setGeneratedLink(null);
                    }}
                    className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted min-h-[44px]"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Member Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Ramesh Gupta"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="member@domain.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={invitePhone}
                      onChange={(e) => setInvitePhone(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      Governance Role
                    </label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                    >
                      {persona === 'RWA' ? (
                        <>
                          <option value="COMMITTEE_MEMBER">Committee Member (Votes on Awards)</option>
                          <option value="MANAGER">Facility Manager (Operational Proposals)</option>
                          <option value="BUYER">Procurement Secretary</option>
                          <option value="VIEWER">Society Resident / Auditor (View Only)</option>
                        </>
                      ) : (
                        <>
                          <option value="BUYER">Procurement Lead (Creates RFQs)</option>
                          <option value="MANAGER">Operations Manager (Reviews Quotes)</option>
                          <option value="APPROVER">Financial Approver (Signs POs)</option>
                          <option value="VIEWER">Auditor / Finance Observer</option>
                        </>
                      )}
                    </select>
                  </div>

                  {persona === 'RWA' ? (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Voting Power Multiplier
                      </label>
                      <select
                        value={votingWeight}
                        onChange={(e) => setVotingWeight(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                      >
                        <option value="1.0">Standard (1.0x)</option>
                        <option value="1.5">Executive (1.5x)</option>
                        <option value="2.0">President / Secretary (2.0x)</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Max Spend Limit (₹)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 500000 (Empty = Unlimited)"
                        value={spendLimit}
                        onChange={(e) => setSpendLimit(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-border bg-background text-foreground min-h-[44px]"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-muted min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 min-h-[44px] disabled:opacity-50"
                  >
                    {inviting ? 'Generating...' : 'Send Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
