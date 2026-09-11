import type { RolePermission } from '../api/roles';

/**
 * Permissions in the words the product uses.
 *
 * The enum names are the database's vocabulary. "PROPOSE" is precise but it is
 * not what anyone would say out loud, and this text appears on the screen where
 * someone commits to a role for good.
 */
const PLAIN: Record<RolePermission, string> = {
  READ: 'See your workspace',
  WRITE: 'Create and edit',
  PROPOSE: 'Publish and submit',
  VOTE: 'Vote in Evaluation Room',
  APPROVE: 'Approve orders and payments',
  AWARD: 'Award contracts',
};

const ORDER: RolePermission[] = ['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE', 'AWARD'];

export function PermissionChips({
  permissions,
  className,
}: {
  permissions: RolePermission[];
  className?: string;
}) {
  const sorted = ORDER.filter((permission) => permissions.includes(permission));

  return (
    <ul className={`flex flex-wrap gap-1.5 ${className ?? ''}`} data-testid="permission-chips">
      {sorted.map((permission) => (
        <li
          key={permission}
          className="rounded-full border bg-muted/50 px-2 py-0.5 text-[0.7rem] text-muted-foreground"
        >
          {PLAIN[permission]}
        </li>
      ))}
      {sorted.length === 1 && sorted[0] === 'READ' && (
        <li className="rounded-full border border-dashed px-2 py-0.5 text-[0.7rem] text-muted-foreground">
          Read only
        </li>
      )}
    </ul>
  );
}

export function permissionLabel(permission: RolePermission): string {
  return PLAIN[permission];
}
