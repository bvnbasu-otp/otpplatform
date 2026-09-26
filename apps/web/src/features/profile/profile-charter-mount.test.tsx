import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrganizationCharterPanel } from '@/features/governance/components/OrganizationCharterPanel';

const profileSrc = readFileSync(resolve(__dirname, 'pages/ProfilePage.tsx'), 'utf8');

describe('Profile shows the real governance charter (issue 10)', () => {
  it('mounts OrganizationCharterPanel on the organization tab', () => {
    expect(profileSrc).toMatch(/<OrganizationCharterPanel\s/);
    expect(profileSrc).toMatch(/isSupplier=\{context\.side === 'SUPPLIER'\}/);
  });

  it('no longer renders the one-line placeholder agreement', () => {
    expect(profileSrc).not.toContain("registered under OTP's direct settlement framework with zero markup");
    expect(profileSrc).not.toContain('immutable audit logs');
  });

  it('the mounted panel renders enforceable clauses for an RWA', () => {
    const html = renderToStaticMarkup(<OrganizationCharterPanel orgType="RWA" organizationName="Palm Grove RWA" />);
    expect(html).toContain('data-testid="organization-charter"');
    expect(html).toContain('data-persona="RWA"');
    expect(html.toLowerCase()).toContain('quorum');
  });
});
