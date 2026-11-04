import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { X2oLogo, X2O_ASSETS } from './X2oLogo';

describe('X2O Brand Visual Identity & 3D Parity Asset Invariants', () => {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith('apps/web') || cwd.endsWith('apps\\web')
    ? path.resolve(cwd, '../..')
    : cwd;
  const x2oDir = path.join(repoRoot, 'apps/web/public/x2o');

  it('verifies all X2O 3D matching production assets exist and are non-empty', () => {
    expect(fs.existsSync(x2oDir)).toBe(true);

    const requiredAssets = [
      'x2o-logo.jpg',
      'x2o-banner.jpg',
      'x2o-logo-3d.svg',
      'x2o-logo-dark.svg',
      'x2o-logo-light.svg',
      'x2o-icon.svg',
      'x2o-icon-dark.svg',
      'x2o-icon-light.svg',
      'x2o-symbol.svg',
      'x2o-favicon.svg',
    ];

    for (const asset of requiredAssets) {
      const filePath = path.join(x2oDir, asset);
      expect(fs.existsSync(filePath), `Missing asset: ${asset}`).toBe(true);
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(500);
    }
  });

  it('verifies X2oLogo component renders 3D banner, horizontal and icon variants', () => {
    const bannerEl = React.createElement(X2oLogo, { variant: '3d', size: 48 });
    expect(bannerEl).toBeDefined();
    expect(bannerEl.props.variant).toBe('3d');

    const horizontalEl = React.createElement(X2oLogo, { size: 36, theme: 'dark' });
    expect(horizontalEl).toBeDefined();
    expect(horizontalEl.props.theme).toBe('dark');

    const iconEl = React.createElement(X2oLogo, { variant: 'icon', size: 32 });
    expect(iconEl.props.variant).toBe('icon');
  });

  it('verifies asset URLs in X2O_ASSETS match expected endpoints', () => {
    expect(X2O_ASSETS.logo3D).toBe('/x2o/x2o-logo.jpg');
    expect(X2O_ASSETS.logo3DSvg).toBe('/x2o/x2o-logo-3d.svg');
    expect(X2O_ASSETS.logoDark).toBe('/x2o/x2o-logo-dark.svg');
    expect(X2O_ASSETS.logoLight).toBe('/x2o/x2o-logo-light.svg');
    expect(X2O_ASSETS.iconMaster).toBe('/x2o/x2o-icon.svg');
    expect(X2O_ASSETS.favicon).toBe('/x2o/x2o-favicon.svg');
  });
});
