import React, { useState } from 'react';
import {
  type DiscoveryScopeDescriptor,
  type ScopeCoverageReport,
  type ScopeFreshnessStatus,
  SupplierTruthfulVerificationStage,
  VERIFICATION_STAGE_DESCRIPTIONS,
  CANONICAL_INDIAN_PROCUREMENT_STANDARDS,
} from '@otp/domain';
import { Button, Card, Badge } from '@/components/ui';

export interface AdminSupplierNetworkConsoleProps {
  onPrepareLocation?: (params: {
    state: string;
    city: string;
    pincode: string;
    category: string;
    forceRefresh: boolean;
  }) => Promise<any>;
  onRefreshTelemetry?: () => void;
}

const INDIAN_STATES = [
  'Karnataka',
  'Maharashtra',
  'Delhi NCR',
  'Tamil Nadu',
  'Telangana',
  'Gujarat',
  'Haryana',
  'Uttar Pradesh',
  'West Bengal',
];

const POPULAR_CITIES: Record<string, string[]> = {
  Karnataka: ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi'],
  Maharashtra: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Thane'],
  'Delhi NCR': ['New Delhi', 'Gurugram', 'Noida', 'Faridabad', 'Ghaziabad'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli'],
  Telangana: ['Hyderabad', 'Secunderabad', 'Warangal'],
  Gujarat: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
  Haryana: ['Gurugram', 'Faridabad', 'Panipat', 'Ambala'],
  'Uttar Pradesh': ['Noida', 'Greater Noida', 'Lucknow', 'Kanpur'],
  'West Bengal': ['Kolkata', 'Howrah', 'Siliguri'],
};

const CANONICAL_CATEGORIES = [
  'Electrical & Automation',
  'Construction & Civil Works',
  'Plumbing & Water Systems',
  'Painting & Waterproofing',
  'Security & Surveillance',
  'Elevator & Lift Maintenance',
  'HVAC & Air Conditioning',
  'Food, Catering & Hospitality',
  'Office Furniture & Fixtures',
  'Solar Power & Inverters',
];

export function AdminSupplierNetworkConsole({
  onPrepareLocation,
  onRefreshTelemetry,
}: AdminSupplierNetworkConsoleProps) {
  const [state, setState] = useState('Karnataka');
  const [city, setCity] = useState('Bengaluru');
  const [pincode, setPincode] = useState('560048');
  const [category, setCategory] = useState('Electrical & Automation');
  const [customCategory, setCustomCategory] = useState('');
  const [forceRefresh, setForceRefresh] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<ScopeCoverageReport | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'warn' | 'error' } | null>(null);

  const activeCategory = category === 'OTHER' ? customCategory.trim() : category;

  const handleStateChange = (newState: string) => {
    setState(newState);
    const cities = POPULAR_CITIES[newState] || ['Primary City'];
    setCity(cities[0] || 'City');
  };

  const handleCheckCoverage = async (executeDiscovery: boolean = false) => {
    if (!pincode.trim() || !activeCategory) {
      setMessage({ text: 'Please specify Pincode and Procurement Category.', type: 'error' });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      if (onPrepareLocation) {
        const res = await onPrepareLocation({
          state,
          city,
          pincode: pincode.trim(),
          category: activeCategory,
          forceRefresh: executeDiscovery || forceRefresh,
        });

        if (res && res.ok) {
          setReport(res.report);
          setMessage({
            text: res.message || 'Location network analysis complete.',
            type: 'success',
          });
          onRefreshTelemetry?.();
        } else {
          setMessage({
            text: res?.message || res?.error || 'Failed to prepare supplier network.',
            type: 'error',
          });
        }
      } else {
        // Fallback simulation for offline/standalone execution
        const mockSuppliers = [
          {
            id: 'sup-demo-01',
            businessName: `${city} Electrical Supplies Pvt Ltd`,
            verificationStage: SupplierTruthfulVerificationStage.DETAILS_AVAILABLE,
            firstDiscoveredAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            lastRefreshedAt: new Date().toISOString(),
            provenanceProviders: ['GOOGLE_PLACES'],
            locations: [{ id: 'l1', supplierId: 'sup-demo-01', state, city, pincode, isPrimary: true, serviceRadiusKm: 25 }],
            categories: [{ id: 'c1', supplierId: 'sup-demo-01', categoryCode: 'ELEC', categoryName: activeCategory, isPrimary: true, confidenceScore: 85 }],
            observationsCount: 2,
            isOtpRegistered: false,
            isGstVerified: false,
            complianceStandards: CANONICAL_INDIAN_PROCUREMENT_STANDARDS.slice(0, 2),
          },
          {
            id: 'sup-demo-02',
            businessName: `Apex Regional ${activeCategory} Works`,
            verificationStage: SupplierTruthfulVerificationStage.OTP_REGISTERED,
            firstDiscoveredAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
            lastRefreshedAt: new Date().toISOString(),
            provenanceProviders: ['DIRECT_NETWORK', 'GOOGLE_PLACES'],
            locations: [{ id: 'l2', supplierId: 'sup-demo-02', state, city, pincode, isPrimary: true, serviceRadiusKm: 30 }],
            categories: [{ id: 'c2', supplierId: 'sup-demo-02', categoryCode: 'ELEC_2', categoryName: activeCategory, isPrimary: true, confidenceScore: 92 }],
            observationsCount: 4,
            isOtpRegistered: true,
            isGstVerified: true,
            complianceStandards: CANONICAL_INDIAN_PROCUREMENT_STANDARDS.slice(0, 1),
          },
        ];

        const mockReport: ScopeCoverageReport = {
          scope: { state, city, pincode, category: activeCategory },
          freshness: {
            scope: { state, city, pincode, category: activeCategory },
            status: executeDiscovery ? 'FRESH' : 'NEVER_DISCOVERED',
            lastDiscoveredAt: executeDiscovery ? new Date().toISOString() : null,
            ageInDays: executeDiscovery ? 0 : null,
            knownSupplierCount: executeDiscovery ? 2 : 0,
            stageBreakdown: {
              DISCOVERED_IN_AREA: 0,
              DETAILS_AVAILABLE: executeDiscovery ? 1 : 0,
              OTP_REGISTERED: executeDiscovery ? 1 : 0,
              OTP_VERIFIED: 0,
              GST_VERIFIED: executeDiscovery ? 1 : 0,
            },
            canReuseCachedNetwork: executeDiscovery,
            requiresExternalDiscovery: !executeDiscovery,
            explanation: executeDiscovery
              ? `Prepared fresh supplier network for ${city} (${pincode}). 2 suppliers available with 0 API calls required for upcoming RFQs.`
              : `No suppliers pre-warmed for ${city} (${pincode}) in ${activeCategory}.`,
          },
          suppliers: executeDiscovery ? (mockSuppliers as any) : [],
          summary: {
            totalKnown: executeDiscovery ? 2 : 0,
            discoveredInArea: 0,
            detailsAvailable: executeDiscovery ? 1 : 0,
            otpRegistered: executeDiscovery ? 1 : 0,
            otpVerified: 0,
            gstVerified: executeDiscovery ? 1 : 0,
            standardCompliantCount: executeDiscovery ? 2 : 0,
          },
        };

        setReport(mockReport);
        setMessage({
          text: executeDiscovery
            ? `Successfully prepared supplier network for ${city} (${pincode}).`
            : `Coverage status assessed: ${mockReport.freshness.status}`,
          type: 'success',
        });
      }
    } catch (err: any) {
      setMessage({ text: err?.message || 'Error executing location preparation.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-supplier-network-console">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🌐</span>
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              Prepare Supplier Network &amp; Location Pre-Population
            </h2>
            <Badge statusKey="IDENTITY_PROTECTED">30-Day Policy</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Audit existing regional supplier density, evaluate 30-day freshness status, and pre-warm location coverage ahead of buyer demand.
          </p>
        </div>
      </div>

      {/* Input Configuration Grid */}
      <Card className="p-4 sm:p-5 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <span>📍</span> Location &amp; Category Scope Specification
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* State */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">State</label>
            <select
              value={state}
              onChange={(e) => handleStateChange(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* City */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">City / Town</label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
            >
              {(POPULAR_CITIES[state] || [city]).map((ct) => (
                <option key={ct} value={ct}>
                  {ct}
                </option>
              ))}
            </select>
          </div>

          {/* Pincode */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Pincode (6 Digits)</label>
            <input
              type="text"
              maxLength={6}
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 560048"
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground">Procurement Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
            >
              {CANONICAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="OTHER">Not Listed (Custom Vertical)...</option>
            </select>
          </div>
        </div>

        {category === 'OTHER' && (
          <div className="space-y-1 pt-1">
            <label className="text-xs font-semibold text-foreground">Specify Custom Category</label>
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="e.g. Industrial Hydraulic Presses & Valves"
              className="w-full rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {/* Action Controls & Force Refresh Switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={forceRefresh}
              onChange={(e) => setForceRefresh(e.target.checked)}
              className="rounded text-primary focus:ring-primary h-4 w-4"
            />
            <span>Force external provider refresh (bypass &lt;30 day cache)</span>
          </label>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isLoading}
              onClick={() => void handleCheckCoverage(false)}
            >
              🔍 Check Existing Coverage
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isLoading}
              onClick={() => void handleCheckCoverage(true)}
            >
              {isLoading ? '⏳ Executing...' : '⚡ Prepare Location Network'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Feedback Messages */}
      {message && (
        <div
          className={`rounded-xl border p-3.5 text-xs font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800'
              : message.type === 'warn'
              ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
              : 'bg-rose-50 text-rose-900 border-rose-300 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Scope Coverage & Freshness Report Card */}
      {report && (
        <div className="space-y-4">
          <Card className="p-4 sm:p-5 space-y-4 border-l-4 border-l-primary">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Scope Analysis: {report.scope.city} ({report.scope.pincode}) — {report.scope.category}
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-extrabold text-foreground">
                    Freshness State:{' '}
                    <span
                      className={
                        report.freshness.status === 'FRESH'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : report.freshness.status === 'REFRESH_ELIGIBLE'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {report.freshness.status}
                    </span>
                  </span>
                  {report.freshness.ageInDays !== null && (
                    <span className="text-xs text-muted-foreground">
                      ({report.freshness.ageInDays} days old)
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-muted-foreground block">Known Density</span>
                <span className="text-lg font-black text-foreground">
                  {report.summary.totalKnown} Suppliers
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {report.freshness.explanation}
            </p>

            {/* Truthful Verification Granularity Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
              <div className="rounded-xl border bg-muted/20 p-2.5 text-center">
                <span className="text-[10px] font-semibold text-muted-foreground block">Discovered in Area</span>
                <span className="text-base font-bold text-foreground">{report.summary.discoveredInArea}</span>
              </div>
              <div className="rounded-xl border bg-muted/20 p-2.5 text-center">
                <span className="text-[10px] font-semibold text-muted-foreground block">Details Available</span>
                <span className="text-base font-bold text-foreground">{report.summary.detailsAvailable}</span>
              </div>
              <div className="rounded-xl border bg-muted/20 p-2.5 text-center">
                <span className="text-[10px] font-semibold text-muted-foreground block">OTP Registered</span>
                <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">{report.summary.otpRegistered}</span>
              </div>
              <div className="rounded-xl border bg-muted/20 p-2.5 text-center">
                <span className="text-[10px] font-semibold text-muted-foreground block">OTP Verified</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{report.summary.otpVerified}</span>
              </div>
              <div className="rounded-xl border bg-muted/20 p-2.5 text-center">
                <span className="text-[10px] font-semibold text-muted-foreground block">GST Verified</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{report.summary.gstVerified}</span>
              </div>
            </div>
          </Card>

          {/* Discovered Regional Suppliers Roster */}
          {report.suppliers.length > 0 && (
            <Card className="p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Regional Supplier Network Roster ({report.suppliers.length})
              </h4>

              <div className="divide-y">
                {report.suppliers.map((s) => {
                  const stageInfo = VERIFICATION_STAGE_DESCRIPTIONS[s.verificationStage];
                  return (
                    <div key={s.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-foreground">
                            {s.businessName}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border">
                            {stageInfo.badgeLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2">
                          <span>📍 {s.locations[0]?.city || city} ({s.locations[0]?.pincode || pincode})</span>
                          <span>·</span>
                          <span>📞 {s.contactPhone || 'Phone on File'}</span>
                          <span>·</span>
                          <span>Provenance: {s.provenanceProviders.join(', ')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-start sm:self-auto">
                        {s.complianceStandards.map((std) => (
                          <span
                            key={std.id}
                            className="rounded bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 text-[10px] font-bold"
                          >
                            {std.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
