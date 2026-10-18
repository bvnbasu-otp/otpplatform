import React, { useState, useEffect } from 'react';
import type { InternalRole } from '../api/internal-ops';
import { fetchInternalRoles } from '../api/internal-ops';

const SYSTEM_PERMISSIONS = [
  { code: 'admin:read', label: 'Admin Console Read', group: 'OPS_GOVERNANCE', desc: 'Read internal administration consoles' },
  { code: 'admin:write', label: 'Admin Settings Write', group: 'OPS_GOVERNANCE', desc: 'Modify internal settings and operational data' },
  { code: 'admin:users:manage', label: 'Manage Internal Users', group: 'OPS_GOVERNANCE', desc: 'Invite, assign, and manage operator accounts' },
  { code: 'admin:referrals:authorize', label: 'Authorize Referral Bonus', group: 'FINANCE_LEDGER', desc: 'Approve eligible staff referral achievements' },
  { code: 'admin:referrals:payout', label: 'Process Referral Payout', group: 'FINANCE_LEDGER', desc: 'Record bank settlement and UTR evidence' },
  { code: 'admin:audit:read', label: 'Read Audit Logs', group: 'AUDIT_COMPLIANCE', desc: 'Inspect system and administrative audit logs' },
];

export function InternalRbacMatrixPanel() {
  const [roles, setRoles] = useState<InternalRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        const r = await fetchInternalRoles();
        setRoles(r);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const hasRolePermission = (roleCode: string, permCode: string): boolean => {
    if (roleCode === 'SUPER_ADMIN') return true;
    if (roleCode === 'INTERNAL_OPERATOR') {
      return permCode === 'admin:read' || permCode === 'admin:write';
    }
    if (roleCode === 'FINANCE_OPERATOR') {
      return (
        permCode === 'admin:read' ||
        permCode === 'admin:referrals:authorize' ||
        permCode === 'admin:referrals:payout'
      );
    }
    if (roleCode === 'CATALOG_MANAGER') {
      return permCode === 'admin:read' || permCode === 'admin:write';
    }
    return false;
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border rounded-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-foreground">Internal RBAC Permission Matrix</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Permission groups, system roles, and explicit checkbox grants governing the internal operator boundary.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-muted/30 text-muted-foreground font-semibold">
            <tr>
              <th className="py-3 px-4 min-w-[200px]">Permission</th>
              <th className="py-3 px-4">Group</th>
              {roles.map((r) => (
                <th key={r.id} className="py-3 px-4 text-center">
                  <div className="font-semibold text-foreground">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground">{r.code}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {SYSTEM_PERMISSIONS.map((perm) => (
              <tr key={perm.code} className="hover:bg-muted/10 transition">
                <td className="py-3 px-4">
                  <div className="font-medium text-foreground">{perm.label}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{perm.code}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{perm.desc}</div>
                </td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground">
                    {perm.group}
                  </span>
                </td>
                {roles.map((r) => {
                  const allowed = hasRolePermission(r.code, perm.code);
                  return (
                    <td key={r.id} className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                          allowed
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : 'bg-muted/40 text-muted-foreground/40'
                        }`}
                      >
                        {allowed ? '✓' : '—'}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
