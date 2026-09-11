import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRoleContext } from "@/features/roles";

const ORG_TYPE_ICONS: Record<string, string> = {
  INDIVIDUAL: "👤",
  MSME: "🏭",
  COMMUNITY: "🏘️",
  ENTERPRISE: "🏢",
  INSTITUTION: "🏛️",
};

/**
 * Dropdown shown in the header nav when the signed-in user belongs to 2 or more
 * organizations. Lets them switch the active org context without signing out.
 * Hidden for single-org users, suppliers, and platform admins.
 */
export function OrgContextSwitcher() {
  const { context, switchOrg } = useRoleContext();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only show for BUYER side with 2+ orgs
  if (
    context.isPlatformAdmin ||
    context.side !== "BUYER" ||
    context.organizations.length < 2
  ) {
    return null;
  }

  const activeOrg = context.organizations.find(
    (o) => o.id === context.organizationId
  ) ?? context.organizations[0];

  async function handleSwitch(orgId: string) {
    if (orgId === context.organizationId) {
      setOpen(false);
      return;
    }
    setSwitching(orgId);
    setError(null);
    const res = await switchOrg(orgId);
    setSwitching(null);
    if (!res.ok) {
      setError(res.error ?? "Failed to switch organization");
      return;
    }
    setOpen(false);
    // Navigate to dashboard to reload with fresh org context
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setError(null); }}
        className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition focus:outline-none focus:ring-2 focus:ring-primary"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch organization context"
      >
        <span>{ORG_TYPE_ICONS[activeOrg?.orgType ?? ""] ?? "🏢"}</span>
        <span className="max-w-[120px] truncate">{activeOrg?.name ?? "My Org"}</span>
        <span className="text-[10px] opacity-60">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border bg-card shadow-xl p-1.5 space-y-0.5">
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Switch Organization
            </p>
            {context.organizations.map((org) => {
              const isActive = org.id === context.organizationId;
              const isLoading = switching === org.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleSwitch(org.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition disabled:opacity-50 ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  <span className="text-base">{ORG_TYPE_ICONS[org.orgType] ?? "🏢"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{org.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {org.orgType} &middot; {org.role.replace(/_/g, " ")}
                    </p>
                  </div>
                  {isActive && <span className="text-primary text-xs font-bold">&#10003;</span>}
                  {isLoading && (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  )}
                </button>
              );
            })}

            {error && (
              <p className="px-2.5 py-1 text-[11px] font-semibold text-red-600">
                &#9888; {error}
              </p>
            )}

            <div className="border-t pt-1 mt-1">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate("/org/members"); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                <span>&#128101;</span> Manage Organization Members
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
