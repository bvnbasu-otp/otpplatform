import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CANONICAL_OPPORTUNITIES } from '@/features/supplier/pages/OpportunitiesBrowsePage';
import { DEFAULT_SUPPLIER_CAPABILITY_PROFILE } from '@/features/supplier/types/capability-profile';

const WEB_SRC = resolve(__dirname, '../../');

describe('Home & Landing Experience Cleanup V2 (User Points 1–5)', () => {
  it('Point 1: Opportunities are aligned with Supplier Capabilities & Radar Scope', () => {
    const oppSrc = readFileSync(
      resolve(WEB_SRC, 'features/supplier/pages/OpportunitiesBrowsePage.tsx'),
      'utf8',
    );
    expect(oppSrc).toContain('useSupplierRadarCapabilities');
    expect(oppSrc).toContain('radar-scope-banner');
    expect(oppSrc).toContain('SupplierCapabilityModal');
    expect(oppSrc).toContain('declaredCategories');

    // Default categories include HVAC, Electrical, Motor Rewinding
    const defaultCategories = DEFAULT_SUPPLIER_CAPABILITY_PROFILE.categories;
    expect(defaultCategories).toContain('HVAC Repair & Maintenance');
    expect(defaultCategories).toContain('Electrical Hardware & Pumps');
    expect(defaultCategories).toContain('Motor Rewinding & Servicing');

    // Matching opportunities exist for declared categories
    const hvacOpp = CANONICAL_OPPORTUNITIES.find((o) => o.category === 'HVAC Repair & Maintenance');
    expect(hvacOpp).toBeDefined();

    const electricalOpp = CANONICAL_OPPORTUNITIES.find((o) => o.category === 'Electrical');
    expect(electricalOpp).toBeDefined();

    const motorOpp = CANONICAL_OPPORTUNITIES.find((o) => o.category === 'Motor Rewinding & Servicing');
    expect(motorOpp).toBeDefined();
  });

  it('Point 2: Refer a peer to OTP is removed from Home & Landing (only in Profile)', () => {
    const buyerDashboard = readFileSync(
      resolve(WEB_SRC, 'pages/DashboardPage.tsx'),
      'utf8',
    );
    expect(buyerDashboard).toContain('{false && (');
    expect(buyerDashboard).toContain('side={referSide}');

    const supplierDashboard = readFileSync(
      resolve(WEB_SRC, 'pages/SupplierDashboardPage.tsx'),
      'utf8',
    );
    expect(supplierDashboard).toContain('{false && (');
    expect(supplierDashboard).toContain('side={referSide}');

    // ProfilePage still retains Refer & Earn
    const profilePage = readFileSync(
      resolve(WEB_SRC, 'features/profile/pages/ProfilePage.tsx'),
      'utf8',
    );
    expect(profilePage).toContain('<ReferAndEarnCard');
  });

  it('Point 3: Opportunities is applicable for suppliers but not for buyers', () => {
    const bottomNav = readFileSync(
      resolve(WEB_SRC, 'components/MobileBottomNav.tsx'),
      'utf8',
    );
    expect(bottomNav).toContain('{isSupplier && (');
    expect(bottomNav).toContain('to="/opportunities"');

    const buyerDashboard = readFileSync(
      resolve(WEB_SRC, 'pages/DashboardPage.tsx'),
      'utf8',
    );
    expect(buyerDashboard).not.toContain('RECOMMENDED FOR YOU');
    expect(buyerDashboard).toContain('Screen 9: Recommended items');
    expect(buyerDashboard).not.toContain('to="/opportunities"');
    expect(buyerDashboard).not.toContain('/opportunities?q=');

    const oppPage = readFileSync(
      resolve(WEB_SRC, 'features/supplier/pages/OpportunitiesBrowsePage.tsx'),
      'utf8',
    );
    expect(oppPage).toContain("context.side !== 'SUPPLIER'");
    expect(oppPage).toContain('<Navigate to="/dashboard" replace />');
  });

  it('Point 4: Buyer screen shows 2x2 tiles with expandable/collapsible My Orders', () => {
    const buyerDashboard = readFileSync(
      resolve(WEB_SRC, 'pages/DashboardPage.tsx'),
      'utf8',
    );
    expect(buyerDashboard).toContain('grid grid-cols-2');
    expect(buyerDashboard).toContain('data-testid="tile-create-request"');
    expect(buyerDashboard).toContain('Create Request');
    expect(buyerDashboard).toContain('data-testid="tile-my-orders"');
    expect(buyerDashboard).toContain('My Orders');
    expect(buyerDashboard).toContain('data-testid="tile-notification"');
    expect(buyerDashboard).toContain('Notification');
    expect(buyerDashboard).toContain('data-testid="tile-profile"');
    expect(buyerDashboard).toContain('Profile');

    expect(buyerDashboard).toContain('isOrdersOpen');
    expect(buyerDashboard).toContain('setIsOrdersOpen');
    expect(buyerDashboard).toContain('data-testid="buyer-expandable-orders"');
  });

  it('Point 5: Redundant supplier identity shield & lifecycle banner blocks are removed', () => {
    const supplierDashboard = readFileSync(
      resolve(WEB_SRC, 'pages/SupplierDashboardPage.tsx'),
      'utf8',
    );
    expect(supplierDashboard).not.toContain('<SupplierIdentityShieldBanner');
    expect(supplierDashboard).not.toContain('SupplierIdentityShieldBanner');
  });
});
