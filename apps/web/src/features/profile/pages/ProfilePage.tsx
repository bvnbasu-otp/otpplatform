import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import {
  fetchMyProfile,
  updateMyProfile,
  updateOrganizationName,
  requestProfileCredentialOtp,
  verifyAndUpdateProfileCredential,
} from '../api/profile';
import { fetchUserOrganization } from '@/features/requirement/api/requirements';
import { PERSONA_AVATARS, compressAndCropAvatar } from '../lib/avatars';

export function ProfilePage() {
  const { context, refresh } = useRoleContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
  const [phoneResendTimer, setPhoneResendTimer] = useState(0);

  const [newEmail, setNewEmail] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState<'IDLE' | 'SENT' | 'VERIFIED'>('IDLE');
  const [emailOtpBusy, setEmailOtpBusy] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [emailOtpSuccess, setEmailOtpSuccess] = useState<string | null>(null);
  const [emailResendTimer, setEmailResendTimer] = useState(0);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (phoneResendTimer > 0) {
      timer = setTimeout(() => setPhoneResendTimer((t) => t - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [phoneResendTimer]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (emailResendTimer > 0) {
      timer = setTimeout(() => setEmailResendTimer((t) => t - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [emailResendTimer]);

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
      .catch((err) => console.error('Error fetching profile:', err))
      .finally(() => setLoading(false));
  }, [context]);

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

      if (orgName.trim() && orgName.trim() !== (context.organizationName || '')) {
        const orgRes = await updateOrganizationName(orgName.trim(), orgId || context.organizationId);
        if (!orgRes.ok) {
          setError(`Profile updated, but organization name update failed: ${orgRes.error}`);
          setSaving(false);
          return;
        }
      }

      setSuccessMsg('Profile and workspace settings saved successfully!');
      await refresh();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error saving profile');
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <div className="zero-scroll-container p-3 max-w-6xl mx-auto w-full">
      {/* Compressed Top Bar */}
      <header className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/dashboard" className="text-xs font-semibold text-muted-foreground hover:text-foreground shrink-0">
            ← Dashboard
          </Link>
          <span className="text-muted-foreground">|</span>
          <h1 className="text-xs font-bold text-foreground truncate">Account &amp; Profile Settings</h1>
        </div>
        <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold shrink-0 ${
          context.isPlatformAdmin
            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
            : context.side === 'SUPPLIER'
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
        }`}>
          {context.isPlatformAdmin ? 'Super Admin' : context.side === 'SUPPLIER' ? 'Supplier' : 'Buyer'}
        </span>
      </header>

      {error && (
        <div className="mt-1 shrink-0 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-1 shrink-0 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 flex items-center gap-1.5">
          <span>✓</span> {successMsg}
        </div>
      )}

      {/* Internal Scroll Content Area */}
      <div className="zero-scroll-pane mt-2">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Left Column: Avatar Management */}
          <div className="space-y-3">
            <div className="rounded-lg border bg-card p-4 shadow-2xs text-center">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Profile Photo &amp; Avatar
              </h2>
              <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/20 bg-primary/10 overflow-hidden shadow-inner">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-primary">{initials || '?'}</span>
                )}
              </div>

              <div className="mt-3 flex flex-col items-center gap-1.5">
                <label
                  htmlFor="avatar-upload"
                  className="cursor-pointer inline-flex items-center gap-1.5 rounded bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition shadow-2xs"
                >
                  <span>📷</span> Upload Photo
                </label>
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="text-[10px] text-red-600 hover:underline"
                  >
                    Remove Avatar
                  </button>
                )}
              </div>
            </div>

            {/* Persona Avatar Presets */}
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <h3 className="text-xs font-bold text-foreground mb-2">Choose Persona Preset</h3>
              <div className="grid grid-cols-3 gap-1.5">
                {PERSONA_AVATARS.map((preset) => {
                  const isSelected = avatarUrl === preset.svgUrl;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setAvatarUrl(preset.svgUrl)}
                      title={`${preset.name} (${preset.category})`}
                      className={`flex flex-col items-center p-1.5 rounded border transition ${
                        isSelected
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border/60 hover:border-primary/50 hover:bg-muted/50'
                      }`}
                    >
                      <img src={preset.svgUrl} alt={preset.name} className="h-8 w-8 rounded-full" />
                      <span className="text-[9px] mt-0.5 text-center font-medium text-foreground truncate w-full">
                        {preset.name.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Profile & Credentials Form */}
          <div className="md:col-span-2">
            <form onSubmit={handleSave} className="rounded-lg border bg-card p-4 shadow-2xs space-y-3">
              <h2 className="text-xs font-bold text-foreground border-b pb-1.5 uppercase tracking-wider text-muted-foreground">
                Personal &amp; Organizational Identity
              </h2>

              {/* Full Name */}
              <div>
                <label htmlFor="full-name" className="block text-xs font-medium text-foreground">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="full-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Basu, Baskar Loganathan"
                  className="mt-1 block w-full rounded border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Organization / Workspace Name */}
              <div>
                <label htmlFor="org-name" className="block text-xs font-medium text-foreground">
                  Organization / Workspace Name
                </label>
                <input
                  id="org-name"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Basu, Durgha Rainbow Apartments, Acme Corp"
                  className="mt-1 block w-full rounded border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Title / Designation */}
              <div>
                <label htmlFor="title" className="block text-xs font-medium text-foreground">
                  Title / Professional Designation
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Procurement Lead, Managing Director, Secretary"
                  className="mt-1 block w-full rounded border bg-background px-2.5 py-1.5 text-xs text-foreground shadow-2xs focus:border-primary focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Suggestions:</span>
                  {roleSuggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setTitle(sug)}
                      className="rounded-full border bg-muted/40 px-1.5 py-0.2 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Security Credentials Section */}
              <div className="rounded border border-dashed border-border bg-muted/15 p-3 space-y-3 mt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">🔒</span>
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Security &amp; Authentication Credentials
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    At least 1 verified credential required
                  </span>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">
                      Email Address
                    </label>
                    {hasEmail ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.2 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                        <span>✓</span> Verified Primary
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.2 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
                        <span>🔓</span> Missing — Unlock &amp; Verify
                      </span>
                    )}
                  </div>

                  {hasEmail ? (
                    <input
                      type="email"
                      disabled
                      readOnly
                      value={email}
                      className="block w-full cursor-not-allowed rounded border border-dashed bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground select-all"
                    />
                  ) : (
                    <div className="space-y-1.5 rounded border bg-card p-2.5">
                      {emailOtpStep === 'IDLE' ? (
                        <div className="flex flex-col sm:flex-row gap-1.5 items-start sm:items-center">
                          <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="e.g. bvnbasu@yahoo.com"
                            className="flex-1 w-full rounded border bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary"
                          />
                          <button
                            type="button"
                            disabled={emailOtpBusy || !newEmail.trim()}
                            onClick={() => void handleSendEmailOtp()}
                            className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                          >
                            {emailOtpBusy ? 'Sending…' : '⚡ Send OTP'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex gap-1.5 items-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={emailOtpCode}
                              onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="6-digit OTP"
                              className="w-28 tracking-widest text-center font-mono font-bold rounded border bg-background px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              disabled={emailOtpBusy || emailOtpCode.length < 4}
                              onClick={() => void handleVerifyEmailOtp()}
                              className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {emailOtpBusy ? 'Verifying…' : '✓ Verify'}
                            </button>
                          </div>
                        </div>
                      )}
                      {emailOtpError && <p className="text-[10px] text-red-600 font-medium">⚠️ {emailOtpError}</p>}
                      {emailOtpSuccess && <p className="text-[10px] text-emerald-600 font-medium">✓ {emailOtpSuccess}</p>}
                    </div>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">
                      Phone Number
                    </label>
                    {hasPhone ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.2 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300">
                        <span>✓</span> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.2 text-[10px] font-bold text-amber-800 dark:text-amber-300 border border-amber-300">
                        <span>🔓</span> Missing — Unlock &amp; Verify
                      </span>
                    )}
                  </div>

                  {hasPhone ? (
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={phone}
                      className="block w-full cursor-not-allowed rounded border border-dashed bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground select-all"
                    />
                  ) : (
                    <div className="space-y-1.5 rounded border bg-card p-2.5">
                      {phoneOtpStep === 'IDLE' ? (
                        <div className="flex flex-col sm:flex-row gap-1.5 items-start sm:items-center">
                          <input
                            type="tel"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            placeholder="e.g. 98400 12345 or +91 98400 12345"
                            className="flex-1 w-full rounded border bg-background px-2.5 py-1 text-xs text-foreground focus:border-primary"
                          />
                          <button
                            type="button"
                            disabled={phoneOtpBusy || !newPhone.trim()}
                            onClick={() => void handleSendPhoneOtp()}
                            className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                          >
                            <span>⚡</span> {phoneOtpBusy ? 'Sending…' : 'Send WhatsApp OTP'}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex gap-1.5 items-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={phoneOtpCode}
                              onChange={(e) => setPhoneOtpCode(e.target.value.replace(/\D/g, ''))}
                              placeholder="6-digit OTP"
                              className="w-28 tracking-widest text-center font-mono font-bold rounded border bg-background px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              disabled={phoneOtpBusy || phoneOtpCode.length < 4}
                              onClick={() => void handleVerifyPhoneOtp()}
                              className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <span>✓</span> {phoneOtpBusy ? 'Verifying…' : 'Verify'}
                            </button>
                          </div>
                        </div>
                      )}
                      {phoneOtpError && <p className="text-[10px] text-red-600 font-medium">⚠️ {phoneOtpError}</p>}
                      {phoneOtpSuccess && <p className="text-[10px] text-emerald-600 font-medium">✓ {phoneOtpSuccess}</p>}
                    </div>
                  )}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t">
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="inline-flex items-center gap-1.5 rounded bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition"
                >
                  {saving ? 'Saving Changes…' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
