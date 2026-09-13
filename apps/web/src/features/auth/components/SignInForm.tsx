import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, controlClasses } from '@/components/ui';
import { useAuth } from '../AuthProvider';
import { isSuperAdminEmail } from '../user-role';
import { fetchDemoStatus } from '../../demo/api/demo';

type Method = 'code' | 'password';

/**
 * Signing in, both ways, in one component.
 *
 * A one-time code is the default because it is the credential this market
 * actually has: a phone that receives messages, and no password manager. But the
 * password path stays, and not only for the demo accounts — email delivery fails
 * often enough that a passwordless-only product has days where nobody can get in
 * at all. Offering both is the difference between an inconvenience and an outage.
 *
 * Neither path creates an account. Registration is a separate, verified route,
 * because an account with no organisation behind it cannot do anything here.
 */
interface DemoPersona {
  name: string;
  email: string;
  role: string;
  badge: string;
}

const DEMO_BUYERS: DemoPersona[] = [
  { name: 'Ramesh (Sunrise RWA)', email: 'secretary@sunrise.test', role: 'Community Secretary', badge: 'Community' },
  { name: 'K. Murugesan', email: 'owner@kovaiprecision.test', role: 'MSME Owner', badge: 'MSME' },
  { name: 'S. Rangarajan', email: 'procurement@srilakshmi.test', role: 'Enterprise Lead', badge: 'Enterprise' },
  { name: 'Bharathi Selvan', email: 'bharathi@agrotrade.test', role: 'Individual Buyer', badge: 'Individual' },
  { name: 'QA Test Buyer', email: 'qa-buyer@otp.test', role: 'Test Account', badge: 'QA' },
];

interface SupplierCategoryGroup {
  category: string;
  icon: string;
  suppliers: DemoPersona[];
}

const DEMO_SUPPLIER_GROUPS: SupplierCategoryGroup[] = [
  {
    category: '☀️ Solar Energy (01 – 04)',
    icon: '☀️',
    suppliers: [
      { name: 'SunPower Tech', email: 'solar01@otpdemo.test', role: 'Rooftop Solar & EPC', badge: 'Solar 01' },
      { name: 'Aditya Solar', email: 'solar02@otpdemo.test', role: 'Hybrid Inverters & Panels', badge: 'Solar 02' },
      { name: 'EcoGreen Solar', email: 'solar03@otpdemo.test', role: 'Bifacial Mono PERC MW', badge: 'Solar 03' },
      { name: 'Surya Shakti', email: 'solar04@otpdemo.test', role: 'Commercial Solar & Heaters', badge: 'Solar 04' },
    ],
  },
  {
    category: '📹 CCTV & Security (01 – 04)',
    icon: '📹',
    suppliers: [
      { name: 'SecureVision CCTV', email: 'cctv01@otpdemo.test', role: '4K IP Surveillance & NVR', badge: 'CCTV 01' },
      { name: 'Falcon Eye Security', email: 'cctv02@otpdemo.test', role: 'AI Biometrics & Access Control', badge: 'CCTV 02' },
      { name: 'Optima Guard Security', email: 'cctv03@otpdemo.test', role: 'Video Wall & Intrusion Alarms', badge: 'CCTV 03' },
      { name: 'Sentinel Surveillance', email: 'cctv04@otpdemo.test', role: 'RWA & Apartment CCTV', badge: 'CCTV 04' },
    ],
  },
  {
    category: '🪑 Furniture & Workstations (01 – 04 + Specialized)',
    icon: '🪑',
    suppliers: [
      { name: 'UrbanSpace Modular Workstations', email: 'sales@urbanspace-interiors.test', role: 'Owner (Office Workstations & Chairs)', badge: 'UrbanSpace' },
      { name: 'Classic Interiors', email: 'furniture01@otpdemo.test', role: 'Modular Cubicles & Mesh Chairs', badge: 'Furniture 01' },
      { name: 'ErgoDesign Office', email: 'furniture02@otpdemo.test', role: 'BIFMA Ergonomic Chairs & Desks', badge: 'Furniture 02' },
      { name: 'WoodCraft Desks', email: 'furniture03@otpdemo.test', role: 'Executive Suites & Tables', badge: 'Furniture 03' },
      { name: 'SteelForm Storage', email: 'furniture04@otpdemo.test', role: 'Metal Storage & Compactors', badge: 'Furniture 04' },
      { name: 'Royal Teak Solutions', email: 'info@royalteak-furniture.test', role: 'Home & Office Furnishing', badge: 'Royal Teak' },
      { name: 'SocietyComfort Seating', email: 'orders@societycomfort.test', role: 'RWA & Outdoor Seating', badge: 'SocietyComfort' },
    ],
  },
  {
    category: '💧 Water Filters & Commercial RO (01 – 04)',
    icon: '💧',
    suppliers: [
      { name: 'PureAqua Commercial', email: 'water01@otpdemo.test', role: 'Commercial RO & Water Filters', badge: 'Water 01' },
      { name: 'HydroClear Filtration', email: 'water02@otpdemo.test', role: 'Industrial Water Softeners & DM', badge: 'Water 02' },
      { name: 'Zenith Water Systems', email: 'water03@otpdemo.test', role: 'Institutional Coolers & UV/UF', badge: 'Water 03' },
      { name: 'AquaPure Commercial', email: 'water04@otpdemo.test', role: 'Industrial WTP & STP Plants', badge: 'Water 04' },
    ],
  },
  {
    category: '🔥 Gas Pipeline & Piping (01 – 04)',
    icon: '🔥',
    suppliers: [
      { name: 'GasTech Piping', email: 'gas01@otpdemo.test', role: 'Industrial LPG & PNG Piping', badge: 'Gas 01' },
      { name: 'Bharat Gas Piping', email: 'gas02@otpdemo.test', role: 'Commercial Kitchen Manifolds', badge: 'Gas 02' },
      { name: 'IndoGas Pipelines', email: 'gas03@otpdemo.test', role: 'High-Pressure Lines & PESO', badge: 'Gas 03' },
      { name: 'Premier Gas Systems', email: 'gas04@otpdemo.test', role: 'Reticulation & Utility Works', badge: 'Gas 04' },
    ],
  },
  {
    category: '⚡ Electrical & Facility',
    icon: '⚡',
    suppliers: [
      { name: 'A1 Electricals', email: 'supplier01@otpdemo.test', role: 'Rewinding & Motors', badge: 'Electrical 01' },
      { name: 'Apex Facility', email: 'supplier02@otpdemo.test', role: 'Facility Maintenance', badge: 'Facility 02' },
    ],
  },
];

function sanitizeRedirectTarget(rawParam: string | null): string | null {
  if (!rawParam) return null;
  let decoded = rawParam;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch {
    decoded = rawParam;
  }
  if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.startsWith('/login')) {
    return decoded;
  }
  return null;
}

export function SignInForm({
  onRegister,
  autoFocus = false,
}: {
  onRegister?: () => void;
  autoFocus?: boolean;
}) {
  const {
    signIn,
    sendSignInCode,
    verifySignInCode,
    rememberDevice,
    resetPasswordForEmail,
    requestPasswordResetWhatsApp,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  // Default to password method for instant development and demo convenience
  const [method, setMethod] = useState<Method>('password');
  const [email, setEmail] = useState(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('identifier') || params.get('email');
    if (id && id.includes('@')) return id;
    return '';
  });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('forgot') === '1';
  });
  const [resetChannel, setResetChannel] = useState<'WHATSAPP' | 'EMAIL'>(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('identifier') || params.get('email') || params.get('phone');
    if (id && id.includes('@')) return 'EMAIL';
    return 'WHATSAPP';
  });
  const [resetPhone, setResetPhone] = useState(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('identifier') || params.get('phone');
    if (id && !id.includes('@')) return id;
    return '';
  });
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    async function checkDemo() {
      const status = await fetchDemoStatus();
      setDemoEnabled(status.enabled);
    }
    void checkDemo();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('forgot') === '1') {
      setIsResettingPassword(true);
      const id = params.get('identifier') || params.get('email') || params.get('phone');
      if (id) {
        if (id.includes('@')) {
          setResetChannel('EMAIL');
          setEmail(id);
        } else {
          setResetChannel('WHATSAPP');
          setResetPhone(id);
        }
      }
    }
  }, [location.search]);

  async function handleSendResetLink() {
    setError(null);
    setBusy(true);

    if (resetChannel === 'WHATSAPP') {
      const cleanPhone = resetPhone.trim();
      if (!cleanPhone) {
        setError('Please enter your registered phone number.');
        setBusy(false);
        return;
      }
      const res = await requestPasswordResetWhatsApp(cleanPhone);
      setBusy(false);
      if (!res.ok) {
        setError(res.error || 'Failed to send WhatsApp verification code.');
        return;
      }
      setResetSent(true);
      setTimeout(() => {
        navigate(`/reset-password?identifier=${encodeURIComponent(cleanPhone)}`);
      }, 1800);
    } else {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        setError('Please enter your work email address first.');
        setBusy(false);
        return;
      }
      const res = await resetPasswordForEmail(normalizedEmail);
      setBusy(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResetSent(true);
    }
  }

  function chooseMethod(next: Method) {
    setMethod(next);
    setError(null);
    setNotice(null);
    setCodeSent(false);
    setCode('');
  }

  async function handleQuickDemoSignIn(personaEmail: string) {
    setEmail(personaEmail);
    setPassword('password');
    setMethod('password');
    setBusy(true);
    setError(null);
    rememberDevice(true);

    const result = await signIn(personaEmail, 'password');
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const validRedirect = sanitizeRedirectTarget(searchParams.get('redirect'));

    const isSupplierEmail =
      personaEmail.includes('solar') ||
      personaEmail.includes('furniture') ||
      personaEmail.includes('cctv') ||
      personaEmail.includes('water') ||
      personaEmail.includes('borewell') ||
      personaEmail.includes('supplier') ||
      personaEmail.includes('urbanspace') ||
      personaEmail.includes('otpdemo.test') ||
      personaEmail.includes('royalteak') ||
      personaEmail.includes('societycomfort');

    if (validRedirect) {
      navigate(validRedirect, { replace: true });
    } else if (isSupplierEmail) {
      navigate('/supplier/purchase-orders', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }

  async function requestCode() {
    setBusy(true);
    setError(null);
    let normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === 'admin@otp.ai' || normalizedEmail === 'ops@otp.ai' || normalizedEmail === 'ops@otp.test') {
      normalizedEmail = 'admin@otp.test';
    }
    const result = await sendSignInCode(normalizedEmail);
    setBusy(false);
    if (result.error) {
      setError(describeCodeError(result.error));
      return;
    }
    setCodeSent(true);
    setNotice(`We sent an eight-digit code to ${normalizedEmail}. It expires in a few minutes.`);
  }

  async function submit() {
    rememberDevice(remember);
    setBusy(true);
    setError(null);

    let normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === 'admin@otp.ai' || normalizedEmail === 'ops@otp.ai' || normalizedEmail === 'ops@otp.test') {
      normalizedEmail = 'admin@otp.test';
    }

    const result =
      method === 'password'
        ? await signIn(normalizedEmail, password)
        : await verifySignInCode(normalizedEmail, code);

    setBusy(false);

    if (result.error) {
      setError(
        method === 'code'
          ? 'That code did not match, or it has expired. Ask for a new one.'
          : result.error,
      );
      return;
    }

    const searchParams = new URLSearchParams(location.search);
    const validRedirect = sanitizeRedirectTarget(searchParams.get('redirect'));

    const isSupplierEmail =
      normalizedEmail.includes('solar') ||
      normalizedEmail.includes('furniture') ||
      normalizedEmail.includes('cctv') ||
      normalizedEmail.includes('water') ||
      normalizedEmail.includes('borewell') ||
      normalizedEmail.includes('supplier') ||
      normalizedEmail.includes('royalteak') ||
      normalizedEmail.includes('urbanspace') ||
      normalizedEmail.includes('societycomfort') ||
      (normalizedEmail.startsWith('contact') && normalizedEmail.endsWith('@otpdemo.test'));

    if (validRedirect) {
      navigate(validRedirect, { replace: true });
    } else if (
      isSuperAdminEmail(normalizedEmail) ||
      normalizedEmail === 'bvnbasu@gmail.com' ||
      normalizedEmail === 'admin@otp.test' ||
      normalizedEmail === 'ops@otp.test'
    ) {
      navigate('/admin', { replace: true });
    } else if (isSupplierEmail) {
      navigate('/supplier/purchase-orders', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  }

  return (
    <div className="space-y-5">
      {/* 1-Click Demo Accounts Switcher (Only visible in Demo/Staging mode) */}
      {demoEnabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 p-3.5 text-xs space-y-2.5" data-testid="demo-quick-login">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1">
              <span>⚡</span> 1-Tap Demo Switcher
            </span>
            <span className="text-[9px] text-muted-foreground font-semibold">Instant Sign In</span>
          </div>

          <div className="space-y-2">
            <div>
              <span className="text-[10px] font-bold text-muted-foreground block mb-1">
                Buyer Personas:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_BUYERS.map((p) => (
                  <button
                    key={p.email}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleQuickDemoSignIn(p.email)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-card px-2.5 py-1.5 text-[11px] font-semibold border border-amber-300/80 shadow-2xs hover:bg-amber-100/60 transition active:scale-95"
                    title={`${p.role} (${p.email})`}
                  >
                    <span className="font-bold text-foreground">{p.name}</span>
                    <span className="text-[9px] rounded-full bg-muted px-1.5 py-0.2 text-muted-foreground font-bold">{p.badge}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 border-t border-amber-200/60 pt-2">
              <span className="text-[10px] font-bold text-muted-foreground block">
                Verified Suppliers (1-Tap):
              </span>
              {DEMO_SUPPLIER_GROUPS.map((group) => (
                <div key={group.category} className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground block">
                    {group.category}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {group.suppliers.map((p) => (
                      <button
                        key={p.email}
                        type="button"
                        disabled={busy}
                        onClick={() => void handleQuickDemoSignIn(p.email)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-card px-2.5 py-1.5 text-[11px] font-semibold border border-emerald-300/80 shadow-2xs hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition text-emerald-900 dark:text-emerald-300 active:scale-95"
                        title={`${p.role} (${p.email})`}
                      >
                        <span className="font-bold">{p.name}</span>
                        <span className="text-[9px] rounded-full bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.2 text-emerald-800 dark:text-emerald-300 font-bold">{p.badge}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isResettingPassword ? (
        <div className="space-y-4 rounded-lg border bg-card/60 p-4" data-testid="forgot-password-panel">
          <div>
            <h3 className="text-base font-semibold text-foreground">Reset your password</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose your preferred channel to receive an 8-digit verification code.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setResetChannel('WHATSAPP');
                setError(null);
              }}
              className={`rounded-lg border p-2.5 text-xs font-semibold transition text-left ${
                resetChannel === 'WHATSAPP'
                  ? 'border-emerald-600 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 ring-1 ring-emerald-500'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <span>💬</span> WhatsApp
              </div>
              <span className="text-[11px] text-muted-foreground block mt-0.5">Instant code to your phone</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setResetChannel('EMAIL');
                setError(null);
              }}
              className={`rounded-lg border p-2.5 text-xs font-semibold transition text-left ${
                resetChannel === 'EMAIL'
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <span>📧</span> Work Email
              </div>
              <span className="text-[11px] text-muted-foreground block mt-0.5">Reset link &amp; code</span>
            </button>
          </div>

          {resetSent ? (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-900 space-y-2">
              <p className="font-bold flex items-center gap-1.5">
                <span>✓</span> {resetChannel === 'WHATSAPP' ? 'Verification Code Sent to WhatsApp!' : 'Password Reset Email Sent!'}
              </p>
              <p className="text-emerald-800">
                {resetChannel === 'WHATSAPP' ? (
                  <>We sent an 8-digit verification code to WhatsApp on <strong>{resetPhone}</strong>. Redirecting to set new password...</>
                ) : (
                  <>Check your inbox at <strong>{email}</strong>. Click the link in the email or enter the 8-digit code on the reset page.</>
                )}
              </p>
              <div className="flex items-center gap-3 pt-1">
                <Link
                  to={`/reset-password?identifier=${encodeURIComponent(resetChannel === 'WHATSAPP' ? resetPhone : email)}`}
                  className="inline-flex items-center gap-1 font-bold text-action hover:underline"
                >
                  Enter 8-Digit Code Now →
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setIsResettingPassword(false);
                    setResetSent(false);
                  }}
                  className="text-muted-foreground hover:underline"
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendResetLink();
              }}
              className="space-y-3.5"
            >
              {error && (
                <p className="text-xs text-red-600" role="alert">
                  {error}
                </p>
              )}

              {resetChannel === 'WHATSAPP' ? (
                <Field label="Registered Phone Number" required help="Your WhatsApp mobile number (e.g. +91 98765 43210)">
                  {({ id, describedBy, invalid }) => (
                    <input
                      id={id}
                      aria-describedby={describedBy}
                      type="tel"
                      value={resetPhone}
                      onChange={(e) => setResetPhone(e.target.value)}
                      className={controlClasses(invalid)}
                      placeholder="+91 98765 43210"
                      required
                      autoFocus
                    />
                  )}
                </Field>
              ) : (
                <Field label="Work Email" required help="Registered business email">
                  {({ id, describedBy, invalid }) => (
                    <input
                      id={id}
                      aria-describedby={describedBy}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
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
                busyLabel={resetChannel === 'WHATSAPP' ? 'Sending code via WhatsApp…' : 'Sending reset link…'}
                className="w-full"
              >
                {resetChannel === 'WHATSAPP' ? 'Send Reset Code via WhatsApp →' : 'Send Password Reset Link →'}
              </Button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setIsResettingPassword(false);
                    setError(null);
                  }}
                  className="text-muted-foreground hover:text-foreground font-semibold"
                >
                  ← Return to Sign In
                </button>
                <Link
                  to="/reset-password"
                  className="text-action hover:underline"
                >
                  Already have an 8-digit code? →
                </Link>
              </div>
            </form>
          )}
        </div>
      ) : (
        <form
          data-testid="sign-in-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (method === 'code' && !codeSent) void requestCode();
            else void submit();
          }}
          className="space-y-3.5"
        >
          <div
          role="radiogroup"
          aria-label="How to sign in"
          className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs"
        >
          {(
            [
              ['password', 'Use a password'],
              ['code', 'Email me a code'],
            ] as [Method, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={method === value}
              onClick={() => chooseMethod(value)}
              data-testid={`sign-in-method-${value}`}
              className={`rounded px-2.5 py-1.5 ${
                method === value ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Field label="Work email" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus={autoFocus}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (codeSent) chooseMethod('code');
              }}
              className={controlClasses(invalid)}
              required
            />
        )}
      </Field>

      {method === 'password' && (
        <Field label="Password" required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={controlClasses(invalid)}
              required
            />
          )}
        </Field>
      )}

      {method === 'code' && codeSent && (
        <Field label="Eight-digit code" required help="Check your inbox, including spam.">
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className={controlClasses(invalid, 'tracking-[0.3em]')}
              data-testid="otp-code"
              placeholder="Enter 8-digit code"
              required
            />
          )}
        </Field>
      )}

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
          className="mt-0.5"
          data-testid="remember-device"
        />
        <span>
          Remember this device. Leave it unchecked on a shared computer and you will be signed
          out when the tab closes.
        </span>
      </label>

      {notice && !error && (
        <p className="text-xs text-muted-foreground" data-testid="sign-in-notice">
          {notice}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600" data-testid="login-error" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="action"
        size="lg"
        busy={busy}
        busyLabel={method === 'code' && !codeSent ? 'Sending…' : 'Signing in…'}
        className="w-full"
      >
        {method === 'code' ? (codeSent ? 'Sign in' : 'Send me a code') : 'Sign in'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        {method === 'code' && codeSent ? (
          <button
            type="button"
            onClick={() => void requestCode()}
            className="text-action hover:underline"
          >
            Send another code
          </button>
        ) : method === 'password' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsResettingPassword(true);
                setError(null);
              }}
              className="text-action hover:underline font-medium"
            >
              Forgot password?
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => chooseMethod('code')}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Sign in with code
            </button>
          </div>
        ) : (
          <span className="text-muted-foreground">
            No password needed.
          </span>
        )}
        {onRegister && (
          <button type="button" onClick={onRegister} className="text-action hover:underline">
            Register instead
          </button>
        )}
      </div>
    </form>
    )}
  </div>
  );
}

/**
 * The one error worth rewording.
 *
 * Supabase says "Signups not allowed for otp" when the address has no account.
 * Repeated verbatim it reads as a platform fault, when the actual situation is
 * that the person needs to register — the one thing they can do about it.
 */
function describeCodeError(message: string): string {
  if (/signups not allowed/i.test(message)) {
    return 'We could not find an account for that email. Register your organisation first, or check the address.';
  }
  if (/rate limit|too many/i.test(message)) {
    return 'Too many codes requested. Wait a minute before trying again.';
  }
  return message;
}
