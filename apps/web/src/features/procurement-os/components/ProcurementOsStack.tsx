import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMarketIntelligence } from '../api/fetch-market-intelligence';
import {
  fetchProcurementPolicy,
  fetchRfqEvaluationWeights,
  fetchSupplierNetworkSummary,
  type RfqCriterionWeight,
} from '../api/fetch-procurement-os';
import { MarketIntelligencePanel } from './MarketIntelligencePanel';
import { ProcurementPolicyPanel } from './ProcurementPolicyPanel';
import { SupplierNetworkPanel } from './SupplierNetworkPanel';
import type { MarketIntelligenceSummary, ProcurementPolicyRules, SupplierNetworkSummary } from '@otp/domain';

export interface ProcurementOsStackProps {
  rfqId: string;
  requirementTitle?: string;
  compact?: boolean;
}

/** Three OTP Platform pillars for an active RFQ. */
export function ProcurementOsStack({ rfqId, requirementTitle, compact = false }: ProcurementOsStackProps) {
  const [networks, setNetworks] = useState<SupplierNetworkSummary[]>([]);
  const [totalInvited, setTotalInvited] = useState(0);
  const [policy, setPolicy] = useState<ProcurementPolicyRules | null>(null);
  const [policyType, setPolicyType] = useState<string>();
  const [rfqWeights, setRfqWeights] = useState<RfqCriterionWeight[]>([]);
  const [intelligence, setIntelligence] = useState<MarketIntelligenceSummary | null>(null);
  const [networkErr, setNetworkErr] = useState<string | null>(null);
  const [policyErr, setPolicyErr] = useState<string | null>(null);
  const [intelErr, setIntelErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [net, pol, intel, weights] = await Promise.all([
        fetchSupplierNetworkSummary(rfqId),
        fetchProcurementPolicy(rfqId),
        fetchMarketIntelligence(rfqId),
        fetchRfqEvaluationWeights(rfqId),
      ]);
      if (cancelled) return;
      setRfqWeights(weights.ok ? weights.weights : []);
      if (net.ok) {
        setNetworks(net.networks);
        setTotalInvited(net.totalInvited);
        setNetworkErr(null);
      } else {
        setNetworkErr(net.error);
      }
      if (pol.ok) {
        setPolicy(pol.policy);
        setPolicyType(pol.policyType);
        setPolicyErr(null);
      } else {
        setPolicyErr(pol.error);
      }
      if (intel.ok) {
        setIntelligence(intel.intelligence);
        setIntelErr(null);
      } else {
        setIntelErr(intel.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rfqId]);

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'} data-testid="procurement-os-stack">
      {!compact && (
        <header>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            OTP Platform Engine
          </p>
          {requirementTitle && (
            <h2 className="text-lg font-semibold">{requirementTitle}</h2>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            Supplier network · Market intelligence · Procurement policy — same workflow, governed
            procurement.
          </p>
        </header>
      )}
      <div className="space-y-4">
        <SupplierNetworkPanel
          networks={networks}
          totalInvited={totalInvited}
          isLoading={loading}
          error={networkErr}
        />
        <MarketIntelligencePanel
          intelligence={intelligence}
          isLoading={loading}
          error={intelErr}
        />
        <ProcurementPolicyPanel
          policy={policy}
          policyType={policyType}
          rfqWeights={rfqWeights}
          isLoading={loading}
          error={policyErr}
        />
      </div>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          <Link to={`/rfq/${rfqId}/evaluation`} className="hover:text-foreground">
            Continue to Fair Anonymous Comparison →
          </Link>
        </p>
      )}
    </div>
  );
}
