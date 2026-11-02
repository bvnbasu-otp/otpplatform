import React from 'react';

/**
 * X2O / OTP Next — Minimalist Flat Vector Illustrations
 * High-performance, responsive SVGs matching modern Indian consumer-grade apps.
 */

interface IllustrationProps {
  className?: string;
  size?: number | string;
}

/**
 * Screen 1 Hero Illustration:
 * Minimalist duo characters (one male & one female) holding smartphones
 * with floating procurement items, quote comparison cards & merit star.
 */
export function WelcomeHeroIllustration({ className = 'w-56 h-36 mx-auto', size }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 360 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: 'auto' } : undefined}
      aria-hidden="true"
    >
      {/* Background Soft Floating Organic Cloud */}
      <circle cx="180" cy="110" r="90" fill="#EEF2FF" />
      <path
        d="M50 160C35 130 55 90 85 85C115 80 135 105 160 95C185 85 220 50 260 65C300 80 305 135 285 165C265 195 210 190 170 195C130 200 65 190 50 160Z"
        fill="#E0E7FF"
        opacity="0.6"
      />

      {/* Floating Accent Cards (Smart Merit & Quotes) */}
      <rect x="145" y="42" width="70" height="36" rx="8" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.06))" />
      <circle cx="160" cy="60" r="7" fill="#FEF3C7" />
      <path d="M160 56.5L161.2 58.8H163.6L161.7 60.2L162.4 62.5L160 61L157.6 62.5L158.3 60.2L156.4 58.8H158.8L160 56.5Z" fill="#D97706" />
      <rect x="174" y="55" width="30" height="4" rx="2" fill="#1E293B" />
      <rect x="174" y="62" width="22" height="3" rx="1.5" fill="#10B981" />

      {/* ────────────────── CHARACTER 1: MALE (LEFT) ────────────────── */}
      <ellipse cx="118" cy="195" rx="30" ry="14" fill="#1E293B" opacity="0.08" />
      {/* Blue Shirt Body */}
      <path
        d="M96 205C96 175 106 156 118 156C130 156 140 175 140 205H96Z"
        fill="#2563EB"
      />
      {/* Collar */}
      <path d="M112 156L118 168L124 156H112Z" fill="#1D4ED8" />

      {/* Arm & Hand holding phone */}
      <path
        d="M102 172L110 186C110 186 118 187 122 187L132 172"
        stroke="#FDBA74"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Male Smartphone */}
      <rect x="115" y="166" width="16" height="28" rx="2.5" fill="#0F172A" />
      <rect x="117" y="169" width="12" height="20" rx="1.5" fill="#60A5FA" />
      <circle cx="123" cy="191" r="1" fill="#FFFFFF" />

      {/* Neck & Head */}
      <rect x="114" y="142" width="8" height="15" rx="2" fill="#FDBA74" />
      <circle cx="118" cy="132" r="16" fill="#FED7AA" />

      {/* Short Modern Navy Hair */}
      <path
        d="M103 130C103 121 110 115 119 115C129 115 134 122 134 130C134 133 131 127 127 125C123 122 116 122 110 125C106 127 104 130 103 130Z"
        fill="#0F172A"
      />

      {/* ────────────────── CHARACTER 2: FEMALE (RIGHT) ────────────────── */}
      <ellipse cx="242" cy="195" rx="30" ry="14" fill="#1E293B" opacity="0.08" />
      {/* Emerald / Teal Kurti Top Body */}
      <path
        d="M220 205C220 176 230 156 242 156C254 156 264 176 264 205H220Z"
        fill="#0D9488"
      />
      {/* V-Neck Detail */}
      <path d="M236 156L242 166L248 156H236Z" fill="#0F766E" />

      {/* Arm & Hand holding tablet / phone */}
      <path
        d="M228 172L236 186C236 186 244 187 248 187L258 172"
        stroke="#FDBA74"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Female Smartphone / Tablet */}
      <rect x="238" y="165" width="16" height="28" rx="2.5" fill="#0F172A" />
      <rect x="240" y="168" width="12" height="20" rx="1.5" fill="#34D399" />
      <circle cx="246" cy="190" r="1" fill="#FFFFFF" />

      {/* Neck & Head */}
      <rect x="238" y="142" width="8" height="15" rx="2" fill="#FDBA74" />
      <circle cx="242" cy="132" r="16" fill="#FED7AA" />

      {/* Stylish Flowing Hair with Side Part / Bun Accent */}
      <path
        d="M226 134C226 120 234 114 243 114C253 114 259 122 258 135C258 144 256 150 255 154C253 148 253 138 251 133C248 126 238 126 234 130C230 135 229 146 228 154C227 148 226 140 226 134Z"
        fill="#1E1B4B"
      />
      {/* Top Hair Bun / Wave Accent */}
      <ellipse cx="242" cy="113" rx="7" ry="5" fill="#0F172A" />

      {/* Subtle Floating Sparkles & Dots */}
      <circle cx="75" cy="70" r="3" fill="#60A5FA" />
      <circle cx="285" cy="80" r="3.5" fill="#F59E0B" />
      <circle cx="180" cy="180" r="2.5" fill="#10B981" />
      <circle cx="295" cy="135" r="2.5" fill="#EC4899" />
      <circle cx="65" cy="140" r="3" fill="#8B5CF6" />
    </svg>
  );
}

/**
 * Screen 8 Celebration Illustration:
 * Vibrant confetti, stars, and radiant checkmark shield for registration success.
 */
export function CelebrationIllustration({ className = 'w-36 h-36 mx-auto', size }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: 'auto' } : undefined}
      aria-hidden="true"
    >
      {/* Celebration Rings */}
      <circle cx="80" cy="80" r="56" fill="#ECFDF5" />
      <circle cx="80" cy="80" r="44" fill="#D1FAE5" />
      <circle cx="80" cy="80" r="32" fill="#10B981" />

      {/* Confetti Particles */}
      <circle cx="32" cy="45" r="4" fill="#3B82F6" />
      <circle cx="128" cy="40" r="3.5" fill="#F59E0B" />
      <circle cx="25" cy="95" r="3" fill="#EC4899" />
      <circle cx="138" cy="90" r="4.5" fill="#8B5CF6" />
      <circle cx="50" cy="135" r="3.5" fill="#10B981" />
      <circle cx="115" cy="130" r="4" fill="#06B6D4" />

      {/* Stars */}
      <path d="M48 28L50 33L55 35L50 37L48 42L46 37L41 35L46 33L48 28Z" fill="#FBBF24" />
      <path d="M115 65L116.5 68.5L120 70L116.5 71.5L115 75L113.5 71.5L110 70L113.5 68.5L115 65Z" fill="#F43F5E" />
      <path d="M78 18L80 22L84 23.5L80 25L78 29L76 25L72 23.5L76 22L78 18Z" fill="#3B82F6" />

      {/* Checkmark */}
      <path
        d="M68 80.5L76 88.5L93 71.5"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Concentric Rings Discovery Illustration:
 * Radar waves emanating outward through the 6 concentric perimeters.
 */
export function ConcentricRadarIllustration({ className = 'w-24 h-24 mx-auto', ringIndex = 1 }: IllustrationProps & { ringIndex?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="54" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="60" cy="60" r="42" stroke={ringIndex >= 3 ? '#2563EB' : '#E2E8F0'} strokeWidth="1.5" />
      <circle cx="60" cy="60" r="30" stroke={ringIndex >= 2 ? '#2563EB' : '#E2E8F0'} strokeWidth="1.5" />
      <circle cx="60" cy="60" r="18" stroke={ringIndex >= 1 ? '#2563EB' : '#E2E8F0'} strokeWidth="2" fill="#EEF2FF" />
      <circle cx="60" cy="60" r="8" fill="#2563EB" />
      <circle cx="60" cy="60" r="3" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Minimalist Category Icons (Goods & Services thumbnails)
 */
export function OfficeChairsIllustration({ className = 'w-10 h-10' }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#EFF6FF" />
      {/* Backrest */}
      <rect x="18" y="10" width="12" height="16" rx="3" fill="#2563EB" />
      {/* Seat */}
      <rect x="15" y="27" width="18" height="4" rx="2" fill="#1D4ED8" />
      {/* Center Post */}
      <path d="M24 31V38" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
      {/* Legs */}
      <path d="M16 41L24 38L32 41" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ElectricalPlumbingIllustration({ className = 'w-10 h-10' }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#FFFBEB" />
      {/* Light Bulb & Wrench */}
      <circle cx="24" cy="20" r="8" fill="#F59E0B" />
      <path d="M21 28H27V31H21V28Z" fill="#D97706" />
      <path d="M22 32H26" stroke="#92400E" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 15L12 12M33 15L36 12M24 10V6" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function HousekeepingIllustration({ className = 'w-10 h-10' }: IllustrationProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#ECFDF5" />
      {/* Spray Bottle & Sparkle */}
      <rect x="20" y="22" width="12" height="18" rx="3" fill="#10B981" />
      <path d="M24 14V22" stroke="#059669" strokeWidth="3" />
      <path d="M24 14H18M24 14H28" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" />
      {/* Sparkles */}
      <path d="M36 12L37 14L39 15L37 16L36 18L35 16L33 15L35 14L36 12Z" fill="#34D399" />
    </svg>
  );
}
