import React from 'react';

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
          src="/brand/otp-logo.jpg"
          alt="OTP Platform — Open Trade & Procurement (Identity-Protected Competitive Sourcing Platform)"
          className="w-full max-w-xl h-auto rounded-xl object-cover shadow-lg border border-slate-800/60 transition hover:shadow-cyan-900/20"
        />
      </div>
    );
  }

  // Default: Official Option 2 Brand Logo Image
  return (
    <div className={`inline-flex items-center ${className}`}>
      <img
        src="/brand/otp-logo.jpg"
        alt="OTP Platform — Open Trade & Procurement"
        style={{ height: `${size}px` }}
        className="w-auto rounded-lg object-contain shadow-sm border border-slate-800/80 hover:brightness-105 transition"
      />
    </div>
  );
}
