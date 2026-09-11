import { describe, expect, it } from 'vitest';
import {
  humanizeSignupError,
  normalizePhone,
  resolveBuyerOrganisation,
  resolveBuyerRoleCode,
} from './signup';

describe('phone normalisation', () => {
  it('assumes India for a bare ten-digit number', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
  });

  it('keeps a country code the applicant typed', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('strips the punctuation people actually use', () => {
    expect(normalizePhone('98765-43210')).toBe('+919876543210');
    expect(normalizePhone('(987) 654 3210')).toBe('+919876543210');
  });
});

describe('turning constraint failures into something actionable', () => {
  it('names the box to go back to, not the constraint', () => {
    const message = humanizeSignupError(
      'new row for relation "signup_requests" violates check constraint "signup_requests_phone_shape"',
    );

    expect(message).toMatch(/phone number/i);
    expect(message).not.toMatch(/constraint/i);
  });

  it('explains why a category is not optional for a supplier', () => {
    expect(
      humanizeSignupError('violates check constraint "signup_requests_supplier_needs_category"'),
    ).toMatch(/no request can reach you/);
  });

  it('translates a bad buyer type into the question that was asked', () => {
    expect(
      humanizeSignupError('invalid input value for enum org_type: "SOMETHING"'),
    ).toMatch(/kind of organisation/i);
  });

  it('passes an unrecognised message through rather than inventing one', () => {
    expect(humanizeSignupError('connection refused')).toBe('connection refused');
  });
});

describe('buyer organisation and role normalisation', () => {
  it('defaults organisation to Self when buyer is buying for themselves (INDIVIDUAL)', () => {
    expect(resolveBuyerOrganisation('INDIVIDUAL', '')).toBe('Self');
    expect(resolveBuyerOrganisation('INDIVIDUAL', '   ')).toBe('Self');
    expect(resolveBuyerOrganisation('INDIVIDUAL', 'Self')).toBe('Self');
    expect(resolveBuyerOrganisation('INDIVIDUAL', 'Custom Home Office')).toBe('Custom Home Office');
  });

  it('preserves registered organisation name for MSME and other enterprise categories', () => {
    expect(resolveBuyerOrganisation('MSME', 'Acme Precision Tools')).toBe('Acme Precision Tools');
    expect(resolveBuyerOrganisation('COMMUNITY', 'Greenview Heights RWA')).toBe('Greenview Heights RWA');
    expect(resolveBuyerOrganisation('ENTERPRISE', 'Apex Global Corp')).toBe('Apex Global Corp');
    expect(resolveBuyerOrganisation('INSTITUTION', 'St. Jude Medical Trust')).toBe('St. Jude Medical Trust');
  });

  it('assigns PROPERTY_OWNER role to individual buyers and preserves role choices for organizations', () => {
    expect(resolveBuyerRoleCode('INDIVIDUAL')).toBe('PROPERTY_OWNER');
    expect(resolveBuyerRoleCode('INDIVIDUAL', 'FACILITY_MANAGER')).toBe('PROPERTY_OWNER');
    expect(resolveBuyerRoleCode('MSME', 'PROCUREMENT_LEAD')).toBe('PROCUREMENT_LEAD');
    expect(resolveBuyerRoleCode('COMMUNITY', 'COMMITTEE_MEMBER')).toBe('COMMITTEE_MEMBER');
  });
});

