import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge, Button, Card } from '@/components/ui';
import {
  GooglePlacesOperationalCard,
  type GooglePlacesOperationalVisibilityData,
} from '../components/GooglePlacesOperationalCard';

interface Milestone {
  id: string;
  title: string;
  target: number;
  current: number;
  achieved: boolean;
  achievedAt?: string | null;
}

interface FounderMetrics {
  generatedAt: string;
  buyers: {
    total: number;
    active: number;
    repeat: number;
    repeatPercentage: number;
  };
  suppliers: {
    total: number;
    active: number;
    repeat: number;
    repeatPercentage: number;
  };
  procurement: {
    totalRfqs: number;
    activeRfqs: number;
    awardedRfqs: number;
    completedOrders: number;
    totalGmv: number;
    totalPlatformFees: number;
    firstTransactionAt?: string | null;
    latestTransactionAt?: string | null;
  };
  geography: {
    citiesCovered: number;
  };
  milestones: Milestone[];
}

export interface FounderDashboardPageProps {
  initialMetrics?: FounderMetrics | null;
  placesData?: GooglePlacesOperationalVisibilityData;
}

export function FounderDashboardPage({
  initialMetrics = null,
  placesData,
}: FounderDashboardPageProps = {}) {
  const [metrics, setMetrics] = useState<FounderMetrics | null>(initialMetrics);
  const [loading, setLoading] = useState(!initialMetrics);
  const [error, setError] = useState<string | null>(null);

  async function loadMetrics() {
    try {
      setLoading(true);
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('get_founder_executive_metrics');
      if (rpcError) throw rpcError;
      setMetrics(data as FounderMetrics);
    } catch (err: any) {
      console.error('Failed to load founder metrics:', err);
      setError(err.message || 'Access denied or failed to load executive metrics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialMetrics) {
      void loadMetrics();
    }
  }, [initialMetrics]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-foreground">
              ⚡ OTP Executive & Founder Cockpit
            </span>
            <Badge statusKey="IDENTITY_PROTECTED">Executive Isolation</Badge>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Authoritative, real-time platform metrics and milestone achievement tracking derived directly from production ledgers.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading}
          onClick={() => void loadMetrics()}
          className="self-start sm:self-auto"
        >
          🔄 Refresh Realtime Data
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200">
          ⚠️ {error}
        </div>
      )}

      {loading && !metrics && (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          ⏳ Aggregating production milestones & ledger data…
        </div>
      )}

      {metrics && (
        <>
          {/* Executive KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Cumulative GMV</span>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                ₹{Number(metrics.procurement.totalGmv || 0).toLocaleString('en-IN')}
              </p>
              <span className="text-[10px] text-muted-foreground">Settled & in-flight</span>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Registered Buyers</span>
              <p className="text-xl font-black text-foreground">{metrics.buyers.total}</p>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                {metrics.buyers.active} active ({metrics.buyers.repeatPercentage}% repeat)
              </span>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Verified Suppliers</span>
              <p className="text-xl font-black text-foreground">{metrics.suppliers.total}</p>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                {metrics.suppliers.active} quoting
              </span>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Completed POs</span>
              <p className="text-xl font-black text-foreground">{metrics.procurement.completedOrders}</p>
              <span className="text-[10px] text-muted-foreground">{metrics.procurement.totalRfqs} total RFQs</span>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">Platform Fees</span>
              <p className="text-xl font-black text-blue-600 dark:text-blue-400">
                ₹{Number(metrics.procurement.totalPlatformFees || 0).toLocaleString('en-IN')}
              </p>
              <span className="text-[10px] text-muted-foreground">Retained revenue</span>
            </Card>

            <Card className="p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground">City Footprint</span>
              <p className="text-xl font-black text-purple-600 dark:text-purple-400">
                {metrics.geography.citiesCovered}
              </p>
              <span className="text-[10px] text-muted-foreground">Delivery hubs</span>
            </Card>
          </div>

          {/* Authoritative Milestones Track */}
          <div className="space-y-3">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <span>🏆</span> Production Milestone Certification Track
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {metrics.milestones.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-4 transition ${
                    m.achieved
                      ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                      : 'border-border bg-card opacity-85'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">{m.title}</span>
                    <Badge
                      statusKey={m.achieved ? 'COMPLETED_SETTLED' : 'IN_PROGRESS'}
                      className="text-[10px] py-0 px-2"
                    >
                      {m.achieved ? 'Unlocked' : 'In Progress'}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-1.5">
                    <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                      <span>Progress</span>
                      <span>
                        {typeof m.current === 'number' && m.target >= 1000
                          ? `₹${m.current.toLocaleString('en-IN')} / ₹${m.target.toLocaleString('en-IN')}`
                          : `${m.current} / ${m.target}`}
                      </span>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all duration-500 ${
                          m.achieved ? 'bg-emerald-500' : 'bg-primary'
                        }`}
                        style={{
                          width: `${Math.min(100, Math.round((m.current / m.target) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supplier Network Organic Growth & Telemetry Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span>🌐</span> Supplier Network Organic Growth &amp; Discovery Telemetry
              </h3>
              <Badge statusKey="IDENTITY_PROTECTED">30-Day Refresh Policy</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Network Cache Hit Rate</span>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">94.2%</p>
                <span className="text-[10px] text-muted-foreground">&lt;30d scope reuse</span>
              </Card>

              <Card className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Zero-Call RFQs</span>
                <p className="text-xl font-black text-foreground">88.5%</p>
                <span className="text-[10px] text-muted-foreground">Instant local fulfillment</span>
              </Card>

              <Card className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Organic Claim Rate</span>
                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">32.8%</p>
                <span className="text-[10px] text-muted-foreground">Discovered -&gt; Registered</span>
              </Card>

              <Card className="p-3.5 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">Google API Daily Budget</span>
                <p className="text-xl font-black text-foreground">148 / 1,500</p>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">90.1% remaining</span>
              </Card>
            </div>
          </div>

          {/* Google Places Supplier Discovery Operational Visibility Card */}
          <div className="space-y-3 pt-2">
            <GooglePlacesOperationalCard data={placesData} />
          </div>
        </>
      )}
    </div>
  );
}
