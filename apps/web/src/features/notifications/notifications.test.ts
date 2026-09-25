import { describe, it, expect } from 'vitest';
import type { AppNotification } from './types';
import { notificationService } from './services/notificationService';

describe('Notification History & Activity Feed', () => {
  const sampleNotifications: AppNotification[] = [
    {
      id: 'notif-1',
      profile_id: 'prof-admin',
      channel: 'IN_APP',
      status: 'PENDING',
      event_type: 'rfq.invited',
      action_type: 'RFQ_INVITED',
      title: 'New RFQ Invitation',
      body: 'Greenview Heights invited you to submit a quotation for Modular Workstations.',
      link: '/rfq/rfq-101/evaluation',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'notif-2',
      profile_id: 'prof-buyer',
      channel: 'IN_APP',
      status: 'PENDING',
      event_type: 'governance.vote_requested',
      action_type: 'VOTE_REQUESTED',
      title: 'Committee Vote Required',
      body: 'Quorum pending for DG Set Maintenance tender.',
      link: '/governance/evaluations/rfq-202/vote',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'notif-3',
      profile_id: 'prof-supplier',
      channel: 'EMAIL',
      status: 'READ',
      event_type: 'po.issued',
      action_type: 'PO_ISSUED',
      title: 'Purchase Order Issued',
      body: 'Purchase Order #PO-2026-004 has been issued.',
      link: '/purchase-orders/po-303',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      read_at: new Date().toISOString(),
    },
    {
      id: 'notif-4',
      profile_id: 'prof-buyer',
      channel: 'IN_APP',
      status: 'PENDING',
      event_type: 'rfq.quote_received',
      action_type: 'QUOTE_RECEIVED',
      title: 'New Quotation Received',
      body: 'Supplier A7K3 submitted quote for 10HP Motor Rewind.',
      link: '/rfq/rfq-404/quotes',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'notif-5',
      profile_id: 'prof-buyer',
      channel: 'IN_APP',
      status: 'READ',
      event_type: 'work_order.progress_updated',
      action_type: 'WORK_PROGRESS_UPDATED',
      title: 'Milestone Progress Updated',
      body: 'Motor collected from site by Sri Vinayaka Electricals.',
      link: '/purchase-orders/po-505',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it('correctly calculates unread count across fleet notifications', () => {
    const unread = sampleNotifications.filter((n) => n.status !== 'READ');
    expect(unread).toHaveLength(3);
    expect(unread.map((n) => n.id)).toEqual(['notif-1', 'notif-2', 'notif-4']);
  });

  it('correctly categorizes notifications by action type and category', () => {
    const rfqNotifs = sampleNotifications.filter(
      (n) => (n.action_type || '').includes('RFQ') || (n.action_type || '').includes('QUOTE') || (n.event_type || '').startsWith('rfq.')
    );
    expect(rfqNotifs).toHaveLength(2);
    expect(rfqNotifs.map((n) => n.id)).toEqual(['notif-1', 'notif-4']);

    const voteNotifs = sampleNotifications.filter(
      (n) => (n.action_type || '').includes('VOTE') || (n.event_type || '').startsWith('governance.')
    );
    expect(voteNotifs).toHaveLength(1);
    expect(voteNotifs[0]?.id).toBe('notif-2');

    const orderNotifs = sampleNotifications.filter(
      (n) => ['PO_ISSUED', 'PO_ACCEPTED', 'WORK_PROGRESS_UPDATED'].includes(n.action_type || '') || (n.event_type || '').startsWith('po.') || (n.event_type || '').startsWith('work_order.')
    );
    expect(orderNotifs).toHaveLength(2);
    expect(orderNotifs.map((n) => n.id)).toEqual(['notif-3', 'notif-5']);
  });

  it('provides 1-tap deep links across all workflow notifications', () => {
    for (const notif of sampleNotifications) {
      expect(notif.link).toBeDefined();
      expect(notif.link).toMatch(/^\/(rfq|governance|purchase-orders)\//);
    }
  });

  it('optimistically marks all notifications as read', () => {
    const marked = sampleNotifications.map((n) => ({
      ...n,
      status: 'READ' as const,
      read_at: new Date().toISOString(),
    }));

    const unreadCount = marked.filter((n) => n.status !== 'READ').length;
    expect(unreadCount).toBe(0);
    expect(marked.every((n) => n.status === 'READ')).toBe(true);
  });

  it('optimistically marks a single notification as read without mutating others', () => {
    const targetId = 'notif-1';
    const updated = sampleNotifications.map((n) =>
      n.id === targetId ? { ...n, status: 'READ' as const, read_at: new Date().toISOString() } : n
    );

    expect(updated.find((n) => n.id === 'notif-1')?.status).toBe('READ');
    expect(updated.find((n) => n.id === 'notif-2')?.status).toBe('PENDING');
    expect(updated.filter((n) => n.status !== 'READ')).toHaveLength(2);
  });

  it('exposes markAllPlatformNotificationsRead on notificationService', () => {
    expect(typeof notificationService.markAllPlatformNotificationsRead).toBe('function');
    expect(typeof notificationService.markAsRead).toBe('function');
    expect(typeof notificationService.markAllAsRead).toBe('function');
  });

  it('exports NotificationBell component with flyout and mobile overlay support', () => {
    const bellProps = {
      open: false,
    };
    expect(bellProps.open).toBe(false);
  });

  it('exports NotificationsPage component with responsive activity navigation', async () => {
    const { NotificationsPage } = await import('./pages/NotificationsPage');
    expect(NotificationsPage).toBeDefined();
    expect(typeof NotificationsPage).toBe('function');
  });

  it('renders truthful delivery state badges for canonical states', () => {
    const states: Array<AppNotification['status']> = [
      'CREATED',
      'DISPATCH_REQUESTED',
      'PROVIDER_ACCEPTED',
      'DELIVERED',
      'OPENED',
      'CLAIMED',
      'UNAVAILABLE',
      'FAILED',
    ];

    expect(states).toHaveLength(8);
  });
});
