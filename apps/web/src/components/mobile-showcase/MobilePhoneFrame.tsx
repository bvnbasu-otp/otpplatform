import React, { type ReactNode } from 'react';

export interface MobilePhoneFrameProps {
  children: ReactNode;
  title?: string;
  badge?: string;
  badgeColor?: string;
  subtitle?: string;
  time?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  activeTab?: 'home' | 'orders' | 'new' | 'audit' | 'profile';
  onTabClick?: (tab: 'home' | 'orders' | 'new' | 'audit' | 'profile') => void;
  showNav?: boolean;
}

export function MobilePhoneFrame({
  children,
  title,
  badge,
  badgeColor = 'bg-primary/20 text-primary border-primary/30',
  subtitle,
  time = '9:41',
  className = '',
  size = 'md',
  activeTab = 'home',
  onTabClick,
  showNav = true,
}: MobilePhoneFrameProps) {
  const sizeStyles = {
    sm: 'w-[280px] h-[580px] rounded-[36px] p-2.5',
    md: 'w-[340px] sm:w-[360px] h-[720px] rounded-[44px] p-3',
    lg: 'w-[380px] h-[780px] rounded-[48px] p-3.5',
  }[size];

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Optional Screen Title & Badge Above Phone */}
      {(title || badge) && (
        <div className="mb-3 text-center px-2">
          <div className="flex items-center justify-center gap-2">
            {badge && (
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${badgeColor}`}>
                {badge}
              </span>
            )}
            {title && (
              <h4 className="text-sm sm:text-base font-extrabold text-foreground tracking-tight">
                {title}
              </h4>
            )}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Realistic Titanium / Matte Device Outer Shell */}
      <div
        className={`relative ${sizeStyles} bg-slate-900 dark:bg-black shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.1)_inset] border-[4px] border-slate-700/80 dark:border-slate-800 transition-all duration-300`}
      >
        {/* Outer Phone Volume / Power Buttons (CSS Accents) */}
        <div className="absolute -left-[7px] top-[100px] w-[3px] h-[32px] bg-slate-600 rounded-l-sm" />
        <div className="absolute -left-[7px] top-[145px] w-[3px] h-[50px] bg-slate-600 rounded-l-sm" />
        <div className="absolute -right-[7px] top-[120px] w-[3px] h-[65px] bg-slate-600 rounded-r-sm" />

        {/* Inner Screen Display */}
        <div className="relative w-full h-full bg-background rounded-[34px] overflow-hidden flex flex-col select-none border border-black/10 dark:border-white/5 sm:transform-gpu sm:[transform:translate3d(0,0,0)] [contain:paint]">
          {/* Top Status Bar with Dynamic Island */}
          <div className="shrink-0 h-10 w-full px-5 pt-2 flex items-center justify-between text-[11px] font-semibold text-foreground z-30 bg-background/90 backdrop-blur-xs">
            <span className="tabular-nums font-bold text-xs">{time}</span>

            {/* Dynamic Island Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-black text-white rounded-full text-[9px] font-medium shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="tracking-tight text-[10px] font-bold">OTP Active</span>
            </div>

            {/* Signal & Battery Icons */}
            <div className="flex items-center gap-1.5 text-xs">
              <span>📶</span>
              <span>5G</span>
              <span className="text-[10px]">🔋</span>
            </div>
          </div>

          {/* Phone Screen Scrollable Body Content */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-background flex flex-col relative scrollbar-none">
            {children}
          </div>

          {/* Integrated Mock Phone Bottom Navigation (PhonePe / Swiggy Style) */}
          {showNav && (
            <div className="shrink-0 border-t border-border/70 bg-card/95 backdrop-blur-md px-2 py-1.5 flex items-center justify-around z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
              <button
                type="button"
                onClick={() => onTabClick?.('home')}
                className={`flex flex-col items-center flex-1 py-0.5 transition ${
                  activeTab === 'home' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-base">🏠</span>
                <span className="text-[9px] mt-0.5">Home</span>
              </button>

              <button
                type="button"
                onClick={() => onTabClick?.('orders')}
                className={`flex flex-col items-center flex-1 py-0.5 transition ${
                  activeTab === 'orders' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-base">📋</span>
                <span className="text-[9px] mt-0.5">Orders</span>
              </button>

              <button
                type="button"
                onClick={() => onTabClick?.('new')}
                className="relative -top-2 flex flex-col items-center justify-center shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 active:scale-95 transition"
                title="New Requirement"
              >
                <span className="text-lg font-black leading-none">+</span>
              </button>

              <button
                type="button"
                onClick={() => onTabClick?.('audit')}
                className={`flex flex-col items-center flex-1 py-0.5 transition ${
                  activeTab === 'audit' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-base">🛡️</span>
                <span className="text-[9px] mt-0.5">Quotes</span>
              </button>

              <button
                type="button"
                onClick={() => onTabClick?.('profile')}
                className={`flex flex-col items-center flex-1 py-0.5 transition ${
                  activeTab === 'profile' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-base">👤</span>
                <span className="text-[9px] mt-0.5">Profile</span>
              </button>
            </div>
          )}

          {/* Bottom iOS Home Indicator Bar */}
          <div className="shrink-0 h-4 w-full flex items-center justify-center bg-card pb-1">
            <div className="w-28 h-1 bg-slate-400/50 dark:bg-slate-600 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
