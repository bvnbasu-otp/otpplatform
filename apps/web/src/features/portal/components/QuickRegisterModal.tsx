import React from 'react';
import { Link } from 'react-router-dom';
import { BottomSheet } from '@/components/ui/BottomSheet';

export interface QuickRegisterModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickRegisterModal({ open, onClose }: QuickRegisterModalProps) {
  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/15 text-primary font-black text-sm">
            ✨
          </span>
          <span className="font-extrabold text-foreground text-sm">
            Get Started with OTP
          </span>
        </div>
      }
      subtitle="Select your role to start identity-protected procurement or quoting in under 60 seconds."
      className="sm:max-w-lg"
    >
      <div className="space-y-4 text-xs" data-testid="quick-register-modal">
        {/* Buyer Option Card */}
        <div className="rounded-2xl border-2 border-primary/40 bg-card p-4 space-y-3 shadow-xs hover:border-primary transition">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary text-xl font-bold shrink-0">
                🏢
              </span>
              <div>
                <h4 className="font-extrabold text-foreground text-sm">
                  I am a Buyer / Institution
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  For RWAs, MSMEs, Facility Managers &amp; Enterprises
                </p>
              </div>
            </div>
            <span className="rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 shrink-0">
              Procurement
            </span>
          </div>

          <ul className="space-y-1.5 text-muted-foreground text-[11px] pt-1 border-t border-border/60">
            <li className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span>10-Second voice &amp; plain-text RFQ intake</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span>Identity-protected sealed quote matrix &amp; committee voting</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span>Instant GST Purchase Orders with live milestone tracking</span>
            </li>
          </ul>

          <div className="pt-1">
            <Link
              to="/signup?side=buyer"
              onClick={onClose}
              data-testid="quick-register-buyer-btn"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition text-xs active:scale-98 mobile-touch-target"
            >
              <span>Register as Buyer</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Supplier Option Card */}
        <div className="rounded-2xl border-2 border-purple-500/40 bg-card p-4 space-y-3 shadow-xs hover:border-purple-500 transition">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xl font-bold shrink-0">
                🚚
              </span>
              <div>
                <h4 className="font-extrabold text-foreground text-sm">
                  I am a Supplier / Contractor
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  For Verified Vendors, Fabricators &amp; Service Providers
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 shrink-0">
              ₹0 Free Forever
            </span>
          </div>

          <ul className="space-y-1.5 text-muted-foreground text-[11px] pt-1 border-t border-border/60">
            <li className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span>15-Second mobile quoting via WhatsApp &amp; Web</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span>Zero commissions, zero lead fees, 100% fair score ranking</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
              <span>Direct Purchase Orders and instant bank settlements</span>
            </li>
          </ul>

          <div className="pt-1">
            <Link
              to="/signup?side=supplier"
              onClick={onClose}
              data-testid="quick-register-supplier-btn"
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2.5 font-bold text-white shadow-xs transition text-xs active:scale-98 mobile-touch-target"
            >
              <span>Register as Verified Supplier</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Existing User Login Shortcut */}
        <div className="pt-2 text-center text-xs text-muted-foreground border-t border-border/60">
          <span>Already registered? </span>
          <Link
            to="/login"
            onClick={onClose}
            className="font-bold text-primary hover:underline"
          >
            Log In to Workspace →
          </Link>
        </div>
      </div>
    </BottomSheet>
  );
}
