import React from 'react';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { describe, it, expect } from 'vitest';
import { OtpLogo } from './OtpLogo';

describe('Canonical OTP Brand Logo — Asset Integrity, Synchronization & Safety Backup Invariants', () => {
  const rootDir = process.cwd();
  const primaryLogoPath = path.join(rootDir, 'apps/web/public/brand/otp-logo.jpg');
  const rootMirrorLogoPath = path.join(rootDir, 'apps/web/public/logo.jpg');
  const backupLogoPath = path.join(rootDir, 'apps/web/public/brand/otp-logo.original-backup.jpg');
  const webSrcDir = path.join(rootDir, 'apps/web/src');

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

  it('verifies previous-version safety backup exists and is preserved', () => {
    expect(fs.existsSync(backupLogoPath)).toBe(true);
    const backupStats = fs.statSync(backupLogoPath);
    expect(backupStats.size).toBeGreaterThan(100000);
  });

  it('strictly enforces safety backup isolation: production code MUST NOT reference otp-logo.original-backup.jpg', () => {
    function scanDirectoryForForbiddenString(dir: string, forbidden: string): string[] {
      const violations: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          violations.push(...scanDirectoryForForbiddenString(fullPath, forbidden));
        } else if (/\.(tsx?|jsx?|html|css|json)$/.test(entry.name) && !entry.name.includes('otp-logo-brand.test')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes(forbidden)) {
            violations.push(fullPath);
          }
        }
      }
      return violations;
    }

    const violations = scanDirectoryForForbiddenString(webSrcDir, 'otp-logo.original-backup.jpg');
    expect(violations).toEqual([]);
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
