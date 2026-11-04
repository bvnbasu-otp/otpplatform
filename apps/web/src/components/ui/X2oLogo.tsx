import React from 'react';

export const X2O_ASSETS = {
  logo3D: '/x2o/x2o-logo.jpg',
  logo3DBanner: '/x2o/x2o-banner.jpg',
  logo3DSvg: '/x2o/x2o-logo-3d.svg',
  logoDark: '/x2o/x2o-logo-dark.svg',
  logoLight: '/x2o/x2o-logo-light.svg',
  iconMaster: '/x2o/x2o-icon.svg',
  iconDark: '/x2o/x2o-icon-dark.svg',
  iconLight: '/x2o/x2o-icon-light.svg',
  symbol: '/x2o/x2o-symbol.svg',
  favicon: '/x2o/x2o-favicon.svg',
} as const;

export interface X2oLogoProps {
  className?: string;
  size?: number; // Height in pixels (default 36)
  variant?: '3d' | 'banner' | 'horizontal' | 'icon' | 'symbol' | 'mark';
  theme?: 'auto' | 'light' | 'dark';
  showTagline?: boolean;
}

/**
 * X2O Brand Logo & Visual Identity Component
 *
 * "Anything To Order" — The evolution of the legacy OTP platform.
 * Features the iconic 3D glowing glass trust shield with neon infinity loop & ascending arrow,
 * alongside sculptural 3D metallic chrome X2O wordmark and dual-line platform subtitle.
 */
export function X2oLogo({
  className = '',
  size = 36,
  variant = 'horizontal',
  theme = 'auto',
}: X2oLogoProps) {
  // 3D Glass & Chrome Photographic Banner
  if (variant === '3d' || variant === 'banner') {
    return (
      <div className={`inline-flex items-center ${className}`}>
        <img
          src={X2O_ASSETS.logo3D}
          alt="X2O — Anything to Order"
          style={{ height: `${size}px` }}
          className="w-auto rounded-xl object-contain shadow-md border border-slate-800/80 hover:brightness-105 transition"
        />
      </div>
    );
  }

  // Standalone App Icon
  if (variant === 'icon' || variant === 'mark') {
    if (theme === 'dark') {
      return (
        <img
          src={X2O_ASSETS.iconDark}
          alt="X2O Icon"
          style={{ height: `${size}px`, width: `${size}px` }}
          className={`shrink-0 rounded-xl object-contain ${className}`}
        />
      );
    }
    if (theme === 'light') {
      return (
        <img
          src={X2O_ASSETS.iconLight}
          alt="X2O Icon"
          style={{ height: `${size}px`, width: `${size}px` }}
          className={`shrink-0 rounded-xl object-contain ${className}`}
        />
      );
    }
    // Auto theme
    return (
      <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
        <img
          src={X2O_ASSETS.iconDark}
          alt="X2O Icon"
          style={{ height: `${size}px`, width: `${size}px` }}
          className="hidden dark:block shrink-0 rounded-xl object-contain"
        />
        <img
          src={X2O_ASSETS.iconLight}
          alt="X2O Icon"
          style={{ height: `${size}px`, width: `${size}px` }}
          className="block dark:hidden shrink-0 rounded-xl object-contain"
        />
      </div>
    );
  }

  // Symbol only
  if (variant === 'symbol') {
    return (
      <img
        src={X2O_ASSETS.symbol}
        alt="X2O Symbol"
        style={{ height: `${size}px`, width: `${size}px` }}
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }

  // Default Horizontal Lockup
  const calculatedWidth = Math.round(size * (640 / 360));

  if (theme === 'dark') {
    return (
      <img
        src={X2O_ASSETS.logoDark}
        alt="X2O — Anything To Order"
        style={{ height: `${size}px`, width: `${calculatedWidth}px` }}
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }

  if (theme === 'light') {
    return (
      <img
        src={X2O_ASSETS.logoLight}
        alt="X2O — Anything To Order"
        style={{ height: `${size}px`, width: `${calculatedWidth}px` }}
        className={`shrink-0 object-contain ${className}`}
      />
    );
  }

  // Auto theme
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <img
        src={X2O_ASSETS.logoDark}
        alt="X2O — Anything To Order"
        style={{ height: `${size}px`, width: `${calculatedWidth}px` }}
        className="hidden dark:block shrink-0 object-contain"
      />
      <img
        src={X2O_ASSETS.logoLight}
        alt="X2O — Anything To Order"
        style={{ height: `${size}px`, width: `${calculatedWidth}px` }}
        className="block dark:hidden shrink-0 object-contain"
      />
    </div>
  );
}
