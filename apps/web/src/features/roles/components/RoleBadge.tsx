import { isReadOnly, type RoleContext } from '../api/roles';

/**
 * The active role, next to the avatar.
 *
 * Worth the header space because permissions come from this one value: someone
 * who switched to their auditor view and then wonders why the publish button has
 * gone needs the answer visible, not one click away.
 */
export function RoleBadge({
  context,
  className,
}: {
  context: RoleContext;
  className?: string;
}) {
  if (context.isPlatformAdmin || !context.activeRole) return null;

  const readOnly = isReadOnly(context);

  return (
    <span
      data-testid="role-badge"
      title={context.activeRole.description}
      className={`inline-flex max-w-[16rem] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[0.7rem] ${
        readOnly
          ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
          : 'border-border bg-muted/60 text-muted-foreground'
      } ${className ?? ''}`}
    >
      <span className="hidden sm:inline">Role:</span>
      <span className="truncate font-medium">{context.activeRole.label}</span>
      {readOnly && <span className="hidden shrink-0 md:inline">· read only</span>}
    </span>
  );
}
