import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRoleContext } from '@/features/roles';
import {
  updateMyProfile,
  updateOrganizationName,
  fetchMyProfile,
  requestProfileCredentialOtp,
  verifyAndUpdateProfileCredential,
  type UserProfileDetails,
} from '../api/profile';
import { fetchUserOrganization } from '@/features/requirement/api/requirements';
import { PERSONA_AVATARS, compressAndCropAvatar } from '../lib/avatars';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
  onProfileUpdated?: (updated: UserProfileDetails) => void;
}

export function ProfileEditModal({ open, onClose, onProfileUpdated }: ProfileEditModalProps) {
  const { context, refresh } = useRoleContext();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccessMsg(null);
      setPhoneOtpError(null);
      setPhoneOtpSuccess(null);
      setEmailOtpError(null);
      setEmailOtpSuccess(null);
      setPhoneOtpStep('IDLE');
      setEmailOtpStep('IDLE');
      setPhoneOtpCode('');
      setEmailOtpCode('');
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    // Initialize with context values immediately
    setFullName(context.fullName || '');
    setOrgName(context.organizationName || '');
    setOrgId(context.organizationId || null);
    setTitle(context.title || '');
    setAvatarUrl(context.avatarUrl || '');
    setEmail(context.email || '');
    setPhone(context.phone || '');

    // Fetch fresh database profile & organization
    setLoading(true);
    Promise.all([
      fetchMyProfile(),
      fetchUserOrganization().catch(() => null),
    ])
      .then(([res, orgRes]) => {
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
      })
      .catch((err) => {
        console.error('Error fetching profile or organization:', err);
      })
      .finally(() => setLoading(false));

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, context, onClose]);

  if (!open) return null;

  const hasEmail = Boolean(email && email.trim().length > 0 && email !== 'Not registered');
  const hasPhone = Boolean(phone && phone.trim().length > 0 && phone !== 'Not registered');

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
      const croppedBase64 = await compressAndCropAvatar(file, 256);
      setAvatarUrl(croppedBase64);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
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

      // Update Organization / Entity Name if entered and modified
      if (orgName.trim() && orgName.trim() !== (context.organizationName || '')) {
        const orgRes = await updateOrganizationName(orgName.trim(), orgId || context.organizationId);
        if (!orgRes.ok) {
          setError(`Profile updated, but organization name update failed: ${orgRes.error}`);
          setSaving(false);
          return;
        }
      }

      setSuccessMsg('Profile and organization settings updated successfully!');
      await refresh();
      onProfileUpdated?.(res.profile);

      // Auto close after brief success indication
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error updating profile');
    } finally {
      setSaving(false);
    }
  }

  // Role suggestions for title
  const roleSuggestions = context.isPlatformAdmin
    ? ['Platform Super Administrator', 'Lead Operations Engineer', 'DevOps & Security Lead']
    : context.side === 'SUPPLIER'
    ? ['Authorized Supplier Representative', 'Managing Director', 'Sales Director', 'Lead Contractor']
    : ['Procurement Committee Member', 'Facility Secretary', 'RWA President', 'Estate Manager', 'Treasurer'];

  const initials = (fullName || email || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
        className="relative z-10 w-full max-w-xl rounded-xl border bg-card p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="profile-modal-title" className="text-lg font-bold text-foreground">
                Profile &amp; Account Settings
              </h2>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                context.isPlatformAdmin
                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                  : context.side === 'SUPPLIER'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}>
                {context.isPlatformAdmin
                  ? 'Super Admin'
                  : context.side === 'SUPPLIER'
                  ? 'Supplier'
                  : 'Buyer'}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Manage your display name, workspace entity, credentials, and profile avatar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="mt-5 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-300 flex items-center gap-2">
              <span>✓</span> {successMsg}
            </div>
          )}

          {/* Avatar & Photo Section */}
          <div className="rounded-lg border bg-muted/20 p-4">
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wide">
              Profile Photo &amp; Avatar
            </label>
            <div className="mt-3 flex flex-col sm:flex-row items-center gap-4">
              {/* Current Preview */}
              <div className="relative shrink-0">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/10 overflow-hidden shadow-inner">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-primary">{initials || '?'}</span>
                  )}
                </div>
              </div>

              {/* Upload & Clear Controls */}
              <div className="flex-1 text-center sm:text-left space-y-2">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="avatar-file-upload"
                  />
                  <label
                    htmlFor="avatar-file-upload"
                    className="cursor-pointer inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition shadow-2xs"
                  >
                    <span>📷</span> Upload Photo
                  </label>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950 transition"
                    >
                      Remove Photo
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Square JPEG, PNG, or WebP up to 10MB. Images are automatically cropped and optimized.
                </p>
              </div>
            </div>

            {/* Persona Preset Picker */}
            <div className="mt-4 pt-3 border-t">
              <span className="text-[11px] font-medium text-muted-foreground block mb-2">
                Or choose a curated persona avatar:
              </span>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {PERSONA_AVATARS.map((preset) => {
                  const isSelected = avatarUrl === preset.svgUrl;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setAvatarUrl(preset.svgUrl)}
                      title={`${preset.name} (${preset.category})`}
                      className={`relative flex flex-col items-center p-1 rounded-lg border transition ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                          : 'border-border/60 hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <img src={preset.svgUrl} alt={preset.name} className="h-9 w-9 rounded-full" />
                      <span className="text-[9px] mt-1 truncate w-full text-center text-muted-foreground font-medium">
                        {preset.name.split(' ')[0]}
                      </span>
                      {isSelected && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold shadow-xs">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Editable Full Name */}
          <div>
            <label htmlFor="profile-full-name" className="block text-xs font-medium text-foreground">
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              id="profile-full-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Basu, Baskar Loganathan"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-2xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Displayed on sealed quotes, committee ballots, and purchase order signoffs.
            </p>
          </div>

          {/* Editable Organization / Workspace Name */}
          <div>
            <label htmlFor="profile-org-name" className="block text-xs font-medium text-foreground">
              Organization / Workspace Name
            </label>
            <input
              id="profile-org-name"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Basu, Durgha Rainbow Apartments, Acme Corp"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-2xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Your company, housing society/RWA, or procurement workspace identity.
            </p>
          </div>

          {/* Editable Job Title / Designation */}
          <div>
            <label htmlFor="profile-title" className="block text-xs font-medium text-foreground">
              Title / Designation
            </label>
            <input
              id="profile-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Procurement Manager, Secretary, Director"
              className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-2xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            {/* Suggestions Chips */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Quick set:</span>
              {roleSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setTitle(sug)}
                  className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Security Credentials Section */}
          <div className="rounded-lg border border-dashed border-border bg-muted/15 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs">🔒</span>
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Security &amp; Authentication Credentials
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">
                At least 1 verified credential required
              </span>
            </div>

            {/* Email Address */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  Email Address
                </label>
                {hasEmail ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span>✓</span> Verified Primary
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    <span>🔓</span> Missing — Unlock to Add &amp; Verify
                  </span>
                )}
              </div>

              {hasEmail ? (
                <>
                  <input
                    type="email"
                    disabled
                    readOnly
                    value={email}
                    className="block w-full cursor-not-allowed rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm text-muted-foreground select-all"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Primary login credential and cryptographic signature identity.
                  </p>
                </>
              ) : (
                <div className="space-y-2 rounded-lg border bg-card p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Email address is missing. Add and verify your email to unlock email notifications and formal RFP invites.
                  </p>

                  {emailOtpStep === 'IDLE' ? (
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="e.g. buyer@example.com"
                        className="flex-1 w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        disabled={emailOtpBusy || !newEmail.trim()}
                        onClick={() => void handleSendEmailOtp()}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                      >
                        {emailOtpBusy ? 'Sending Code…' : '⚡ Send OTP Code'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={emailOtpCode}
                          onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit OTP"
                          className="w-full sm:w-40 tracking-widest text-center font-mono font-bold rounded-md border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          disabled={emailOtpBusy || emailOtpCode.length < 4}
                          onClick={() => void handleVerifyEmailOtp()}
                          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                        >
                          {emailOtpBusy ? 'Verifying…' : '✓ Verify & Link Email'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEmailOtpStep('IDLE');
                            setEmailOtpError(null);
                          }}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Change
                        </button>
                      </div>
                      {emailResendTimer > 0 ? (
                        <p className="text-[10px] text-muted-foreground">
                          Resend code in {emailResendTimer}s
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSendEmailOtp()}
                          className="text-[10px] text-primary font-medium hover:underline"
                        >
                          Resend OTP code
                        </button>
                      )}
                    </div>
                  )}

                  {emailOtpError && (
                    <p className="text-[11px] text-red-600 font-medium">⚠️ {emailOtpError}</p>
                  )}
                  {emailOtpSuccess && (
                    <p className="text-[11px] text-emerald-600 font-medium">✓ {emailOtpSuccess}</p>
                  )}
                </div>
              )}
            </div>

            {/* Phone Number */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  WhatsApp / Contact Phone
                </label>
                {hasPhone ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <span>✓</span> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    <span>🔓</span> Missing — Unlock to Add &amp; Verify
                  </span>
                )}
              </div>

              {hasPhone ? (
                <>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={phone}
                    className="block w-full cursor-not-allowed rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm text-muted-foreground select-all"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Bound to WhatsApp OTP dispatch and real-time PO &amp; RFQ notification alerts.
                  </p>
                </>
              ) : (
                <div className="space-y-2 rounded-lg border bg-card p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Phone number is missing. Add and verify your mobile number via OTP to activate WhatsApp RFQ, quote, and Purchase Order notifications.
                  </p>

                  {phoneOtpStep === 'IDLE' ? (
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="e.g. 98400 12345 or +91 98400 12345"
                        className="flex-1 w-full rounded-md border bg-background px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        disabled={phoneOtpBusy || !newPhone.trim()}
                        onClick={() => void handleSendPhoneOtp()}
                        className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
                      >
                        <span>⚡</span> {phoneOtpBusy ? 'Sending OTP…' : 'Send WhatsApp OTP'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={phoneOtpCode}
                          onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit OTP"
                          className="w-full sm:w-40 tracking-widest text-center font-mono font-bold rounded-md border bg-background px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          disabled={phoneOtpBusy || phoneOtpCode.length < 4}
                          onClick={() => void handleVerifyPhoneOtp()}
                          className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap flex items-center gap-1"
                        >
                          <span>✓</span> {phoneOtpBusy ? 'Verifying…' : 'Verify & Link Phone'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneOtpStep('IDLE');
                            setPhoneOtpError(null);
                          }}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          Change Number
                        </button>
                      </div>
                      {phoneResendTimer > 0 ? (
                        <p className="text-[10px] text-muted-foreground">
                          Resend code in {phoneResendTimer}s
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleSendPhoneOtp()}
                          className="text-[10px] text-primary font-medium hover:underline"
                        >
                          Resend WhatsApp OTP code
                        </button>
                      )}
                    </div>
                  )}

                  {phoneOtpError && (
                    <p className="text-[11px] text-red-600 font-medium">⚠️ {phoneOtpError}</p>
                  )}
                  {phoneOtpSuccess && (
                    <p className="text-[11px] text-emerald-600 font-medium">{phoneOtpSuccess}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {saving ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Saving Changes…</span>
                </>
              ) : (
                <span>Save Profile Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
