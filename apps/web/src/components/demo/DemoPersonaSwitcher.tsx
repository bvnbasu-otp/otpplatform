import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';

export interface PersonaOption {
  id: 'buyer' | 'voter' | 'supplier';
  title: string;
  shortLabel: string;
  roleDescription: string;
  icon: string;
  email: string;
  scenario: string;
  targetRoute: string;
  badgeClass: string;
}

export const DEMO_PERSONAS: PersonaOption[] = [
  {
    id: 'buyer',
    title: 'Buyer (Community Lead)',
    shortLabel: 'Buyer',
    roleDescription: 'Sunrise RWA Management Committee',
    icon: '🏢',
    email: 'secretary@sunrise.test',
    scenario: '10 kW Solar & CCTV Procurement Pipeline',
    targetRoute: '/dashboard',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/80 dark:text-indigo-300',
  },
  {
    id: 'voter',
    title: 'Committee Voter',
    shortLabel: 'Voter',
    roleDescription: 'Greenview Heights Voting Member',
    icon: '🏛️',
    email: 'qa-buyer@otp.test',
    scenario: 'Active Quorum & Sealed Merit Evaluation Ballot',
    targetRoute: '/dashboard',
    badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/80 dark:text-cyan-300',
  },
  {
    id: 'supplier',
    title: 'Verified Supplier',
    shortLabel: 'Supplier',
    roleDescription: 'SunPower Tech (MSME Rooftop Solar)',
    icon: '📦',
    email: 'solar01@otpdemo.test',
    scenario: 'Received RFQs & Instant WhatsApp Direct Quoting',
    targetRoute: '/supplier/dashboard',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300',
  },
];

export function DemoPersonaSwitcher() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [activePersonaId, setActivePersonaId] = useState<'buyer' | 'voter' | 'supplier' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect active persona from current user email
  useEffect(() => {
    if (!user?.email) {
      setActivePersonaId(null);
      return;
    }
    const email = user.email.toLowerCase();
    if (email.includes('solar') || email.includes('furniture') || email.includes('cctv') || email.includes('supplier') || email.includes('urbanspace')) {
      setActivePersonaId('supplier');
    } else if (email.includes('qa-buyer') || email.includes('committee') || email.includes('voter') || email.includes('treasurer')) {
      setActivePersonaId('voter');
    } else {
      setActivePersonaId('buyer');
    }
  }, [user]);

  // Click outside listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const activePersona = DEMO_PERSONAS.find((p) => p.id === activePersonaId);

  const handleSelectPersona = async (persona: PersonaOption) => {
    setIsSwitching(true);
    setIsOpen(false);
    try {
      const res = await signIn(persona.email, 'password');
      if (res.error) {
        // Fallback: In development or staging, try alternative test password
        await signIn(persona.email, '@dm!n123');
      }
      navigate(persona.targetRoute);
    } catch {
      navigate(persona.targetRoute);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Pill Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={isSwitching}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition shadow-2xs hover:shadow-xs active:scale-95 ${
          activePersona
            ? activePersona.badgeClass
            : 'bg-muted/70 text-foreground border-border hover:bg-muted'
        }`}
        title="Swap between Buyer, Committee Voter, and Supplier demo personas"
        data-testid="demo-persona-switcher-btn"
      >
        <span className="text-xs">{activePersona?.icon || '🎭'}</span>
        <span className="hidden xs:inline text-[11px]">
          {isSwitching ? 'Switching…' : activePersona ? activePersona.shortLabel : 'Demo Mode'}
        </span>
        <span className="text-[10px] text-muted-foreground/80 font-normal">▾</span>
      </button>

      {/* Popover / Dropdown Menu */}
      {isOpen && (
        <div
          className="fixed inset-x-3 top-14 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1.5 w-auto sm:w-80 rounded-2xl border bg-card/98 p-2.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95"
          data-testid="demo-persona-dropdown"
        >
          <div className="flex items-center justify-between border-b pb-2 px-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🎭</span>
              <p className="text-xs font-black text-foreground">One-Tap Demo Switcher</p>
            </div>
            <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[9px] font-extrabold text-primary">
              Pre-Loaded Scenarios
            </span>
          </div>

          <div className="mt-2 space-y-1.5">
            {DEMO_PERSONAS.map((p) => {
              const isCurrent = activePersonaId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void handleSelectPersona(p)}
                  className={`w-full rounded-xl border p-2.5 text-left transition flex items-start gap-2.5 ${
                    isCurrent
                      ? 'border-primary ring-1 ring-primary/40 bg-primary/5'
                      : 'border-border/60 hover:border-border hover:bg-muted/40'
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                    {p.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-foreground truncate">{p.title}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 px-1.5 py-0.2 text-[9px] font-extrabold shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-medium truncate mt-0.5">
                      {p.roleDescription}
                    </p>
                    <p className="text-[10px] text-primary/80 truncate font-semibold mt-0.5">
                      ⚡ {p.scenario}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-2 border-t pt-2 px-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Instant 1-tap sign-in with full test datasets</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-primary font-bold hover:underline"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
