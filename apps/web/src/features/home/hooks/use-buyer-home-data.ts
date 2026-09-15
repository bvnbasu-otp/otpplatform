import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchUserOrganization,
  fetchOrganizationRequirements,
  type UserOrganization,
  type OrganizationRequirementSummary,
} from '@/features/requirement/api/requirements';
import {
  fetchOrganizationSubscription,
  type OrganizationSubscription,
} from '@/features/subscription';
import type { CoreProcurementState } from '@/features/lifecycle';
import { formatDateIST } from '@/lib/date-utils';
import type {
  BuyerActionItem,
  BuyerProcurementItem,
  HomeActivityEvent,
  ActionPriority,
} from '../types';

export function getBuyerCoreState(req: OrganizationRequirementSummary): CoreProcurementState {
  if (req.isSettled || req.effectiveStatus === 'COMPLETED') return 'SETTLED';
  if (
    req.poStatus === 'ISSUED' ||
    req.poStatus === 'ACCEPTED' ||
    req.poStatus === 'IN_PROGRESS' ||
    req.effectiveStatus === 'IN_PROGRESS'
  ) {
    return 'PO_ISSUED';
  }
  if (req.rfqStatus === 'AWARDED' || req.revealStatus === 'REVEALED' || req.effectiveStatus === 'AWARDED') {
    return 'AWARDED';
  }
  if (req.rfqStatus === 'EVALUATING' || req.rfqStatus === 'CLOSED' || req.effectiveStatus === 'EVALUATION') {
    return 'EVALUATING';
  }
  if (req.rfqStatus === 'OPEN' || req.effectiveStatus === 'QUOTING' || req.status === 'QUOTING') {
    return 'QUOTING';
  }
  return 'DRAFT';
}

export function isBuyerRequirementStalled(req: OrganizationRequirementSummary): boolean {
  if (
    req.isSettled ||
    req.effectiveStatus === 'COMPLETED' ||
    req.effectiveStatus === 'CANCELLED' ||
    req.status === 'CANCELLED'
  ) {
    return false;
  }
  const createdMs = new Date(req.createdAt).getTime();
  const elapsedHours = (Date.now() - createdMs) / (1000 * 60 * 60);
  return elapsedHours > 24;
}

export function deriveBuyerActionItem(req: OrganizationRequirementSummary): BuyerActionItem | null {
  if (req.isSettled || req.effectiveStatus === 'COMPLETED' || req.status === 'CANCELLED' || req.effectiveStatus === 'CANCELLED') {
    return null;
  }

  const coreState = getBuyerCoreState(req);
  const quotesCount = req.quotesCount || 0;
  const quorum = req.minQuotesRequired || 3;

  switch (req.status) {
    case 'DRAFT':
      return {
        id: req.id,
        requirement: req,
        title: req.title,
        category: req.requirementType || 'Procurement',
        statusLabel: 'Draft Ready',
        statusIcon: '📝',
        whyText: 'Specification draft saved · Submit to publish RFQ',
        actionLabel: 'Continue Draft →',
        actionUrl: `/requirements/${req.id}`,
        priority: 'P1',
        priorityTag: 'Draft Ready',
        coreState,
        quotesCount,
        minQuotesRequired: quorum,
        rfqId: req.rfqId,
      };

    case 'SUBMITTED':
    case 'RFQ_CREATED':
      return {
        id: req.id,
        requirement: req,
        title: req.title,
        category: req.requirementType || 'Procurement',
        statusLabel: 'Suppliers Needed',
        statusIcon: '📢',
        whyText: 'Tender published · Invite qualified suppliers to start quoting',
        actionLabel: 'Invite Suppliers →',
        actionUrl: `/requirements/${req.id}/discover`,
        priority: 'P0',
        priorityTag: 'Action Needed',
        coreState,
        quotesCount,
        minQuotesRequired: quorum,
        rfqId: req.rfqId,
      };

    case 'QUOTING':
      if (quotesCount >= quorum) {
        return {
          id: req.id,
          requirement: req,
          title: req.title,
          category: req.requirementType || 'Procurement',
          statusLabel: 'Quotes Ready',
          statusIcon: '⚡',
          whyText: `${quotesCount} sealed quotes received · Quorum reached for comparison`,
          actionLabel: 'Compare Quotes →',
          actionUrl: req.rfqId ? `/rfq/${req.rfqId}/quotes` : `/requirements/${req.id}`,
          priority: 'P0',
          priorityTag: 'Quorum Reached',
          coreState,
          quotesCount,
          minQuotesRequired: quorum,
          rfqId: req.rfqId,
        };
      }
      if (quotesCount > 0) {
        return {
          id: req.id,
          requirement: req,
          title: req.title,
          category: req.requirementType || 'Procurement',
          statusLabel: 'Quotes Arrived',
          statusIcon: '🟢',
          whyText: `${quotesCount} / ${quorum} quotes received · Sourcing in progress`,
          actionLabel: 'View Quotes →',
          actionUrl: req.rfqId ? `/rfq/${req.rfqId}/committee` : `/requirements/${req.id}`,
          priority: 'P2',
          priorityTag: 'Quotes In',
          coreState,
          quotesCount,
          minQuotesRequired: quorum,
          rfqId: req.rfqId,
        };
      }
      return null;

    case 'EVALUATION':
      return {
        id: req.id,
        requirement: req,
        title: req.title,
        category: req.requirementType || 'Procurement',
        statusLabel: 'Vote Pending',
        statusIcon: '🗳️',
        whyText: 'Committee voting active · Quorum decision pending',
        actionLabel: 'Cast Vote →',
        actionUrl: req.rfqId ? `/rfq/${req.rfqId}/committee` : `/requirements/${req.id}`,
        priority: 'P0',
        priorityTag: 'Vote Required',
        coreState,
        quotesCount,
        minQuotesRequired: quorum,
        rfqId: req.rfqId,
      };

    case 'AWARDED':
      if (req.revealStatus !== 'REVEALED') {
        return {
          id: req.id,
          requirement: req,
          title: req.title,
          category: req.requirementType || 'Procurement',
          statusLabel: 'Award Finalized',
          statusIcon: '🏆',
          whyText: 'Winning quote selected · Reveal supplier identity to issue Purchase Order',
          actionLabel: 'Reveal & Issue PO →',
          actionUrl: req.rfqId ? `/rfq/${req.rfqId}/reveal` : `/requirements/${req.id}`,
          priority: 'P0',
          priorityTag: 'PO Ready',
          coreState,
          quotesCount,
          minQuotesRequired: quorum,
          rfqId: req.rfqId,
        };
      }
      return null;

    case 'IN_PROGRESS':
      if ((req.workOrderProgressPercent ?? 0) >= 100) {
        return {
          id: req.id,
          requirement: req,
          title: req.title,
          category: req.requirementType || 'Procurement',
          statusLabel: 'Delivery Finished',
          statusIcon: '🚚',
          whyText: 'Work completed 100% · Buyer inspection & final sign-off pending',
          actionLabel: 'Review & Sign Off →',
          actionUrl: '/purchase-orders',
          priority: 'P0',
          priorityTag: 'Sign-Off Due',
          coreState,
          quotesCount,
          minQuotesRequired: quorum,
          rfqId: req.rfqId,
        };
      }
      return null;

    default:
      return null;
  }
}

export function deriveBuyerProcurementItem(req: OrganizationRequirementSummary): BuyerProcurementItem {
  const coreState = getBuyerCoreState(req);
  const stalled = isBuyerRequirementStalled(req);
  const quotesCount = req.quotesCount || 0;
  const quorum = req.minQuotesRequired || 3;
  const actionItem = deriveBuyerActionItem(req);

  let statusLabel = 'Draft';
  let statusIcon = '📝';
  let statusClass = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  let actionLabel = 'View Scope';
  let actionUrl = `/requirements/${req.id}`;

  if (stalled) {
    statusLabel = 'Stalled · 24h+';
    statusIcon = '⚠️';
    statusClass = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
  } else if (req.isSettled || req.effectiveStatus === 'COMPLETED') {
    statusLabel = 'Settled ✓';
    statusIcon = '🟢';
    statusClass = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    actionLabel = 'View Order';
    actionUrl = '/purchase-orders';
  } else if (coreState === 'PO_ISSUED' || req.poStatus === 'ISSUED' || req.poStatus === 'ACCEPTED' || req.poStatus === 'IN_PROGRESS') {
    const pct = req.workOrderProgressPercent ?? 0;
    statusLabel = pct >= 100 ? 'Delivery Ready' : `PO In Execution · ${pct}%`;
    statusIcon = '🚚';
    statusClass = 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
    actionLabel = 'Track Order';
    actionUrl = '/purchase-orders';
  } else if (coreState === 'AWARDED' || req.rfqStatus === 'AWARDED') {
    if (req.revealStatus === 'REVEALED') {
      statusLabel = 'Winner Revealed';
      statusIcon = '🏆';
      statusClass = 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800';
      actionLabel = 'Track PO';
      actionUrl = '/purchase-orders';
    } else {
      statusLabel = 'Award Finalized';
      statusIcon = '🏆';
      statusClass = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      actionLabel = 'Issue PO';
      actionUrl = req.rfqId ? `/rfq/${req.rfqId}/reveal` : `/requirements/${req.id}`;
    }
  } else if (coreState === 'EVALUATING' || req.rfqStatus === 'EVALUATING' || req.rfqStatus === 'CLOSED') {
    statusLabel = `Voting · ${quotesCount} Quotes`;
    statusIcon = '🗳️';
    statusClass = 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
    actionLabel = 'Vote';
    actionUrl = req.rfqId ? `/rfq/${req.rfqId}/committee` : `/requirements/${req.id}`;
  } else if (coreState === 'QUOTING' || req.rfqStatus === 'OPEN' || req.status === 'QUOTING') {
    statusLabel = quotesCount > 0 ? `${quotesCount} Quotes Received` : 'Awaiting Quotes';
    statusIcon = quotesCount > 0 ? '🟢' : '⏳';
    statusClass = quotesCount > 0
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
      : 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    actionLabel = req.rfqId ? (quotesCount >= quorum ? 'Compare' : 'View RFQ') : 'View Scope';
    actionUrl = req.rfqId ? `/rfq/${req.rfqId}/quotes` : `/requirements/${req.id}`;
  } else if (req.status === 'SUBMITTED' || req.status === 'RFQ_CREATED') {
    statusLabel = 'Invite Suppliers';
    statusIcon = '📢';
    statusClass = 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800';
    actionLabel = 'Invite';
    actionUrl = `/requirements/${req.id}/discover`;
  }

  return {
    id: req.id,
    requirement: req,
    title: req.title,
    category: req.requirementType || 'Procurement',
    createdAt: req.createdAt,
    statusLabel,
    statusIcon,
    statusClass,
    coreState,
    quotesCount,
    minQuotesRequired: quorum,
    workOrderProgressPercent: req.workOrderProgressPercent,
    actionLabel,
    actionUrl,
    isActionRequired: Boolean(actionItem),
    rfqId: req.rfqId,
  };
}

export function deriveBuyerRecentActivity(requirements: OrganizationRequirementSummary[]): HomeActivityEvent[] {
  const events: HomeActivityEvent[] = [];

  for (const req of requirements) {
    if (req.isSettled || req.effectiveStatus === 'COMPLETED') {
      events.push({
        id: `settled-${req.id}`,
        title: req.title,
        description: 'Order fully completed & settled',
        timestamp: req.createdAt,
        relativeTime: formatDateIST(req.createdAt),
        icon: '🟢',
        category: 'BUYER',
        targetUrl: '/purchase-orders',
      });
    } else if (req.poStatus === 'ISSUED' || req.poStatus === 'ACCEPTED' || req.poStatus === 'IN_PROGRESS') {
      events.push({
        id: `po-${req.id}`,
        title: req.title,
        description: `Purchase order active (${req.workOrderProgressPercent ?? 0}% executed)`,
        timestamp: req.createdAt,
        relativeTime: formatDateIST(req.createdAt),
        icon: '🚚',
        category: 'BUYER',
        targetUrl: '/purchase-orders',
      });
    } else if (req.revealStatus === 'REVEALED' || req.rfqStatus === 'AWARDED') {
      events.push({
        id: `awarded-${req.id}`,
        title: req.title,
        description: 'Award finalized · Winner revealed',
        timestamp: req.createdAt,
        relativeTime: formatDateIST(req.createdAt),
        icon: '🏆',
        category: 'BUYER',
        targetUrl: req.rfqId ? `/rfq/${req.rfqId}/reveal` : `/requirements/${req.id}`,
      });
    } else if (req.quotesCount > 0) {
      events.push({
        id: `quotes-${req.id}`,
        title: req.title,
        description: `${req.quotesCount} sealed supplier ${req.quotesCount === 1 ? 'quote' : 'quotes'} received`,
        timestamp: req.createdAt,
        relativeTime: formatDateIST(req.createdAt),
        icon: '⚡',
        category: 'BUYER',
        targetUrl: req.rfqId ? `/rfq/${req.rfqId}/quotes` : `/requirements/${req.id}`,
      });
    } else if (req.publishedAt || req.status === 'RFQ_CREATED') {
      events.push({
        id: `rfq-${req.id}`,
        title: req.title,
        description: 'RFQ tender broadcast to supplier network',
        timestamp: req.publishedAt || req.createdAt,
        relativeTime: formatDateIST(req.publishedAt || req.createdAt),
        icon: '📢',
        category: 'BUYER',
        targetUrl: `/requirements/${req.id}`,
      });
    }
  }

  return events.slice(0, 5);
}

export function useBuyerHomeData() {
  const [org, setOrg] = useState<UserOrganization | null>(null);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [requirements, setRequirements] = useState<OrganizationRequirementSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const orgRes = await fetchUserOrganization();
      if (!orgRes.ok) {
        setError(orgRes.error);
        setIsLoading(false);
        return;
      }
      setOrg(orgRes.org);

      const [reqRes, subRes] = await Promise.all([
        fetchOrganizationRequirements(orgRes.org.organizationId),
        fetchOrganizationSubscription(orgRes.org.organizationId),
      ]);

      if (reqRes.ok) {
        setRequirements(reqRes.requirements);
      } else {
        setError(reqRes.error);
      }

      if (subRes.ok) {
        setSubscription(subRes.subscription);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load procurement workspace');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const actionRequiredItems = useMemo(() => {
    const list: BuyerActionItem[] = [];
    for (const req of requirements) {
      const item = deriveBuyerActionItem(req);
      if (item) list.push(item);
    }
    // Sort priority: P0 > P1 > P2
    const priorityWeight: Record<ActionPriority, number> = { P0: 0, P1: 1, P2: 2 };
    return list.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);
  }, [requirements]);

  const activeProcurements = useMemo(() => {
    return requirements
      .filter(
        (r) =>
          r.effectiveStatus !== 'CANCELLED' &&
          r.status !== 'CANCELLED' &&
          !r.isSettled &&
          r.effectiveStatus !== 'COMPLETED' &&
          getBuyerCoreState(r) !== 'SETTLED',
      )
      .map(deriveBuyerProcurementItem);
  }, [requirements]);

  const recentActivity = useMemo(() => {
    return deriveBuyerRecentActivity(requirements);
  }, [requirements]);

  const stats = useMemo(() => {
    const total = requirements.length;
    const active = activeProcurements.length;
    const action = actionRequiredItems.length;
    const settled = requirements.filter(
      (r) => r.isSettled || r.effectiveStatus === 'COMPLETED' || getBuyerCoreState(r) === 'SETTLED',
    ).length;

    return { total, active, action, settled };
  }, [requirements, activeProcurements, actionRequiredItems]);

  return {
    org,
    subscription,
    requirements,
    actionRequiredItems,
    activeProcurements,
    recentActivity,
    stats,
    isLoading,
    error,
    refresh: loadData,
  };
}
