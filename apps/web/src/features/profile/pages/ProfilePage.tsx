import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import { useAuth } from '@/features/auth';
import {
  fetchMyProfile,
  updateMyProfile,
  updateOrganizationName,
  requestProfileCredentialOtp,
  verifyAndUpdateProfileCredential,
} from '../api/profile';
import { fetchUserOrganization } from '@/features/requirement/api/requirements';
import { PERSONA_AVATARS, compressAndCropAvatar } from '../lib/avatars';
import { useTheme, ThemeBottomSheet } from '@/features/theme';
import { ChangePasswordModal } from '@/features/roles/components/ChangePasswordModal';
import { listOrgMembers, inviteOrgMember, removeOrgMember, type OrgMember } from '@/features/org/api/org-members';
import {
  SubscriptionPaymentModal,
  SubscriptionExpiryBanner,
  OtpWalletCreditsWidget,
  fetchOrganizationSubscription,
  type OrganizationSubscription,
} from '@/features/subscription';
import { AddressBookManager } from '../components/AddressBookManager';
import { CommitteeTeamBuilder } from '@/features/org/components/CommitteeTeamBuilder';
import { tryResolveBuyerPersona } from '@otp/domain';

const ROLE_OPTIONS = [
  { value: 'COMMITTEE_MEMBER', label: 'Committee Member — evaluates & votes on RFQs' },
  { value: 'BUYER', label: 'Buyer / Procurement Lead — raises requirements' },
  { value: 'MANAGER', label: 'Manager — full read + propose access' },
  { value: 'VIEWER', label: 'Viewer — read-only observer' },
];

const ROLE_BADGE: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60',
  MANAGER: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60',
  BUYER: 'bg-primary/10 text-primary border border-primary/20',
  COMMITTEE_MEMBER: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
  VIEWER: 'bg-muted text-muted-foreground border border-border',
};

export function ProfilePage() {
  const { context, refresh, switchOrg, switchTo } = useRoleContext();
  const { user } = useAuth();
  const { theme, resolvedTheme, colorTheme } = useTheme();

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'profile' | 'addresses' | 'team' | 'preferences'>(
    tabParam === 'addresses'
      ? 'addresses'
      : tabParam === 'team'
      ? 'team'
      : tabParam === 'preferences'
      ? 'preferences'
      : 'profile'
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Profile Form States
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Credential verification state
  const [newPhone, setNewPhone] = useState('');
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [phoneOtpStep, setPhoneOtpStep] = useState<'IDLE' | 'SENT' | 'VERIFIED'>('IDLE');
  const [phoneOtpBusy, setPhoneOtpBusy] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState<string | null>(null);
  const [phoneOtpSuccess, setPhoneOtpSuccess] = useState<string | null>(null);
  const [phoneResendTimer, setPhoneResendTimer] = useState(() => {
    try {
      const stored = sessionStorage.getItem('otp_phone_resend_timer');
      if (stored) {
        const remaining = Math.max(0, Math.ceil((parseInt(stored, 10) - Date.now()) / 1000));
        return remaining;
      }
    } catch {}
    return 0;
  });

  const [newEmail, setNewEmail] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState<'IDLE' | 'SENT' | 'VERIFIED'>('IDLE');
  const [emailOtpBusy, setEmailOtpBusy] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [emailOtpSuccess, setEmailOtpSuccess] = useState<string | null>(null);
  const [emailResendTimer, setEmailResendTimer] = useState(() => {
    try {
      const stored = sessionStorage.getItem('otp_email_resend_timer');
      if (stored) {
        const remaining = Math.max(0, Math.ceil((parseInt(stored, 10) - Date.now()) / 1000));
        return remaining;
      }
    } catch {}
    return 0;
  });

  // Team & Org Management state
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('COMMITTEE_MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [switchingOrg, setSwitchingOrg] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<OrganizationSubscription | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Password modal & Canonical Theme Sheet Drawer
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);

  // Notification Channel Preferences (persisted in localStorage)
  const [channelWhatsapp, setChannelWhatsapp] = useState(() => {
    try {
      const saved = localStorage.getItem('otp-pref-whatsapp');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [channelEmail, setChannelEmail] = useState(() => {
    try {
      const saved = localStorage.getItem('otp-pref-email');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [channelInApp, setChannelInApp] = useState(() => {
    try {
      const saved = localStorage.getItem('otp-pref-inapp');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const handleToggleChannel = (channel: 'whatsapp' | 'email' | 'inapp', value: boolean) => {
    try {
      if (channel === 'whatsapp') {
        setChannelWhatsapp(value);
        localStorage.setItem('otp-pref-whatsapp', String(value));
      } else if (channel === 'email') {
        setChannelEmail(value);
        localStorage.setItem('otp-pref-email', String(value));
      } else {
        setChannelInApp(value);
        localStorage.setItem('otp-pref-inapp', String(value));
      }
      setSuccessMsg(`Notification preference for ${channel} updated.`);
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (tabParam === 'team') setActiveTab('team');
    else if (tabParam === 'preferences') {
      setActiveTab('preferences');
      if (searchParams.get('theme') === 'true' || searchParams.get('action') === 'theme') {
        setShowThemeSheet(true);
      }
    } else if (tabParam === 'profile') setActiveTab('profile');
  }, [tabParam, searchParams]);

  const handleTabSwitch = (tab: 'profile' | 'addresses' | 'team' | 'preferences') => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  const activeOrgSummary = context.organizations.find((o) => o.id === context.organizationId);
  const currentOrgType = activeOrgSummary?.orgType || null;
  const isIndividual = !context.organizationId || (tryResolveBuyerPersona(context.buyerType || currentOrgType) ?? 'INDIVIDUAL') === 'INDIVIDUAL';

  useEffect(() => {
    if (isIndividual && activeTab === 'team') {
      setActiveTab('profile');
    }
  }, [isIndividual, activeTab]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (phoneResendTimer > 0) {
      timer = setTimeout(() => setPhoneResendTimer((t) => t - 1), 1000);
    } else {
      try {
        sessionStorage.removeItem('otp_phone_resend_timer');
      } catch {}
    }
    return () => clearTimeout(timer);
  }, [phoneResendTimer]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (emailResendTimer > 0) {
      timer = setTimeout(() => setEmailResendTimer((t) => t - 1), 1000);
    } else {
      try {
        sessionStorage.removeItem('otp_email_resend_timer');
      } catch {}
    }
    return () => clearTimeout(timer);
  }, [emailResendTimer]);

  // Load Profile and Org data
  useEffect(() => {
    setFullName(context.fullName || '');
    setOrgName(context.organizationName || '');
    setOrgId(context.organizationId || null);
    setTitle(context.title || '');
    setAvatarUrl(context.avatarUrl || '');
    setEmail(context.email || '');
    setPhone(context.phone || '');

    Promise.all([
      fetchMyProfile(),
      fetchUserOrganization().catch(() => null),
      context.organizationId ? fetchOrganizationSubscription(context.organizationId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([res, orgRes, subRes]) => {
        if (res.ok) {
          setFullName(res.profile.fullName || context.fullName || '');
          setTitle(res.profile.title || context.title || '');
          setAvatarUrl(res.profile.avatarUrl || context.avatarUrl || '');
          setEmail(res.profile.email || context.email || '');
          setPhone(res.profile.phone || context.phone || 'Not registered');
        }
        if (orgRes && orgRes.ok) {
          setOrgName(orgRes.org.organizationName);
          setOrgId(orgRes.org.organizationId);
        }
        if (subRes && subRes.ok) {
          setSubscription(subRes.subscription);
        }
      })
      .catch((err) => console.error('Error fetching profile:', err))
      .finally(() => setLoading(false));
  }, [context]);

  // Load Org Members when on team tab
  useEffect(() => {
    if (activeTab === 'team' && context.organizationId) {
      setMembersLoading(true);
      setMembersError(null);
      void listOrgMembers(context.organizationId).then((res) => {
        if (res.ok) setMembers(res.members);
        else setMembersError(res.error);
        setMembersLoading(false);
      });
    }
  }, [activeTab, context.organizationId]);

  const hasEmail = Boolean(email && email.trim().length > 0 && email !== 'Not registered');
  const hasPhone = Boolean(phone && phone.trim().length > 0 && phone !== 'Not registered');

  const canManageTeam =
    !context.isPlatformAdmin && (context.orgRole === 'OWNER' || context.orgRole === 'MANAGER');

  async function handleSendPhoneOtp() {
    setPhoneOtpError(null);
    setPhoneOtpSuccess(null);
    const digits = newPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setPhoneOtpError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setPhoneOtpBusy(true);
    const res = await requestProfileCredentialOtp('PHONE', newPhone);
    setPhoneOtpBusy(false);

    if (!res.ok) {
      setPhoneOtpError(res.error);
      return;
    }

    setPhoneOtpStep('SENT');
    setPhoneResendTimer(60);
    try {
      sessionStorage.setItem('otp_phone_resend_timer', String(Date.now() + 60000));
    } catch {}
    setPhoneOtpSuccess(
      res.otpCode
        ? `Verification code sent via WhatsApp! (Code: ${res.otpCode})`
        : 'Verification code sent to your phone number via WhatsApp.'
    );
  }

  async function handleVerifyPhoneOtp() {
    setPhoneOtpError(null);
    setPhoneOtpSuccess(null);
    if (!phoneOtpCode.trim() || phoneOtpCode.trim().length < 4) {
      setPhoneOtpError('Please enter the 6-digit verification code.');
      return;
    }

    setPhoneOtpBusy(true);
    const res = await verifyAndUpdateProfileCredential('PHONE', newPhone, phoneOtpCode);
    setPhoneOtpBusy(false);

    if (!res.ok) {
      setPhoneOtpError(res.error);
      return;
    }

    const verifiedValue = res.formattedValue || newPhone.trim();
    setPhone(verifiedValue);
    setPhoneOtpStep('VERIFIED');
    setPhoneOtpSuccess('✓ Phone number verified and linked to your profile!');
    await refresh();
  }

  async function handleSendEmailOtp() {
    setEmailOtpError(null);
    setEmailOtpSuccess(null);
    const clean = newEmail.trim().toLowerCase();
    if (!clean || !clean.includes('@') || !clean.includes('.')) {
      setEmailOtpError('Please enter a valid email address.');
      return;
    }

    setEmailOtpBusy(true);
    const res = await requestProfileCredentialOtp('EMAIL', clean);
    setEmailOtpBusy(false);

    if (!res.ok) {
      setEmailOtpError(res.error);
      return;
    }

    setEmailOtpStep('SENT');
    setEmailResendTimer(60);
    try {
      sessionStorage.setItem('otp_email_resend_timer', String(Date.now() + 60000));
    } catch {}
    setEmailOtpSuccess(
      res.otpCode
        ? `Verification code sent to ${clean}! (Code: ${res.otpCode})`
        : `Verification code sent to ${clean}.`
    );
  }

  async function handleVerifyEmailOtp() {
    setEmailOtpError(null);
    setEmailOtpSuccess(null);
    if (!emailOtpCode.trim() || emailOtpCode.trim().length < 4) {
      setEmailOtpError('Please enter the 6-digit verification code.');
      return;
    }

    setEmailOtpBusy(true);
    const res = await verifyAndUpdateProfileCredential('EMAIL', newEmail, emailOtpCode);
    setEmailOtpBusy(false);

    if (!res.ok) {
      setEmailOtpError(res.error);
      return;
    }

    const verifiedValue = res.formattedValue || newEmail.trim().toLowerCase();
    setEmail(verifiedValue);
    setEmailOtpStep('VERIFIED');
    setEmailOtpSuccess('✓ Email address verified and linked to your profile!');
    await refresh();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const cropped = await compressAndCropAvatar(file, 256);
      setAvatarUrl(cropped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter a valid full name (at least 2 characters).');
      return;
    }

    setSaving(true);
    try {
      const res = await updateMyProfile({
        fullName: fullName.trim(),
        title: title.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error);
        setSaving(false);
        return;
      }

      if (orgName.trim() && orgName.trim() !== (context.organizationName || '')) {
        const orgRes = await updateOrganizationName(orgName.trim(), orgId || context.organizationId);
        if (!orgRes.ok) {
          setError(`Profile updated, but organization name update failed: ${orgRes.error}`);
          setSaving(false);
          return;
        }
      }

      setSuccessMsg('Profile and workspace identity saved successfully!');
      await refresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error saving profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!context.organizationId || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteResult(null);
    const res = await inviteOrgMember(context.organizationId, inviteEmail, inviteRole);
    setInviteLoading(false);
    if (res.ok) {
      setInviteResult({ ok: true, message: res.message });
      setInviteEmail('');
      // Reload members list
      const fresh = await listOrgMembers(context.organizationId);
      if (fresh.ok) setMembers(fresh.members);
    } else {
      setInviteResult({ ok: false, message: res.error });
    }
  }

  async function handleRemoveMember(profileId: string) {
    if (!context.organizationId) return;
    if (!window.confirm('Remove this member from the organization?')) return;
    setRemoving(profileId);
    const res = await removeOrgMember(context.organizationId, profileId);
    setRemoving(null);
    if (!res.ok) {
      alert(`Remove failed: ${res.error}`);
    } else {
      setMembers((prev) => prev.filter((m) => m.profileId !== profileId));
    }
  }

  async function handleSwitchOrg(targetOrgId: string) {
    if (targetOrgId === context.organizationId) return;
    setSwitchingOrg(targetOrgId);
    const res = await switchOrg(targetOrgId);
    setSwitchingOrg(null);
    if (res.ok) {
      await refresh();
    }
  }

  const roleSuggestions = context.isPlatformAdmin
    ? ['Platform Super Administrator', 'Lead Operations Engineer', 'DevOps & Security Lead']
    : context.side === 'SUPPLIER'
    ? ['Authorized Supplier Representative', 'Managing Director', 'Sales Director', 'Lead Contractor']
    : ['Procurement Committee Member', 'Facility Secretary', 'RWA President', 'Estate Manager', 'Treasurer'];

  const initials = (fullName || email || user?.email || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-4 py-3 space-y-3 overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      {/* 1. Header & Segmented Navigation */}
      <header className="rounded-2xl border border-border bg-card p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/dashboard"
              className="flex items-center justify-center h-8 w-8 rounded-xl border border-border/70 bg-muted/40 hover:bg-muted text-foreground transition text-xs shrink-0"
              title="Return to Dashboard"
            >
              ←
            </Link>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-foreground flex items-center gap-1.5 truncate">
                <span>👤</span>
                <span>User Profile &amp; Organization Settings</span>
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                {context.organizationName || 'Personal Workspace'} · {context.activeRole?.label || 'Account Member'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                context.isPlatformAdmin
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                  : context.side === 'SUPPLIER'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {context.isPlatformAdmin ? 'Super Admin' : context.side === 'SUPPLIER' ? 'Supplier Rep' : 'Buyer Lead'}
            </span>
          </div>
        </div>

        {/* Segmented Control / Tab Pills (PhonePe / Swiggy style) */}
        <div
          role="tablist"
          aria-label="Profile Settings Section"
          className="flex items-center gap-1.5 rounded-xl bg-muted/60 p-1 border border-border/80 overflow-x-auto scrollbar-thin scroll-smooth no-print min-w-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => handleTabSwitch('profile')}
            className={`flex-1 shrink-0 whitespace-nowrap min-w-0 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all mobile-touch-target ${
              activeTab === 'profile'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>👤</span>
            <span>Profile</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'addresses'}
            onClick={() => handleTabSwitch('addresses')}
            className={`flex-1 shrink-0 whitespace-nowrap min-w-0 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all mobile-touch-target ${
              activeTab === 'addresses'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>📍</span>
            <span>Address Book</span>
          </button>

          {!isIndividual && (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'team'}
              onClick={() => handleTabSwitch('team')}
              className={`flex-1 shrink-0 whitespace-nowrap min-w-0 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all mobile-touch-target ${
                activeTab === 'team'
                  ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>{(tryResolveBuyerPersona(currentOrgType) ?? 'MSME') === 'RWA' ? '🏛️' : '🏢'}</span>
              <span>{(tryResolveBuyerPersona(currentOrgType) ?? 'MSME') === 'RWA' ? 'Committee' : 'Team'} ({members.length || 1})</span>
            </button>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'preferences'}
            onClick={() => handleTabSwitch('preferences')}
            className={`flex-1 shrink-0 whitespace-nowrap min-w-0 min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all mobile-touch-target ${
              activeTab === 'preferences'
                ? 'bg-card text-foreground shadow-xs ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>⚙️</span>
            <span>Preferences</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300 flex items-center gap-2">
          <span>✓</span> {successMsg}
        </div>
      )}

      {/* 2. TAB 1: USER PROFILE & IDENTITY */}
      {activeTab === 'profile' && (
        <div className="space-y-3">
          {/* Subscription Expiry & Starter Credit Banner */}
          {subscription ? (
            <SubscriptionExpiryBanner
              subscription={subscription}
              onRenewClick={() => setIsPaymentModalOpen(true)}
            />
          ) : isIndividual ? (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👤</span>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">Individual Buyer Tier</h3>
                    <p className="text-[11px] text-muted-foreground">Direct 1-click procurement • Zero committee overhead</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black">
                  ACTIVE
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span className="font-semibold text-foreground">Sourcing Entitlement:</span>
                <span>3 RFQs / month</span>
                <span>•</span>
                <span>1 Bonus RFQ / quarter</span>
              </div>
            </div>
          ) : null}

          {/* OTP Wallet Credits Widget */}
          <OtpWalletCreditsWidget
            organizationId={orgId || undefined}
            onApplyRenewal={() => setIsPaymentModalOpen(true)}
          />

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Identity & Avatar Card (4 cols) */}
          <div className="md:col-span-4 space-y-3">
            {/* Identity Hero Card */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs text-center space-y-3">
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/10 overflow-hidden shadow-inner">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-black text-primary">{initials || '?'}</span>
                )}
              </div>

              <div>
                <h2 className="text-sm font-extrabold text-foreground truncate">
                  {fullName || 'Unnamed User'}
                </h2>
                <p className="text-xs text-muted-foreground truncate">{title || 'Procurement Member'}</p>
                <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{email || user?.email}</p>
              </div>

              {/* Upload and Clear photo */}
              <div className="pt-1 flex flex-wrap items-center justify-center gap-2">
                <label
                  htmlFor="profile-avatar-file"
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition shadow-2xs min-h-[44px] mobile-touch-target"
                >
                  <span>📷</span> Upload Photo
                </label>
                <input
                  id="profile-avatar-file"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="rounded-xl border border-rose-300 dark:border-rose-800 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-h-[44px] mobile-touch-target"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Persona Preset Picker */}
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-xs space-y-2">
              <h3 className="text-xs font-bold text-foreground">Choose Persona Preset</h3>
              <div className="grid grid-cols-3 gap-2">
                {PERSONA_AVATARS.map((preset) => {
                  const isSelected = avatarUrl === preset.svgUrl;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setAvatarUrl(preset.svgUrl)}
                      title={`${preset.name} (${preset.category})`}
                      className={`flex flex-col items-center p-2 rounded-xl border transition min-h-[44px] ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                          : 'border-border/60 hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <img src={preset.svgUrl} alt={preset.name} className="h-9 w-9 rounded-full" />
                      <span className="text-[10px] mt-1 text-center font-semibold text-foreground truncate w-full">
                        {preset.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Edit Form & Verified Credentials (8 cols) */}
          <div className="md:col-span-8">
            <form onSubmit={handleSaveProfile} className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">
                Personal &amp; Organizational Profile
              </h2>

              {/* Full Name */}
              <div>
                <label htmlFor="input-full-name" className="block text-xs font-bold text-foreground mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="input-full-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Basu, Baskar Loganathan"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-hidden min-h-[44px]"
                />
              </div>

              {/* Organization Name */}
              <div>
                <label htmlFor="input-org-name" className="block text-xs font-bold text-foreground mb-1">
                  Organization / Entity Workspace Name
                </label>
                <input
                  id="input-org-name"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Durgha Rainbow Apartments RWA, Acme Corp"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-hidden min-h-[44px]"
                />
              </div>

              {/* Title / Role Suggestions */}
              <div>
                <label htmlFor="input-title" className="block text-xs font-bold text-foreground mb-1">
                  Title / Professional Designation
                </label>
                <input
                  id="input-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Procurement Lead, Managing Director, Secretary"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-hidden min-h-[44px]"
                />
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Quick set:</span>
                  {roleSuggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setTitle(sug)}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Verified Credentials Section */}
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">🔒</span>
                    <span className="text-xs font-extrabold text-foreground uppercase tracking-wide">
                      Security &amp; Communication Channels
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Required for RFQ dispatch
                  </span>
                </div>

                {/* Email Verification Box */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">Email Address</span>
                    {hasEmail ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                        <span>✓</span> Verified Primary
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
                        <span>🔓</span> Missing — Verify Email
                      </span>
                    )}
                  </div>

                  {hasEmail ? (
                    <input
                      type="email"
                      disabled
                      readOnly
                      value={email}
                      className="w-full cursor-not-allowed rounded-xl border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground select-all min-h-[44px]"
                    />
                  ) : (
                    <div className="space-y-2 rounded-xl border bg-card p-3">
                      {emailOtpStep === 'IDLE' ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="e.g. lead@organization.com"
                            className="flex-1 rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                          />
                          <button
                            type="button"
                            disabled={emailOtpBusy || !newEmail.trim()}
                            onClick={() => void handleSendEmailOtp()}
                            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap min-h-[44px] mobile-touch-target"
                          >
                            {emailOtpBusy ? 'Sending…' : '⚡ Send OTP'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={emailOtpCode}
                            onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="6-digit OTP"
                            className="w-32 tracking-widest text-center font-mono font-bold rounded-xl border bg-background px-3 py-2 text-xs min-h-[44px]"
                          />
                          <button
                            type="button"
                            disabled={emailOtpBusy || emailOtpCode.length < 4}
                            onClick={() => void handleVerifyEmailOtp()}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[44px] mobile-touch-target"
                          >
                            {emailOtpBusy ? 'Verifying…' : '✓ Verify Email'}
                          </button>
                        </div>
                      )}
                      {emailOtpError && <p className="text-[11px] text-red-600 font-medium">⚠️ {emailOtpError}</p>}
                      {emailOtpSuccess && <p className="text-[11px] text-emerald-600 font-medium">✓ {emailOtpSuccess}</p>}
                    </div>
                  )}
                </div>

                {/* WhatsApp Phone Verification Box */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">WhatsApp / Mobile Number</span>
                    {hasPhone ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                        <span>✓</span> Verified WhatsApp
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
                        <span>🔓</span> Missing — Verify Phone
                      </span>
                    )}
                  </div>

                  {hasPhone ? (
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={phone}
                      className="w-full cursor-not-allowed rounded-xl border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground select-all min-h-[44px]"
                    />
                  ) : (
                    <div className="space-y-2 rounded-xl border bg-card p-3">
                      {phoneOtpStep === 'IDLE' ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="tel"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            placeholder="e.g. 98400 12345 or +91 98400 12345"
                            className="flex-1 rounded-xl border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                          />
                          <button
                            type="button"
                            disabled={phoneOtpBusy || !newPhone.trim()}
                            onClick={() => void handleSendPhoneOtp()}
                            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap min-h-[44px] mobile-touch-target"
                          >
                            <span>⚡</span> {phoneOtpBusy ? 'Sending…' : 'Send WhatsApp OTP'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={phoneOtpCode}
                            onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="6-digit OTP"
                            className="w-32 tracking-widest text-center font-mono font-bold rounded-xl border bg-background px-3 py-2 text-xs min-h-[44px]"
                          />
                          <button
                            type="button"
                            disabled={phoneOtpBusy || phoneOtpCode.length < 4}
                            onClick={() => void handleVerifyPhoneOtp()}
                            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 min-h-[44px] mobile-touch-target"
                          >
                            <span>✓</span> {phoneOtpBusy ? 'Verifying…' : 'Verify Phone'}
                          </button>
                        </div>
                      )}
                      {phoneOtpError && <p className="text-[11px] text-red-600 font-medium">⚠️ {phoneOtpError}</p>}
                      {phoneOtpSuccess && <p className="text-[11px] text-emerald-600 font-medium">✓ {phoneOtpSuccess}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] mobile-touch-target flex items-center gap-1.5"
                >
                  {saving ? 'Saving Changes…' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* 2. TAB: ADDRESS BOOK */}
      {activeTab === 'addresses' && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-6">
          <AddressBookManager
            organizationId={context.organizationId || null}
            persona={tryResolveBuyerPersona(currentOrgType) ?? 'INDIVIDUAL'}
          />
        </section>
      )}

      {/* 3. TAB 2: WORKSPACE & TEAM MEMBERS */}
      {activeTab === 'team' && (
        <div className="space-y-3">
          {/* Quick link to Dedicated Governance & Delegation Workbench */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-xs">
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Dedicated Governance &amp; Delegation Workbench</span>
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Manage tokenized invitations, granular proxies, and spend caps in the full-screen governance portal.
              </p>
            </div>
            <Link
              to="/org/members"
              className="rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition shadow-2xs shrink-0 min-h-[44px] mobile-touch-target flex items-center gap-1"
            >
              <span>Open Governance Workbench</span>
              <span>→</span>
            </Link>
          </div>

          {/* Organization Switcher & Role Selector Banner */}
          <div className="rounded-2xl border border-border bg-card p-3.5 shadow-xs space-y-3">
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                Active Organization &amp; Role Context
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Switch between your authorized organizations and verified governance roles.
              </p>
            </div>

            {context.organizations.length > 1 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-muted-foreground">Organizations:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {context.organizations.map((org) => {
                    const isActive = org.id === context.organizationId;
                    const isBusy = switchingOrg === org.id;
                    return (
                      <button
                        key={org.id}
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleSwitchOrg(org.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition min-h-[44px] mobile-touch-target cursor-pointer ${
                          isActive
                            ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                            : 'border-border/70 bg-card hover:bg-muted text-foreground'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{org.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            {org.isPersonal ? 'Personal' : org.role.toLowerCase()}
                          </p>
                        </div>
                        {isActive && <span className="text-primary font-extrabold">✓ Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {context.roles.length > 1 && (
              <div className="space-y-1.5 pt-2 border-t border-border/60">
                <span className="text-[11px] font-bold text-muted-foreground">Active Operational Role:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {context.roles.map((r) => {
                    const isActive = r.code === context.activeRole?.code;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={async () => {
                          if (r.code !== context.activeRole?.code) {
                            await switchTo(r.code);
                            await refresh();
                          }
                        }}
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition min-h-[44px] mobile-touch-target cursor-pointer ${
                          isActive
                            ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                            : 'border-border/70 bg-card hover:bg-muted text-foreground'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{r.label}</p>
                          <p className="text-[10px] text-muted-foreground line-clamp-1">{r.description}</p>
                        </div>
                        {isActive && <span className="text-primary font-extrabold">✓ Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Committee / Team Builder */}
          {context.organizationId && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
              <CommitteeTeamBuilder
                organizationId={context.organizationId}
                persona={tryResolveBuyerPersona(currentOrgType) ?? 'MSME'}
                organizationName={orgName}
              />
            </div>
          )}

          {/* Team Invitation Card (if Manager/Owner) */}
          {canManageTeam && (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">👥</span>
                <div>
                  <h2 className="text-xs font-bold text-foreground">Invite Colleague to Workspace</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Grant committee voting, procurement intake, or observer permissions.
                  </p>
                </div>
              </div>

              <form onSubmit={handleInviteMember} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@organization.com"
                      disabled={inviteLoading}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      disabled={inviteLoading}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-primary min-h-[44px]"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={inviteLoading || !inviteEmail.trim()}
                      className="w-full rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] mobile-touch-target flex items-center justify-center gap-1"
                    >
                      {inviteLoading ? 'Sending…' : '+ Invite'}
                    </button>
                  </div>
                </div>

                {inviteResult && (
                  <p
                    className={`text-xs font-semibold rounded-xl p-2.5 ${
                      inviteResult.ok
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {inviteResult.ok ? '✓' : '⚠️'} {inviteResult.message}
                  </p>
                )}
              </form>
            </section>
          )}

          {/* Members Roster Card */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                Workspace Members ({members.length})
              </h2>
            </div>

            {membersLoading ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2 align-middle" />
                Loading members…
              </div>
            ) : membersError ? (
              <div className="p-3 text-xs text-red-600 bg-red-50 rounded-xl">⚠️ {membersError}</div>
            ) : members.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No colleagues registered yet. Send an invitation above to collaborate.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {members.map((m) => (
                  <li key={m.profileId} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-black text-primary">
                        {(m.fullName || m.email).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-foreground truncate">
                            {m.fullName || m.email}
                          </span>
                          {m.isSelf && (
                            <span className="rounded-full bg-primary/10 text-primary text-[9px] px-2 py-0.2 font-bold">
                              You
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.2 text-[9px] font-bold ${
                              ROLE_BADGE[m.role] ?? 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {m.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {m.fullName && <p className="text-[11px] text-muted-foreground truncate">{m.email}</p>}
                      </div>
                    </div>

                    {canManageTeam && !m.isSelf && m.role !== 'OWNER' && (
                      <button
                        type="button"
                        disabled={removing === m.profileId}
                        onClick={() => void handleRemoveMember(m.profileId)}
                        className="rounded-xl border border-rose-300 dark:border-rose-900/60 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-h-[44px] mobile-touch-target"
                      >
                        {removing === m.profileId ? '…' : 'Remove'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Governance Rules Card */}
          <div className="rounded-2xl border border-border bg-muted/20 p-3.5 text-xs text-muted-foreground space-y-1">
            <p className="font-bold text-foreground">🛡️ Merit Governance Rules</p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
              <li>Committee Members evaluate and vote on sealed quotes using identity-protected scoring.</li>
              <li>Quorum of 2+ votes required for Community, Institution, and Enterprise organizations.</li>
            </ul>
          </div>
        </div>
      )}

      {/* 4. TAB 3: PREFERENCES, NOTIFICATION CHANNELS & SECURITY */}
      {activeTab === 'preferences' && (
        <div className="space-y-3">
          {/* Theme & Display Mode: Restricted to Theme Bottom Sheet */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  🎨 Appearance &amp; Display Theme
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Active Mode: <strong className="text-foreground capitalize">{theme} ({resolvedTheme})</strong> · Color Accent: <strong className="text-foreground capitalize">{colorTheme}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowThemeSheet(true)}
                data-testid="profile-open-theme-sheet"
                className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:bg-primary/90 transition active:scale-95 min-h-[40px] inline-flex items-center gap-1.5 shadow-2xs"
              >
                <span>🎨 Change Theme</span>
                <span>→</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Display theme, dark/light modes, and curated accent color palettes are managed exclusively via the bottom-up Appearance Sheet.
            </p>
          </section>

          {/* Notification Channels Preferences */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">
              🔔 Notification Channels
            </h2>
            <p className="text-xs text-muted-foreground">
              Select which channels should receive procurement updates, sealed quotes, and purchase orders.
            </p>

            <div className="space-y-3">
              {/* WhatsApp Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">📱</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground">WhatsApp Channel</span>
                      <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold px-1.5 py-0.2">
                        Instant
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                      Receive 1-tap OTP logins, RFQ quotation invites, and purchase order status alerts directly on WhatsApp.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={channelWhatsapp}
                  onClick={() => handleToggleChannel('whatsapp', !channelWhatsapp)}
                  className={`ml-3 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden min-h-[24px] ${
                    channelWhatsapp ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      channelWhatsapp ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Email Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">✉️</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground">Email Notifications</span>
                      <span className="rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[9px] font-bold px-1.5 py-0.2">
                        Formal
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                      Receive formal RFP document PDFs, committee award summaries, and cryptographically signed PO receipts.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={channelEmail}
                  onClick={() => handleToggleChannel('email', !channelEmail)}
                  className={`ml-3 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden min-h-[24px] ${
                    channelEmail ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      channelEmail ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* In-App Feed Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">🔔</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-foreground">In-App Live Activity Feed</span>
                      <span className="rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[9px] font-bold px-1.5 py-0.2">
                        Realtime
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                      Live dashboard toasts and unread counters for active workflows and committee ballot requests.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={channelInApp}
                  onClick={() => handleToggleChannel('inapp', !channelInApp)}
                  className={`ml-3 relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden min-h-[24px] ${
                    channelInApp ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      channelInApp ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </section>

          {/* Security & Password */}
          <section className="rounded-2xl border border-border bg-card p-4 shadow-xs space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-2">
              🔐 Account Security &amp; Passwords
            </h2>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-foreground">Sign-In Password</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Update your authentication password for portal access.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition shadow-2xs min-h-[44px] mobile-touch-target"
              >
                🔐 Change Password
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Password Modal */}
      <ChangePasswordModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
      />

      {/* Mobile Theme Bottom Sheet */}
      <ThemeBottomSheet
        isOpen={showThemeSheet}
        onClose={() => setShowThemeSheet(false)}
      />

      {/* Subscription Payment Modal */}
      {isPaymentModalOpen && orgId && (
        <SubscriptionPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          organizationId={orgId}
          organizationName={context.organizationName || orgName || 'Organization'}
          initialTierId={subscription?.tierId}
          initialCycle={subscription?.plan || 'MONTHLY'}
          onSuccess={() => {
            setIsPaymentModalOpen(false);
            if (context.organizationId) {
              void fetchOrganizationSubscription(context.organizationId).then((res) => {
                if (res.ok) setSubscription(res.subscription);
              });
            }
          }}
        />
      )}

      {/* Guaranteed scroll clearance spacer above MobileBottomNav */}
      <div className="h-28 sm:h-16 shrink-0 w-full" aria-hidden="true" />
    </div>
  );
}
