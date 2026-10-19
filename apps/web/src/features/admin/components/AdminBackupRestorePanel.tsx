import React, { useState, useEffect } from 'react';
import {
  fetchDbBackups,
  createDbBackup,
  restoreDbBackup,
  purgeTransactionalData,
  simulateDryRunTransactionalReset,
  type DryRunResetImpact,
} from '../api/admin-ops';
import type { DbSnapshotItem } from '../types/admin';

export function AdminBackupRestorePanel() {
  const [backups, setBackups] = useState<DbSnapshotItem[]>([]);
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('TABLE');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [backupType, setBackupType] = useState<string>('TRANSACTIONAL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResetImpact | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleRunDryRun = async () => {
    setIsSimulating(true);
    setStatusMessage(null);
    try {
      const res = await simulateDryRunTransactionalReset();
      setDryRunResult(res);
      setStatusMessage(`✓ Dry-run completed at ${new Date(res.timestamp).toLocaleTimeString()}: ${res.statutoryRetention.auditEvents} statutory audit records protected.`);
    } catch (err) {
      alert(`Dry run simulation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsSimulating(false);
    }
  };

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
    <div className="space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* Top Banner */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl shrink-0">💾</span>
            <h3 className="text-sm sm:text-base font-bold text-foreground">Database Snapshot &amp; Point-in-Time Recovery Engine</h3>
          </div>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Create atomic database snapshots of master data, procurement pipelines, quotes, and cryptographic audit records.
          </p>
        </div>
        <button
          type="button"
          onClick={loadBackups}
          disabled={isLoading}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs"
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
      <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
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
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
            />
          </div>

          <div className="w-full sm:w-56">
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Snapshot Scope:
            </label>
            <select
              value={backupType}
              onChange={(e) => setBackupType(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] cursor-pointer"
            >
              <option value="TRANSACTIONAL">Transactional Pipeline</option>
              <option value="FULL">Full Database Snapshot</option>
              <option value="DEMO_BASELINE">Demo Baseline Persona Seed</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={isCreating}
            className="w-full sm:w-auto inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-98 transition disabled:opacity-50 mobile-touch-target"
          >
            {isCreating ? 'Creating Snapshot…' : '📸 Take DB Snapshot'}
          </button>
        </form>
      </div>

      {/* Snapshots Header & View Mode Switcher */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <span>💾</span> Available Snapshots ({backups.length})
        </h4>

        <div className="flex rounded-xl border bg-muted/50 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('CARDS')}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 transition active:scale-98 ${
              viewMode === 'CARDS'
                ? 'bg-background text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🃏</span> Cards
          </button>
          <button
            type="button"
            onClick={() => setViewMode('TABLE')}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1.5 transition active:scale-98 ${
              viewMode === 'TABLE'
                ? 'bg-background text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>📋</span> Table
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && backups.length === 0 && (
        <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
          ⏳ Loading database snapshots…
        </div>
      )}

      {/* Empty State */}
      {!isLoading && backups.length === 0 && (
        <div className="rounded-2xl border bg-card p-12 text-center space-y-3">
          <span className="text-4xl">💾</span>
          <h3 className="text-base font-bold text-foreground">No Database Snapshots Recorded</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Create a snapshot above to preserve the current state of procurement pipelines, accounts, and audit events.
          </p>
        </div>
      )}

      {/* 1. MOBILE-FIRST RESPONSIVE CARDS VIEW */}
      {!isLoading && viewMode === 'CARDS' && backups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full max-w-full">
          {backups.map((s) => (
            <article
              key={s.id}
              className="rounded-2xl border bg-card p-4 shadow-2xs space-y-3.5 transition hover:shadow-md flex flex-col justify-between"
            >
              {/* Card Header */}
              <div className="space-y-1.5 border-b border-border/50 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h5 className="font-extrabold text-xs text-foreground truncate" title={s.name}>
                      {s.name}
                    </h5>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[9px] font-bold shrink-0">
                    {s.snapshotType}
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="space-y-2 text-xs flex-1">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Size:</span>
                    <span className="font-black text-foreground font-mono">
                      {s.sizeFormatted || `${(s.sizeBytes / 1024).toFixed(1)} KB`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Snapshot ID:</span>
                    <span className="font-mono text-[10px] text-muted-foreground truncate block" title={s.id}>
                      {s.id.slice(0, 12)}…
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/20 p-2.5 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground">Preserved Record Counts</div>
                  {s.tableCounts ? (
                    <div className="flex items-center gap-2 text-[10px] font-mono text-foreground flex-wrap">
                      <span>📋 {s.tableCounts.requirements || 0} Reqs</span>
                      <span>•</span>
                      <span>💬 {s.tableCounts.quotes || 0} Quotes</span>
                      <span>•</span>
                      <span>🏪 {s.tableCounts.purchaseOrders || 0} POs</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground">Master schema &amp; table records</div>
                  )}
                </div>
              </div>

              {/* Card Action Footer: 44px+ touch target */}
              <div className="pt-2 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => handleRestore(s)}
                  className="w-full inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition active:scale-98 shadow-xs mobile-touch-target"
                >
                  <span>↺</span>
                  <span>Restore Database State</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* 2. TABULAR VIEW */}
      {!isLoading && viewMode === 'TABLE' && backups.length > 0 && (
        <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
          <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="sticky top-0 z-10 border-b bg-muted/90 backdrop-blur-xs font-semibold text-muted-foreground shadow-2xs">
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
                {backups.map((s) => (
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
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs min-h-[44px] mobile-touch-target"
                      >
                        Restore State ↺
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Requirement 16: Statutory Data Retention & Dry-Run Impact Assessment */}
      <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-amber-700 dark:text-amber-400 font-bold text-base">🛡️</span>
            <div>
              <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                Data Retention Governance &amp; Dry-Run Impact Assessment
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Requirement 16: Non-destructive dry-run simulation and statutory retention locking.
              </p>
            </div>
          </div>
          <span className="rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold px-2.5 py-1 border border-emerald-300 dark:border-emerald-800">
            🔒 STATUTORY RETENTION ACTIVE
          </span>
        </div>

        {/* Protected Entities Badges */}
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">Immutable Platform Entities (Never Purged):</span>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="px-2 py-1 rounded-md bg-background border font-medium">
              📜 Audit Events &amp; Compliance Logs
            </span>
            <span className="px-2 py-1 rounded-md bg-background border font-medium">
              ⚖️ EULA Consents &amp; Legal Evidence
            </span>
            <span className="px-2 py-1 rounded-md bg-background border font-medium">
              🏢 Verified Supplier Profiles &amp; GSTINs
            </span>
            <span className="px-2 py-1 rounded-md bg-background border font-medium">
              🏷️ Canonical Taxonomy &amp; Keywords
            </span>
            <span className="px-2 py-1 rounded-md bg-background border font-medium">
              🏛️ Benchmark Pilot Organization
            </span>
          </div>
        </div>

        {/* Dry-Run Result Preview */}
        {dryRunResult && (
          <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground">
                Dry-Run Scope Impact Report (Simulated at {new Date(dryRunResult.timestamp).toLocaleTimeString()})
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-bold">
                {dryRunResult.governanceStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Audit Logs</div>
                <div className="font-bold text-sm text-emerald-600">
                  {dryRunResult.statutoryRetention.auditEvents} (Locked)
                </div>
              </div>
              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Verified Suppliers</div>
                <div className="font-bold text-sm text-emerald-600">
                  {dryRunResult.statutoryRetention.verifiedSuppliers} (Locked)
                </div>
              </div>
              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Categories</div>
                <div className="font-bold text-sm text-emerald-600">
                  {dryRunResult.statutoryRetention.canonicalCategories} (Locked)
                </div>
              </div>
              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Organizations</div>
                <div className="font-bold text-sm text-emerald-600">
                  {dryRunResult.statutoryRetention.registeredOrganizations} (Locked)
                </div>
              </div>
              <div className="p-2 rounded bg-muted/40 border">
                <div className="text-[10px] text-muted-foreground">Active Users</div>
                <div className="font-bold text-sm text-emerald-600">
                  {dryRunResult.statutoryRetention.activeUsers} (Locked)
                </div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <span className="font-semibold text-foreground text-[11px]">
                Transactional Records in Candidate Scope (If executed in disposable test DB):
              </span>
              <div className="mt-1 flex flex-wrap gap-3 text-muted-foreground text-[11px]">
                <span>📋 Requirements: <strong className="text-foreground">{dryRunResult.transactionalScope.requirements}</strong></span>
                <span>•</span>
                <span>📨 RFQs: <strong className="text-foreground">{dryRunResult.transactionalScope.rfqs}</strong></span>
                <span>•</span>
                <span>💬 Quotes: <strong className="text-foreground">{dryRunResult.transactionalScope.quotes}</strong></span>
                <span>•</span>
                <span>🏪 POs: <strong className="text-foreground">{dryRunResult.transactionalScope.purchaseOrders}</strong></span>
                <span>•</span>
                <span>🧾 Invoices: <strong className="text-foreground">{dryRunResult.transactionalScope.invoices}</strong></span>
                <span>•</span>
                <span>💳 Payments: <strong className="text-foreground">{dryRunResult.transactionalScope.payments}</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleRunDryRun}
            disabled={isSimulating}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold shadow hover:bg-primary/90 transition active:scale-98"
          >
            {isSimulating ? 'Simulating Dry-Run Impact…' : '🔍 Run Dry-Run Impact Assessment (Non-Destructive)'}
          </button>

          <span className="text-[11px] text-muted-foreground italic">
            Note: Destructive resets are strictly blocked outside isolated disposable environments.
          </span>
        </div>
      </div>
    </div>
  );
}
