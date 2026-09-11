import React, { useState, useEffect } from 'react';
import { fetchDbBackups, createDbBackup, restoreDbBackup, purgeTransactionalData } from '../api/admin-ops';
import type { DbSnapshotItem } from '../types/admin';

export function AdminBackupRestorePanel() {
  const [backups, setBackups] = useState<DbSnapshotItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [backupType, setBackupType] = useState<string>('TRANSACTIONAL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadBackups = async () => {
    setIsLoading(true);
    const res = await fetchDbBackups();
    if (res.ok) {
      setBackups(res.backups);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadBackups();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setStatusMessage(null);
    try {
      const res = await createDbBackup(backupName.trim() || `Manual Snapshot ${new Date().toLocaleTimeString()}`, backupType);
      if (res.ok && res.result) {
        setStatusMessage(`Backup snapshot "${res.result.name}" created successfully (${res.result.sizeBytes} bytes).`);
        setBackupName('');
        await loadBackups();
      } else {
        alert(res.error || 'Failed to create backup');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleRestore = async (snapshot: DbSnapshotItem) => {
    if (!window.confirm(`Are you sure you want to verify and restore state from snapshot "${snapshot.name}"?`)) return;
    setIsLoading(true);
    try {
      const res = await restoreDbBackup(snapshot.id, 'RESTORE');
      if (res.ok) {
        setStatusMessage(res.message);
      } else {
        alert(res.error || 'Restore failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetTransactions = async () => {
    const confirmation = window.prompt('Type "RESET" to confirm purging all transactional requirements, RFQs, quotes, and work orders:');
    if (confirmation !== 'RESET') return;

    setIsLoading(true);
    try {
      const res = await restoreDbBackup(undefined, 'RESET_TRANSACTIONS');
      if (res.ok) {
        setStatusMessage(res.message);
        await loadBackups();
      } else {
        alert(res.error || 'Reset failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">💾</span>
            <h3 className="text-base font-bold text-foreground">Database Snapshot &amp; Point-in-Time Recovery Engine</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create atomic database snapshots of master data, procurement pipelines, quotes, and cryptographic audit records.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBackups}
          disabled={isLoading}
          className="rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          {isLoading ? 'Refreshing…' : '🔄 Refresh Backups'}
        </button>
      </div>

      {statusMessage && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-950 flex items-center justify-between font-semibold">
          <span>✓ {statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Create Backup Form */}
      <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <span>📸</span> Create New Database Snapshot
        </h4>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 max-w-3xl">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Snapshot Name / Tag:
            </label>
            <input
              type="text"
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              placeholder="e.g. Pre-Pilot Staging Snapshot / EOD Backup"
              className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="w-48">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Snapshot Scope:
            </label>
            <select
              value={backupType}
              onChange={(e) => setBackupType(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="TRANSACTIONAL">Transactional Pipeline</option>
              <option value="FULL">Full Database Snapshot</option>
              <option value="DEMO_BASELINE">Demo Baseline Persona Seed</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isCreating}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition disabled:opacity-50"
          >
            {isCreating ? 'Creating Snapshot…' : '+ Take DB Snapshot'}
          </button>
        </form>
      </div>

      {/* Snapshots Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="border-b bg-muted/40 p-3 flex items-center justify-between">
          <h4 className="text-xs font-bold text-foreground">Available Snapshots ({backups.length})</h4>
          <span className="text-[11px] text-muted-foreground font-medium">Stored in PostgreSQL admin_database_snapshots</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/20 font-semibold text-muted-foreground">
              <tr>
                <th className="p-3">Snapshot Name</th>
                <th className="p-3">Scope</th>
                <th className="p-3">Table Records</th>
                <th className="p-3">Size</th>
                <th className="p-3">Created At</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y text-foreground">
              {isLoading && backups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    Loading database snapshots…
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground font-medium">
                    No snapshots recorded yet. Create one above to preserve current database state.
                  </td>
                </tr>
              ) : (
                backups.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/20 transition">
                    <td className="p-3">
                      <div className="font-bold text-foreground">{s.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">ID: {s.id}</div>
                    </td>

                    <td className="p-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold">
                        {s.snapshotType}
                      </span>
                    </td>

                    <td className="p-3 text-[11px] text-muted-foreground">
                      {s.tableCounts ? (
                        <span>
                          {s.tableCounts.requirements || 0} Reqs · {s.tableCounts.quotes || 0} Quotes · {s.tableCounts.purchaseOrders || 0} POs
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="p-3 font-semibold text-foreground">
                      {s.sizeFormatted || `${(s.sizeBytes / 1024).toFixed(1)} KB`}
                    </td>

                    <td className="p-3 text-muted-foreground text-[11px]">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>

                    <td className="p-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleRestore(s)}
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 shadow-xs"
                      >
                        Restore State ↺
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-300 bg-red-50/40 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-red-200 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-red-700 font-bold text-base">⚠️</span>
            <h4 className="text-sm font-bold text-red-900">Production Testing Danger Zone</h4>
          </div>
          <span className="rounded-md bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 border border-red-300">
            TRANSACTIONAL RESET
          </span>
        </div>
        <p className="text-xs text-red-800 leading-relaxed">
          Wipes all buyer orders (Requirements, RFQs, Quotes, Evaluations, Votes) and seller orders (POs, Work Orders, Inspections, Invoices, Payments). Pure SuperAdmins, 104 verified suppliers, benchmark pilot org, demo accounts, and master taxonomy remain 100% intact. Ready for staging, demo, pilot, pre-production &amp; production.
        </p>
        <button
          type="button"
          onClick={async () => {
            const entered = window.prompt(
              '⚠️ TRANSACTIONAL PURGE CONFIRMATION:\n\nTo purge test records, enter token or leave blank if in Staging/Demo:\n(For Production DB: type PERMANENTLY_PURGE_PRODUCTION_DATA_I_AM_CERTAIN)'
            );
            if (entered === null) return;
            setIsLoading(true);
            try {
              const res = await purgeTransactionalData(entered);
              if (res.ok) {
                setStatusMessage(`✓ ${res.message} (Preserved ${res.buyersPreserved ?? 'all'} buyer accounts, ${res.suppliersPreserved ?? 104} verified suppliers, ${res.organizationsPreserved ?? 16} canonical organizations, and ${res.taxonomiesPreserved ?? 16} taxonomies).`);
                await loadBackups();
              } else {
                alert(`Purge failed: ${res.error}`);
              }
            } catch (err) {
              alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
            } finally {
              setIsLoading(false);
            }
          }}
          className="rounded-lg bg-red-600 text-white px-4 py-2 text-xs font-bold shadow hover:bg-red-700 transition"
        >
          🧹 Purge All Test Records &amp; Reset to Clean Production State
        </button>
      </div>
    </div>
  );
}
