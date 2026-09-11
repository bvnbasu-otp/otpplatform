/**
 * Fixed UUIDs for Durga Rainbow Community demo scenario.
 * Documented in docs/OTP-DEMO.md — do not change without updating tests.
 */
export const DEMO = {
  orgId: 'd1000000-0000-4000-8000-000000000001',
  users: {
    manager: {
      id: 'd1000001-0000-4000-8000-000000000001',
      email: 'demo@durga-rainbow.manager',
      password: 'DemoManager2026!',
      fullName: 'Priya Sharma',
      role: 'MANAGER',
    },
    committee1: {
      id: 'd1000002-0000-4000-8000-000000000001',
      email: 'committee1@durga-rainbow.community',
      password: 'DemoCommittee2026!',
      fullName: 'Ramesh Iyer',
      role: 'COMMITTEE_MEMBER',
    },
    committee2: {
      id: 'd1000003-0000-4000-8000-000000000001',
      email: 'committee2@durga-rainbow.community',
      password: 'DemoCommittee2026!',
      fullName: 'Anita Deshmukh',
      role: 'COMMITTEE_MEMBER',
    },
    buyer: {
      id: 'd1000004-0000-4000-8000-000000000001',
      email: 'buyer@durga-rainbow.community',
      password: 'DemoBuyer2026!',
      fullName: 'Vikram Patel',
      role: 'BUYER',
    },
    platformAdmin: {
      id: 'd1000005-0000-4000-8000-000000000001',
      email: 'admin@otp.demo',
      password: 'DemoAdmin2026!',
      fullName: 'OTP Platform Admin',
      role: 'PLATFORM_ADMIN',
    },
  },
  suppliers: {
    A: {
      id: 'd1000010-0000-4000-8000-000000000001',
      businessName: 'Shree Sai Electricals',
      label: 'Supplier A',
    },
    B: {
      id: 'd1000011-0000-4000-8000-000000000001',
      businessName: 'Krishna Pump Services',
      label: 'Supplier B',
    },
    C: {
      id: 'd1000012-0000-4000-8000-000000000001',
      businessName: 'AquaTech Borewell Solutions',
      label: 'Supplier C',
    },
    D: {
      id: 'd1000013-0000-4000-8000-000000000001',
      businessName: 'Vinayaka Motor Rewinding',
      label: 'Supplier D',
    },
    E: {
      id: 'd1000014-0000-4000-8000-000000000001',
      businessName: 'Lakshmi Engineering Works',
      label: 'Supplier E',
    },
  },
  requirementId: 'd1000020-0000-4000-8000-000000000001',
  rfqId: 'd1000021-0000-4000-8000-000000000001',
  approvalPolicyId: 'd1000022-0000-4000-8000-000000000001',
  invites: {
    A: 'd1000030-0000-4000-8000-000000000001',
    B: 'd1000031-0000-4000-8000-000000000001',
    C: 'd1000032-0000-4000-8000-000000000001',
    D: 'd1000033-0000-4000-8000-000000000001',
    E: 'd1000034-0000-4000-8000-000000000001',
  },
  quotes: {
    A: 'd1000040-0000-4000-8000-000000000001',
    B: 'd1000041-0000-4000-8000-000000000001',
    C: 'd1000042-0000-4000-8000-000000000001',
  },
  awardId: 'd1000050-0000-4000-8000-000000000001',
  purchaseOrderId: 'd1000051-0000-4000-8000-000000000001',
  workOrderId: 'd1000052-0000-4000-8000-000000000001',
  invoiceId: 'd1000053-0000-4000-8000-000000000001',
  paymentId: 'd1000054-0000-4000-8000-000000000001',
  performanceId: 'd1000055-0000-4000-8000-000000000001',
} as const;

/** Canonical quote commercial terms (totals in INR). */
export const DEMO_QUOTES = {
  A: {
    totalCost: 8500,
    basePrice: 6800,
    transportCost: 400,
    gstAmount: 1300,
    deliveryDays: 2,
    warrantyMonths: 12,
    evaluationScore: 88.4,
  },
  B: {
    totalCost: 7800,
    basePrice: 6271,
    transportCost: 300,
    gstAmount: 1229,
    deliveryDays: 4,
    warrantyMonths: 6,
    evaluationScore: 91.2,
  },
  C: {
    totalCost: 9200,
    basePrice: 7389,
    transportCost: 400,
    gstAmount: 1411,
    deliveryDays: 2,
    warrantyMonths: 12,
    evaluationScore: 85.1,
  },
} as const;

export const DEMO_ORG_NAME = 'Durga Rainbow Community';
export const DEMO_REQUIREMENT_TITLE = '10 HP Borewell Motor Winding';
