import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { SiteLayout } from '@/features/site/components/SiteLayout';
import { Button, Field, controlClasses } from '@/components/ui';
import { supabase } from '@/lib/supabase';

type ResetMode = 'request' | 'verify';

export function ResetPasswordPage() {
  const {
    updatePassword,
    verifyPasswordReset,
    requestPasswordResetWhatsApp,
    resetPasswordForEmail,
    user,
    isLoading,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Mode: either requesting a code, verifying a code, or setting a password with an authenticated recovery session
  const [mode, setMode] = useState<ResetMode>(() => {
    const c = searchParams.get('code') || searchParams.get('token');
    // If short 6-digit code or explicit verify step in URL, start in verify mode
    if ((c && c.length <= 8) || searchParams.get('step') === 'verify') return 'verify';
    return 'request';
  });

  const [requestChannel, setResetChannel] = useState<'WHATSAPP' | 'EMAIL'>('WHATSAPP');
  const [requestIdentifier, setRequestIdentifier] = useState(
    searchParams.get('identifier') || searchParams.get('email') || searchParams.get('phone') || ''
  );
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  const [codeIdentifier, setCodeIdentifier] = useState(
    searchParams.get('identifier') || searchParams.get('email') || searchParams.get('phone') || ''
  );
  const [code, setCode] = useState(() => {
    const raw = searchParams.get('code') || searchParams.get('token') || '';
    return raw.length <= 8 ? raw : '';
  });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Parse incoming URL hash and search params for Supabase recovery tokens, errors, and PKCE codes
  useEffect(() => {
    async function processRecoveryParams() {
      // 1. Check for error descriptions in hash or search params
      let errDesc = searchParams.get('error_description') || searchParams.get('error');
      if (!errDesc && typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        errDesc = hashParams.get('error_description') || hashParams.get('error');
      }
      if (errDesc) {
        const cleanErr = decodeURIComponent(errDesc.replace(/\+/g, ' '));
        setError(
          cleanErr.includes('expired') || cleanErr.includes('invalid')
            ? 'This password reset link has expired or is invalid. You can request a new verification code below.'
            : cleanErr
        );
        return;
      }

      // 2. Check for PKCE authorization code (?code=...)
      const pkceCode = searchParams.get('code');
      if (pkceCode && pkceCode.length > 8) {
        setVerifyingToken(true);
        try {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(pkceCode);
          if (exchangeErr) {
            setError(
              'The recovery link could not be verified (' +
                exchangeErr.message +
                '). Please request a new verification code below.'
            );
          } else {
            // Clean URL query parameter
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
        } catch {
          setError('Failed to exchange recovery code. Please request a new code.');
        } finally {
          setVerifyingToken(false);
        }
        return;
      }

      // 3. Check for token_hash (?token_hash=...&type=recovery)
      const tokenHash = searchParams.get('token_hash');
      const tokenType = searchParams.get('type');
      if (tokenHash && (tokenType === 'recovery' || tokenType === 'email' || !tokenType)) {
        setVerifyingToken(true);
        try {
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });
          if (verifyErr) {
            setError(
              'This recovery link is invalid or expired (' +
                verifyErr.message +
                '). Please request a new code.'
            );
          } else {
            if (typeof window !== 'undefined') {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          }
        } catch {
          setError('Failed to verify recovery token. Please request a new code.');
        } finally {
          setVerifyingToken(false);
        }
      }
    }

    void processRecoveryParams();
  }, [searchParams]);

  // Handle direct code request (Mode: 'request')
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRequestNotice(null);

    const cleanInput = requestIdentifier.trim();
    if (!cleanInput) {
      setError(
        requestChannel === 'WHATSAPP'
          ? 'Please enter your registered mobile number.'
          : 'Please enter your registered work email address.'
      );
      return;
    }

    setBusy(true);

    if (requestChannel === 'WHATSAPP') {
      const res = await requestPasswordResetWhatsApp(cleanInput);
      setBusy(false);
      if (!res.ok) {
        setError(res.error || 'Failed to dispatch WhatsApp verification code.');
        return;
      }

      setCodeIdentifier(res.phone || cleanInput);
      setRequestNotice(`We sent an 8-digit verification code via WhatsApp to ${res.phone || cleanInput}.`);
      setMode('verify');
    } else {
      const normalizedEmail = cleanInput.toLowerCase();
      const res = await resetPasswordForEmail(normalizedEmail);
      setBusy(false);
      if (res.error) {
        setError(res.error);
        return;
      }

      setCodeIdentifier(normalizedEmail);
      setRequestNotice(`Password reset email sent to ${normalizedEmail}. Click the link in the email or enter the 8-digit code below.`);
      setMode('verify');
    }
  };

  // Handle password submission (Mode: 'verify' or authenticated recovery session)
  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setBusy(true);

    if (user) {
      // Authenticated session (via email recovery link, token_hash, or exchanged PKCE code)
      const res = await updatePassword(password);
      setBusy(false);

      if (res.error) {
        setError(res.error);
        return;
      }
    } else {
      // Code verification (via 6-digit code from WhatsApp or Email)
      if (!codeIdentifier.trim()) {
        setBusy(false);
        setError('Please enter your registered email address or phone number.');
        return;
      }
      if (!code.trim() || code.trim().length < 6) {
        setBusy(false);
        setError('Please enter the verification code received on WhatsApp or Email.');
        return;
      }

      const res = await verifyPasswordReset(codeIdentifier, code, password);
      setBusy(false);

      if (!res.ok) {
        setError(res.error || 'Verification failed. Please check your verification code.');
        return;
      }
    }

    // Successfully updated! Sign out to ensure clean re-authentication with new credentials
    try {
      await supabase.auth.signOut();
    } catch {
      // Non-blocking
    }

    setSuccess(true);
    setTimeout(() => {
      navigate('/login?reset=success', { replace: true });
    }, 2500);
  };

  const hasIncomingRecoveryParam = Boolean(
    searchParams.get('code') ||
    searchParams.get('token_hash') ||
    (typeof window !== 'undefined' && window.location.hash && (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token=')))
  );

  const isResolving = verifyingToken || (isLoading && hasIncomingRecoveryParam);

  return (
    <SiteLayout>
      <div className="mx-auto w-full max-w-md px-4 py-8 sm:py-14 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden">
        <h1 className="text-2xl font-semibold text-foreground">Set New Password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {user
            ? 'Your recovery session is verified. Choose a new secure password for your OTP Platform account.'
            : 'Reset your password securely via email or WhatsApp verification code.'}
        </p>

        <div className="mt-6 rounded-lg border bg-card p-6 shadow-sm">
          {isResolving ? (
            <div className="py-8 text-center space-y-3">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-action border-t-transparent" />
              <p className="text-xs text-muted-foreground">Verifying recovery credentials…</p>
            </div>
          ) : success ? (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-4 text-sm text-emerald-900 dark:text-emerald-300">
              <div className="flex items-center gap-2 font-bold mb-1">
                <span>✓</span> Password Updated Successfully!
              </div>
              <p className="text-xs text-emerald-800 dark:text-emerald-400">
                Your new password is now active across all devices. Redirecting you to sign in with your new credentials…
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 p-3 text-xs text-red-900 dark:text-red-300" role="alert">
                  {error}
                </div>
              )}

              {requestNotice && (
                <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3 text-xs text-emerald-900 dark:text-emerald-300 flex items-start gap-2">
                  <span className="font-bold">✓</span>
                  <div>{requestNotice}</div>
                </div>
              )}

              {/* Mode 3: User has verified recovery session (via direct email link, token_hash, or PKCE exchange) */}
              {user ? (
                <form onSubmit={handleSubmitPassword} className="space-y-4">
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3 text-xs text-emerald-950 dark:text-emerald-200">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span>✓</span> Authenticated Recovery Session
                    </p>
                    <p className="mt-0.5 text-emerald-800 dark:text-emerald-300">
                      Identity verified for <strong>{user.email || user.phone || 'your account'}</strong>. Enter your new password below.
                    </p>
                  </div>

                  <Field label="New Password" required help="At least 8 characters.">
                    {({ id, describedBy, invalid }) => (
                      <input
                        id={id}
                        aria-describedby={describedBy}
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={controlClasses(invalid)}
                        placeholder="••••••••••••"
                        required
                        autoFocus
                      />
                    )}
                  </Field>

                  <Field label="Confirm New Password" required>
                    {({ id, describedBy, invalid }) => (
                      <input
                        id={id}
                        aria-describedby={describedBy}
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={controlClasses(invalid)}
                        placeholder="••••••••••••"
                        required
                      />
                    )}
                  </Field>

                  <Button
                    type="submit"
                    variant="action"
                    size="lg"
                    busy={busy}
                    busyLabel="Saving new password…"
                    className="w-full mt-2"
                  >
                    Save New Password
                  </Button>
                </form>
              ) : (
                <>
                  {/* Mode switcher tabs for unauthenticated direct URL access */}
                  <div
                    role="tablist"
                    aria-label="Password Reset Method"
                    className="mb-5 grid grid-cols-2 rounded-md border bg-muted/40 p-0.5 text-xs font-medium"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'request'}
                      onClick={() => {
                        setMode('request');
                        setError(null);
                      }}
                      className={`rounded py-1.5 transition-colors ${
                        mode === 'request'
                          ? 'bg-card text-foreground font-semibold shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      1. Request Reset Code
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === 'verify'}
                      onClick={() => {
                        setMode('verify');
                        setError(null);
                      }}
                      className={`rounded py-1.5 transition-colors ${
                        mode === 'verify'
                          ? 'bg-card text-foreground font-semibold shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      2. Enter Code &amp; Reset
                    </button>
                  </div>

                  {/* Mode 1: Request Code directly on /reset-password */}
                  {mode === 'request' ? (
                    <form onSubmit={handleSendCode} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Delivery Channel</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setResetChannel('WHATSAPP')}
                            className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                              requestChannel === 'WHATSAPP'
                                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-bold'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                            }`}
                          >
                            <span>💬</span> WhatsApp Code
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetChannel('EMAIL')}
                            className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                              requestChannel === 'EMAIL'
                                ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200 font-bold'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                            }`}
                          >
                            <span>✉️</span> Reset Email
                          </button>
                        </div>
                      </div>

                      {requestChannel === 'WHATSAPP' ? (
                        <Field
                          label="Registered Phone Number"
                          required
                          help="Your WhatsApp mobile number with country code (e.g. +91 98765 43210)"
                        >
                          {({ id, describedBy, invalid }) => (
                            <input
                              id={id}
                              aria-describedby={describedBy}
                              type="tel"
                              value={requestIdentifier}
                              onChange={(e) => setRequestIdentifier(e.target.value)}
                              className={controlClasses(invalid)}
                              placeholder="+91 98765 43210"
                              required
                              autoFocus
                            />
                          )}
                        </Field>
                      ) : (
                        <Field
                          label="Registered Work Email"
                          required
                          help="The email address associated with your OTP Platform account"
                        >
                          {({ id, describedBy, invalid }) => (
                            <input
                              id={id}
                              aria-describedby={describedBy}
                              type="email"
                              value={requestIdentifier}
                              onChange={(e) => setRequestIdentifier(e.target.value)}
                              className={controlClasses(invalid)}
                              placeholder="name@company.com"
                              required
                              autoFocus
                            />
                          )}
                        </Field>
                      )}

                      <Button
                        type="submit"
                        variant="action"
                        size="lg"
                        busy={busy}
                        busyLabel={
                          requestChannel === 'WHATSAPP' ? 'Sending WhatsApp code…' : 'Sending recovery email…'
                        }
                        className="w-full mt-2"
                      >
                        {requestChannel === 'WHATSAPP'
                          ? 'Send 6-Digit Code via WhatsApp →'
                          : 'Send Password Reset Link & Code →'}
                      </Button>

                      <div className="pt-2 text-center text-xs text-muted-foreground">
                        Already received a code?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setMode('verify');
                            setError(null);
                          }}
                          className="text-action font-semibold hover:underline"
                        >
                          Enter it here →
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Mode 2: Verify Code & Set Password */
                    <form onSubmit={handleSubmitPassword} className="space-y-4">
                      <Field
                        label="Work Email or Registered Phone"
                        required
                        help="e.g. name@company.com or +91 98765 43210"
                      >
                        {({ id, describedBy, invalid }) => (
                          <input
                            id={id}
                            aria-describedby={describedBy}
                            type="text"
                            value={codeIdentifier}
                            onChange={(e) => setCodeIdentifier(e.target.value)}
                            className={controlClasses(invalid)}
                            placeholder="Enter email or phone"
                            required
                            autoFocus={!codeIdentifier}
                          />
                        )}
                      </Field>

                      <Field
                        label="Verification Code (8 Digits)"
                        required
                        help="From your WhatsApp message or reset email"
                      >
                        {({ id, describedBy, invalid }) => (
                          <input
                            id={id}
                            aria-describedby={describedBy}
                            type="text"
                            inputMode="numeric"
                            maxLength={8}
                            value={code}
                            onChange={(e) => setCode(e.target.value.trim())}
                            className={`${controlClasses(invalid)} font-mono tracking-widest text-center text-lg`}
                            placeholder="Enter 8-digit code"
                            required
                            autoFocus={Boolean(codeIdentifier && !code)}
                          />
                        )}
                      </Field>

                      <Field label="New Password" required help="At least 8 characters.">
                        {({ id, describedBy, invalid }) => (
                          <input
                            id={id}
                            aria-describedby={describedBy}
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={controlClasses(invalid)}
                            placeholder="••••••••••••"
                            required
                          />
                        )}
                      </Field>

                      <Field label="Confirm New Password" required>
                        {({ id, describedBy, invalid }) => (
                          <input
                            id={id}
                            aria-describedby={describedBy}
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={controlClasses(invalid)}
                            placeholder="••••••••••••"
                            required
                          />
                        )}
                      </Field>

                      <Button
                        type="submit"
                        variant="action"
                        size="lg"
                        busy={busy}
                        busyLabel="Updating password…"
                        className="w-full mt-2"
                      >
                        Verify Code &amp; Set Password
                      </Button>

                      <div className="pt-2 text-center text-xs text-muted-foreground">
                        Didn't receive a code?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setMode('request');
                            setError(null);
                          }}
                          className="text-action font-semibold hover:underline"
                        >
                          Request a new code →
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
          <Link to="/login" className="text-action hover:underline">
            ← Return to Sign In
          </Link>
          <Link to="/login?forgot=1" className="hover:underline">
            Request new code via WhatsApp / Email →
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
