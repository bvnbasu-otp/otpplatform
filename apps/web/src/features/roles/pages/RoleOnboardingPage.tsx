import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Button } from '@/components/ui';
import { PRODUCT_NAME } from '@/lib/brand';
import { chooseMyRole, fetchRoleCatalog, type RoleDefinition } from '../api/roles';
import { useRoleContext } from '../hooks/use-role-context';
import { PermissionChips } from '../components/PermissionChips';

/**
 * The gate between signing in and using the product.
 *
 * There is no skip, and that is the point. What this account can do afterwards
 * depends on the answer, so a "decide later" option would put every new person
 * into the one state the permission model cannot describe. It is asked once: a
 * person cannot re-title themselves afterwards, because a role you can change at
 * will is not a role, it is a menu.
 */
export function RoleOnboardingPage() {
  const { context, refresh } = useRoleContext();
  const { user, signOut } = useAuth();

  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const side = context.side ?? 'BUYER';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchRoleCatalog(side);
      if (cancelled) return;
      if (result.ok) setRoles(result.roles);
      else setError(result.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [side]);

  const selected = useMemo(
    () => roles.find((role) => role.code === chosen) ?? null,
    [roles, chosen],
  );

  async function confirm() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const result = await chooseMyRole(chosen);
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    // The provider owns the context, so re-read rather than setting it here:
    // the header badge and the navigation are reading the same object.
    await refresh();
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {PRODUCT_NAME} · one more step
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Complete Your Profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tell us what you do in your{' '}
            {side === 'SUPPLIER' ? 'business' : 'organisation'}
            {context.organizationName ? ` (${context.organizationName})` : ''}. Your role
            decides which screens you land on and which actions you can take, so pick the
            one that matches your actual responsibility rather than the widest one.
          </p>
        </header>

        <section className="mt-6 rounded-lg border bg-card p-1" data-testid="role-choices">
          {loading ? (
            <p className="p-5 text-sm text-muted-foreground">Loading roles…</p>
          ) : (
            <ul role="radiogroup" aria-label="Your role" className="divide-y">
              {roles.map((role) => {
                const active = role.code === chosen;
                return (
                  <li key={role.code}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setChosen(role.code)}
                      data-testid={`role-option-${role.code}`}
                      className={`flex w-full items-start gap-3 rounded-md p-4 text-left transition ${
                        active ? 'bg-primary/5 ring-2 ring-inset ring-primary' : 'hover:bg-muted/60'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                          active ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                        }`}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{role.label}</span>
                        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                          {role.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {selected && (
          <div className="mt-4 rounded-lg border bg-card p-4">
            <p className="text-xs font-medium">As {selected.label} you will be able to</p>
            <PermissionChips permissions={selected.permissions} className="mt-2" />
            <p className="mt-3 text-xs text-muted-foreground">
              Being able to vote also needs your organisation to add you to a specific enquiry&apos;s Evaluation &amp; Voting Room,
              and approving money still follows your organisation&apos;s approval policy. A
              role narrows what you can reach; it never grants access on its own.
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600" role="alert" data-testid="role-error">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="action"
            size="lg"
            busy={busy}
            busyLabel="Saving…"
            disabled={!chosen}
            onClick={() => void confirm()}
            data-testid="confirm-role"
          >
            Continue
          </Button>
          <span className="text-xs text-muted-foreground">
            Signed in as {user?.email}.{' '}
            <button
              type="button"
              onClick={() => void signOut()}
              className="underline hover:no-underline"
            >
              Sign out
            </button>
          </span>
        </div>

        {!loading && roles.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            No roles are configured for this portal yet. Ask an administrator to set them up.
          </p>
        )}
      </div>
    </div>
  );
}
