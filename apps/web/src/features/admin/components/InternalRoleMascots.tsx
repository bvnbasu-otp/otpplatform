import React from 'react';
import type { InternalConsoleRoleCode } from '../types/admin-navigation';

interface MascotProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  role: InternalConsoleRoleCode;
}

/**
 * Minimalist flat vector character illustrations for internal roles,
 * styled to match the customer-facing 23-screen design language with warm skin tones,
 * sleek executive attire, and subtle emerald/slate accents.
 */
export function InternalRoleMascot({ role, className, size = 'md' }: MascotProps) {
  const sizeClass = size === 'sm' ? 'w-16 h-16' : size === 'lg' ? 'w-48 h-48' : 'w-32 h-32';
  const effectiveClass = className || sizeClass;
  switch (role) {
    case 'CEO_FOUNDER':
      return (
        <svg viewBox="0 0 160 120" className={effectiveClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Glass Desk & Hologram Chart */}
          <rect x="20" y="88" width="120" height="6" rx="3" className="fill-slate-700/60 dark:fill-slate-600/80" />
          <path d="M40 76 L65 58 L95 68 L125 42" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 0" />
          <circle cx="125" cy="42" r="4" fill="#34d399" />
          
          {/* Female Executive (Left) */}
          <circle cx="50" cy="35" r="14" fill="#fcd34d" />
          <path d="M40 32 C40 22 60 22 60 32 C60 26 40 26 40 32 Z" fill="#374151" />
          <path d="M38 49 C38 45 42 43 50 43 C58 43 62 45 62 49 L65 82 L35 82 Z" fill="#0f766e" />
          <circle cx="47" cy="34" r="1.5" fill="#1f2937" />
          <circle cx="53" cy="34" r="1.5" fill="#1f2937" />
          <path d="M48 39 Q50 41 52 39" stroke="#1f2937" strokeWidth="1" strokeLinecap="round" />

          {/* Male Executive (Right) */}
          <circle cx="110" cy="35" r="14" fill="#fcd34d" />
          <path d="M98 30 C98 22 122 22 122 30 C122 24 98 24 98 30 Z" fill="#1e293b" />
          <path d="M98 49 C98 45 102 43 110 43 C118 43 122 45 122 49 L125 82 L95 82 Z" fill="#065f46" />
          <path d="M107 43 L110 52 L113 43" stroke="#fcd34d" strokeWidth="2" strokeLinecap="round" />
          <circle cx="107" cy="34" r="1.5" fill="#1f2937" />
          <circle cx="113" cy="34" r="1.5" fill="#1f2937" />
          <path d="M108 39 Q110 41 112 39" stroke="#1f2937" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    case 'SUPER_ADMIN':
      return (
        <svg viewBox="0 0 160 120" className={effectiveClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Security Shield Backdrop */}
          <path d="M80 15 L120 28 V65 C120 90 80 108 80 108 C80 108 40 90 40 65 V28 Z" className="fill-indigo-950/40 stroke-indigo-500/40" strokeWidth="2" />
          
          {/* Senior Administrator Figure */}
          <circle cx="80" cy="42" r="15" fill="#fcd34d" />
          <path d="M68 36 C68 26 92 26 92 36 Z" fill="#334155" />
          <path d="M66 57 C66 52 72 50 80 50 C88 50 94 52 94 57 L96 90 L64 90 Z" fill="#4338ca" />
          
          {/* Biometric Security Tablet */}
          <rect x="70" y="66" width="20" height="26" rx="3" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.5" />
          <circle cx="80" cy="76" r="4" stroke="#a5b4fc" strokeWidth="1" strokeDasharray="2 1" />
          <line x1="75" y1="84" x2="85" y2="84" stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case 'GENERAL_SUPPORT':
      return (
        <svg viewBox="0 0 160 120" className={effectiveClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Customer Care Specialist Figure */}
          <circle cx="75" cy="42" r="15" fill="#fcd34d" />
          <path d="M63 36 C63 26 87 26 87 36 Z" fill="#1e293b" />
          <path d="M62 57 C62 52 68 50 75 50 C82 50 88 52 88 57 L90 92 L60 92 Z" fill="#0284c7" />
          
          {/* Professional Headset & Boom Mic */}
          <path d="M60 42 C60 26 90 26 90 42" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="58" y="38" width="5" height="10" rx="2" fill="#0284c7" />
          <rect x="87" y="38" width="5" height="10" rx="2" fill="#0284c7" />
          <path d="M62 46 L70 52" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          <circle cx="72" cy="53" r="2.5" fill="#38bdf8" />
          
          {/* Live Support Dialogue Card */}
          <g transform="translate(100, 25)">
            <rect width="45" height="30" rx="6" className="fill-slate-900/90 stroke-sky-500/50" strokeWidth="1" />
            <line x1="8" y1="10" x2="35" y2="10" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            <line x1="8" y1="18" x2="26" y2="18" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" />
          </g>
        </svg>
      );

    case 'OPERATIONS':
      return (
        <svg viewBox="0 0 160 120" className={effectiveClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Server Array Backdrop */}
          <rect x="25" y="30" width="30" height="60" rx="3" className="fill-slate-900/80 stroke-amber-500/40" strokeWidth="1.5" />
          <circle cx="33" cy="38" r="2" fill="#10b981" />
          <circle cx="33" cy="46" r="2" fill="#10b981" />
          <circle cx="33" cy="54" r="2" fill="#f59e0b" />
          <line x1="40" y1="38" x2="48" y2="38" stroke="#475569" strokeWidth="2" />
          <line x1="40" y1="46" x2="48" y2="46" stroke="#475569" strokeWidth="2" />
          
          {/* DevSecOps Specialist Figure */}
          <circle cx="95" cy="42" r="15" fill="#fcd34d" />
          <path d="M83 36 C83 26 107 26 107 36 Z" fill="#334155" />
          <path d="M82 57 C82 52 88 50 95 50 C102 50 108 52 108 57 L110 92 L80 92 Z" fill="#d97706" />
          
          {/* System Pulse & Terminal Console */}
          <path d="M115 65 L122 65 L126 55 L132 75 L136 65 L145 65" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'SALES_MARKETING':
      return (
        <svg viewBox="0 0 160 120" className={effectiveClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Growth Strategist Figure */}
          <circle cx="65" cy="42" r="15" fill="#fcd34d" />
          <path d="M53 36 C53 26 77 26 77 36 Z" fill="#1e293b" />
          <path d="M52 57 C52 52 58 50 65 50 C72 50 78 52 78 57 L80 92 L50 92 Z" fill="#7e22ce" />
          
          {/* SNE Regional Concentric Radar */}
          <g transform="translate(110, 50)">
            <circle cx="0" cy="0" r="10" className="stroke-purple-400" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
            <circle cx="0" cy="0" r="22" className="stroke-purple-500/60" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
            <circle cx="0" cy="0" r="34" className="stroke-purple-600/30" strokeWidth="1.5" fill="none" />
            <circle cx="0" cy="0" r="3" fill="#a855f7" />
            <circle cx="15" cy="-8" r="2.5" fill="#10b981" />
            <circle cx="-12" cy="14" r="2.5" fill="#06b6d4" />
          </g>
        </svg>
      );

    case 'LEGAL_PRIVACY':
      return (
        <svg viewBox="0 0 160 120" className={effectiveClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Legal Counsel Figure */}
          <circle cx="65" cy="42" r="15" fill="#fcd34d" />
          <path d="M53 36 C53 26 77 26 77 36 Z" fill="#0f172a" />
          <path d="M52 57 C52 52 58 50 65 50 C72 50 78 52 78 57 L80 92 L50 92 Z" fill="#be123c" />
          <path d="M62 50 L65 58 L68 50" stroke="#fcd34d" strokeWidth="1.5" />
          
          {/* Justice Balance Scale & Audit Seal */}
          <g transform="translate(112, 35)">
            <line x1="0" y1="5" x2="0" y2="40" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" />
            <line x1="-18" y1="12" x2="18" y2="12" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" />
            {/* Left Pan */}
            <line x1="-18" y1="12" x2="-22" y2="24" stroke="#f43f5e" strokeWidth="1" />
            <line x1="-18" y1="12" x2="-14" y2="24" stroke="#f43f5e" strokeWidth="1" />
            <path d="M-25 24 Q-18 28 -11 24 Z" fill="#fda4af" />
            {/* Right Pan */}
            <line x1="18" y1="12" x2="14" y2="24" stroke="#f43f5e" strokeWidth="1" />
            <line x1="18" y1="12" x2="22" y2="24" stroke="#f43f5e" strokeWidth="1" />
            <path d="M11 24 Q18 28 25 24 Z" fill="#fda4af" />
            {/* Base */}
            <path d="M-10 40 L10 40" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
      );

    case 'AUDITOR':
      return (
        <svg viewBox="0 0 160 120" className={effectiveClass} fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Auditor Figure with Magnifying Glass & Clipboard */}
          <circle cx="70" cy="42" r="15" fill="#fcd34d" />
          <path d="M58 36 C58 26 82 26 82 36 Z" fill="#134e4a" />
          <path d="M57 57 C57 52 63 50 70 50 C77 50 83 52 83 57 L85 92 L55 92 Z" fill="#0f766e" />
          
          {/* Audit Clipboard */}
          <rect x="92" y="38" width="28" height="38" rx="3" className="fill-slate-900 stroke-teal-400" strokeWidth="1.5" />
          <rect x="101" y="35" width="10" height="5" rx="1.5" fill="#14b8a6" />
          <line x1="98" y1="48" x2="114" y2="48" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="98" y1="56" x2="114" y2="56" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="98" y1="64" x2="108" y2="64" stroke="#2dd4bf" strokeWidth="1.5" strokeLinecap="round" />
          
          {/* Read-Only Inspection Eyepiece / Magnifier */}
          <circle cx="60" cy="62" r="10" stroke="#14b8a6" strokeWidth="2" fill="#042f2e" fillOpacity="0.6" />
          <line x1="53" y1="69" x2="45" y2="77" stroke="#14b8a6" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );

    default:
      return null;
  }
}
