/** Announcement category taxonomy */
export const AnnouncementCategory = {
  NEW_VERSION: 'NEW_VERSION',
  NEW_FEATURE: 'NEW_FEATURE',
  BUG_FIX: 'BUG_FIX',
  SECURITY_UPDATE: 'SECURITY_UPDATE',
  BROWSER_SUPPORT: 'BROWSER_SUPPORT',
  PLANNED_MAINTENANCE: 'PLANNED_MAINTENANCE',
  EMERGENCY_MAINTENANCE: 'EMERGENCY_MAINTENANCE',
  SERVICE_RESTORATION: 'SERVICE_RESTORATION',
  PLATFORM_NOTICE: 'PLATFORM_NOTICE',
} as const;

export type AnnouncementCategory =
  (typeof AnnouncementCategory)[keyof typeof AnnouncementCategory];

/** Announcement severity level */
export const AnnouncementSeverity = {
  INFO: 'INFO',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type AnnouncementSeverity =
  (typeof AnnouncementSeverity)[keyof typeof AnnouncementSeverity];

/** Target audience for platform broadcasts */
export const AnnouncementAudience = {
  ALL: 'ALL',
  BUYER: 'BUYER',
  SUPPLIER: 'SUPPLIER',
  ADMIN: 'ADMIN',
} as const;

export type AnnouncementAudience =
  (typeof AnnouncementAudience)[keyof typeof AnnouncementAudience];

/** Lifecycle state machine for an announcement */
export const AnnouncementStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  PUBLISHED: 'PUBLISHED',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type AnnouncementStatus =
  (typeof AnnouncementStatus)[keyof typeof AnnouncementStatus];
