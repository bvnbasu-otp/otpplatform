import type { ProcurementPolicyRules } from '@otp/domain';
import type { RfqCriterionWeight } from '../api/fetch-procurement-os';

export interface ProcurementPolicyPanelProps {
  policy: ProcurementPolicyRules | null;
  policyType?: string;
  /** What this RFQ is actually scored on, which overrides the org default. */
  rfqWeights?: RfqCriterionWeight[];
  isLoading?: boolean;
  error?: string | null;
}

function formatRoles(roles: string[]): string {
  return roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(', ');
}

/**
 * Governance rules — who can request, approve, award; min quotes; evaluation weights.
 */
export function ProcurementPolicyPanel({
  policy,
  policyType,
  rfqWeights = [],
  isLoading = false,
  error = null,
}: ProcurementPolicyPanelProps) {
  if (isLoading) {
    return (
      <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Loading procurement policy…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        <h3 className="font-semibold text-foreground">C. Procurement Policy</h3>
        <p className="mt-1">{error}</p>
      </section>
    );
  }

  if (!policy) return null;

  const w = policy.evaluationWeights;

  return (
    <section className="rounded-lg border bg-card p-4" data-testid="procurement-policy-panel">
      <h3 className="text-sm font-semibold">C. Procurement Policy</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Operating rules for this organization{policyType ? ` (${policyType.replace(/_/g, ' ')})` : ''}.
      </p>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between gap-4 border-b pb-2">
          <dt className="text-muted-foreground">Who can request?</dt>
          <dd className="text-right font-medium">{formatRoles(policy.requestRoles)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b pb-2">
          <dt className="text-muted-foreground">Who can approve?</dt>
          <dd className="text-right font-medium">{formatRoles(policy.approveRoles)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b pb-2">
          <dt className="text-muted-foreground">Who can award?</dt>
          <dd className="text-right font-medium">{formatRoles(policy.awardRoles)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b pb-2">
          <dt className="text-muted-foreground">Minimum competitive quotes</dt>
          <dd className="font-medium">{policy.minQuotesRequired} Suppliers</dd>
        </div>
        <div className="flex justify-between gap-4 border-b pb-2">
          <dt className="text-muted-foreground">Evaluation voting model</dt>
          <dd className="font-medium text-right">
            {policy.committeeVoteRequired
              ? `${policy.minCommitteeVotes} Votes Required (Democratic Committee Quorum)`
              : '1 Vote (Single-Buyer Direct Fast-Track Award)'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {rfqWeights.length > 0
              ? 'Evaluation weights for this requirement'
              : 'Default evaluation weights'}
          </dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {rfqWeights.length > 0 ? (
              rfqWeights.map((weight) => (
                <span
                  key={weight.code}
                  className="rounded-full border px-2 py-0.5 text-xs"
                >
                  {weight.name} {weight.percent}%
                </span>
              ))
            ) : (
              <>
                <span className="rounded-full border px-2 py-0.5 text-xs">
                  Price {w.price}%
                </span>
                <span className="rounded-full border px-2 py-0.5 text-xs">
                  Delivery {w.delivery}%
                </span>
                <span className="rounded-full border px-2 py-0.5 text-xs">
                  Warranty {w.warranty}%
                </span>
              </>
            )}
          </dd>
          {rfqWeights.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              The buyer sets their own criteria on each requirement.
            </p>
          )}
        </div>
      </dl>
    </section>
  );
}
