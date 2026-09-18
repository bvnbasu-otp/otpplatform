/** Organization account types — billing and UI context, not permissions. */
export const OrganizationType = {
  INDIVIDUAL: 'INDIVIDUAL',
  MSME: 'MSME',
  COMMUNITY: 'COMMUNITY',
  ENTERPRISE: 'ENTERPRISE',
  INSTITUTION: 'INSTITUTION',
} as const;

export type OrganizationType =
  (typeof OrganizationType)[keyof typeof OrganizationType];

/** User roles within a buyer organization. */
export const OrganizationMemberRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  BUYER: 'BUYER',
  APPROVER: 'APPROVER',
  COMMITTEE_MEMBER: 'COMMITTEE_MEMBER',
} as const;

export type OrganizationMemberRole =
  (typeof OrganizationMemberRole)[keyof typeof OrganizationMemberRole];

/** Roles within a supplier account. */
export const SupplierUserRole = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  OPERATOR: 'OPERATOR',
} as const;

export type SupplierUserRole =
  (typeof SupplierUserRole)[keyof typeof SupplierUserRole];

/** Platform-level admin flag lives on profile; this is the logical role name. */
export const PlatformRole = {
  FOUNDER: 'FOUNDER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  USER: 'USER',
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

/** Logical role for supplier portal users (separate from org membership). */
export const UserRole = {
  FOUNDER: 'FOUNDER',
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  BUYER: 'BUYER',
  APPROVER: 'APPROVER',
  COMMITTEE_MEMBER: 'COMMITTEE_MEMBER',
  SUPPLIER_USER: 'SUPPLIER_USER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
