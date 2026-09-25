import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { fetchScenarioBoard, stageScenario } from '../api/demo';
import { useDemoMode } from '../hooks/use-demo-mode';
import { isDemoMode } from '../demo-config';
import {
  formatVotingPower,
  isBehindTarget,
  STAGE_LABELS,
  stageProgress,
  type DemoScenarioRow,
} from '../types/demo';

/**
 * The presenter's control room.
 *
 * Its job is to answer, before anyone clicks anything: which buyer type am I
 * standing in, what does a vote weigh here, and how far has each scenario got.
 * Counts only — the board never names a supplier or shows a quote amount,
 * because identity-protected evaluation does not suspend itself for a demonstration.
 */
export function DemoDashboardPage() {
  const { status, identity, isLoading: statusLoading } = useDemoMode();
  const [scenarios, setScenarios] = useState<DemoScenarioRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staging, setStaging] = useState<string | null>(null);

  const isDemoActive = Boolean(isDemoMode && status.enabled);

  const load = useCallback(async () => {
    setIsLoading(true);
    const result = await fetchScenarioBoard();
    if (result.ok) {
      setScenarios(result.scenarios);
      setError(null);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isDemoActive) {
      setIsLoading(false);
      return;
    }
    void load();
  }, [isDemoActive, load]);

  async function handleStage(code: string) {
    setStaging(code);
    const result = await stageScenario(code);
    setStaging(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (statusLoading) return <p className="p-8 text-muted-foreground">Loading…</p>;

  if (!isDemoActive) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="zero-scroll-container p-3 max-w-6xl mx-auto w-full" data-testid="demo-dashboard">
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xs font-bold text-foreground truncate">Demo Dashboard</h1>
          <span className="text-muted-foreground">·</span>
          <span className="text-[11px] text-muted-foreground truncate">Presenter Control Room</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="zero-scroll-pane mt-2 space-y-2.5">
        {identity && (
          <section
            className="rounded-lg border bg-card p-2.5 shadow-2xs"
            data-testid="demo-identity"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold text-muted-foreground">
                Signed in as: <span className="text-foreground">{identity.fullName ?? 'Demo user'}</span>
                {identity.organizationName && ` (${identity.organizationName})`}
              </h2>
            </div>
            {identity.side === 'BUYER' ? (
              <dl className="mt-1.5 grid gap-2 sm:grid-cols-3 text-xs">
                <div className="rounded border bg-muted/20 px-2 py-1">
                  <dt className="text-[10px] text-muted-foreground">Buyer Type</dt>
                  <dd className="font-semibold text-xs">{identity.buyerTypeLabel ?? '—'}</dd>
                </div>
                <div className="rounded border bg-muted/20 px-2 py-1">
                  <dt className="text-[10px] text-muted-foreground">Your Vote Counts</dt>
                  <dd className="font-semibold text-xs" data-testid="demo-voting-power">
                    {formatVotingPower(identity.votingPower)}
                  </dd>
                </div>
                <div className="rounded border bg-muted/20 px-2 py-1">
                  <dt className="text-[10px] text-muted-foreground">Typical Committee</dt>
                  <dd className="font-semibold text-xs">
                    {identity.defaultCommitteeSize
                      ? `${identity.defaultCommitteeSize} members`
                      : '—'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Supplier view. Suppliers quote and are judged; they do not vote.
              </p>
            )}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-foreground">Scenarios</h2>
          </div>

          {error && (
            <p className="p-2 text-xs text-red-600 bg-red-50 rounded border border-red-200" data-testid="demo-error">
              {error}
            </p>
          )}

          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading scenarios…</p>
          ) : scenarios.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No scenarios are staged. Reseed the demo environment to get them back.
            </p>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-2.5" data-testid="demo-scenario-list">
              {scenarios.map((scenario) => (
                <ScenarioCard
                  key={scenario.code}
                  scenario={scenario}
                  staging={staging === scenario.code}
                  onStage={() => void handleStage(scenario.code)}
                />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border bg-muted/20 p-2.5 text-[11px]">
          <h2 className="font-bold text-foreground text-xs">About this run</h2>
          <p className="mt-0.5 text-muted-foreground">
            Run {status.runId?.slice(0, 8) ?? 'unknown'}
            {status.lastResetAt
              ? `, last reset ${new Date(status.lastResetAt).toLocaleString()}`
              : ', never reset'}
            . A reset starts a new run rather than deleting history: the audit trail
            from earlier runs stays readable and attributable.
          </p>
        </section>
      </div>
    </div>
  );
}

function ScenarioCard({
  scenario,
  staging,
  onStage,
}: {
  scenario: DemoScenarioRow;
  staging: boolean;
  onStage: () => void;
}) {
  const behind = isBehindTarget(scenario);
  const progress = Math.round(stageProgress(scenario.actualStage) * 100);

  return (
    <li className="rounded-lg border bg-card p-3 shadow-2xs" data-testid={`scenario-${scenario.code}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-xs truncate">{scenario.title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {scenario.organizationName}
            {scenario.buyerTypeLabel && ` · ${scenario.buyerTypeLabel}`}
            {scenario.votingPower !== null &&
              ` · ${formatVotingPower(scenario.votingPower)}`}
            {scenario.publicRef && ` · ${scenario.publicRef}`}
          </p>
        </div>
        <span className="shrink-0 rounded border px-2 py-0.2 text-[10px] font-semibold bg-muted/30">
          {STAGE_LABELS[scenario.actualStage]}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{scenario.narrative}</p>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <div className="flex gap-1">
          <dt className="text-muted-foreground text-[11px]">Invited:</dt>
          <dd className="font-semibold text-xs">{scenario.suppliersInvited}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground text-[11px]">Quotes:</dt>
          <dd className="font-semibold text-xs">
            {scenario.quotesReceived}
            {scenario.minQuotesRequired !== null && (
              <span className="text-muted-foreground text-[10px]">
                /{scenario.minQuotesRequired}
              </span>
            )}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted-foreground text-[11px]">Voted:</dt>
          <dd className="font-semibold text-xs">
            {scenario.membersVoted}
            {scenario.weightCast > 0 && (
              <span className="text-muted-foreground text-[10px]">
                {' '}
                ({scenario.weightCast}w)
              </span>
            )}
          </dd>
        </div>
        {scenario.awardStatus && (
          <div className="flex gap-1">
            <dt className="text-muted-foreground text-[11px]">Award:</dt>
            <dd className="font-semibold text-xs text-primary">{scenario.awardStatus}</dd>
          </div>
        )}
      </dl>

      {behind && (
        <p className="mt-1.5 text-[11px] text-amber-700" data-testid="scenario-behind">
          Staged to reach {STAGE_LABELS[scenario.targetStage].toLowerCase()}, currently{' '}
          {STAGE_LABELS[scenario.actualStage].toLowerCase()}.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2 text-xs border-t pt-2">
        {scenario.rfqId && (
          <>
            <Link
              to={`/rfq/${scenario.rfqId}/evaluation`}
              className="text-primary hover:underline text-[11px] font-medium"
            >
              Quotes →
            </Link>
            <Link
              to={`/rfq/${scenario.rfqId}/committee`}
              className="text-primary hover:underline text-[11px] font-medium"
            >
              Vote →
            </Link>
            <Link
              to={`/rfq/${scenario.rfqId}/award`}
              className="text-primary hover:underline text-[11px] font-medium"
            >
              Award →
            </Link>
            <Link
              to={`/rfq/${scenario.rfqId}/audit`}
              className="text-primary hover:underline text-[11px] font-medium"
            >
              Audit →
            </Link>
          </>
        )}
        {behind && (
          <button
            type="button"
            disabled={staging}
            onClick={onStage}
            className="text-primary hover:underline disabled:opacity-50 text-[11px] font-semibold ml-auto"
          >
            {staging ? 'Staging…' : 'Catch up ⚡'}
          </button>
        )}
      </div>
    </li>
  );
}
