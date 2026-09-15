import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSupplierInvitations } from '@/features/supplier/hooks/use-supplier-invitations';
import {
  fetchSupplierPerformance,
  type SupplierPerformanceSummary,
} from '@/features/supplier/api/fetch-supplier-performance';
import { fetchPurchaseOrders } from '@/features/fulfillment/api/purchase-orders';
import type { PurchaseOrderSummary } from '@/features/fulfillment/types/fulfillment';
import { useSupplierRadarCapabilities } from '@/features/supplier/hooks/use-supplier-radar';
import { formatDateIST, formatDeadlineCountdown } from '@/lib/date-utils';
import type {
  SupplierOpportunityItem,
  SupplierActionItem,
  SupplierActiveQuoteItem,
  HomeActivityEvent,
} from '../types';

export function useSupplierHomeData() {
  const { invitations, isLoading: isInvLoading, error: invError, refresh: refreshInv } = useSupplierInvitations();
  const { profile } = useSupplierRadarCapabilities();

  const [performance, setPerformance] = useState<SupplierPerformanceSummary | null>(null);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderSummary[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const loadExtraData = useCallback(async () => {
    setIsDataLoading(true);
    setDataError(null);
    try {
      const [perfRes, poRes] = await Promise.all([
        fetchSupplierPerformance(),
        fetchPurchaseOrders(),
      ]);

      if (perfRes.ok) {
        setPerformance(perfRes.performance);
      }
      if (poRes.ok) {
        setPurchaseOrders(poRes.orders);
      }
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to load supplier workspace');
    } finally {
      setIsDataLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExtraData();
  }, [loadExtraData]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshInv(), loadExtraData()]);
  }, [refreshInv, loadExtraData]);

  // 1. New Opportunities: Unanswered RFQ invitations (INVITED or VIEWED), not closed/awarded/cancelled
  const newOpportunities = useMemo<SupplierOpportunityItem[]>(() => {
    return invitations
      .filter(
        (inv) =>
          (inv.status === 'INVITED' || inv.status === 'VIEWED') &&
          inv.rfqStatus !== 'AWARDED' &&
          inv.rfqStatus !== 'CLOSED' &&
          inv.rfqStatus !== 'CANCELLED',
      )
      .map((inv) => {
        const countdown = formatDeadlineCountdown(inv.quoteDeadline);
        const deadlineMs = inv.quoteDeadline ? new Date(inv.quoteDeadline).getTime() : null;
        const isClosingSoon = deadlineMs ? deadlineMs - Date.now() < 24 * 60 * 60 * 1000 : false;

        return {
          id: inv.invitationId,
          invitation: inv,
          title: inv.rfqTitle,
          publicRef: inv.publicRef,
          anonymousLabel: inv.anonymousLabel || 'Anonymous Tender',
          buyerDisplayName: inv.buyerDisplayName || 'Identity Protected',
          buyerAnonymous: inv.buyerAnonymous,
          quoteDeadline: inv.quoteDeadline,
          deadlineCountdown: countdown.label,
          invitedAt: inv.invitedAt,
          actionUrl: `/supplier/rfq/${inv.rfqId}`,
          isClosingSoon,
        };
      });
  }, [invitations]);

  // 2. Action Required: Pending PO acceptances, Closing RFQs, Work order milestones
  const actionRequiredItems = useMemo<SupplierActionItem[]>(() => {
    const actions: SupplierActionItem[] = [];

    // Pending Purchase Order Acceptances (P0)
    const pendingPOs = purchaseOrders.filter((po) => po.status === 'ISSUED');
    for (const po of pendingPOs) {
      actions.push({
        id: `po-accept-${po.id}`,
        type: 'PO_ACCEPTANCE',
        title: `PO #${po.poNumber || po.id.slice(0, 8)}`,
        subtitle: po.rfqTitle || 'Awarded Purchase Order',
        priority: 'P0',
        statusLabel: 'PO Acceptance Pending',
        whyText: 'Buyer has issued Purchase Order · Accept to begin work execution',
        actionLabel: 'Accept & Sign PO →',
        actionUrl: `/purchase-orders/${po.id}`,
      });
    }

    // High urgency opportunity actions (closing < 24h)
    for (const opp of newOpportunities) {
      if (opp.isClosingSoon) {
        actions.push({
          id: `rfq-closing-${opp.id}`,
          type: 'RFQ_CLOSING_SOON',
          title: opp.title,
          subtitle: opp.publicRef || opp.anonymousLabel,
          priority: 'P1',
          statusLabel: 'Closing Soon',
          whyText: `Quote submission deadline approaching (${opp.deadlineCountdown})`,
          actionLabel: 'Submit Quote →',
          actionUrl: opp.actionUrl,
          deadline: opp.quoteDeadline,
          publicRef: opp.publicRef,
        });
      }
    }

    return actions;
  }, [purchaseOrders, newOpportunities]);

  // 3. Active Quotes: Submitted quotes currently in Quoting or Evaluation
  const activeQuotes = useMemo<SupplierActiveQuoteItem[]>(() => {
    return invitations
      .filter(
        (inv) =>
          inv.status === 'QUOTED' &&
          inv.rfqStatus !== 'AWARDED' &&
          inv.rfqStatus !== 'CLOSED' &&
          inv.rfqStatus !== 'CANCELLED',
      )
      .map((inv) => ({
        id: inv.invitationId,
        invitation: inv,
        title: inv.rfqTitle,
        publicRef: inv.publicRef,
        statusLabel: inv.rfqStatus === 'EVALUATING' ? 'Under Committee Evaluation' : 'Quote Submitted · Sourcing Open',
        rfqStatus: inv.rfqStatus,
        actionUrl: `/supplier/rfq/${inv.rfqId}`,
        submittedDate: inv.invitedAt,
      }));
  }, [invitations]);

  // 4. Orders / Business Summary
  const ordersSummary = useMemo(() => {
    const activeOrders = purchaseOrders.filter(
      (po) => !po.isSettled && po.status !== 'CANCELLED' && po.status !== 'DRAFT',
    );
    const totalActiveAmount = activeOrders.reduce((sum, po) => sum + (Number(po.totalAmount) || 0), 0);
    const pendingAcceptanceCount = purchaseOrders.filter((po) => po.status === 'ISSUED').length;
    const completedOrdersCount = purchaseOrders.filter(
      (po) => po.isSettled || po.status === 'COMPLETED',
    ).length || (performance?.completedOrdersCount ?? (performance?.completedJobs ?? 0));

    return {
      activeCount: activeOrders.length || (performance?.inExecutionCount ?? 0),
      totalAmount: totalActiveAmount,
      pendingAcceptanceCount,
      completedCount: completedOrdersCount,
      ratingAvg: performance?.ratingAvg ?? 5.0,
      totalReviews: performance?.totalReviews ?? 0,
    };
  }, [purchaseOrders, performance]);

  // 5. Recent Activity
  const recentActivity = useMemo<HomeActivityEvent[]>(() => {
    const events: HomeActivityEvent[] = [];

    // Recent PO events
    for (const po of purchaseOrders.slice(0, 3)) {
      if (po.isSettled || po.status === 'COMPLETED') {
        events.push({
          id: `po-settled-${po.id}`,
          title: `Order #${po.poNumber || po.id.slice(0, 6)}`,
          description: 'Payment settled and order completed',
          timestamp: po.createdAt,
          relativeTime: formatDateIST(po.createdAt),
          icon: '🟢',
          category: 'SUPPLIER',
          targetUrl: `/purchase-orders/${po.id}`,
        });
      } else if (po.status === 'ACCEPTED' || po.status === 'IN_PROGRESS') {
        events.push({
          id: `po-active-${po.id}`,
          title: `PO #${po.poNumber || po.id.slice(0, 6)} Accepted`,
          description: po.rfqTitle || 'Work order active in execution',
          timestamp: po.createdAt,
          relativeTime: formatDateIST(po.createdAt),
          icon: '🚚',
          category: 'SUPPLIER',
          targetUrl: `/purchase-orders/${po.id}`,
        });
      }
    }

    // Recent Quotes & Invitations
    for (const inv of invitations.slice(0, 4)) {
      if (inv.status === 'QUOTED') {
        events.push({
          id: `quoted-${inv.invitationId}`,
          title: inv.rfqTitle,
          description: 'Sealed quote submitted to buyer evaluation room',
          timestamp: inv.invitedAt,
          relativeTime: formatDateIST(inv.invitedAt),
          icon: '⚡',
          category: 'SUPPLIER',
          targetUrl: `/supplier/rfq/${inv.rfqId}`,
        });
      } else if (inv.status === 'INVITED' || inv.status === 'VIEWED') {
        events.push({
          id: `invited-${inv.invitationId}`,
          title: inv.rfqTitle,
          description: `New RFQ opportunity received · ${inv.publicRef || inv.anonymousLabel}`,
          timestamp: inv.invitedAt,
          relativeTime: formatDateIST(inv.invitedAt),
          icon: '📢',
          category: 'SUPPLIER',
          targetUrl: `/supplier/rfq/${inv.rfqId}`,
        });
      }
    }

    return events.slice(0, 5);
  }, [purchaseOrders, invitations]);

  const isLoading = isInvLoading || isDataLoading;
  const error = invError || dataError;

  return {
    profile,
    performance,
    newOpportunities,
    actionRequiredItems,
    activeQuotes,
    ordersSummary,
    recentActivity,
    isLoading,
    error,
    refresh: refreshAll,
  };
}
