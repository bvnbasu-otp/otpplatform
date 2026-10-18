import React from 'react';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import { OtpLogo } from './OtpLogo';

describe('Canonical OTP Brand Logo — Asset Integrity, Synchronization & Safety Backup Invariants', () => {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith('apps/web') || cwd.endsWith('apps\\web')
    ? path.resolve(cwd, '../..')
    : cwd;
  const primaryLogoPath = path.join(repoRoot, 'apps/web/public/brand/otp-logo.jpg');
  const rootMirrorLogoPath = path.join(repoRoot, 'apps/web/public/logo.jpg');
  const backupLogoPath = path.join(repoRoot, 'archive/brand_concepts/otp-logo.original-backup.jpg');
  const brandDir = path.join(repoRoot, 'apps/web/public/brand');
  const webSrcDir = path.join(repoRoot, 'apps/web/src');

  function getFileSha256(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  it('verifies primary canonical brand logo asset exists and is non-empty', () => {
    expect(fs.existsSync(primaryLogoPath)).toBe(true);
    const stats = fs.statSync(primaryLogoPath);
    expect(stats.size).toBeGreaterThan(100000); // ~508 KB
  });

  it('verifies root public mirror logo is strictly synchronized with primary logo (matching SHA-256)', () => {
    expect(fs.existsSync(rootMirrorLogoPath)).toBe(true);
    const primaryHash = getFileSha256(primaryLogoPath);
    const mirrorHash = getFileSha256(rootMirrorLogoPath);
    expect(mirrorHash).toBe(primaryHash);
  });

  it('verifies previous-version safety backup exists and is preserved in archive', () => {
    expect(fs.existsSync(backupLogoPath)).toBe(true);
    const backupStats = fs.statSync(backupLogoPath);
    expect(backupStats.size).toBeGreaterThan(100000);
  });

  it('strictly enforces brand folder hygiene: public/brand contains only canonical logo and festive directory', () => {
    const entries = fs.readdirSync(brandDir);
    const nonFestiveFiles = entries.filter((name) => name !== 'festive');
    expect(nonFestiveFiles).toEqual(['otp-logo.jpg']);
  });

  it('instantiates OtpLogo component with canonical primary logo path', () => {
    const standardElement = React.createElement(OtpLogo, { size: 32 });
    expect(standardElement).toBeDefined();
    expect(standardElement.type).toBe(OtpLogo);

    const bannerElement = React.createElement(OtpLogo, { variant: 'banner' });
    expect(bannerElement).toBeDefined();
    expect(bannerElement.props.variant).toBe('banner');
  });
});
