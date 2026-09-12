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

  // Click outside and ESC listener to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
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
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label="One-tap demo persona switcher"
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
        <>
          {/* Backdrop Overlay to ensure 100% solid contrast without background bleed-through */}
          <div
            className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div
            role="dialog"
            aria-label="One-Tap Demo Switcher"
            className="fixed inset-x-3 top-16 z-50 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-88 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-card text-card-foreground p-3 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-150"
            data-testid="demo-persona-dropdown"
          >
            {/* Popover Header */}
            <div className="flex items-center justify-between border-b border-border pb-2 px-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🎭</span>
                <p className="text-xs font-black text-foreground">One-Tap Demo Switcher</p>
              </div>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[9px] font-extrabold text-primary border border-primary/20">
                Pre-Loaded Scenarios
              </span>
            </div>

            {/* Persona Selection Buttons */}
            <div className="mt-2.5 space-y-2">
              {DEMO_PERSONAS.map((p) => {
                const isCurrent = activePersonaId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void handleSelectPersona(p)}
                    className={`w-full rounded-lg border p-2.5 text-left transition flex items-start gap-2.5 ${
                      isCurrent
                        ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                        : 'border-border bg-background hover:bg-muted text-foreground shadow-2xs'
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base shadow-2xs border border-border">
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
                      <p className="text-[10px] text-primary dark:text-primary-foreground/90 truncate font-semibold mt-0.5">
                        ⚡ {p.scenario}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Popover Footer */}
            <div className="mt-2.5 -mx-3 -mb-3 rounded-b-xl border-t border-border bg-muted/60 px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Instant 1-tap sign-in with full test datasets</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-primary font-bold hover:underline ml-2 shrink-0"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
