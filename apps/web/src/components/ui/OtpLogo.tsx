import React from 'react';
import { PRODUCT_FULL_NAME, PRODUCT_NAME, PRODUCT_TITLE } from '@/lib/brand';

export const OTP_LOGO_SRC = '/brand/otp-logo.jpg';

interface OtpLogoProps {
  className?: string;
  size?: number; // Height in px
  showText?: boolean;
  subtitle?: string;
  variant?: 'image' | 'banner' | 'icon';
}

export function OtpLogo({
  className = '',
  size = 38,
  variant = 'image',
}: OtpLogoProps) {
  if (variant === 'banner') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <img
          src={OTP_LOGO_SRC}
          alt={PRODUCT_TITLE}
          className="w-full max-w-xl h-auto rounded-xl object-cover shadow-lg border border-slate-800/60 transition hover:shadow-cyan-900/20"
        />
      </div>
    );
  }

  // Default: Official Option 2 Brand Logo Image
  return (
    <div className={`inline-flex items-center ${className}`}>
      <img
        src={OTP_LOGO_SRC}
        alt={`${PRODUCT_NAME} — ${PRODUCT_FULL_NAME}`}
        style={{ height: `${size}px` }}
        className="w-auto rounded-lg object-contain shadow-sm border border-slate-800/80 hover:brightness-105 transition"
      />
    </div>
  );
}
