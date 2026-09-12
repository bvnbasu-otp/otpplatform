import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AuthProvider, RequireAuth, ProtectedRoute } from '@/features/auth';
import { LegalPage, LoginPage, ResetPasswordPage, SignupPage } from '@/features/portal';
import { AboutPage, FaqPage, LandingPage, PricingPage } from '@/features/site';
import { RequireRole, RoleProvider } from '@/features/roles';
import { QuickQuotePage } from '@/features/quick-quote';
import { RfqIdentityProtectedComparisonPage } from '@/features/rfq';
import { SupplierRfqPage } from '@/features/supplier/pages/SupplierRfqPage';
import { SupplierCapabilitiesPage } from '@/features/supplier/pages/SupplierCapabilitiesPage';
import {
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
import { MarketIntelligenceStepPage } from '@/features/procurement-os';
import { RfqClarificationPage } from '@/features/clarification';
import { DemoWalkthroughPanel } from '@/features/demo/DemoWalkthroughPanel';
import { DemoModeProvider } from '@/features/demo/DemoModeProvider';
import { DemoDashboardPage } from '@/features/demo/pages/DemoDashboardPage';
import { PilotProvider } from '@/features/pilots/PilotProvider';
import { AppLayout } from '@/components/AppLayout';
import { NotificationsPage } from '@/features/notifications';
import { AdminDashboardPage, AdminBuyerDiagnosticsPage, AdminSellerDiagnosticsPage } from '@/features/admin';
import { OrgMembersPage } from '@/features/org';
import { ProfilePage } from '@/features/profile';
import { HomePage } from '@/pages/HomePage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { getPilotByRfqId } from '@/lib/pilots';
import {
  MaintenanceProvider,
  MaintenanceBanner,
  MaintenanceGlobalGuard,
  RestoredSessionBanner,
} from '@/features/maintenance';
import { ThemeProvider, ThemePersonaSync } from '@/features/theme';

function RfqIdentityProtectedComparisonRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  if (!rfqId) return <Navigate to="/dashboard" replace />;
  const pilot = getPilotByRfqId(rfqId);
  const title = pilot
    ? `${pilot.requirementTitle} — RFQ`
    : 'RFQ — Identity-Protected Evaluation';
  return <RfqIdentityProtectedComparisonPage rfqId={rfqId} rfqTitle={title} />;
}

function SupplierRfqRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  if (!rfqId) return <Navigate to="/dashboard" replace />;
  return <SupplierRfqPage rfqId={rfqId} />;
}

function CommitteeVoteRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  if (!rfqId) return <Navigate to="/dashboard" replace />;
  return <CommitteeVotePage rfqId={rfqId} />;
}

function AwardRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  if (!rfqId) return <Navigate to="/dashboard" replace />;
  return <AwardPage rfqId={rfqId} />;
}

function RevealRoute() {
  const { rfqId } = useParams<{ rfqId: string }>();
  if (!rfqId) return <Navigate to="/dashboard" replace />;
  return <SupplierRevealPage rfqId={rfqId} />;
}

function BuyerPoDetailRoute() {
  const { poId } = useParams<{ poId: string }>();
  if (!poId) return <Navigate to="/purchase-orders" replace />;
  return <PurchaseOrderDetailPage poId={poId} role="buyer" />;
}

function SupplierPoDetailRoute() {
  const { poId } = useParams<{ poId: string }>();
  if (!poId) return <Navigate to="/supplier/purchase-orders" replace />;
  return <PurchaseOrderDetailPage poId={poId} role="supplier" />;
}

function SupplierWoRoute() {
  const { woId } = useParams<{ woId: string }>();
  if (!woId) return <Navigate to="/supplier/purchase-orders" replace />;
  return <SupplierWorkOrderPage workOrderId={woId} />;
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
                  <MaintenanceGlobalGuard>
                    <Routes>
          {/*
            The public site. / is marketing rather than the workspace, because
            most arrivals here have no account yet; the signed-in dashboard lives
            at /dashboard and the header link follows whoever is signed in.
          */}
          <Route path="/" element={<LandingPage />} />
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
            <Route path="/requirements/:requirementId" element={<RequirementRoute />} />
            <Route
              path="/requirements/:requirementId/discover"
              element={<DiscoverRoute />}
            />
            <Route
              path="/requirements/:requirementId/market-intelligence"
              element={<MarketIntelligenceStepPage />}
            />
            <Route
              path="/rfq/:rfqId/market-intelligence"
              element={<MarketIntelligenceStepPage />}
            />
            <Route path="/rfq/:rfqId/evaluation" element={<RfqIdentityProtectedComparisonRoute />} />
            <Route path="/rfq/:rfqId/quotes" element={<RfqIdentityProtectedComparisonRoute />} />
            <Route path="/rfqs/:rfqId/quotes" element={<RfqIdentityProtectedComparisonRoute />} />
            {/* Legacy routes */}
            <Route path="/rfq/:rfqId/identity-protected-comparison" element={<RfqIdentityProtectedComparisonRoute />} />
            <Route path={`/rfq/:rfqId/${['bl', 'ind-comparison'].join('')}`} element={<RfqIdentityProtectedComparisonRoute />} />
            <Route path={`/rfqs/:rfqId/${['bl', 'ind-comparison'].join('')}`} element={<RfqIdentityProtectedComparisonRoute />} />
            <Route path="/rfq/:rfqId/clarification" element={<ClarificationRoute />} />
            <Route path="/rfq/:rfqId/committee" element={<CommitteeVoteRoute />} />
            <Route path="/rfq/:rfqId/award" element={<AwardRoute />} />
            <Route path="/rfq/:rfqId/reveal" element={<RevealRoute />} />
            {/* Route Aliases & Redirects for notification links & deep links */}
            <Route path="/rfq/:rfqId" element={<RfqIdentityProtectedComparisonRoute />} />
            <Route path="/rfqs/:rfqId" element={<RfqIdentityProtectedComparisonRoute />} />
            <Route path="/governance/evaluations/:rfqId/vote" element={<CommitteeVoteRoute />} />
            <Route path="/governance/evaluations/:rfqId" element={<CommitteeVoteRoute />} />
            <Route path="/supplier/rfq/:rfqId" element={<SupplierRfqRoute />} />
            <Route path="/supplier/rfqs/:rfqId" element={<SupplierRfqRoute />} />
            <Route path="/supplier/capabilities" element={<SupplierCapabilitiesPage />} />
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
            <Route path="/audit" element={<AuditRoute />} />
            <Route path="/rfq/:rfqId/audit" element={<AuditRoute />} />
            <Route path="/performance" element={<PerformanceRoute />} />
            <Route path="/rfq/:rfqId/performance" element={<PerformanceRoute />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/settings/profile" element={<Navigate to="/profile" replace />} />
            <Route path="/org/members" element={<OrgMembersPage />} />
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
                  <AdminBuyerDiagnosticsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/seller-diagnostics"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminSellerDiagnosticsPage />
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
