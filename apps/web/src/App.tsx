import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, RequireAuth, ProtectedRoute } from '@/features/auth';
import { LoginPage, ResetPasswordPage, SignupPage } from '@/features/portal';
import { LandingPage } from '@/features/site';
import { RequireRole, RoleProvider, useRoleContext } from '@/features/roles';
import { HomePage } from '@/pages/HomePage';
import { PilotProvider } from '@/features/pilots/PilotProvider';
import { DemoModeProvider } from '@/features/demo/DemoModeProvider';
import { AppLayout } from '@/components/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AnnouncementBanner } from '@/features/announcements/components/AnnouncementBanner';
import { getPilotByRfqId } from '@/lib/pilots';
import {
  MaintenanceProvider,
  MaintenanceBanner,
  MaintenanceGlobalGuard,
  RestoredSessionBanner,
} from '@/features/maintenance';
import { ThemeProvider, ThemePersonaSync } from '@/features/theme';

// ============================================================================
// ROUTE-LEVEL LAZY LOADING & SUSPENSE CHUNKING (R2-22 RELEASE HARDENING)
// ============================================================================

const LegalPage = lazy(() => import('@/features/portal').then((m) => ({ default: m.LegalPage })));
const AboutPage = lazy(() => import('@/features/site').then((m) => ({ default: m.AboutPage })));
const FaqPage = lazy(() => import('@/features/site').then((m) => ({ default: m.FaqPage })));
const PricingPage = lazy(() => import('@/features/site').then((m) => ({ default: m.PricingPage })));
const QuickQuotePage = lazy(() => import('@/features/quick-quote').then((m) => ({ default: m.QuickQuotePage })));
const EvaluationDecisionCockpitPage = lazy(() => import('@/features/evaluation').then((m) => ({ default: m.EvaluationDecisionCockpitPage })));
const SupplierRfqPage = lazy(() => import('@/features/supplier/pages/SupplierRfqPage').then((m) => ({ default: m.SupplierRfqPage })));
const SupplierQuoteSubmitPage = lazy(() => import('@/features/supplier/pages/SupplierQuoteSubmitPage').then((m) => ({ default: m.SupplierQuoteSubmitPage })));
const SupplierCapabilitiesPage = lazy(() => import('@/features/supplier/pages/SupplierCapabilitiesPage').then((m) => ({ default: m.SupplierCapabilitiesPage })));
const SupplierQuotesPage = lazy(() => import('@/features/supplier').then((m) => ({ default: m.SupplierQuotesPage })));
const SupplierAwardOnboardingPage = lazy(() => import('@/features/supplier').then((m) => ({ default: m.SupplierAwardOnboardingPage })));
const FinancialControlDashboardPage = lazy(() => import('@/features/fulfillment').then((m) => ({ default: m.FinancialControlDashboardPage })));
const PurchaseOrderDetailPage = lazy(() => import('@/features/fulfillment').then((m) => ({ default: m.PurchaseOrderDetailPage })));
const PurchaseOrdersPage = lazy(() => import('@/features/fulfillment').then((m) => ({ default: m.PurchaseOrdersPage })));
const SupplierWorkOrderPage = lazy(() => import('@/features/fulfillment').then((m) => ({ default: m.SupplierWorkOrderPage })));
const CommitteeVotePage = lazy(() => import('@/features/governance').then((m) => ({ default: m.CommitteeVotePage })));
const AwardPage = lazy(() => import('@/features/award').then((m) => ({ default: m.AwardPage })));
const SupplierRevealPage = lazy(() => import('@/features/reveal').then((m) => ({ default: m.SupplierRevealPage })));
const AuditLogPage = lazy(() => import('@/features/audit').then((m) => ({ default: m.AuditLogPage })));
const SupplierPerformancePage = lazy(() => import('@/features/performance').then((m) => ({ default: m.SupplierPerformancePage })));
const RequirementDetailPage = lazy(() => import('@/features/requirement/pages/RequirementDetailPage').then((m) => ({ default: m.RequirementDetailPage })));
const RequirementIntakePage = lazy(() => import('@/features/intake').then((m) => ({ default: m.RequirementIntakePage })));
const DiscoverSuppliersPage = lazy(() => import('@/features/requirement/pages/DiscoverSuppliersPage').then((m) => ({ default: m.DiscoverSuppliersPage })));
const RfqReviewPublishPage = lazy(() => import('@/features/requirement/pages/RfqReviewPublishPage').then((m) => ({ default: m.RfqReviewPublishPage })));
const ActiveRfqMonitoringPage = lazy(() => import('@/features/rfq').then((m) => ({ default: m.ActiveRfqMonitoringPage })));
const MarketIntelligenceStepPage = lazy(() => import('@/features/procurement-os').then((m) => ({ default: m.MarketIntelligenceStepPage })));
const RfqClarificationPage = lazy(() => import('@/features/clarification').then((m) => ({ default: m.RfqClarificationPage })));
const DemoDashboardPage = lazy(() => import('@/features/demo/pages/DemoDashboardPage').then((m) => ({ default: m.DemoDashboardPage })));
const NotificationsPage = lazy(() => import('@/features/notifications').then((m) => ({ default: m.NotificationsPage })));
const AdminDashboardPage = lazy(() => import('@/features/admin').then((m) => ({ default: m.AdminDashboardPage })));
const ProfilePage = lazy(() => import('@/features/profile').then((m) => ({ default: m.ProfilePage })));
const OrgMembersPage = lazy(() => import('@/features/org').then((m) => ({ default: m.OrgMembersPage })));
const InviteAcceptancePage = lazy(() => import('@/features/org').then((m) => ({ default: m.InviteAcceptancePage })));
const MaintenancePage = lazy(() => import('@/pages/MaintenancePage').then((m) => ({ default: m.MaintenancePage })));
const MobileShowcasePage = lazy(() => import('@/pages/MobileShowcasePage').then((m) => ({ default: m.MobileShowcasePage })));
const FounderDashboardPage = lazy(() => import('@/features/founder/pages/FounderDashboardPage').then((m) => ({ default: m.FounderDashboardPage })));

function RouteLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-8" data-testid="route-loading-fallback">
      <div className="flex flex-col items-center gap-2.5 text-muted-foreground text-xs">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="font-semibold text-[11px]">Loading view…</span>
      </div>
    </div>
  );
}

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

function RfqTrackRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const sanitized = sanitizeRouteParam(rfqId);
  if (!sanitized) return <Navigate to="/dashboard" replace />;
  return <Navigate to={`/purchase-orders?rfqId=${sanitized}`} replace />;
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
                    <Suspense fallback={<RouteLoadingFallback />}>
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
          <Route path="/supplier/award-onboarding/:token" element={<SupplierAwardOnboardingPage />} />
          <Route path="/supplier/award-onboarding" element={<SupplierAwardOnboardingPage />} />
          {/*
            Organization invitation acceptance route: accessible unauthenticated
            (renders preview & sign-in redirect) and authenticated (1-click join).
          */}
          <Route path="/invite/:token" element={<InviteAcceptancePage />} />
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
            <Route path="/create" element={<Navigate to="/intake" replace />} />
            <Route path="/requirements/new" element={<Navigate to="/intake" replace />} />
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
            <Route path="/rfq/:rfqId/track" element={<RfqTrackRoute />} />
            <Route path="/rfqs/:rfqId/track" element={<RfqTrackRoute />} />
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
              path="/supplier/quotes"
              element={
                <ProtectedRoute allowedRoles={['BUYER', 'SUPPLIER', 'ADMIN']}>
                  <SupplierQuotesPage />
                </ProtectedRoute>
              }
            />
            <Route path="/supplier/opportunities" element={<Navigate to="/dashboard" replace />} />
            <Route path="/quotes" element={<Navigate to="/dashboard" replace />} />
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
            <Route path="/orders/:poId" element={<BuyerPoDetailRoute />} />
            <Route path="/track/:poId" element={<BuyerPoDetailRoute />} />
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
            <Route path="/org/members" element={<OrgMembersPage />} />
            <Route path="/team" element={<Navigate to="/org/members" replace />} />
            <Route path="/governance/team" element={<Navigate to="/org/members" replace />} />
            <Route path="/governance/members" element={<Navigate to="/org/members" replace />} />
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
        </Suspense>
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
