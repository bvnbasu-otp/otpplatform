import React, { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { OtpLogo } from '@/components/ui/OtpLogo';
import { PRODUCT_NAME } from '@/lib/brand';

export interface MobileSimulatorFrameProps {
  children: ReactNode;
}

export function MobileSimulatorFrame({ children }: MobileSimulatorFrameProps) {
  const [currentTime, setCurrentTime] = useState('9:41');

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours % 12 || 12}:${minutes}`);
    }
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen max-h-screen h-dvh max-h-dvh w-full overflow-hidden bg-background sm:bg-slate-950 text-foreground flex flex-col items-center justify-between relative selection:bg-primary/20 selection:text-primary">
      {/* ------------------------------------------------------------------ */}
      {/* 1. DESKTOP AMBIENT BACKDROP (Visible only on >= 640px)             */}
      {/* ------------------------------------------------------------------ */}
      <div className="hidden sm:block absolute inset-0 pointer-events-none overflow-hidden">
        {/* Soft Radial Ambient Glow matching Theme & Brand */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[900px] bg-gradient-to-tr from-primary/15 via-emerald-500/5 to-primary/10 rounded-full blur-3xl opacity-60" />
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. DESKTOP AMBIENT META BAR (Visible only on >= 640px)             */}
      {/* ------------------------------------------------------------------ */}
      <header className="hidden sm:flex shrink-0 z-30 w-full max-w-6xl items-center justify-between px-6 py-2 text-xs text-slate-300">
        {/* Brand & Platform Identity */}
        <div className="flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <OtpLogo size={24} />
            <span className="font-extrabold text-white tracking-tight text-sm">
              {PRODUCT_NAME}
            </span>
          </Link>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 font-medium hidden md:inline">
            Identity-Protected Procurement Platform
          </span>
        </div>

        {/* Dimension & Live Cockpit Badge */}
        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1 rounded-full shadow-inner">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="font-mono text-[11px] font-bold text-slate-200">
            Procurement Cockpit
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 3. CENTERED MOBILE PHONE CONTAINER (COCKPIT)                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative w-full sm:max-w-[430px] sm:w-[412px] h-full sm:h-[93vh] sm:max-h-[915px] sm:my-auto flex flex-col z-20">
        {/* Physical Titanium Shell Outer Border & Shadow (Desktop Only) */}
        <div className="relative w-full h-full sm:rounded-[42px] sm:border-[6px] sm:border-slate-800/90 sm:bg-slate-900 sm:shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.1)_inset] flex flex-col overflow-hidden sm:ring-1 sm:ring-white/10">
          
          {/* Simulated Outer Side Buttons (Desktop Only) */}
          <div className="hidden sm:block absolute -left-[8px] top-[100px] w-[3px] h-[32px] bg-slate-700 rounded-l-sm pointer-events-none" />
          <div className="hidden sm:block absolute -left-[8px] top-[145px] w-[3px] h-[48px] bg-slate-700 rounded-l-sm pointer-events-none" />
          <div className="hidden sm:block absolute -right-[8px] top-[120px] w-[3px] h-[60px] bg-slate-700 rounded-r-sm pointer-events-none" />

          {/* Inner Screen Display Viewport */}
          <div className="relative w-full h-full bg-background flex flex-col overflow-hidden sm:rounded-[36px] sm:transform-gpu sm:[transform:translate3d(0,0,0)] [contain:paint]">
            
            {/* Top Hardware Dynamic Island & Status Bar (Desktop Only) */}
            <div className="hidden sm:flex shrink-0 h-8 w-full px-5 pt-1.5 items-center justify-between text-[11px] font-semibold text-foreground z-40 bg-background/95 backdrop-blur-xs select-none border-b border-border/40">
              <span className="tabular-nums font-bold text-xs">{currentTime}</span>

              {/* Dynamic Island Capsule */}
              <div className="flex items-center gap-1.5 px-3 py-0.5 bg-black text-white rounded-full text-[9px] font-medium shadow-xs border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="tracking-tight text-[10px] font-bold">OTP Active</span>
              </div>

              {/* Status Icons: 5G & Battery */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="text-[10px]">5G</span>
                <span className="text-[10px]">📶</span>
                <span className="text-[10px] font-mono font-bold">🔋</span>
              </div>
            </div>

            {/* Application Inside Viewport */}
            <div className="relative w-full h-full flex-1 min-h-0 flex flex-col overflow-hidden sm:transform-gpu sm:[transform:translate3d(0,0,0)] [contain:paint]">
              {children}
            </div>

            {/* Bottom iOS Home Indicator Pill (Desktop Only) */}
            <div className="hidden sm:flex shrink-0 h-4 w-full items-center justify-center bg-card pb-0.5 select-none pointer-events-none border-t border-border/30">
              <div className="w-28 h-1 bg-muted-foreground/30 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 4. DESKTOP AMBIENT FOOTER (Visible only on >= 640px)               */}
      {/* ------------------------------------------------------------------ */}
      <footer className="hidden sm:flex shrink-0 z-30 w-full max-w-6xl items-center justify-between px-6 py-1.5 text-[11px] text-slate-500">
        <div>
          © {new Date().getFullYear()} {PRODUCT_NAME} Platform · Built 100% Mobile-First for India B2B Procurement
        </div>
        <div className="flex items-center gap-3">
          <Link to="/faqs" className="hover:text-slate-300 transition">FAQs</Link>
          <Link to="/pricing" className="hover:text-slate-300 transition">Pricing</Link>
          <Link to="/legal/terms" className="hover:text-slate-300 transition">Terms</Link>
          <Link to="/legal/privacy" className="hover:text-slate-300 transition">Privacy</Link>
          <Link to="/legal/disclaimer" className="hover:text-slate-300 transition">Direct-Settlement</Link>
        </div>
      </footer>
    </div>
  );
}
