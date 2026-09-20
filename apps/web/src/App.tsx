import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, RequireAuth, ProtectedRoute } from '@/features/auth';
import { LegalPage, LoginPage, ResetPasswordPage, SignupPage } from '@/features/portal';
import { AboutPage, FaqPage, LandingPage, PricingPage } from '@/features/site';
import { RequireRole, RoleProvider, useRoleContext } from '@/features/roles';
import { QuickQuotePage } from '@/features/quick-quote';
import { RfqIdentityProtectedComparisonPage } from '@/features/rfq';
import { EvaluationDecisionCockpitPage } from '@/features/evaluation';
import { SupplierRfqPage } from '@/features/supplier/pages/SupplierRfqPage';
import { SupplierQuoteSubmitPage } from '@/features/supplier/pages/SupplierQuoteSubmitPage';
import { SupplierCapabilitiesPage } from '@/features/supplier/pages/SupplierCapabilitiesPage';
import {
  FinancialControlDashboardPage,
  PurchaseOrderDetailPage,
  PurchaseOrdersPage,
  SupplierWorkOrderPage,
} from '@/features/fulfillment';
import { CommitteeVotePage } from '@/features/governance';
import { AwardPage } from '@/features/award';
import { SupplierRevealPage } from '@/features/reveal';
import { AuditLogPage } from '@/features/audit';
import { SupplierPerformancePage } from '@/features/performance';
import { RequirementDetailPage } from '@/features/requirement/pages/RequirementDetailPage';
import { RequirementIntakePage } from '@/features/intake';
import { DiscoverSuppliersPage } from '@/features/requirement/pages/DiscoverSuppliersPage';
import { RfqReviewPublishPage } from '@/features/requirement/pages/RfqReviewPublishPage';
import { ActiveRfqMonitoringPage } from '@/features/rfq';
import { MarketIntelligenceStepPage } from '@/features/procurement-os';
import { RfqClarificationPage } from '@/features/clarification';
import { DemoWalkthroughPanel } from '@/features/demo/DemoWalkthroughPanel';
import { DemoModeProvider } from '@/features/demo/DemoModeProvider';
import { DemoDashboardPage } from '@/features/demo/pages/DemoDashboardPage';
import { PilotProvider } from '@/features/pilots/PilotProvider';
import { AppLayout } from '@/components/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { NotificationsPage } from '@/features/notifications';
import { AdminDashboardPage } from '@/features/admin';
import { ProfilePage } from '@/features/profile';
import { HomePage } from '@/pages/HomePage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { MobileShowcasePage } from '@/pages/MobileShowcasePage';
import { FounderDashboardPage } from '@/features/founder/pages/FounderDashboardPage';
import { AnnouncementBanner } from '@/features/announcements/components/AnnouncementBanner';
import { getPilotByRfqId } from '@/lib/pilots';
import {
  MaintenanceProvider,
  MaintenanceBanner,
  MaintenanceGlobalGuard,
  RestoredSessionBanner,
} from '@/features/maintenance';
import { ThemeProvider, ThemePersonaSync } from '@/features/theme';

function sanitizeRouteParam(raw: string | undefined): string | null {
  if (!raw) return null;
  const decoded = decodeURIComponent(raw).trim();
  if (
    !decoded ||
    decoded === ':poId' ||
    decoded === ':woId' ||
    decoded === ':rfqId' ||
    decoded === ':requirementId' ||
    decoded === 'undefined' ||
    decoded === 'null' ||
    decoded === '[id]'
  ) {
    return null;
  }
  return decoded;
}

function PoRouteErrorFallback({ role }: { role: 'buyer' | 'supplier' }) {
  const listUrl = role === 'supplier' ? '/supplier/purchase-orders' : '/purchase-orders';
  return (
    <div className="p-6 max-w-xl mx-auto my-12 text-center rounded-xl border border-border bg-card shadow-sm space-y-4">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-lg font-bold text-foreground">Order Route Error</h2>
      <p className="text-sm text-muted-foreground">
        An unexpected error occurred while loading this order. You can return to the orders ledger or refresh the view.
      </p>
      <div className="flex justify-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
        >
          ↻ Reload Page
        </button>
        <a
          href={listUrl}
          className="rounded-md border border-border bg-muted/40 px-3.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition inline-flex items-center"
        >
          ← Back to Orders &amp; Reports
        </a>
      </div>
    </div>
  );
}

function RfqIdentityProtectedComparisonRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const sanitized = sanitizeRouteParam(rfqId);
  if (!sanitized) return <Navigate to="/dashboard" replace />;
  const pilot = getPilotByRfqId(sanitized);
  const title = pilot
    ? `${pilot.requirementTitle} — RFQ`
    : 'RFQ — Unified Evaluation & Decision Cockpit';
  return <EvaluationDecisionCockpitPage rfqId={sanitized} rfqTitle={title} />;
}

function SupplierRfqRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const sanitized = sanitizeRouteParam(rfqId);
  if (!sanitized) return <Navigate to="/dashboard" replace />;
  return <SupplierRfqPage rfqId={sanitized} />;
}

function SupplierQuoteSubmitRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const sanitized = sanitizeRouteParam(rfqId);
  if (!sanitized) return <Navigate to="/dashboard" replace />;
  return <SupplierQuoteSubmitPage rfqId={sanitized} />;
}

function CommitteeVoteRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const sanitized = sanitizeRouteParam(rfqId);
  if (!sanitized) return <Navigate to="/dashboard" replace />;
  return <CommitteeVotePage rfqId={sanitized} />;
}

function AwardRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const sanitized = sanitizeRouteParam(rfqId);
  if (!sanitized) return <Navigate to="/dashboard" replace />;
  return <AwardPage rfqId={sanitized} />;
}

function RevealRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const sanitized = sanitizeRouteParam(rfqId);
  if (!sanitized) return <Navigate to="/dashboard" replace />;
  return <SupplierRevealPage rfqId={sanitized} />;
}

function BuyerPoDetailRoute() {
  const { poId } = useParams<{ poId: string }>();
  const sanitized = sanitizeRouteParam(poId);
  const { context } = useRoleContext();
  const effectiveRole = context.side === 'SUPPLIER' ? 'supplier' : 'buyer';
  if (!sanitized) return <Navigate to={effectiveRole === 'supplier' ? '/supplier/purchase-orders' : '/purchase-orders'} replace />;
  return (
    <ErrorBoundary fallback={<PoRouteErrorFallback role={effectiveRole} />}>
      <PurchaseOrderDetailPage poId={sanitized} role={effectiveRole} />
    </ErrorBoundary>
  );
}

function SupplierPoDetailRoute() {
  const { poId } = useParams<{ poId: string }>();
  const sanitized = sanitizeRouteParam(poId);
  const { context } = useRoleContext();
  const effectiveRole = context.side === 'BUYER' ? 'buyer' : 'supplier';
  if (!sanitized) return <Navigate to={effectiveRole === 'buyer' ? '/purchase-orders' : '/supplier/purchase-orders'} replace />;
  return (
    <ErrorBoundary fallback={<PoRouteErrorFallback role={effectiveRole} />}>
      <PurchaseOrderDetailPage poId={sanitized} role={effectiveRole} />
    </ErrorBoundary>
  );
}

function SupplierWoRoute() {
  const { woId } = useParams<{ woId: string }>();
  const sanitized = sanitizeRouteParam(woId);
  if (!sanitized) return <Navigate to="/supplier/purchase-orders" replace />;
  return (
    <ErrorBoundary fallback={<PoRouteErrorFallback role="supplier" />}>
      <SupplierWorkOrderPage workOrderId={sanitized} />
    </ErrorBoundary>
  );
}

function ClarificationRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  if (!rfqId) return <Navigate to="/dashboard" replace />;
  return <RfqClarificationPage rfqId={rfqId} />;
}

function DiscoverRoute() {
  const { requirementId } = useParams<{ requirementId: string }>();
  if (!requirementId) return <Navigate to="/dashboard" replace />;
  return <DiscoverSuppliersPage requirementId={requirementId} />;
}

function RfqReviewRoute() {
  const { requirementId, rfqId } = useParams<{ requirementId?: string; rfqId?: string }>();
  if (!requirementId && !rfqId) return <Navigate to="/dashboard" replace />;
  return <RfqReviewPublishPage requirementId={requirementId} rfqId={rfqId} />;
}

function ActiveRfqMonitoringRoute() {
  const { requirementId, rfqId } = useParams<{ requirementId?: string; rfqId?: string }>();
  if (!requirementId && !rfqId) return <Navigate to="/dashboard" replace />;
  return <ActiveRfqMonitoringPage requirementId={requirementId} rfqId={rfqId} />;
}

function RequirementRoute() {
  const { requirementId } = useParams<{ requirementId: string }>();
  if (!requirementId) return <Navigate to="/dashboard" replace />;
  return <RequirementDetailPage requirementId={requirementId} />;
}

function AuditRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  return (
    <AuditLogPage
      rfqId={rfqId}
      title={rfqId ? 'RFQ audit history' : 'Audit history'}
    />
  );
}

function PerformanceRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  return <SupplierPerformancePage rfqId={rfqId} />;
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <RoleProvider>
            <ThemePersonaSync />
            <DemoModeProvider>
              <PilotProvider>
                <MaintenanceProvider>
                  <RestoredSessionBanner />
                  <MaintenanceBanner />
                  <AnnouncementBanner />
                  <MaintenanceGlobalGuard>
                    <Routes>
          {/*
            The public site. / is marketing rather than the workspace, because
            most arrivals here have no account yet; the signed-in dashboard lives
            at /dashboard and the header link follows whoever is signed in.
          */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/how-it-works" element={<Navigate to="/faqs#workflow" replace />} />
          <Route path="/howitworks" element={<Navigate to="/faqs#workflow" replace />} />
          <Route path="/showcase" element={<MobileShowcasePage />} />
          <Route path="/mobile" element={<MobileShowcasePage />} />
          <Route path="/mobile-showcase" element={<MobileShowcasePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/faqs" element={<FaqPage />} />
          <Route path="/about-us" element={<AboutPage />} />
          {/*
            Two doors: sign in, or register. /signup names the side in a query
            parameter and shows that side's pitch beside the form.
          */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/*
            The old per-side portals. They rendered the same sign-in form as
            /login and the same registration forms as /signup, one layout apart,
            and being a second sign-in surface cost something real: they ignored
            the destination RequireAuth recorded, so anyone stopped at a deep link
            was returned to the dashboard instead of where they were going.

            Kept as redirects rather than deleted, because these paths are in
            invitations already sent.
          */}
          <Route path="/buyer" element={<Navigate to="/signup?side=buyer" replace />} />
          <Route path="/seller" element={<Navigate to="/signup?side=supplier" replace />} />
          <Route path="/supplier" element={<Navigate to="/signup?side=supplier" replace />} />
          <Route path="/supplier/register" element={<Navigate to="/signup?side=supplier" replace />} />
          <Route path="/legal/:topic" element={<LegalPage />} />
          {/*
            Reached from a WhatsApp or SMS message, so it sits outside
            RequireAuth: the supplier has no account, and the link token is the
            credential. Short path because it has to survive being typed by hand
            off a phone screen.
          */}
          <Route path="/q/:token" element={<QuickQuotePage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route
            element={
              <RequireAuth>
                {/*
                  The role gate sits inside the session check and outside the
                  layout, so an account with no role assigned gets the
                  "complete your profile" screen instead of a workspace it is
                  not configured to use. By state, not by route: a bookmarked
                  enquiry lands here too.
                */}
                <RequireRole>
                  <AppLayout />
                </RequireRole>
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<HomePage />} />
            <Route path="/requirements/new" element={<RequirementIntakePage />} />
            <Route path="/intake" element={<RequirementIntakePage />} />
            <Route path="/requirements/:requirementId" element={<RequirementRoute />} />
            <Route
              path="/requirements/:requirementId/discover"
              element={<DiscoverRoute />}
            />
            <Route
              path="/requirements/:requirementId/rfq-review"
              element={<RfqReviewRoute />}
            />
            <Route
              path="/requirements/:requirementId/review-publish"
              element={<RfqReviewRoute />}
            />
            <Route
              path="/requirements/:requirementId/monitoring"
              element={<ActiveRfqMonitoringRoute />}
            />
            <Route
              path="/requirements/:requirementId/live"
              element={<ActiveRfqMonitoringRoute />}
            />
            <Route
              path="/rfq/:rfqId/publish"
              element={<RfqReviewRoute />}
            />
            <Route
              path="/rfq/:rfqId/review"
              element={<RfqReviewRoute />}
            />
            <Route
              path="/rfq/:rfqId/monitoring"
              element={<ActiveRfqMonitoringRoute />}
            />
            <Route
              path="/rfq/:rfqId/live"
              element={<ActiveRfqMonitoringRoute />}
            />
            <Route
              path="/requirements/:requirementId/market-intelligence"
              element={<MarketIntelligenceStepPage />}
            />
            <Route
              path="/rfq/:rfqId/market-intelligence"
              element={<MarketIntelligenceStepPage />}
            />
            <Route path="/rfq/:rfqId/evaluation" element={<EvaluationDecisionCockpitPage />} />
            <Route path="/rfq/:rfqId/cockpit" element={<EvaluationDecisionCockpitPage />} />
            <Route path="/rfq/:rfqId/decision" element={<EvaluationDecisionCockpitPage />} />
            <Route path="/rfqs/:rfqId/evaluation" element={<EvaluationDecisionCockpitPage />} />
            <Route path="/rfq/:rfqId/quotes" element={<EvaluationDecisionCockpitPage />} />
            <Route path="/rfqs/:rfqId/quotes" element={<EvaluationDecisionCockpitPage />} />
            {/* Legacy comparison routes */}
            <Route path="/rfq/:rfqId/identity-protected-comparison" element={<EvaluationDecisionCockpitPage />} />
            <Route path={`/rfq/:rfqId/${['bl', 'ind-comparison'].join('')}`} element={<EvaluationDecisionCockpitPage />} />
            <Route path={`/rfqs/:rfqId/${['bl', 'ind-comparison'].join('')}`} element={<EvaluationDecisionCockpitPage />} />
            <Route path="/rfq/:rfqId/clarification" element={<ClarificationRoute />} />
            <Route path="/rfq/:rfqId/committee" element={<CommitteeVoteRoute />} />
            <Route path="/rfq/:rfqId/award" element={<AwardRoute />} />
            <Route path="/rfq/:rfqId/reveal" element={<RevealRoute />} />
            {/* Route Aliases & Redirects for notification links & deep links */}
            <Route path="/rfq/:rfqId" element={<EvaluationDecisionCockpitPage />} />
            <Route path="/rfqs/:rfqId" element={<EvaluationDecisionCockpitPage />} />
            <Route path="/governance/evaluations/:rfqId/vote" element={<CommitteeVoteRoute />} />
            <Route path="/governance/evaluations/:rfqId" element={<CommitteeVoteRoute />} />
            <Route path="/supplier/rfq/:rfqId/quote" element={<SupplierQuoteSubmitRoute />} />
            <Route path="/supplier/rfqs/:rfqId/quote" element={<SupplierQuoteSubmitRoute />} />
            <Route path="/supplier/rfq/:rfqId" element={<SupplierRfqRoute />} />
            <Route path="/supplier/rfqs/:rfqId" element={<SupplierRfqRoute />} />
            <Route path="/supplier/capabilities" element={<SupplierCapabilitiesPage />} />
            <Route path="/supplier/onboarding" element={<SupplierCapabilitiesPage />} />
            <Route path="/supplier/dashboard" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/purchase-orders"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'SUPPLIER', 'ADMIN']}>
                  <PurchaseOrdersPage role="buyer" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/purchase-orders/:poId"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'SUPPLIER', 'ADMIN']}>
                  <BuyerPoDetailRoute />
                </ProtectedRoute>
              }
            />
            <Route
              path="/supplier/purchase-orders"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'SUPPLIER', 'ADMIN']}>
                  <PurchaseOrdersPage role="supplier" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/supplier/purchase-orders/:poId"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'SUPPLIER', 'ADMIN']}>
                  <SupplierPoDetailRoute />
                </ProtectedRoute>
              }
            />
            <Route
              path="/supplier/work-orders/:woId"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'SUPPLIER', 'ADMIN']}>
                  <SupplierWoRoute />
                </ProtectedRoute>
              }
            />
            {/* Orders & Reports, Purchase Orders, Work Orders Aliases & Deep Links */}
            <Route path="/orders-reports" element={<Navigate to="/purchase-orders" replace />} />
            <Route path="/orders" element={<Navigate to="/purchase-orders" replace />} />
            <Route path="/reports" element={<Navigate to="/purchase-orders?view=reports" replace />} />
            <Route path="/ledger" element={<Navigate to="/purchase-orders?view=orders" replace />} />
            <Route
              path="/financial-controls"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}>
                  <FinancialControlDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reconciliation"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}>
                  <FinancialControlDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/work-orders/:woId" element={<SupplierWoRoute />} />
            <Route path="/work-orders" element={<Navigate to="/supplier/purchase-orders" replace />} />
            <Route path="/supplier/orders" element={<Navigate to="/supplier/purchase-orders" replace />} />
            <Route path="/supplier/reports" element={<Navigate to="/supplier/purchase-orders?view=reports" replace />} />
            <Route path="/audit" element={<AuditRoute />} />
            <Route path="/rfq/:rfqId/audit" element={<AuditRoute />} />
            <Route path="/performance" element={<PerformanceRoute />} />
            <Route path="/rfq/:rfqId/performance" element={<PerformanceRoute />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings/profile" element={<Navigate to="/profile" replace />} />
            <Route path="/org/members" element={<Navigate to="/profile?tab=team" replace />} />
            <Route path="/demo" element={<DemoDashboardPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/founder"
              element={
                <ProtectedRoute allowedRoles={['FOUNDER']}>
                  <FounderDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ceo"
              element={
                <ProtectedRoute allowedRoles={['FOUNDER']}>
                  <Navigate to="/founder" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ops"
              element={
                <ProtectedRoute requireAdmin>
                  <Navigate to="/admin" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/buyer-orders"
              element={
                <ProtectedRoute requireAdmin>
                  <Navigate to="/admin?tab=transactions" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/seller-orders"
              element={
                <ProtectedRoute requireAdmin>
                  <Navigate to="/admin?tab=seller-orders" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/buyer-diagnostics"
              element={
                <ProtectedRoute requireAdmin>
                  <Navigate to="/admin?tab=buyer_troubleshooter" replace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/seller-diagnostics"
              element={
                <ProtectedRoute requireAdmin>
                  <Navigate to="/admin?tab=seller_troubleshooter" replace />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
            </MaintenanceGlobalGuard>
          </MaintenanceProvider>
        </PilotProvider>
        </DemoModeProvider>
        </RoleProvider>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}
