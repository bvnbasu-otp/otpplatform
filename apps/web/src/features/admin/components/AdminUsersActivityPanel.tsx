import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { sendWhatsAppNotification } from '@/features/portal/api/signup';
import {
  fetchUsersAndOrganizations,
  fetchSignupRequests,
  reviewSignupRequest,
  bulkBlockUsers,
  bulkUnblockUsers,
  bulkDeleteUsers,
  bulkBlockOrganizations,
  bulkUnblockOrganizations,
  bulkDeleteOrganizations,
} from '../api/admin-ops';
import {
  getUserOnlineStatus,
  getPresenceBadgeConfig,
  formatLastSeenRelative,
  formatLastSeenAbsolute,
  type UserPresenceStatus,
} from '../utils/presence';
import type {
  AdminUserItem,
  AdminOrganizationItem,
  AdminSignupRequest,
  AccountBlockReason,
  AccountLifecycleStatus,
} from '../types/admin';

const BLOCK_REASONS: AccountBlockReason[] = [
  'Suspicious Activity',
  'Policy Violation',
  'Spam / Bot Behavior',
  'Unresponsive / Failed Fulfillment',
  'Non-Compliant KYC / Invalid GSTIN',
  'Payment Dispute / Fraud Risk',
  'Other',
];

export interface AdminUsersActivityPanelProps {
  initialSubTab?: 'USERS' | 'ORGANIZATIONS' | 'REGISTRATIONS';
  onSubTabChange?: (tab: 'USERS' | 'ORGANIZATIONS' | 'REGISTRATIONS') => void;
}

export function AdminUsersActivityPanel({ initialSubTab = 'USERS', onSubTabChange }: AdminUsersActivityPanelProps = {}) {
  const [subTab, setSubTab] = useState<'USERS' | 'ORGANIZATIONS' | 'REGISTRATIONS'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSubTabChange = (next: 'USERS' | 'ORGANIZATIONS' | 'REGISTRATIONS') => {
    setSubTab(next);
    setStatusFilter('ALL');
    setSideFilter('ALL');
    setPresenceFilter('ALL');
    setSearch('');
    onSubTabChange?.(next);
  };
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [organizations, setOrganizations] = useState<AdminOrganizationItem[]>([]);
  const [requests, setRequests] = useState<AdminSignupRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AccountLifecycleStatus>('ALL');
  const [presenceFilter, setPresenceFilter] = useState<'ALL' | UserPresenceStatus>('ALL');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUYER' | 'SUPPLIER' | 'ADMIN'>('ALL');

  // Real-time dynamic ticker (updates relative time every 30s)
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Multi-Selection States
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());

  // Action / Modal States
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isBulkExecuting, setIsBulkExecuting] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Block Modal State
  const [blockModalTarget, setBlockModalTarget] = useState<{
    type: 'USERS' | 'ORGANIZATIONS';
    ids: string[];
    labels: string[];
  } | null>(null);
  const [selectedBlockReason, setSelectedBlockReason] = useState<AccountBlockReason>('Suspicious Activity');
  const [customBlockReason, setCustomBlockReason] = useState('');

  // Delete Modal State (Two-step confirmation)
  const [deleteModalTarget, setDeleteModalTarget] = useState<{
    type: 'USERS' | 'ORGANIZATIONS';
    ids: string[];
    labels: string[];
  } | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isSoftDelete, setIsSoftDelete] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    const [usersOrgsRes, reqsRes] = await Promise.all([
      fetchUsersAndOrganizations(),
      fetchSignupRequests('ALL'),
    ]);

    if (usersOrgsRes.ok) {
      setUsers(usersOrgsRes.users);
      setOrganizations(usersOrgsRes.organizations);
    }
    if (reqsRes.ok) {
      setRequests(reqsRes.requests);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Clear selections when changing tabs
  useEffect(() => {
    setSelectedUserIds(new Set());
    setSelectedOrgIds(new Set());
  }, [subTab]);

  const pendingRegistrationsCount = requests.filter((r) => r.status === 'PENDING').length;
  const blockedUsersCount = users.filter(
    (u) =>
      u.status === 'BLOCKED' ||
      (u.status as string) === 'SUSPENDED' ||
      Boolean(u.blockedAt) ||
      Boolean(u.blockedReason)
  ).length;
  const blockedOrgsCount = organizations.filter(
    (o) =>
      o.status === 'BLOCKED' ||
      (o.status as string) === 'SUSPENDED' ||
      Boolean(o.blocked_at) ||
      Boolean(o.blocked_reason)
  ).length;

  const onlineUsersCount = useMemo(() => {
    return users.filter((u) => getUserOnlineStatus(u.lastSeenAt, now) === 'ONLINE').length;
  }, [users, now]);

  const recentlyActiveUsersCount = useMemo(() => {
    return users.filter((u) => getUserOnlineStatus(u.lastSeenAt, now) === 'RECENTLY_ACTIVE').length;
  }, [users, now]);

  const offlineUsersCount = useMemo(() => {
    return users.filter((u) => getUserOnlineStatus(u.lastSeenAt, now) === 'OFFLINE').length;
  }, [users, now]);

  // Filtering
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const isBlocked =
        u.status === 'BLOCKED' ||
        (u.status as string) === 'SUSPENDED' ||
        Boolean(u.blockedAt) ||
        Boolean(u.blockedReason);

      if (statusFilter === 'BLOCKED' && !isBlocked) return false;
      if (statusFilter === 'ACTIVE' && (isBlocked || u.status !== 'ACTIVE')) return false;
      if (
        statusFilter !== 'ALL' &&
        statusFilter !== 'BLOCKED' &&
        statusFilter !== 'ACTIVE' &&
        u.status !== statusFilter
      ) {
        return false;
      }

      if (presenceFilter !== 'ALL') {
        const presence = getUserOnlineStatus(u.lastSeenAt, now);
        if (presence !== presenceFilter) return false;
      }

      if (sideFilter !== 'ALL' && u.side !== sideFilter) {
        return false;
      }

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        u.email.toLowerCase().includes(q) ||
        (u.fullName && u.fullName.toLowerCase().includes(q)) ||
        (u.organizationName && u.organizationName.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.phone && u.phone.includes(q)) ||
        (u.blockedReason && u.blockedReason.toLowerCase().includes(q))
      );
    });
  }, [users, statusFilter, presenceFilter, sideFilter, search, now]);

  const filteredOrganizations = useMemo(() => {
    return organizations.filter((o) => {
      const isBlocked =
        o.status === 'BLOCKED' ||
        (o.status as string) === 'SUSPENDED' ||
        Boolean(o.blocked_at) ||
        Boolean(o.blocked_reason);

      if (statusFilter === 'BLOCKED' && !isBlocked) return false;
      if (statusFilter === 'ACTIVE' && (isBlocked || o.status !== 'ACTIVE')) return false;
      if (
        statusFilter !== 'ALL' &&
        statusFilter !== 'BLOCKED' &&
        statusFilter !== 'ACTIVE' &&
        o.status !== statusFilter
      ) {
        return false;
      }

      if (presenceFilter !== 'ALL') {
        const presence = getUserOnlineStatus(o.last_seen_at, now);
        if (presence !== presenceFilter) return false;
      }

      if (sideFilter === 'BUYER' && o.entity_type !== 'BUYER_ORG') return false;
      if (sideFilter === 'SUPPLIER' && o.entity_type !== 'SUPPLIER') return false;

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        o.name.toLowerCase().includes(q) ||
        (o.contact_email && o.contact_email.toLowerCase().includes(q)) ||
        (o.gstin && o.gstin.toLowerCase().includes(q)) ||
        (o.org_type && o.org_type.toLowerCase().includes(q)) ||
        (o.contact_person && o.contact_person.toLowerCase().includes(q)) ||
        (o.blocked_reason && o.blocked_reason.toLowerCase().includes(q))
      );
    });
  }, [organizations, statusFilter, presenceFilter, sideFilter, search, now]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PENDING' && r.status !== 'PENDING') return false;
        if (statusFilter === 'ACTIVE' && r.status !== 'ONBOARDED') return false;
        if (statusFilter === 'BLOCKED' && r.status !== 'REJECTED') return false;
        if (statusFilter === 'DELETED' || statusFilter === 'SUSPENDED') return false;
      }
      if (sideFilter !== 'ALL' && r.side !== sideFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.reference.toLowerCase().includes(q) ||
        r.business_name.toLowerCase().includes(q) ||
        r.contact_full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.phone && r.phone.includes(q))
      );
    });
  }, [requests, statusFilter, sideFilter, search]);

  // Selection Toggles
  const isAllUsersSelected =
    filteredUsers.length > 0 && filteredUsers.every((u) => selectedUserIds.has(u.id));
  const isSomeUsersSelected =
    filteredUsers.some((u) => selectedUserIds.has(u.id)) && !isAllUsersSelected;

  const toggleSelectAllUsers = () => {
    if (isAllUsersSelected) {
      setSelectedUserIds(new Set());
    } else {
      const next = new Set<string>();
      filteredUsers.forEach((u) => {
        if (!u.isPlatformAdmin) next.add(u.id);
      });
      setSelectedUserIds(next);
    }
  };

  const toggleSelectUser = (id: string, isSuperAdmin?: boolean) => {
    if (isSuperAdmin) return;
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllOrgsSelected =
    filteredOrganizations.length > 0 &&
    filteredOrganizations.every((o) => selectedOrgIds.has(o.id));
  const isSomeOrgsSelected =
    filteredOrganizations.some((o) => selectedOrgIds.has(o.id)) && !isAllOrgsSelected;

  const toggleSelectAllOrgs = () => {
    if (isAllOrgsSelected) {
      setSelectedOrgIds(new Set());
    } else {
      const next = new Set<string>(filteredOrganizations.map((o) => o.id));
      setSelectedOrgIds(next);
    }
  };

  const toggleSelectOrg = (id: string) => {
    setSelectedOrgIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Modal Openers
  const openBlockModal = (
    type: 'USERS' | 'ORGANIZATIONS',
    ids: string[],
    labels: string[]
  ) => {
    setBlockModalTarget({ type, ids, labels });
    setSelectedBlockReason('Suspicious Activity');
    setCustomBlockReason('');
  };

  const openDeleteModal = (
    type: 'USERS' | 'ORGANIZATIONS',
    ids: string[],
    labels: string[]
  ) => {
    setDeleteModalTarget({ type, ids, labels });
    setDeleteStep(1);
    setDeleteConfirmationText('');
    setIsSoftDelete(true);
  };

  // Execution Handlers
  const handleConfirmBlock = async () => {
    if (!blockModalTarget) return;
    const finalReason =
      selectedBlockReason === 'Other' && customBlockReason.trim()
        ? customBlockReason.trim()
        : selectedBlockReason;

    setIsBulkExecuting(true);
    const previousUsers = [...users];
    const previousOrgs = [...organizations];
    const nowIso = new Date().toISOString();

    if (blockModalTarget.type === 'USERS') {
      const blockedIdSet = new Set(blockModalTarget.ids);
      setUsers((prev) =>
        prev.map((u) =>
          blockedIdSet.has(u.id)
            ? { ...u, status: 'BLOCKED', blockedAt: nowIso, blockedReason: finalReason }
            : u
        )
      );
    } else {
      const blockedIdSet = new Set(blockModalTarget.ids);
      setOrganizations((prev) =>
        prev.map((o) =>
          blockedIdSet.has(o.id)
            ? { ...o, status: 'BLOCKED', blocked_at: nowIso, blocked_reason: finalReason }
            : o
        )
      );
    }

    try {
      if (blockModalTarget.type === 'USERS') {
        const res = await bulkBlockUsers(blockModalTarget.ids, finalReason);
        if (res.ok) {
          setBannerMessage({
            type: 'success',
            text: `✓ ${res.message || `Blocked ${blockModalTarget.ids.length} user account(s).`}`,
          });
          setSelectedUserIds(new Set());
          await loadData();
        } else {
          setUsers(previousUsers);
          setBannerMessage({ type: 'error', text: `✕ ${res.error || 'Failed to block users.'}` });
        }
      } else {
        const isSupplier = organizations.some(
          (o) => blockModalTarget.ids.includes(o.id) && o.entity_type === 'SUPPLIER'
        );
        const res = await bulkBlockOrganizations(blockModalTarget.ids, isSupplier, finalReason);
        if (res.ok) {
          setBannerMessage({
            type: 'success',
            text: `✓ ${res.message || `Blocked ${blockModalTarget.ids.length} organization(s).`}`,
          });
          setSelectedOrgIds(new Set());
          await loadData();
        } else {
          setOrganizations(previousOrgs);
          setBannerMessage({
            type: 'error',
            text: `✕ ${res.error || 'Failed to block organizations.'}`,
          });
        }
      }
    } catch (err: any) {
      setUsers(previousUsers);
      setOrganizations(previousOrgs);
      setBannerMessage({ type: 'error', text: `✕ Operation error: ${err.message}` });
    } finally {
      setIsBulkExecuting(false);
      setBlockModalTarget(null);
    }
  };

  const handleConfirmUnblock = async (type: 'USERS' | 'ORGANIZATIONS', ids: string[]) => {
    setIsBulkExecuting(true);
    const previousUsers = [...users];
    const previousOrgs = [...organizations];
    const unblockedIdSet = new Set(ids);

    if (type === 'USERS') {
      setUsers((prev) =>
        prev.map((u) =>
          unblockedIdSet.has(u.id)
            ? { ...u, status: 'ACTIVE', blockedAt: undefined, blockedReason: undefined }
            : u
        )
      );
    } else {
      setOrganizations((prev) =>
        prev.map((o) =>
          unblockedIdSet.has(o.id)
            ? { ...o, status: 'ACTIVE', blocked_at: null, blocked_reason: null }
            : o
        )
      );
    }

    try {
      if (type === 'USERS') {
        const res = await bulkUnblockUsers(ids);
        if (res.ok) {
          setBannerMessage({
            type: 'success',
            text: `✓ ${res.message || `Unblocked and reactivated ${ids.length} user account(s).`}`,
          });
          setSelectedUserIds(new Set());
          await loadData();
        } else {
          setUsers(previousUsers);
          setBannerMessage({ type: 'error', text: `✕ ${res.error || 'Failed to unblock users.'}` });
        }
      } else {
        const isSupplier = organizations.some(
          (o) => ids.includes(o.id) && o.entity_type === 'SUPPLIER'
        );
        const res = await bulkUnblockOrganizations(ids, isSupplier);
        if (res.ok) {
          setBannerMessage({
            type: 'success',
            text: `✓ ${res.message || `Unblocked and reactivated ${ids.length} organization(s).`}`,
          });
          setSelectedOrgIds(new Set());
          await loadData();
        } else {
          setOrganizations(previousOrgs);
          setBannerMessage({
            type: 'error',
            text: `✕ ${res.error || 'Failed to unblock organizations.'}`,
          });
        }
      }
    } catch (err: any) {
      setUsers(previousUsers);
      setOrganizations(previousOrgs);
      setBannerMessage({ type: 'error', text: `✕ Operation error: ${err.message}` });
    } finally {
      setIsBulkExecuting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalTarget) return;

    setIsBulkExecuting(true);
    const previousUsers = [...users];
    const previousOrgs = [...organizations];
    const deletedIdSet = new Set(deleteModalTarget.ids);

    if (deleteModalTarget.type === 'USERS') {
      setUsers((prev) => prev.filter((u) => !deletedIdSet.has(u.id)));
    } else {
      setOrganizations((prev) => prev.filter((o) => !deletedIdSet.has(o.id)));
    }

    try {
      if (deleteModalTarget.type === 'USERS') {
        const res = await bulkDeleteUsers(deleteModalTarget.ids, isSoftDelete);
        if (res.ok) {
          setBannerMessage({
            type: 'success',
            text: `✓ ${res.message || `Deleted ${deleteModalTarget.ids.length} user account(s).`}`,
          });
          setSelectedUserIds(new Set());
          await loadData();
        } else {
          setUsers(previousUsers);
          setBannerMessage({ type: 'error', text: `✕ ${res.error || 'Failed to delete users.'}` });
        }
      } else {
        const isSupplier = organizations.some(
          (o) => deleteModalTarget.ids.includes(o.id) && o.entity_type === 'SUPPLIER'
        );
        const res = await bulkDeleteOrganizations(
          deleteModalTarget.ids,
          isSupplier,
          isSoftDelete
        );
        if (res.ok) {
          setBannerMessage({
            type: 'success',
            text: `✓ ${res.message || `Deleted ${deleteModalTarget.ids.length} organization(s).`}`,
          });
          setSelectedOrgIds(new Set());
          await loadData();
        } else {
          setOrganizations(previousOrgs);
          setBannerMessage({
            type: 'error',
            text: `✕ ${res.error || 'Failed to delete organizations.'}`,
          });
        }
      }
    } catch (err: any) {
      setUsers(previousUsers);
      setOrganizations(previousOrgs);
      setBannerMessage({ type: 'error', text: `✕ Operation error: ${err.message}` });
    } finally {
      setIsBulkExecuting(false);
      setDeleteModalTarget(null);
    }
  };

  // Registration Review Handler
  const handleReview = async (request: AdminSignupRequest, action: 'APPROVE' | 'REJECT') => {
    setProcessingId(request.id);
    try {
      const res = await reviewSignupRequest(request.id, action);
      if (res.ok) {
        const notifDetails: string[] = [];

        if (action === 'APPROVE') {
          try {
            const { error: emailErr } = await supabase.auth.resetPasswordForEmail(request.email, {
              redirectTo: `${window.location.origin}/reset-password`,
            });
            if (!emailErr) notifDetails.push('Activation email dispatched');
          } catch (e) {
            console.warn('Approval email dispatch note:', e);
          }

          if (request.phone) {
            try {
              const portalUrl = window.location.origin;
              const tempPass = res.temporary_password || 'Welcome@OTP2026!';
              const waSuccess = await sendWhatsAppNotification(
                request.phone,
                `[OTP Platform] Account Approved & Activated\n\n` +
                  `Hello ${request.contact_full_name},\n` +
                  `Your registration for *${request.business_name}* (Ref: ${request.reference}) has been approved by the platform administrator.\n\n` +
                  `*Your Login Credentials:*\n` +
                  `- Email: ${request.email}\n` +
                  `- Temporary Password: ${tempPass}\n` +
                  `- Login URL: ${portalUrl}/login\n\n` +
                  `An activation email has also been sent to *${request.email}*. Please log in and update your password under Account Settings.`
              );
              if (waSuccess) notifDetails.push('WhatsApp dispatched');
            } catch (e) {
              console.warn('Failed to send WhatsApp activation message:', e);
            }
          }
        }

        const notifSummary = notifDetails.length > 0 ? ` (${notifDetails.join(' & ')})` : '';
        setBannerMessage({
          type: 'success',
          text:
            action === 'APPROVE'
              ? `✓ Successfully approved and onboarded "${request.business_name}" (${request.reference}). Workspace provisioned for ${request.email}.${notifSummary}`
              : `✕ Registration request "${request.business_name}" (${request.reference}) marked as rejected.`,
        });
        await loadData();
      } else {
        setBannerMessage({
          type: 'error',
          text: `Failed to ${action.toLowerCase()} request: ${res.error || 'Unknown error'}`,
        });
      }
    } catch (err) {
      setBannerMessage({
        type: 'error',
        text: `Operation failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDirectApproveUser = async (user: AdminUserItem) => {
    setProcessingId(user.id);
    try {
      const isBlocked =
        user.status === 'BLOCKED' ||
        (user.status as string) === 'SUSPENDED' ||
        Boolean(user.blockedAt) ||
        Boolean(user.blockedReason);
      if (isBlocked) {
        await handleConfirmUnblock('USERS', [user.id]);
      }
      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          is_demo: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (profErr) throw profErr;

      if (user.email) {
        try {
          await supabase.auth.resetPasswordForEmail(user.email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });
        } catch (e) {
          console.warn('Password reset dispatch note:', e);
        }
      }

      setBannerMessage({
        type: 'success',
        text: `✓ User "${user.fullName || user.email}" successfully approved and activated.`,
      });
      await loadData();
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: `Failed to activate user: ${err?.message || String(err)}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDirectVerifyOrg = async (org: AdminOrganizationItem) => {
    setProcessingId(org.id);
    try {
      if (org.entity_type === 'SUPPLIER') {
        const { error } = await supabase
          .from('suppliers')
          .update({
            status: 'ACTIVE',
            verification_status: 'PLATFORM_VERIFIED',
            gst_verified: true,
            gst_status: 'Active',
            gst_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', org.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('organizations')
          .update({
            subscription_status: 'ACTIVE',
            gst_verified: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', org.id);
        if (error) throw error;
      }

      setBannerMessage({
        type: 'success',
        text: `✓ "${org.name}" verified and activated with active platform workspace.`,
      });
      await loadData();
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: `Failed to verify organization: ${err?.message || String(err)}`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveAllPending = async () => {
    const pendingReqs = requests.filter((r) => r.status === 'PENDING');
    if (pendingReqs.length === 0) return;
    setIsBulkExecuting(true);
    let successCount = 0;
    for (const req of pendingReqs) {
      try {
        const res = await reviewSignupRequest(req.id, 'APPROVE');
        if (res.ok) successCount++;
      } catch (e) {
        console.warn('Bulk approve item failed:', req.id, e);
      }
    }
    setIsBulkExecuting(false);
    setBannerMessage({
      type: 'success',
      text: `✓ Approved & activated ${successCount} of ${pendingReqs.length} pending registration(s).`,
    });
    await loadData();
  };

  const selectedCount =
    subTab === 'USERS'
      ? selectedUserIds.size
      : subTab === 'ORGANIZATIONS'
      ? selectedOrgIds.size
      : 0;

  return (
    <div className="w-full max-w-full space-y-3 pb-8">
      {/* 1. System Notification Banner */}
      {bannerMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`shrink-0 flex items-center justify-between rounded-xl p-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-150 ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-950 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span>{bannerMessage.type === 'success' ? '✓' : '⚠️'}</span>
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-muted-foreground hover:text-foreground font-bold ml-3 px-1.5 py-0.5"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Responsive 3-Column Sub-Tabs Header (Compact Icons + Tooltips) */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {/* Subtab 1: Users */}
          <button
            type="button"
            onClick={() => handleSubTabChange('USERS')}
            title={`Users Roster (${users.length} total accounts)`}
            className={`inline-flex min-h-[40px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-1.5 text-xs font-bold transition active:scale-98 mobile-touch-target cursor-pointer ${
              subTab === 'USERS'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
            }`}
          >
            <span className="shrink-0 text-sm">👥</span>
            <span className="truncate">Users</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold shrink-0 ${
              subTab === 'USERS' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'
            }`}>
              {users.length}
            </span>
            {onlineUsersCount > 0 && (
              <span className="hidden lg:inline-flex items-center gap-1 rounded-full bg-emerald-500 px-1.5 py-0.2 text-[9px] font-extrabold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                {onlineUsersCount}
              </span>
            )}
          </button>

          {/* Subtab 2: Organizations & Suppliers */}
          <button
            type="button"
            onClick={() => handleSubTabChange('ORGANIZATIONS')}
            title={`Organizations & Supplier Registry (${organizations.length} total)`}
            className={`inline-flex min-h-[40px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-1.5 text-xs font-bold transition active:scale-98 mobile-touch-target cursor-pointer ${
              subTab === 'ORGANIZATIONS'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
            }`}
          >
            <span className="shrink-0 text-sm">🏢</span>
            <span className="truncate">Orgs &amp; Suppliers</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold shrink-0 ${
              subTab === 'ORGANIZATIONS' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'
            }`}>
              {organizations.length}
            </span>
          </button>

          {/* Subtab 3: Approvals Queue */}
          <button
            type="button"
            onClick={() => handleSubTabChange('REGISTRATIONS')}
            title="Approval Queue (Pending applicant registrations awaiting superadmin review)"
            className={`inline-flex min-h-[40px] items-center justify-center gap-1 sm:gap-1.5 rounded-xl px-2.5 sm:px-3.5 py-1.5 text-xs font-bold transition active:scale-98 mobile-touch-target cursor-pointer ${
              subTab === 'REGISTRATIONS'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/70'
            }`}
          >
            <span className="shrink-0 text-sm">📋</span>
            <span className="truncate">Approvals</span>
            {pendingRegistrationsCount > 0 ? (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.2 text-[10px] font-extrabold text-white shrink-0 animate-pulse">
                {pendingRegistrationsCount}
              </span>
            ) : (
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold shrink-0 ${
                subTab === 'REGISTRATIONS' ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-foreground'
              }`}>
                {requests.length}
              </span>
            )}
          </button>
        </div>

        {/* View Switcher & Refresh Button */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {/* Card / Table Toggle */}
          <div className="flex items-center rounded-xl border bg-muted/50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 transition ${
                viewMode === 'CARDS'
                  ? 'bg-card text-foreground font-bold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Switch to Card View"
            >
              <span>▦</span> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 py-1 transition ${
                viewMode === 'TABLE'
                  ? 'bg-card text-foreground font-bold shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title="Switch to Table View"
            >
              <span>📋</span> Table
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={isLoading}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted active:scale-98 transition shrink-0 shadow-2xs"
            title="Refresh Roster Data"
          >
            <span>↻</span> <span className="hidden sm:inline ml-1">{isLoading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* 3. Search & Multi-Criteria Filter Bar */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border bg-card p-2.5 sm:p-3 shadow-2xs">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              subTab === 'USERS'
                ? 'Search name, email, phone, role, organization...'
                : subTab === 'ORGANIZATIONS'
                ? 'Search business name, GSTIN, contact person, email...'
                : 'Search applicant name, business, reference (REG-)...'
            }
            className="rounded-xl border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary w-full max-w-sm min-h-[44px]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-xs text-muted-foreground hover:text-foreground font-semibold shrink-0 px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Presence Filter Dropdown */}
          <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-[140px]">
            <select
              value={presenceFilter}
              onChange={(e) => setPresenceFilter(e.target.value as any)}
              className="w-full rounded-xl border bg-background px-2.5 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer min-h-[44px]"
              aria-label="Filter by online presence status"
            >
              <option value="ALL">All Presence ({subTab === 'USERS' ? users.length : organizations.length})</option>
              <option value="ONLINE">🟢 Online ({onlineUsersCount})</option>
              <option value="RECENTLY_ACTIVE">🟡 Recently Active ({recentlyActiveUsersCount})</option>
              <option value="OFFLINE">⚪ Offline ({offlineUsersCount})</option>
            </select>
          </div>

          {/* Side / Role Filter Dropdown */}
          <div className="flex items-center gap-1 flex-1 sm:flex-initial min-w-[110px]">
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value as any)}
              className="w-full rounded-xl border bg-background px-2.5 py-2 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer min-h-[44px]"
              aria-label="Filter by user portal side"
            >
              <option value="ALL">All Roles</option>
              <option value="BUYER">🏢 Buyers</option>
              <option value="SUPPLIER">🏭 Suppliers</option>
              <option value="ADMIN">🛡️ Admins</option>
            </select>
          </div>

          {/* Account Status Filter Chips */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            {(['ALL', 'ACTIVE', 'BLOCKED', 'PENDING'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition min-h-[44px] mobile-touch-target shrink-0 ${
                  statusFilter === s
                    ? s === 'BLOCKED'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : s === 'ACTIVE'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                }`}
              >
                {s === 'ALL' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. DYNAMIC BATCH ACTION TOOLBAR (Appears when ≥ 1 row selected) */}
      {selectedCount > 0 && (
        <div
          role="toolbar"
          aria-label="Bulk actions toolbar"
          className="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-primary/40 bg-primary/10 p-2.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
              ✓
            </span>
            <span className="font-extrabold text-foreground">
              {selectedCount} {selectedCount === 1 ? 'record' : 'records'} selected
            </span>
            <button
              type="button"
              onClick={() => {
                if (subTab === 'USERS') setSelectedUserIds(new Set());
                if (subTab === 'ORGANIZATIONS') setSelectedOrgIds(new Set());
              }}
              className="ml-2 text-xs font-semibold text-muted-foreground hover:text-foreground underline"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Block Action Button */}
            <button
              type="button"
              onClick={() => {
                if (subTab === 'USERS') {
                  const targetUsers = users.filter((u) => selectedUserIds.has(u.id));
                  openBlockModal(
                    'USERS',
                    targetUsers.map((u) => u.id),
                    targetUsers.map((u) => `${u.fullName || u.email} (${u.email})`)
                  );
                } else if (subTab === 'ORGANIZATIONS') {
                  const targetOrgs = organizations.filter((o) => selectedOrgIds.has(o.id));
                  openBlockModal(
                    'ORGANIZATIONS',
                    targetOrgs.map((o) => o.id),
                    targetOrgs.map((o) => o.name)
                  );
                }
              }}
              disabled={isBulkExecuting}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold px-3.5 py-1.5 text-xs transition shadow-2xs disabled:opacity-50 mobile-touch-target"
            >
              <span>🚫</span> Block Account{selectedCount > 1 ? 's' : ''}
            </button>

            {/* Unblock Action Button */}
            <button
              type="button"
              onClick={() => {
                if (subTab === 'USERS') {
                  void handleConfirmUnblock('USERS', Array.from(selectedUserIds));
                } else if (subTab === 'ORGANIZATIONS') {
                  void handleConfirmUnblock('ORGANIZATIONS', Array.from(selectedOrgIds));
                }
              }}
              disabled={isBulkExecuting}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-1.5 text-xs transition shadow-2xs disabled:opacity-50 mobile-touch-target"
            >
              <span>🔓</span> Unblock / Activate
            </button>

            {/* Delete Action Button */}
            <button
              type="button"
              onClick={() => {
                if (subTab === 'USERS') {
                  const targetUsers = users.filter((u) => selectedUserIds.has(u.id));
                  openDeleteModal(
                    'USERS',
                    targetUsers.map((u) => u.id),
                    targetUsers.map((u) => `${u.fullName || u.email} (${u.email})`)
                  );
                } else if (subTab === 'ORGANIZATIONS') {
                  const targetOrgs = organizations.filter((o) => selectedOrgIds.has(o.id));
                  openDeleteModal(
                    'ORGANIZATIONS',
                    targetOrgs.map((o) => o.id),
                    targetOrgs.map((o) => o.name)
                  );
                }
              }}
              disabled={isBulkExecuting}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold px-3.5 py-1.5 text-xs transition shadow-2xs disabled:opacity-50 mobile-touch-target"
            >
              <span>🗑️</span> Delete {subTab === 'USERS' ? 'User' : 'Org'}{selectedCount > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* 5. DATA CONTAINER: RESPONSIVE CARDS & DATA TABLES */}
      <div className="rounded-2xl border bg-card shadow-2xs p-2.5 sm:p-4 w-full max-w-full space-y-3">
        {/* Real-time Filter & Record Counts Info Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap font-semibold text-foreground">
            <span>
              {subTab === 'USERS'
                ? `Showing ${filteredUsers.length} of ${users.length} user(s)`
                : subTab === 'ORGANIZATIONS'
                ? `Showing ${filteredOrganizations.length} of ${organizations.length} org(s) & supplier(s)`
                : `Showing ${filteredRequests.length} of ${requests.length} onboarding applicant(s)`}
            </span>
            {statusFilter !== 'ALL' && (
              <span className="rounded-md bg-primary/10 text-primary px-1.5 py-0.2 text-[10px] font-bold border border-primary/20">
                Filter: {statusFilter}
              </span>
            )}
            {sideFilter !== 'ALL' && (
              <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-bold border">
                Role: {sideFilter}
              </span>
            )}
            {search && (
              <span className="rounded-md bg-muted px-1.5 py-0.2 text-[10px] font-mono border">
                "{search}"
              </span>
            )}
          </div>

          {(statusFilter !== 'ALL' || sideFilter !== 'ALL' || search || presenceFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setSideFilter('ALL');
                setPresenceFilter('ALL');
                setSearch('');
              }}
              className="text-[11px] font-bold text-primary hover:underline shrink-0 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* ========================================================= */}
        {/* SUBTAB 1: USERS (Cards on Mobile / Default View) */}
        {/* ========================================================= */}
        {subTab === 'USERS' && (
          <div className="space-y-3 w-full">
            {isLoading ? (
              <div className="py-16 text-center text-muted-foreground text-xs animate-pulse">
                Loading user accounts and tenant credentials…
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs font-medium space-y-3 border rounded-xl bg-muted/20 p-4">
                <p>No user accounts matching the current filter ({users.length} total in system).</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setSideFilter('ALL');
                    setSearch('');
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs cursor-pointer"
                >
                  ↻ View All Users ({users.length})
                </button>
              </div>
            ) : viewMode === 'CARDS' ? (
              /* RESPONSIVE MOBILE ACTION CARDS FOR USERS */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredUsers.map((u) => {
                  const isSelected = selectedUserIds.has(u.id);
                  const isBlocked =
                    u.status === 'BLOCKED' ||
                    (u.status as string) === 'SUSPENDED' ||
                    Boolean(u.blockedAt) ||
                    Boolean(u.blockedReason);

                  const presenceStatus = getUserOnlineStatus(u.lastSeenAt, now);
                  const presenceConfig = getPresenceBadgeConfig(presenceStatus);
                  const relativeTime = formatLastSeenRelative(u.lastSeenAt, now);
                  const absoluteTime = formatLastSeenAbsolute(u.lastSeenAt);
                  const initials = (u.fullName || u.email || '?')
                    .split(' ')
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                  return (
                    <article
                      key={u.id}
                      className={`rounded-2xl border bg-card p-3.5 shadow-2xs transition flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                          : isBlocked
                          ? 'border-rose-300 dark:border-rose-900 bg-rose-50/20 dark:bg-rose-950/10'
                          : 'hover:border-border'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2.5 border-b border-border/50 pb-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={u.isPlatformAdmin}
                            onChange={() => toggleSelectUser(u.id, u.isPlatformAdmin)}
                            aria-label={`Select user ${u.email}`}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary disabled:opacity-30 shrink-0"
                          />

                          {/* Avatar & Presence */}
                          <div className="relative shrink-0">
                            <div className="h-9 w-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs border border-primary/20">
                              {initials}
                            </div>
                            <span
                              title={`Presence: ${presenceConfig.label} (${relativeTime})\n${absoluteTime}`}
                              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${presenceConfig.dotColor}`}
                            />
                          </div>

                          {/* Name & Admin Tag */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-extrabold text-xs text-foreground truncate" title={u.fullName || undefined}>
                                {u.fullName || 'User'}
                              </h4>
                              {u.isPlatformAdmin && (
                                <span className="rounded bg-primary/20 text-primary px-1.5 py-0.2 text-[9px] font-black border border-primary/30">
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono truncate" title={u.email}>
                              {u.email}
                            </div>
                          </div>
                        </div>

                        {/* Status Chip */}
                        <div className="shrink-0">
                          {isBlocked ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-2 py-0.5 text-[10px] font-extrabold border border-rose-300 dark:border-rose-800">
                              <span>🚫</span> Blocked
                            </span>
                          ) : u.status === 'PENDING' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold border border-amber-300 dark:border-amber-800">
                              <span>⏳</span> Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800">
                              <span>✓</span> Active
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body Information */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {/* Organization */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Workspace / Org:</span>
                          <span className="font-semibold text-foreground truncate block" title={u.organizationName || 'Personal Workspace'}>
                            {u.organizationName || 'Personal'}
                          </span>
                          <span className="text-[10px] text-muted-foreground block">{u.orgType || 'INDIVIDUAL'}</span>
                        </div>

                        {/* Role & Side */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Role &amp; Side:</span>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span
                              className={`rounded-full px-2 py-0.2 text-[9px] font-bold ${
                                u.side === 'SUPPLIER'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : u.side === 'ADMIN'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              }`}
                            >
                              {u.side}
                            </span>
                            <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-mono font-semibold">
                              {u.role || 'MEMBER'}
                            </span>
                          </div>
                        </div>

                        {/* Presence Details */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Presence:</span>
                          <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${presenceConfig.dotColor}`} />
                            <span>{presenceConfig.label} ({relativeTime})</span>
                          </span>
                        </div>

                        {/* GST & Registration Date */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">GST Compliance:</span>
                          {u.gstVerified ? (
                            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 text-[9px] font-bold">
                              ✓ Verified
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Unregistered</span>
                          )}
                        </div>
                      </div>

                      {/* Block Reason Note if Blocked */}
                      {isBlocked && u.blockedReason && (
                        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2 text-[11px] text-rose-900 dark:text-rose-200">
                          <strong>Block Reason:</strong> {u.blockedReason}
                        </div>
                      )}

                      {/* Card Action Footer: 44px+ Touch Targets */}
                      <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                        {u.phone ? (
                          <a
                            href={`tel:${u.phone}`}
                            className="text-[11px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            📞 {u.phone}
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">
                            Joined {new Date(u.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                          </span>
                        )}

                        <div className="flex items-center gap-1.5">
                          {!u.isPlatformAdmin ? (
                            <>
                              {u.status === 'PENDING' && (
                                <button
                                  type="button"
                                  onClick={() => void handleDirectApproveUser(u)}
                                  disabled={processingId === u.id}
                                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs transition shadow-2xs mobile-touch-target disabled:opacity-50 cursor-pointer"
                                  title="Approve and activate user account"
                                >
                                  <span>✓</span> {processingId === u.id ? 'Activating…' : 'Approve'}
                                </button>
                              )}
                              {isBlocked ? (
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmUnblock('USERS', [u.id])}
                                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs transition shadow-2xs mobile-touch-target"
                                  title="Unblock and reactivate account"
                                >
                                  <span>🔓</span> Unblock
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openBlockModal('USERS', [u.id], [`${u.fullName || u.email} (${u.email})`])
                                  }
                                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold px-3 py-1.5 text-xs transition mobile-touch-target"
                                  title="Block user account"
                                >
                                  <span>🚫</span> Block
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  openDeleteModal('USERS', [u.id], [`${u.fullName || u.email} (${u.email})`])
                                }
                                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold px-2.5 py-1.5 text-xs transition mobile-touch-target"
                                title="Delete user account"
                              >
                                🗑️
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground font-semibold px-2">Protected Admin</span>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              /* DESKTOP TABLE VIEW FOR USERS */
              <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20">
                <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
                  <thead className="sticky top-0 z-10 border-b bg-muted/90 backdrop-blur-xs font-bold text-muted-foreground shadow-2xs">
                    <tr>
                      <th className="p-3 w-10 min-w-[40px] text-center">
                        <input
                          type="checkbox"
                          checked={isAllUsersSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isSomeUsersSelected;
                          }}
                          onChange={toggleSelectAllUsers}
                          aria-label="Select all visible users"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </th>
                      <th className="p-3 min-w-[220px]">User &amp; Contact</th>
                      <th className="p-3 min-w-[140px]">Presence</th>
                      <th className="p-3 min-w-[130px]">Account Status</th>
                      <th className="p-3 min-w-[100px]">Side</th>
                      <th className="p-3 min-w-[180px]">Organization / Company</th>
                      <th className="p-3 min-w-[110px]">Role</th>
                      <th className="p-3 min-w-[120px]">GST Compliance</th>
                      <th className="p-3 min-w-[120px]">Registered</th>
                      <th className="p-3 min-w-[150px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-foreground">
                    {filteredUsers.map((u) => {
                      const isSelected = selectedUserIds.has(u.id);
                      const isBlocked =
                        u.status === 'BLOCKED' ||
                        (u.status as string) === 'SUSPENDED' ||
                        Boolean(u.blockedAt) ||
                        Boolean(u.blockedReason);

                      const presenceStatus = getUserOnlineStatus(u.lastSeenAt, now);
                      const presenceConfig = getPresenceBadgeConfig(presenceStatus);
                      const relativeTime = formatLastSeenRelative(u.lastSeenAt, now);
                      const absoluteTime = formatLastSeenAbsolute(u.lastSeenAt);
                      const initials = (u.fullName || u.email || '?')
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      return (
                        <tr
                          key={u.id}
                          className={`transition hover:bg-muted/20 ${
                            isSelected ? 'bg-primary/5' : isBlocked ? 'bg-rose-500/5' : ''
                          }`}
                        >
                          <td className="p-3 text-center w-10 min-w-[40px]">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={u.isPlatformAdmin}
                              onChange={() => toggleSelectUser(u.id, u.isPlatformAdmin)}
                              aria-label={`Select user ${u.email}`}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary disabled:opacity-30"
                            />
                          </td>

                          <td className="p-3 min-w-[220px]">
                            <div className="flex items-start gap-2.5">
                              <div className="relative shrink-0 mt-0.5">
                                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs border border-primary/20">
                                  {initials}
                                </div>
                                <span
                                  title={`Presence: ${presenceConfig.label} (${relativeTime})\n${absoluteTime}`}
                                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${presenceConfig.dotColor}`}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-foreground truncate max-w-[150px]" title={u.fullName || undefined}>
                                    {u.fullName || 'User'}
                                  </span>
                                  {u.isPlatformAdmin && (
                                    <span className="rounded bg-primary/20 text-primary px-1.5 py-0.2 text-[9px] font-extrabold border border-primary/30">
                                      SUPER ADMIN
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]" title={u.email}>
                                  {u.email}
                                </div>
                                {u.phone && <div className="text-[10px] text-muted-foreground font-mono">{u.phone}</div>}
                              </div>
                            </div>
                          </td>

                          <td className="p-3 min-w-[140px]">
                            <div
                              className="flex flex-col gap-0.5"
                              title={`Last seen: ${absoluteTime} (${relativeTime})`}
                            >
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border w-fit ${presenceConfig.badgeBg} ${presenceConfig.badgeText} ${presenceConfig.badgeBorder}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${presenceConfig.dotColor}`} />
                                <span>{presenceConfig.label}</span>
                              </span>
                              <span className="text-[10px] text-muted-foreground font-medium pl-1">
                                {relativeTime}
                              </span>
                            </div>
                          </td>

                          <td className="p-3 min-w-[130px]">
                            {isBlocked ? (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 px-2 py-0.5 text-[10px] font-extrabold border border-rose-300 dark:border-rose-800">
                                  <span>🚫</span> Blocked
                                </span>
                                {u.blockedReason && (
                                  <div
                                    className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-medium truncate max-w-[140px]"
                                    title={u.blockedReason}
                                  >
                                    {u.blockedReason}
                                  </div>
                                )}
                              </div>
                            ) : u.status === 'PENDING' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold border border-amber-300 dark:border-amber-800">
                                <span>⏳</span> Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800">
                                <span>✓</span> Active
                              </span>
                            )}
                          </td>

                          <td className="p-3 min-w-[100px]">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                u.side === 'SUPPLIER'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : u.side === 'ADMIN'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              }`}
                            >
                              {u.side}
                            </span>
                          </td>

                          <td className="p-3 min-w-[180px]">
                            <div className="font-semibold text-foreground truncate max-w-[160px]" title={u.organizationName || 'Personal Workspace'}>
                              {u.organizationName || 'Personal Workspace'}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{u.orgType}</div>
                          </td>

                          <td className="p-3 min-w-[110px]">
                            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono font-semibold">
                              {u.role || 'MEMBER'}
                            </span>
                          </td>

                          <td className="p-3 min-w-[120px]">
                            {u.gstVerified ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60 px-1.5 py-0.5 text-[10px] font-bold">
                                ✓ Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 rounded bg-muted text-muted-foreground px-1.5 py-0.5 text-[10px] font-medium">
                                Unregistered
                              </span>
                            )}
                          </td>

                          <td className="p-3 min-w-[120px] text-muted-foreground text-[11px] whitespace-nowrap">
                            {new Date(u.createdAt).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>

                          <td className="p-3 min-w-[150px] text-right">
                            {!u.isPlatformAdmin ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {u.status === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDirectApproveUser(u)}
                                    disabled={processingId === u.id}
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 text-xs transition shadow-2xs min-h-[36px] mobile-touch-target disabled:opacity-50 cursor-pointer"
                                    title="Approve and activate user account"
                                  >
                                    {processingId === u.id ? 'Activating…' : '✓ Approve'}
                                  </button>
                                )}
                                {isBlocked ? (
                                  <button
                                    type="button"
                                    onClick={() => void handleConfirmUnblock('USERS', [u.id])}
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 text-xs transition shadow-2xs min-h-[36px] mobile-touch-target"
                                    title="Unblock and reactivate account"
                                  >
                                    Unblock
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openBlockModal('USERS', [u.id], [`${u.fullName || u.email} (${u.email})`])
                                    }
                                    className="rounded-lg border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold px-2.5 py-1 text-xs transition min-h-[36px] mobile-touch-target"
                                    title="Block account from accessing platform"
                                  >
                                    Block
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    openDeleteModal('USERS', [u.id], [`${u.fullName || u.email} (${u.email})`])
                                  }
                                  className="rounded-lg border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold px-2.5 py-1 text-xs transition min-h-[36px] mobile-touch-target"
                                  title="Delete user account"
                                >
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground font-semibold">Protected</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBTAB 2: ORGANIZATIONS & SUPPLIERS */}
        {/* ========================================================= */}
        {subTab === 'ORGANIZATIONS' && (
          <div className="space-y-3 w-full">
            {isLoading ? (
              <div className="py-16 text-center text-muted-foreground text-xs animate-pulse">
                Loading organizations and supplier tenancies…
              </div>
            ) : filteredOrganizations.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs font-medium space-y-3 border rounded-xl bg-muted/20 p-4">
                <p>No organizations or suppliers matching the current filter ({organizations.length} total in system).</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setSideFilter('ALL');
                    setSearch('');
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs cursor-pointer"
                >
                  ↻ View All Orgs &amp; Suppliers ({organizations.length})
                </button>
              </div>
            ) : viewMode === 'CARDS' ? (
              /* RESPONSIVE MOBILE ACTION CARDS FOR ORGANIZATIONS */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredOrganizations.map((o) => {
                  const isSelected = selectedOrgIds.has(o.id);
                  const isBlocked =
                    o.status === 'BLOCKED' ||
                    (o.status as string) === 'SUSPENDED' ||
                    Boolean(o.blocked_at) ||
                    Boolean(o.blocked_reason);

                  const orgPresence = getUserOnlineStatus(o.last_seen_at, now);
                  const orgPresenceConfig = getPresenceBadgeConfig(orgPresence);
                  const orgRelativeTime = formatLastSeenRelative(o.last_seen_at, now);

                  return (
                    <article
                      key={o.id}
                      className={`rounded-2xl border bg-card p-3.5 shadow-2xs transition flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                          : isBlocked
                          ? 'border-rose-300 dark:border-rose-900 bg-rose-50/20 dark:bg-rose-950/10'
                          : 'hover:border-border'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2.5 border-b border-border/50 pb-2.5">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOrg(o.id)}
                            aria-label={`Select organization ${o.name}`}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary shrink-0 mt-0.5"
                          />

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${orgPresenceConfig.dotColor}`} />
                              <h4 className="font-extrabold text-xs text-foreground truncate" title={o.name}>
                                {o.name}
                              </h4>
                            </div>
                            <span
                              className={`inline-block mt-1 rounded px-1.5 py-0.2 text-[9px] font-extrabold ${
                                o.entity_type === 'SUPPLIER'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              }`}
                            >
                              {o.entity_type === 'SUPPLIER' ? 'Verified Supplier' : 'Buyer Organization'}
                            </span>
                          </div>
                        </div>

                        {/* Status Chip */}
                        <div className="shrink-0">
                          {isBlocked ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-2 py-0.5 text-[10px] font-extrabold border border-rose-300 dark:border-rose-800">
                              <span>🚫</span> Suspended
                            </span>
                          ) : o.status === 'PENDING' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold border border-amber-300 dark:border-amber-800">
                              <span>⏳</span> Pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800">
                              <span>✓</span> Active
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Body Details */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Sector / Type:</span>
                          <span className="font-semibold text-foreground block truncate">{o.org_type || 'General'}</span>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Activity Volume:</span>
                          <span className="text-[11px] font-medium text-foreground block">
                            <strong>{o.member_count}</strong> members · <strong>{o.active_orders_count}</strong> active orders
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">GST Registration:</span>
                          {o.gstin ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-foreground font-semibold">
                              <span className="text-emerald-600">✓</span> {o.gstin}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Unregistered</span>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground block">Online Presence:</span>
                          <span className="text-[11px] font-medium text-foreground flex items-center gap-1">
                            <span>{orgPresenceConfig.label} ({orgRelativeTime})</span>
                          </span>
                        </div>
                      </div>

                      {/* Block Reason if applicable */}
                      {isBlocked && o.blocked_reason && (
                        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-2 text-[11px] text-rose-900 dark:text-rose-200">
                          <strong>Suspension Reason:</strong> {o.blocked_reason}
                        </div>
                      )}

                      {/* Card Action Footer */}
                      <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                        <div className="min-w-0 text-[11px] text-muted-foreground font-mono truncate" title={o.contact_email || undefined}>
                          {o.contact_email || o.contact_phone || 'No direct contact'}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {(!o.gst_verified || o.status === 'PENDING') && (
                            <button
                              type="button"
                              onClick={() => void handleDirectVerifyOrg(o)}
                              disabled={processingId === o.id}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs transition shadow-2xs mobile-touch-target disabled:opacity-50 cursor-pointer"
                              title="Verify GST and activate organization workspace"
                            >
                              <span>✓</span> {processingId === o.id ? 'Activating…' : 'Verify & Activate'}
                            </button>
                          )}

                          {isBlocked ? (
                            <button
                              type="button"
                              onClick={() => void handleConfirmUnblock('ORGANIZATIONS', [o.id])}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs transition shadow-2xs mobile-touch-target"
                              title="Unblock organization"
                            >
                              <span>🔓</span> Unblock
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openBlockModal('ORGANIZATIONS', [o.id], [o.name])}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold px-3 py-1.5 text-xs transition mobile-touch-target"
                              title="Suspend organization"
                            >
                              <span>🚫</span> Suspend
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openDeleteModal('ORGANIZATIONS', [o.id], [o.name])}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold px-2.5 py-1.5 text-xs transition mobile-touch-target"
                            title="Delete organization"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              /* DESKTOP TABLE VIEW FOR ORGANIZATIONS */
              <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20">
                <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
                  <thead className="sticky top-0 z-10 border-b bg-muted/90 backdrop-blur-xs font-bold text-muted-foreground shadow-2xs">
                    <tr>
                      <th className="p-3 w-10 min-w-[40px] text-center">
                        <input
                          type="checkbox"
                          checked={isAllOrgsSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isSomeOrgsSelected;
                          }}
                          onChange={toggleSelectAllOrgs}
                          aria-label="Select all visible organizations"
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </th>
                      <th className="p-3 min-w-[220px]">Organization / Business</th>
                      <th className="p-3 min-w-[140px]">Presence</th>
                      <th className="p-3 min-w-[140px]">Type &amp; Sector</th>
                      <th className="p-3 min-w-[130px]">Status</th>
                      <th className="p-3 min-w-[100px]">Members</th>
                      <th className="p-3 min-w-[120px]">Active RFQs / POs</th>
                      <th className="p-3 min-w-[140px]">GST Registration</th>
                      <th className="p-3 min-w-[160px]">Contact</th>
                      <th className="p-3 min-w-[150px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-foreground">
                    {filteredOrganizations.map((o) => {
                      const isSelected = selectedOrgIds.has(o.id);
                      const isBlocked =
                        o.status === 'BLOCKED' ||
                        (o.status as string) === 'SUSPENDED' ||
                        Boolean(o.blocked_at) ||
                        Boolean(o.blocked_reason);

                      const orgPresence = getUserOnlineStatus(o.last_seen_at, now);
                      const orgPresenceConfig = getPresenceBadgeConfig(orgPresence);
                      const orgRelativeTime = formatLastSeenRelative(o.last_seen_at, now);
                      const orgAbsoluteTime = formatLastSeenAbsolute(o.last_seen_at);

                      return (
                        <tr
                          key={o.id}
                          className={`transition hover:bg-muted/20 ${
                            isSelected ? 'bg-primary/5' : isBlocked ? 'bg-rose-500/5' : ''
                          }`}
                        >
                          <td className="p-3 text-center w-10 min-w-[40px]">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOrg(o.id)}
                              aria-label={`Select organization ${o.name}`}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                            />
                          </td>

                          <td className="p-3 min-w-[220px]">
                            <div className="flex items-start gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ${orgPresenceConfig.dotColor}`} title={`Presence: ${orgPresenceConfig.label}`} />
                              <div>
                                <div className="font-bold text-foreground" title={o.name}>{o.name}</div>
                                <span
                                  className={`inline-block mt-0.5 rounded px-1.5 py-0.2 text-[9px] font-extrabold ${
                                    o.entity_type === 'SUPPLIER'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                  }`}
                                >
                                  {o.entity_type === 'SUPPLIER' ? 'Verified Supplier' : 'Buyer Organization'}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 min-w-[140px]">
                            <div
                              className="flex flex-col gap-0.5"
                              title={`Last seen: ${orgAbsoluteTime} (${orgRelativeTime})`}
                            >
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border w-fit ${orgPresenceConfig.badgeBg} ${orgPresenceConfig.badgeText} ${orgPresenceConfig.badgeBorder}`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${orgPresenceConfig.dotColor}`} />
                                <span>{orgPresenceConfig.label}</span>
                              </span>
                              <span className="text-[10px] text-muted-foreground font-medium pl-1">
                                {orgRelativeTime}
                              </span>
                            </div>
                          </td>

                          <td className="p-3 min-w-[140px]">
                            <div className="font-semibold text-foreground">{o.org_type}</div>
                          </td>

                          <td className="p-3 min-w-[130px]">
                            {isBlocked ? (
                              <div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 px-2 py-0.5 text-[10px] font-extrabold border border-rose-300 dark:border-rose-800">
                                  <span>🚫</span> Suspended
                                </span>
                                {o.blocked_reason && (
                                  <div
                                    className="mt-0.5 text-[10px] text-rose-600 dark:text-rose-400 font-medium truncate max-w-[140px]"
                                    title={o.blocked_reason}
                                  >
                                    {o.blocked_reason}
                                  </div>
                                )}
                              </div>
                            ) : o.status === 'PENDING' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold border border-amber-300 dark:border-amber-800">
                                <span>⏳</span> Pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800">
                                <span>✓</span> Active
                              </span>
                            )}
                          </td>

                          <td className="p-3 min-w-[100px]">
                            <span className="font-semibold text-foreground">{o.member_count}</span>{' '}
                            <span className="text-[10px] text-muted-foreground">users</span>
                          </td>

                          <td className="p-3 min-w-[120px]">
                            <span className="font-semibold text-foreground">{o.active_orders_count}</span>{' '}
                            <span className="text-[10px] text-muted-foreground">in flight</span>
                          </td>

                          <td className="p-3 min-w-[140px]">
                            {o.gstin ? (
                              <div>
                                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 text-[9px] font-bold">
                                  ✓ GSTIN
                                </span>
                                <div className="font-mono text-[10px] text-muted-foreground mt-0.5" title={o.gstin}>{o.gstin}</div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">Non-registered</span>
                            )}
                          </td>

                          <td className="p-3 min-w-[160px]">
                            {o.contact_email && (
                              <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[130px]" title={o.contact_email}>
                                {o.contact_email}
                              </div>
                            )}
                            {o.contact_phone && (
                              <div className="font-mono text-[10px] text-muted-foreground">{o.contact_phone}</div>
                            )}
                          </td>

                          <td className="p-3 min-w-[150px] text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {(!o.gst_verified || o.status === 'PENDING') && (
                                <button
                                  type="button"
                                  onClick={() => void handleDirectVerifyOrg(o)}
                                  disabled={processingId === o.id}
                                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 text-xs transition shadow-2xs min-h-[36px] mobile-touch-target disabled:opacity-50 cursor-pointer"
                                  title="Verify GST and activate organization"
                                >
                                  {processingId === o.id ? 'Activating…' : '✓ Verify'}
                                </button>
                              )}
                              {isBlocked ? (
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmUnblock('ORGANIZATIONS', [o.id])}
                                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 text-xs transition shadow-2xs min-h-[36px] mobile-touch-target"
                                  title="Unblock organization"
                                >
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openBlockModal('ORGANIZATIONS', [o.id], [o.name])}
                                  className="rounded-lg border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold px-2.5 py-1 text-xs transition min-h-[36px] mobile-touch-target"
                                  title="Suspend organization"
                                >
                                  Suspend
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => openDeleteModal('ORGANIZATIONS', [o.id], [o.name])}
                                className="rounded-lg border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold px-2.5 py-1 text-xs transition min-h-[36px] mobile-touch-target"
                                title="Delete organization"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBTAB 3: REGISTRATIONS / APPROVAL QUEUE */}
        {/* ========================================================= */}
        {subTab === 'REGISTRATIONS' && (
          <div className="space-y-3 w-full">
            {/* Quick Header Banner for Registrations */}
            <div className="rounded-xl border bg-muted/40 p-3 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <div>
                  <h3 className="text-xs font-bold text-foreground">
                    Applicant Onboarding &amp; Verification Queue
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {pendingRegistrationsCount > 0
                      ? `${pendingRegistrationsCount} pending applicant(s) awaiting review.`
                      : 'All applicant onboarding requests are up to date.'}
                  </p>
                </div>
              </div>

              {pendingRegistrationsCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleApproveAllPending()}
                  disabled={isBulkExecuting}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3.5 py-1.5 text-xs transition shadow-2xs disabled:opacity-50 mobile-touch-target cursor-pointer"
                  title="Approve and activate all pending registrations at once"
                >
                  <span>⚡</span> {isBulkExecuting ? 'Approving All…' : `Approve All Pending (${pendingRegistrationsCount})`}
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="py-16 text-center text-muted-foreground text-xs animate-pulse">
                Loading registration requests queue…
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-xs font-medium space-y-3">
                <p>No registration requests matching the current filter ({requests.length} total in system).</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setSideFilter('ALL');
                    setSearch('');
                    void loadData();
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border bg-card px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted active:scale-98 transition shadow-2xs"
                >
                  ↻ Reset Filters &amp; Reload Queue
                </button>
              </div>
            ) : viewMode === 'CARDS' ? (
              /* RESPONSIVE MOBILE ACTION CARDS FOR REGISTRATIONS */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredRequests.map((r) => {
                  const statusUpper = (r.status || '').toUpperCase();
                  const isPending = statusUpper === 'PENDING' || statusUpper === 'NEW' || statusUpper === 'SUBMITTED' || !r.status;
                  const isOnboarded = statusUpper === 'ONBOARDED' || statusUpper === 'ACTIVE' || statusUpper === 'APPROVED';
                  const isBusy = processingId === r.id;

                  return (
                    <article
                      key={r.id}
                      className={`rounded-2xl border bg-card p-3.5 shadow-2xs transition flex flex-col justify-between gap-3 ${
                        isPending
                          ? 'border-amber-400/80 bg-amber-50/10 dark:bg-amber-950/10'
                          : 'hover:border-border'
                      }`}
                    >
                      {/* Card Header: Reference & Status */}
                      <div className="flex items-start justify-between gap-2 border-b border-border/50 pb-2.5">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-xs text-foreground bg-muted px-2 py-0.5 rounded-lg border">
                              {r.reference}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.2 text-[9px] font-extrabold ${
                                r.side === 'SUPPLIER'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              }`}
                            >
                              {r.side}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground block mt-1">
                            Submitted {new Date(r.created_at).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>

                        {/* Status Chip */}
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border shrink-0 ${
                            r.status === 'ONBOARDED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : r.status === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800 animate-pulse'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>

                      {/* Card Body Information */}
                      <div className="space-y-2 text-xs">
                        {/* Business & Organization */}
                        <div className="rounded-xl bg-muted/30 p-2.5 space-y-1">
                          <div className="font-extrabold text-xs text-foreground" title={r.business_name}>
                            {r.business_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {r.buyer_type ||
                              (r.category_codes?.length
                                ? `Categories: ${r.category_codes.join(', ')}`
                                : 'General')}
                          </div>
                          {r.tax_registration_id ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 text-[9px] font-bold border border-emerald-300 dark:border-emerald-800/60">
                              ✓ GST: <span className="font-mono">{r.tax_registration_id}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">GST: Unregistered</span>
                          )}
                        </div>

                        {/* Applicant & Role */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Applicant &amp; Role:</span>
                            <span className="font-bold text-foreground block truncate" title={r.contact_full_name}>
                              {r.contact_full_name}
                            </span>
                            <span className="text-[10px] text-muted-foreground block truncate">
                              {r.role_label || r.role_code || r.designation || 'Prime Member'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Verification Channel:</span>
                            <span className="font-semibold text-foreground text-[11px] block">
                              Via: <span className="text-primary font-bold">{r.verification_channel || 'DIRECT'}</span>
                            </span>
                          </div>
                        </div>

                        {/* Contact Details */}
                        <div className="font-mono text-[11px] text-muted-foreground space-y-0.5">
                          <div className="truncate text-foreground" title={r.email}>✉ {r.email}</div>
                          {r.phone && <div>📞 {r.phone}</div>}
                        </div>
                      </div>

                      {/* Card Action Footer: Prominent 44px+ Tap Buttons */}
                      <div className="pt-2.5 border-t border-border/40">
                        {isPending ? (
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => void handleReview(r, 'APPROVE')}
                              disabled={isBusy}
                              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 text-xs transition shadow-2xs disabled:opacity-50 mobile-touch-target active:scale-98 cursor-pointer"
                              title="Approve applicant, provision tenant & auth user"
                            >
                              <span>✓</span> {isBusy ? 'Onboarding…' : 'Approve & Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleReview(r, 'REJECT')}
                              disabled={isBusy}
                              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-bold px-3 py-2 text-xs transition disabled:opacity-50 mobile-touch-target active:scale-98 cursor-pointer"
                              title="Reject registration"
                            >
                              <span>✕</span> Reject
                            </button>
                          </div>
                        ) : isOnboarded ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              <span>✓</span> Activated
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleReview(r, 'APPROVE')}
                              disabled={isBusy}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 px-3 py-1 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer"
                              title="Re-run provisioning & re-dispatch credentials"
                            >
                              <span>↻</span> {isBusy ? 'Re-issuing…' : 'Re-Approve'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                              <span>✕</span> Closed
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleReview(r, 'APPROVE')}
                              disabled={isBusy}
                              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-xs font-bold transition cursor-pointer"
                              title="Overrule rejection and approve applicant"
                            >
                              <span>✓</span> {isBusy ? 'Onboarding…' : 'Overrule & Approve'}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              /* DESKTOP TABLE VIEW FOR REGISTRATIONS */
              <div className="overflow-x-auto w-full max-w-full scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-muted/20">
                <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
                  <thead className="sticky top-0 z-10 border-b bg-muted/90 backdrop-blur-xs font-bold text-muted-foreground shadow-2xs">
                    <tr>
                      <th className="p-3 min-w-[140px]">Reference &amp; Side</th>
                      <th className="p-3 min-w-[220px]">Business &amp; Organization</th>
                      <th className="p-3 min-w-[160px]">Applicant &amp; Role</th>
                      <th className="p-3 min-w-[180px]">Contact Details</th>
                      <th className="p-3 min-w-[110px]">Status</th>
                      <th className="p-3 min-w-[120px]">Submitted</th>
                      <th className="p-3 min-w-[180px] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-foreground">
                    {filteredRequests.map((r) => {
                      const statusUpper = (r.status || '').toUpperCase();
                      const isPending = statusUpper === 'PENDING' || statusUpper === 'NEW' || statusUpper === 'SUBMITTED' || !r.status;
                      const isOnboarded = statusUpper === 'ONBOARDED' || statusUpper === 'ACTIVE' || statusUpper === 'APPROVED';
                      const isBusy = processingId === r.id;

                      return (
                        <tr key={r.id} className="hover:bg-muted/20 transition">
                          <td className="p-3 min-w-[140px]">
                            <div className="font-mono font-bold text-foreground">{r.reference}</div>
                            <span
                              className={`inline-block mt-0.5 rounded-full px-2 py-0.2 text-[9px] font-bold ${
                                r.side === 'SUPPLIER'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              }`}
                            >
                              {r.side}
                            </span>
                          </td>

                          <td className="p-3 min-w-[220px]">
                            <div className="font-bold text-foreground" title={r.business_name}>{r.business_name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {r.buyer_type ||
                                (r.category_codes?.length
                                  ? `Categories: ${r.category_codes.join(', ')}`
                                  : 'General')}
                            </div>
                            {r.tax_registration_id ? (
                              <div className="mt-0.5">
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 text-[9px] font-bold border border-emerald-300 dark:border-emerald-800/60">
                                  ✓ GST: <span className="font-mono">{r.tax_registration_id}</span>
                                </span>
                              </div>
                            ) : (
                              <div className="text-[9px] text-muted-foreground">GST: Unregistered</div>
                            )}
                          </td>

                          <td className="p-3 min-w-[160px]">
                            <div className="font-semibold text-foreground" title={r.contact_full_name}>{r.contact_full_name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {r.role_label || r.role_code || r.designation || 'Prime Member'}
                            </div>
                          </td>

                          <td className="p-3 min-w-[180px]">
                            <div className="font-mono text-[10px] text-foreground" title={r.email}>{r.email}</div>
                            <div className="text-[10px] text-muted-foreground">{r.phone}</div>
                            <div className="text-[9px] text-muted-foreground">
                              Via: <span className="font-semibold">{r.verification_channel}</span>
                            </div>
                          </td>

                          <td className="p-3 min-w-[110px]">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                r.status === 'ONBOARDED'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : r.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>

                          <td className="p-3 min-w-[120px] text-muted-foreground text-[10px] whitespace-nowrap">
                            {new Date(r.created_at).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>

                          <td className="p-3 min-w-[200px] text-right">
                            {isPending ? (
                              <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleReview(r, 'APPROVE')}
                                  disabled={isBusy}
                                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-1 shadow-2xs min-h-[44px] mobile-touch-target cursor-pointer"
                                  title="Approve applicant, provision tenant & auth user"
                                >
                                  <span>✓</span> {isBusy ? 'Onboarding…' : 'Approve & Activate'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleReview(r, 'REJECT')}
                                  disabled={isBusy}
                                  className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 transition disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center mobile-touch-target cursor-pointer"
                                  title="Reject registration"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : isOnboarded ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-[10px] text-emerald-600 font-bold">✓ Active</span>
                                <button
                                  type="button"
                                  onClick={() => void handleReview(r, 'APPROVE')}
                                  disabled={isBusy}
                                  className="rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 text-[11px] font-bold hover:bg-emerald-100 transition cursor-pointer"
                                  title="Re-run provisioning & re-dispatch credentials"
                                >
                                  {isBusy ? 'Re-issuing…' : 'Re-Approve'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-[10px] text-rose-600 font-bold">Closed</span>
                                <button
                                  type="button"
                                  onClick={() => void handleReview(r, 'APPROVE')}
                                  disabled={isBusy}
                                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold transition cursor-pointer"
                                  title="Overrule rejection and approve applicant"
                                >
                                  {isBusy ? 'Onboarding…' : 'Approve'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: BLOCK ACCOUNT CONFIRMATION MODAL */}
      {blockModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <span className="text-xl">🚫</span>
                <h3 id="block-modal-title" className="text-base font-bold text-foreground">
                  Block {blockModalTarget.type === 'USERS' ? 'User Account(s)' : 'Organization(s)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBlockModalTarget(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                You are placing{' '}
                <strong className="text-foreground">{blockModalTarget.ids.length}</strong>{' '}
                {blockModalTarget.type === 'USERS' ? 'account(s)' : 'organization(s)'} on administrative hold:
              </p>

              {/* Target items list */}
              <div className="max-h-24 overflow-y-auto rounded-lg bg-muted/40 border p-2 space-y-1 font-mono text-[11px]">
                {blockModalTarget.labels.map((lbl, idx) => (
                  <div key={idx} className="truncate text-foreground">
                    • {lbl}
                  </div>
                ))}
              </div>

              {/* Mandatory Reason Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-foreground">
                  Mandatory Administrative Reason <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedBlockReason}
                  onChange={(e) => setSelectedBlockReason(e.target.value as AccountBlockReason)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-medium min-h-[44px]"
                >
                  {BLOCK_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom reason text input */}
              {selectedBlockReason === 'Other' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-foreground">
                    Specify Reason Details <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={customBlockReason}
                    onChange={(e) => setCustomBlockReason(e.target.value)}
                    placeholder="Provide detailed justification for administrative audit..."
                    className="w-full rounded-md border bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              )}

              {/* Operational Impact Notice */}
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-amber-950 dark:text-amber-200">
                <strong>Platform Governance Impact:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground dark:text-amber-200/80">
                  <li>Immediately blocks sign-in &amp; session tokens for targeted users.</li>
                  <li>Suspends capability to post RFQs, submit quotes, or vote on tenders.</li>
                  <li>Preserves complete cryptographic audit chain and statutory transaction history.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-3">
              <button
                type="button"
                onClick={() => setBlockModalTarget(null)}
                disabled={isBulkExecuting}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmBlock()}
                disabled={
                  isBulkExecuting ||
                  (selectedBlockReason === 'Other' && !customBlockReason.trim())
                }
                className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-1.5 text-xs transition shadow-2xs disabled:opacity-50 flex items-center gap-1.5 min-h-[44px]"
              >
                {isBulkExecuting ? 'Executing Block…' : 'Confirm & Block Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TWO-STEP DESTRUCTIVE DELETE CONFIRMATION */}
      {deleteModalTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-2xl border border-rose-500/40 bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-rose-500/20 pb-3">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <span className="text-xl">⚠️</span>
                <h3 id="delete-modal-title" className="text-base font-bold text-foreground">
                  {deleteStep === 1 ? 'Step 1: Data Retention Warning' : 'Step 2: Final Confirmation'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalTarget(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* STEP 1: Warning & Retention Explanation */}
            {deleteStep === 1 && (
              <div className="space-y-3 text-xs">
                <p className="text-foreground font-semibold">
                  You have requested deletion of{' '}
                  <span className="text-rose-600 dark:text-rose-400 font-extrabold">
                    {deleteModalTarget.ids.length}
                  </span>{' '}
                  {deleteModalTarget.type === 'USERS' ? 'user account(s)' : 'organization entity(ies)'}:
                </p>

                <div className="max-h-24 overflow-y-auto rounded-lg bg-muted/40 border p-2 space-y-1 font-mono text-[11px]">
                  {deleteModalTarget.labels.map((lbl, idx) => (
                    <div key={idx} className="truncate text-foreground">
                      • {lbl}
                    </div>
                  ))}
                </div>

                {/* Soft-delete vs Hard-delete options */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      id="soft-delete-chk"
                      checked={isSoftDelete}
                      onChange={(e) => setIsSoftDelete(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                    />
                    <label htmlFor="soft-delete-chk" className="cursor-pointer">
                      <span className="font-bold text-foreground block">
                        Soft-Delete &amp; Retain Regulatory Audit Records (Recommended)
                      </span>
                      <span className="text-[11px] text-muted-foreground block mt-0.5">
                        Deactivates credentials immediately while preserving GST/tax audit logs, purchase order history, and statutory contract archives.
                      </span>
                    </label>
                  </div>
                </div>

                <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-[11px] text-rose-950 dark:text-rose-200">
                  <strong>Warning:</strong> Deletion will revoke all user access tokens and active workspaces.
                </div>
              </div>
            )}

            {/* STEP 2: Explicit Confirmation Input */}
            {deleteStep === 2 && (
              <div className="space-y-3 text-xs">
                <div className="rounded-lg bg-rose-500/15 border border-rose-500/40 p-3 text-rose-950 dark:text-rose-200 space-y-1">
                  <div className="font-bold text-sm">Final Confirmation Required</div>
                  <p className="text-xs">
                    To execute deletion of <strong>{deleteModalTarget.ids.length}</strong> {deleteModalTarget.type.toLowerCase()}, type{' '}
                    <span className="font-mono font-extrabold text-rose-600 dark:text-rose-400">DELETE</span> in the box below.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="w-full rounded-md border border-rose-400 bg-background px-3 py-2 text-xs font-mono font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[44px]"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-rose-500/20 pt-3">
              {deleteStep === 2 ? (
                <button
                  type="button"
                  onClick={() => setDeleteStep(1)}
                  disabled={isBulkExecuting}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px]"
                >
                  ← Back to Step 1
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteModalTarget(null)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition min-h-[44px]"
                >
                  Cancel
                </button>
              )}

              {deleteStep === 1 ? (
                <button
                  type="button"
                  onClick={() => setDeleteStep(2)}
                  className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-1.5 text-xs transition shadow-2xs flex items-center gap-1.5 min-h-[44px]"
                >
                  Proceed to Step 2 →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConfirmDelete()}
                  disabled={isBulkExecuting || deleteConfirmationText !== 'DELETE'}
                  className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold px-4 py-1.5 text-xs transition shadow-2xs disabled:opacity-40 flex items-center gap-1.5 min-h-[44px]"
                >
                  {isBulkExecuting ? 'Deleting…' : 'Permanently Execute Deletion'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
