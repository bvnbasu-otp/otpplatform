import React, { useState } from 'react';
import {
  type InternalConsoleRoleCode,
  INTERNAL_ROLE_CONFIGS,
} from '../types/admin-navigation';

export interface InternalRoleSwitcherBarProps {
  currentRole: InternalConsoleRoleCode;
  onSelectRole: (role: InternalConsoleRoleCode) => void;
  onSimulatePersona?: (side: 'BUYER' | 'SUPPLIER') => void;
  onSignOut?: () => void;
  isRootFounder?: boolean;
  canSwitch?: boolean;
  isFounder?: boolean;
  userName?: string | null;
  userEmail?: string | null;
}

export function InternalRoleSwitcherBar({
  currentRole,
  onSelectRole,
  onSimulatePersona,
  onSignOut,
  isRootFounder = false,
  canSwitch = true,
  isFounder = false,
  userName,
  userEmail,
}: InternalRoleSwitcherBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCfg = INTERNAL_ROLE_CONFIGS[currentRole] || INTERNAL_ROLE_CONFIGS.SUPER_ADMIN;

  const rolesList: InternalConsoleRoleCode[] = [
    'CEO_FOUNDER',
    'SUPER_ADMIN',
    'GENERAL_SUPPORT',
    'OPERATIONS',
    'SALES_MARKETING',
    'LEGAL_PRIVACY',
    'AUDITOR',
  ];

  return (
    <div className="relative z-50 mb-6 rounded-xl border border-border/80 bg-slate-900/90 p-3 shadow-lg backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-sm">
            ⚡
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Console View Mode
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${activeCfg.colorClass}`}>
                {activeCfg.badge}
              </span>
              {(isRootFounder || isFounder) && (
                <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30">
                  Root Founder
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-foreground">
              {activeCfg.title}
            </p>
            {(userName || userEmail) && (
              <p className="text-[11px] text-slate-400">
                {userName && <span className="font-medium text-slate-200">{userName}</span>}
                {userName && userEmail && <span> · </span>}
                {userEmail && <span className="text-slate-400">{userEmail}</span>}
              </p>
            )}
          </div>
        </div>

        {/* Switcher Dropdown Action or Locked View Notice */}
        <div className="flex items-center gap-2">
          {canSwitch ? (
            <>
              {currentRole !== 'SUPER_ADMIN' && (
                <button
                  type="button"
                  onClick={() => onSelectRole('SUPER_ADMIN')}
                  className="rounded-lg border border-border bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
                >
                  Reset to Super Admin
                </button>
              )}

              <div className="relative z-50">
                <button
                  type="button"
                  onClick={() => setIsOpen(!isOpen)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition cursor-pointer"
                  aria-haspopup="true"
                  aria-expanded={isOpen}
                >
                  <span>Switch Role / View</span>
                  <svg className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-[95] bg-transparent cursor-default"
                      onClick={() => setIsOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl z-[100] animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Internal Console Roles
                    </div>
                    <div className="space-y-1">
                      {rolesList.map((r) => {
                        const cfg = INTERNAL_ROLE_CONFIGS[r];
                        const isSelected = r === currentRole;
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              onSelectRole(r);
                              setIsOpen(false);
                            }}
                            className={`w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                              isSelected
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                            }`}
                          >
                            <span className="text-sm mt-0.5">
                              {r === 'CEO_FOUNDER' ? '👑' :
                               r === 'SUPER_ADMIN' ? '🛡️' :
                               r === 'GENERAL_SUPPORT' ? '🎧' :
                               r === 'OPERATIONS' ? '⚡' :
                               r === 'SALES_MARKETING' ? '📈' :
                               r === 'LEGAL_PRIVACY' ? '⚖️' : '🔍'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold truncate">{cfg.shortTitle}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{cfg.badge}</div>
                            </div>
                            {isSelected && <span className="text-emerald-400 font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>

                    {onSimulatePersona && (
                      <>
                        <div className="my-1.5 border-t border-slate-800" />
                        <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          External Personas Simulation
                        </div>
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => {
                              onSimulatePersona('BUYER');
                              setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                          >
                            <span>🏛️</span>
                            <span>Simulate Buyer Experience</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSimulatePersona('SUPPLIER');
                              setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition"
                          >
                            <span>🏪</span>
                            <span>Simulate Supplier Experience</span>
                          </button>
                        </div>
                      </>
                    )}

                    {onSignOut && (
                      <>
                        <div className="my-1.5 border-t border-slate-800" />
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            onSignOut();
                          }}
                          className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/15 hover:text-red-300 transition cursor-pointer font-medium"
                        >
                          <span>🚪</span>
                          <span>Sign Out of Platform</span>
                        </button>
                      </>
                    )}
                  </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300">
              <span>🔒</span>
              <span>Restricted to role-authorized functions</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
