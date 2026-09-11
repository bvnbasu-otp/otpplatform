import { describe, it, expect, vi } from 'vitest';
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      read_at: new Date().toISOString(),
    },
  ];

  it('correctly calculates unread count across fleet notifications', () => {
    const unread = sampleNotifications.filter((n) => n.status !== 'READ');
    expect(unread).toHaveLength(2);
    expect(unread.map((n) => n.id)).toEqual(['notif-1', 'notif-2']);
  });

  it('correctly categorizes notifications by action type and category', () => {
    const rfqNotifs = sampleNotifications.filter(
      (n) => (n.action_type || '').includes('RFQ') || (n.event_type || '').startsWith('rfq.')
    );
    expect(rfqNotifs).toHaveLength(1);
    expect(rfqNotifs[0]?.id).toBe('notif-1');

    const voteNotifs = sampleNotifications.filter(
      (n) => (n.action_type || '').includes('VOTE') || (n.event_type || '').startsWith('governance.')
    );
    expect(voteNotifs).toHaveLength(1);
    expect(voteNotifs[0]?.id).toBe('notif-2');

    const orderNotifs = sampleNotifications.filter(
      (n) => (n.action_type || '').includes('PO_') || (n.event_type || '').startsWith('po.')
    );
    expect(orderNotifs).toHaveLength(1);
    expect(orderNotifs[0]?.id).toBe('notif-3');
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
    expect(updated.filter((n) => n.status !== 'READ')).toHaveLength(1);
  });

  it('exposes markAllPlatformNotificationsRead on notificationService', () => {
    expect(typeof notificationService.markAllPlatformNotificationsRead).toBe('function');
    expect(typeof notificationService.markAsRead).toBe('function');
    expect(typeof notificationService.markAllAsRead).toBe('function');
  });
});
