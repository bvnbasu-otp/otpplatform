import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getPilotByRequirementId } from '@/lib/pilots';
import { ProcurementStageNavigator } from '@/features/lifecycle';

interface RequirementDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  requirementType: string;
  createdAt: string;
}

interface RequirementDetailPageProps {
  requirementId: string;
}

export function RequirementDetailPage({ requirementId }: RequirementDetailPageProps) {
  const [requirement, setRequirement] = useState<RequirementDetail | null>(null);
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const pilot = getPilotByRequirementId(requirementId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error: fetchError } = await supabase
        .from('requirements')
        .select('id, title, description, status, requirement_type, created_at')
        .eq('id', requirementId)
        .maybeSingle();

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setRequirement(null);
      } else if (!data) {
        setError('Requirement not found');
        setRequirement(null);
      } else {
        setRequirement({
          id: data.id,
          title: data.title,
          description: data.description,
          status: data.status,
          requirementType: data.requirement_type,
          createdAt: data.created_at,
        });
        setError(null);
      }

      const { data: rfq } = await supabase
        .from('rfqs')
        .select('id')
        .eq('requirement_id', requirementId)
        .maybeSingle();

      if (!cancelled) {
        setRfqId(rfq?.id ?? pilot?.rfqId ?? null);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requirementId, pilot?.rfqId]);

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full overflow-x-hidden">
      <ProcurementStageNavigator
        currentLinearStep={1}
        currentStage="DRAFT"
        orderTitle={isLoading ? 'Loading…' : (requirement?.title ?? 'Requirement')}
        orderReference={requirementId}
        requirementId={requirementId}
        rfqId={rfqId}
        role="buyer"
        backToUrl="/"
        backToLabel="Buyer Dashboard"
      />

      {/* Header Banner - Single Row High Density */}
      <div className="rounded-lg border bg-card px-3 py-2.5 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shrink-0">
            Requirement Specification
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">Once Spec is Submitted</h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              Requirement specification is locked. Proceed to broadcast enquiry to verified suppliers.
            </p>
          </div>
        </div>
      </div>

      {pilot && (
        <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-3 py-1 border shrink-0">
          🏢 <strong>{pilot.orgName}</strong> · {pilot.label} · {pilot.location}
        </div>
      )}

      {error && <p className="text-xs text-red-600 shrink-0">{error}</p>}

      {requirement && (
        <div className="zero-scroll-pane grid grid-cols-1 md:grid-cols-3 gap-3">
          <section className="rounded-lg border bg-card p-3 md:col-span-2 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Specification Parameters</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="bg-muted/20 p-2 rounded border">
                <dt className="text-muted-foreground text-[10px] uppercase">Status</dt>
                <dd className="font-bold text-foreground mt-0.5">{requirement.status}</dd>
              </div>
              <div className="bg-muted/20 p-2 rounded border">
                <dt className="text-muted-foreground text-[10px] uppercase">Category / Type</dt>
                <dd className="font-bold text-foreground mt-0.5">{requirement.requirementType}</dd>
              </div>
              <div className="sm:col-span-2 bg-muted/10 p-2.5 rounded border">
                <dt className="text-muted-foreground text-[10px] uppercase font-semibold">Scope Description</dt>
                <dd className="mt-1 text-xs leading-relaxed text-foreground whitespace-pre-wrap">{requirement.description ?? '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border bg-card p-3 space-y-2 flex flex-col justify-between">
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Workflow Transition</h2>
              <p className="text-[11px] text-muted-foreground leading-snug">
                This requirement is active in the procurement pipeline. Next action is matching and broadcasting the enquiry to verified suppliers.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t">
              {rfqId ? (
                <>
                  <Link
                    to={`/requirements/${requirementId}/discover`}
                    className="min-h-[48px] w-full flex items-center justify-between rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
                  >
                    <span>Discover &amp; Match Suppliers</span>
                    <span>→</span>
                  </Link>
                  <Link
                    to={`/rfq/${rfqId}/evaluation`}
                    className="min-h-[48px] w-full flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition mobile-touch-target"
                  >
                    <span>Identity-Protected Evaluation</span>
                    <span>→</span>
                  </Link>
                </>
              ) : (
                <Link
                  to={`/requirements/${requirementId}/discover`}
                  className="min-h-[48px] w-full flex items-center justify-between rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition mobile-touch-target"
                >
                  <span>Send Sourcing Enquiry</span>
                  <span>→</span>
                </Link>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
