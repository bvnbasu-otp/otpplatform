/**
 * OTP Next — Supplier Wallet Top-Up UPI QR Modal
 * Enforces wallet fee reserve before award acceptance to prevent platform disintermediation.
 */

import React, { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export interface SupplierWalletTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredFee: number;
  currentBalance: number;
  orderId?: string;
  orderAmount?: number;
  onTopUpSuccess: (newBalance: number) => void;
}

export function SupplierWalletTopUpModal({
  isOpen,
  onClose,
  requiredFee = 0,
  currentBalance = 0,
  orderId = 'ENQ-2026-0412',
  orderAmount = 4720,
  onTopUpSuccess,
}: SupplierWalletTopUpModalProps) {
  const [topUpAmount, setTopUpAmount] = useState<number>(Math.max(100, (requiredFee || 10) * 2));
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaid, setIsPaid] = useState(false);

  if (!isOpen) return null;

  function handleSimulatePayment() {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsPaid(true);
      const newBal = (currentBalance || 0) + topUpAmount;
      setTimeout(() => {
        onTopUpSuccess(newBal);
      }, 900);
    }, 1200);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
      data-testid="supplier-wallet-topup-modal"
    >
      <div className="w-full max-w-sm bg-card border border-border/80 rounded-3xl p-5 shadow-2xl space-y-4 text-center">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary">
            <Icon name="account_balance_wallet" size={16} />
            <span>Platform Fee Reserve</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs p-1 font-bold"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Order Details & Required Fee */}
        <div className="text-left bg-muted/30 p-3 rounded-2xl border border-border/60 space-y-1 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Order / RFQ ID:</span>
            <span className="font-mono font-bold text-foreground">{orderId}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Order Landed Value:</span>
            <span className="font-bold text-foreground">₹{(orderAmount ?? 0).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground pt-1 border-t border-border/40">
            <span>Required Fee Reserve:</span>
            <span className="font-black text-primary">₹{(requiredFee ?? 0).toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Current Wallet Balance:</span>
            <span className={`font-bold ${(currentBalance ?? 0) < (requiredFee ?? 0) ? 'text-destructive' : 'text-emerald-600'}`}>
              ₹{(currentBalance ?? 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {isPaid ? (
          <div className="py-6 space-y-2 text-center animate-in zoom-in-95">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-2xl font-bold">
              ✓
            </div>
            <h4 className="text-sm font-black text-foreground">Top-Up Successful!</h4>
            <p className="text-xs text-muted-foreground">
              ₹{topUpAmount} added to your platform wallet. Unlocking award acceptance…
            </p>
          </div>
        ) : (
          <>
            {/* Top-up Selection Pills */}
            <div className="space-y-1.5 text-left">
              <label className="text-[11px] font-bold text-foreground block">Select Top-Up Amount:</label>
              <div className="grid grid-cols-4 gap-1.5 text-xs font-bold">
                {[50, 100, 250, 500].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopUpAmount(amt)}
                    className={`py-1.5 rounded-xl border text-center transition ${
                      topUpAmount === amt
                        ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic UPI QR Code Canvas / Visual */}
            <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-inner flex flex-col items-center justify-center space-y-2">
              <div className="w-40 h-40 bg-gray-50 border border-gray-200 rounded-xl p-2 flex flex-col items-center justify-center relative">
                {/* Visual SVG QR representation */}
                <svg viewBox="0 0 100 100" className="w-full h-full text-gray-900 fill-current">
                  {/* Outer Frame */}
                  <rect x="5" y="5" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="6" rx="3" />
                  <rect x="13" y="13" width="12" height="12" />
                  <rect x="67" y="5" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="6" rx="3" />
                  <rect x="75" y="13" width="12" height="12" />
                  <rect x="5" y="67" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="6" rx="3" />
                  <rect x="13" y="75" width="12" height="12" />
                  {/* Center Accent Badge */}
                  <circle cx="50" cy="50" r="12" fill="#059669" />
                  <text x="50" y="54" fill="#ffffff" fontSize="9" fontWeight="900" textAnchor="middle">OTP</text>
                  {/* Synthetic Data Dots */}
                  <circle cx="42" cy="18" r="2.5" />
                  <circle cx="58" cy="18" r="2.5" />
                  <circle cx="42" cy="82" r="2.5" />
                  <circle cx="58" cy="82" r="2.5" />
                  <circle cx="18" cy="45" r="2.5" />
                  <circle cx="82" cy="45" r="2.5" />
                  <circle cx="82" cy="65" r="2.5" />
                  <circle cx="65" cy="82" r="2.5" />
                </svg>
              </div>

              <div className="text-center">
                <span className="text-[11px] font-black text-gray-900 block">Scan to Pay ₹{topUpAmount}</span>
                <span className="text-[9px] text-gray-500 font-mono">VPA: otp.settlement@icici</span>
              </div>
            </div>

            {/* UPI Brand Badges */}
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground font-semibold">
              <span className="px-1.5 py-0.5 rounded bg-muted">GPay</span>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded bg-muted">PhonePe</span>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded bg-muted">Paytm</span>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded bg-muted">BHIM</span>
            </div>

            {/* Payment Trigger */}
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={isProcessing}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:bg-primary/90 transition shadow-sm min-h-[44px] flex items-center justify-center gap-1.5"
                data-testid="btn-confirm-wallet-topup"
              >
                {isProcessing ? (
                  <span>Verifying UPI Receipt…</span>
                ) : (
                  <span>Simulate UPI Payment (₹{topUpAmount}) ✓</span>
                )}
              </button>
              <p className="text-[10px] text-muted-foreground">
                Funds are credited instantly to your platform wallet for fee deduction.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
