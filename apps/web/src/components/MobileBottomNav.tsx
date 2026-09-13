import { NavLink, useLocation } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';

export function MobileBottomNav() {
  const { context } = useRoleContext();
  const { pathname } = useLocation();

  const isSupplier = context.side === 'SUPPLIER';
  const isAdmin = context.isPlatformAdmin;
  const isAuthenticated = Boolean(context.email);

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed sm:absolute bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border/80 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14 w-full max-w-md mx-auto px-2">
        {/* TAB 1: HOME */}
        <NavLink
          to={isAuthenticated ? (isAdmin ? '/admin' : '/dashboard') : '/'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 transition ${
              isActive || (pathname === '/' && !isAuthenticated) || (pathname === '/dashboard' && isAuthenticated)
                ? 'text-primary font-bold'
                : 'text-muted-foreground hover:text-foreground font-medium'
            }`
          }
        >
          <span className="text-lg leading-none">🏠</span>
          <span className="text-[10px] mt-0.5 tracking-tight">Home</span>
        </NavLink>

        {/* TAB 2: ORDERS / BROWSE */}
        <NavLink
          to={isSupplier ? '/supplier/purchase-orders' : isAuthenticated ? '/purchase-orders' : '/#how-it-works'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 transition ${
              isActive
                ? 'text-primary font-bold'
                : 'text-muted-foreground hover:text-foreground font-medium'
            }`
          }
        >
          <span className="text-lg leading-none">📋</span>
          <span className="text-[10px] mt-0.5 tracking-tight">{isAuthenticated ? 'Orders' : 'How it works'}</span>
        </NavLink>

        {/* TAB 3: CENTER ACTION (Elevated Primary CTA like PhonePe / Swiggy) */}
        <NavLink
          to="/requirements/new"
          className={({ isActive }) =>
            `relative -top-3 flex flex-col items-center justify-center shrink-0 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 active:scale-95 transition ${
              isActive ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
            }`
          }
          title="Create New Sourcing Requirement"
        >
          <span className="text-xl font-bold leading-none">+</span>
          <span className="sr-only">New Requirement</span>
        </NavLink>

        {/* TAB 4: AUDIT / QUOTES */}
        <NavLink
          to={isSupplier ? '/supplier/capabilities' : isAuthenticated ? '/audit' : '/pricing'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 transition ${
              isActive
                ? 'text-primary font-bold'
                : 'text-muted-foreground hover:text-foreground font-medium'
            }`
          }
        >
          <span className="text-lg leading-none">{isSupplier ? '🏷️' : isAuthenticated ? '🛡️' : '💳'}</span>
          <span className="text-[10px] mt-0.5 tracking-tight">
            {isSupplier ? 'Quotes' : isAuthenticated ? 'Audit' : 'Pricing'}
          </span>
        </NavLink>

        {/* TAB 5: PROFILE / LOGIN */}
        <NavLink
          to={isAuthenticated ? (isAdmin ? '/admin' : '/dashboard') : '/login'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-1 transition ${
              isActive && (pathname === '/login' || pathname === '/profile')
                ? 'text-primary font-bold'
                : 'text-muted-foreground hover:text-foreground font-medium'
            }`
          }
        >
          <span className="text-lg leading-none">👤</span>
          <span className="text-[10px] mt-0.5 tracking-tight">{isAuthenticated ? 'Profile' : 'Log In'}</span>
        </NavLink>
      </div>
    </nav>
  );
}
