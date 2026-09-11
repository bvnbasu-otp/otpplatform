import { useEffect, useState } from 'react';
import { fetchRoleCatalog, type PortalSide, type RoleDefinition } from '@/features/roles';
import { PortalField, usePortalControl } from './FormDensity';

/**
 * "What do you do here?", asked on the registration form.
 *
 * The options come from the server rather than a list in this file, so the
 * dropdown cannot offer a title the platform would not accept. If the catalogue
 * cannot be read — it is a public endpoint, but the network is the network — the
 * field disappears rather than blocking the registration: the answer is a
 * preference, and losing a real applicant over it would be a poor trade.
 */
export function RoleChoiceField({
  side,
  value,
  onChange,
}: {
  side: PortalSide;
  value: string;
  onChange: (code: string) => void;
}) {
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const control = usePortalControl();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchRoleCatalog(side);
      if (!cancelled && result.ok) setRoles(result.roles);
    })();
    return () => {
      cancelled = true;
    };
  }, [side]);

  if (roles.length === 0) return null;

  const selected = roles.find((role) => role.code === value);

  return (
    <PortalField
      label="Your role"
      help={selected?.description ?? 'This decides which screens you land on once you are set up.'}
    >
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={control(invalid)}
          data-testid="signup-role"
        >
          <option value="">Choose…</option>
          {roles.map((role) => (
            <option key={role.code} value={role.code}>
              {role.label}
            </option>
          ))}
        </select>
      )}
    </PortalField>
  );
}
