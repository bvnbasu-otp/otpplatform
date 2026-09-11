import { useEffect, useState } from "react";
import { useRoleContext } from "@/features/roles";
import {
  listOrgMembers,
  inviteOrgMember,
  removeOrgMember,
  type OrgMember,
} from "../api/org-members";

const ROLE_OPTIONS = [
  { value: "COMMITTEE_MEMBER", label: "Committee Member — evaluates & votes on RFQs" },
  { value: "BUYER", label: "Buyer / Procurement Lead — raises requirements" },
  { value: "MANAGER", label: "Manager — full read + propose access" },
  { value: "VIEWER", label: "Viewer — read-only observer" },
];

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60",
  MANAGER: "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60",
  BUYER: "bg-primary/10 text-primary border border-primary/20",
  COMMITTEE_MEMBER: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60",
  VIEWER: "bg-muted text-muted-foreground border border-border",
};

export function OrgMembersPage() {
  const { context } = useRoleContext();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("COMMITTEE_MEMBER");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Remove state
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const orgId = context.organizationId;
  const orgName = context.organizationName ?? "Your Organization";
  const canManage =
    !context.isPlatformAdmin &&
    (context.orgRole === "OWNER" || context.orgRole === "MANAGER");

  useEffect(() => {
    if (!orgId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      const res = await listOrgMembers(orgId);
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setMembers(res.members);
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    const res = await inviteOrgMember(orgId, inviteEmail, inviteRole);
    setInviteLoading(false);
    if (res.ok) {
      setInviteResult({ ok: true, message: res.message });
      setInviteEmail("");
      // Refresh member list
      const fresh = await listOrgMembers(orgId);
      if (fresh.ok) setMembers(fresh.members);
    } else {
      setInviteResult({ ok: false, message: res.error });
    }
  }

  async function handleRemove(profileId: string) {
    if (!orgId) return;
    if (!window.confirm("Remove this member from the organization?")) return;
    setRemoving(profileId);
    setRemoveError(null);
    const res = await removeOrgMember(orgId, profileId);
    setRemoving(null);
    if (!res.ok) {
      setRemoveError(res.error);
    } else {
      setMembers((prev) => prev.filter((m) => m.profileId !== profileId));
    }
  }

  if (!orgId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-muted-foreground">
        <p className="text-4xl mb-3">🏢</p>
        <p className="font-semibold">No active organization found.</p>
        <p className="text-sm mt-1">
          Complete onboarding or ask a SuperAdmin to link you to an organization.
        </p>
      </div>
    );
  }

  return (
    <div className="zero-scroll-container p-3 max-w-5xl mx-auto w-full">
      {/* Page Header - Compact Single Row */}
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xs font-bold text-foreground truncate">Organization Members</h1>
          <span className="text-muted-foreground">·</span>
          <span className="text-[11px] text-muted-foreground truncate">{orgName}</span>
        </div>
        <span className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 px-2 py-0.2 rounded-full shrink-0">
          Role: {context.orgRole?.replace(/_/g, " ") ?? "Member"}
        </span>
      </header>

      {/* Internal Scroll Content Area */}
      <div className="zero-scroll-pane mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
          {/* Left Column (5 cols): Invite New Member */}
          {canManage && (
            <div className="lg:col-span-5 space-y-2.5">
              <section className="rounded-lg border bg-card p-3 shadow-2xs space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-base">&#128101;</span>
                  <h2 className="text-xs font-bold text-foreground">Invite Member</h2>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Invite colleagues by email to join <strong>{orgName}</strong>.
                </p>

                <form onSubmit={(e) => void handleInvite(e)} className="space-y-2">
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    disabled={inviteLoading}
                    className="w-full rounded border px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    disabled={inviteLoading}
                    className="w-full rounded border px-2.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={inviteLoading || !inviteEmail.trim()}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition"
                  >
                    {inviteLoading ? 'Sending…' : '+ Send Invitation'}
                  </button>

                  {inviteResult && (
                    <p
                      className={`text-[11px] font-semibold rounded p-1.5 ${
                        inviteResult.ok
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {inviteResult.ok ? "✓" : "⚠️"} {inviteResult.message}
                    </p>
                  )}
                </form>
              </section>

              {/* Governance Info */}
              <section className="rounded-lg border bg-muted/20 p-2.5 text-[11px] text-muted-foreground space-y-1">
                <p className="font-bold text-foreground text-xs">&#128274; Governance Rules</p>
                <ul className="list-disc pl-3.5 space-y-0.5">
                  <li>Committee Members evaluate and vote on RFQs using anonymous identity-protected scoring.</li>
                  <li>Quorum of 2+ votes required for Community, Institution, and Enterprise orgs.</li>
                </ul>
              </section>
            </div>
          )}

          {/* Right Column (7 cols or 12 cols): Member List */}
          <div className={canManage ? "lg:col-span-7 space-y-2.5" : "lg:col-span-12 space-y-2.5"}>
            <section className="rounded-lg border bg-card shadow-2xs overflow-hidden">
              <div className="px-3 py-2 border-b flex items-center justify-between">
                <h2 className="text-xs font-bold text-foreground">
                  Current Members
                  {!isLoading && (
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      ({members.length})
                    </span>
                  )}
                </h2>
              </div>

              {isLoading && (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
                  Loading members…
                </div>
              )}

              {error && (
                <div className="px-3 py-2 text-xs text-red-600 bg-red-50 border-b">
                  &#9888; {error}
                </div>
              )}

              {removeError && (
                <div className="px-3 py-1.5 text-[11px] font-semibold text-red-600 bg-red-50 border-b">
                  &#9888; {removeError}
                </div>
              )}

              {!isLoading && !error && members.length === 0 && (
                <div className="px-3 py-6 text-center text-muted-foreground text-xs">
                  No members found. Invite your first colleague above.
                </div>
              )}

              {!isLoading && members.length > 0 && (
                <ul className="divide-y">
                  {members.map((m) => (
                    <li key={m.profileId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/30 transition">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-foreground truncate">
                            {m.fullName ?? m.email}
                          </span>
                          {m.isSelf && (
                            <span className="rounded-full bg-primary/10 text-primary text-[9px] px-1.5 py-0.2 font-bold">
                              You
                            </span>
                          )}
                          <span
                            className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                              ROLE_BADGE[m.role] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {m.role.replace(/_/g, " ")}
                          </span>
                        </div>
                        {m.fullName && (
                          <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>
                        )}
                      </div>

                      {canManage && !m.isSelf && m.role !== "OWNER" && (
                        <button
                          type="button"
                          disabled={removing === m.profileId}
                          onClick={() => void handleRemove(m.profileId)}
                          className="shrink-0 rounded border px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 hover:border-red-200 transition disabled:opacity-40"
                          title={`Remove ${m.fullName ?? m.email}`}
                        >
                          {removing === m.profileId ? "…" : "Remove"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
