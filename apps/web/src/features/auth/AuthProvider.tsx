import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { setRememberDevice, supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Passwordless: emails a one-time code to an account that already exists. */
  sendSignInCode: (email: string) => Promise<{ error: string | null }>;
  verifySignInCode: (email: string, code: string) => Promise<{ error: string | null }>;
  /** Sends a password recovery email with a reset link and code. */
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
  /** Requests a 6-digit password reset verification code via WhatsApp. */
  requestPasswordResetWhatsApp: (identifier: string) => Promise<{ ok: boolean; phone?: string; email?: string; error?: string }>;
  /** Verifies a 6-digit password reset code (from WhatsApp or Email) and sets a new password. */
  verifyPasswordReset: (identifier: string, code: string, newPassword: string) => Promise<{ ok: boolean; error?: string; message?: string }>;
  /** Updates the password for the current authenticated session. */
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  /** Chooses whether the session outlives the tab. Applies to the next sign-in. */
  rememberDevice: (remember: boolean) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // If incoming URL contains password recovery hash or query, route immediately to /reset-password
    if (typeof window !== 'undefined') {
      if (window.location.hash) {
        if (
          (window.location.hash.includes('type=recovery') || window.location.hash.includes('access_token=')) &&
          !window.location.pathname.startsWith('/reset-password')
        ) {
          window.location.href = '/reset-password' + window.location.hash;
          return;
        }
      }
      if (window.location.search) {
        const search = new URLSearchParams(window.location.search);
        if (search.get('type') === 'recovery' && !window.location.pathname.startsWith('/reset-password')) {
          window.location.href = '/reset-password' + window.location.search;
          return;
        }
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/reset-password')) {
          window.location.href = '/reset-password';
        }
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  /**
   * A code, not a magic link.
   *
   * shouldCreateUser is false on purpose: a sign-in form that silently creates
   * accounts turns a typo into a second, empty account with no organisation
   * behind it, and on this platform an account without an organisation cannot do
   * anything at all. Registration goes through the verified signup path instead.
   */
  const sendSignInCode = useCallback(async (email: string) => {
    const redirectUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectUrl,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  const verifySignInCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    return { error: error?.message ?? null };
  }, []);

  const resetPasswordForEmail = useCallback(async (email: string) => {
    const redirectUrl = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirectUrl,
    });
    return { error: error?.message ?? null };
  }, []);

  const requestPasswordResetWhatsApp = useCallback(async (identifier: string) => {
    try {
      const { data, error } = await supabase.rpc('request_whatsapp_password_reset', {
        p_identifier: identifier.trim(),
      });
      if (error) return { ok: false, error: error.message };
      const res = data as {
        ok: boolean;
        error?: string;
        phone?: string;
        email?: string;
        full_name?: string;
        otp_code?: string;
      };
      if (!res.ok) {
        return { ok: false, error: res.error || 'User not found' };
      }

      // Dispatch WhatsApp message via local WAHA proxy
      if (res.phone && res.otp_code) {
        const cleanPhone = res.phone.replace(/\D/g, '');
        const chatId = `${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}@c.us`;
        const resetLink = `${window.location.origin}/reset-password?identifier=${encodeURIComponent(res.phone)}`;

        const rawText =
          `[OTP Platform] Password Reset Verification\n\n` +
          `Hello ${res.full_name || 'User'},\n` +
          `Your password reset verification code is:\n\n` +
          `*${res.otp_code}*\n\n` +
          `Valid for 15 minutes. Enter this code on the password reset screen to set your new password:\n` +
          `${resetLink}\n\n` +
          `If you did not request this, you can safely ignore this message.`;

        await fetch('/waha/api/sendText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify({
            session: 'default',
            chatId,
            text: rawText.replace(/\u2014|\u2013/g, '-').replace(/[^\x20-\x7E\r\n\t]/g, ''),
          }),
        });
      }

      return { ok: true, phone: res.phone, email: res.email };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  const verifyPasswordReset = useCallback(
    async (identifier: string, code: string, newPassword: string) => {
      const cleanId = identifier.trim();
      const cleanCode = code.trim();

      try {
        // 1. If identifier is an email address, first attempt GoTrue email recovery OTP
        if (cleanId.includes('@')) {
          const { data, error: otpErr } = await supabase.auth.verifyOtp({
            email: cleanId.toLowerCase(),
            token: cleanCode,
            type: 'recovery',
          });

          if (!otpErr && data?.session) {
            const { error: updateErr } = await supabase.auth.updateUser({
              password: newPassword,
            });
            if (updateErr) {
              return { ok: false, error: updateErr.message };
            }
            return { ok: true, message: 'Password updated successfully' };
          }
        }

        // 2. Fall back to / execute WhatsApp OTP verification (phone number or custom reset table)
        const { data: waData, error: waErr } = await supabase.rpc('verify_whatsapp_password_reset', {
          p_identifier: cleanId,
          p_otp_code: cleanCode,
          p_new_password: newPassword,
        });

        if (waErr) {
          return { ok: false, error: waErr.message };
        }
        return waData as { ok: boolean; error?: string; message?: string };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    []
  );

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const rememberDevice = useCallback((remember: boolean) => {
    setRememberDevice(remember);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      signIn,
      sendSignInCode,
      verifySignInCode,
      resetPasswordForEmail,
      requestPasswordResetWhatsApp,
      verifyPasswordReset,
      updatePassword,
      rememberDevice,
      signOut,
    }),
    [
      session,
      isLoading,
      signIn,
      sendSignInCode,
      verifySignInCode,
      resetPasswordForEmail,
      requestPasswordResetWhatsApp,
      verifyPasswordReset,
      updatePassword,
      rememberDevice,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
