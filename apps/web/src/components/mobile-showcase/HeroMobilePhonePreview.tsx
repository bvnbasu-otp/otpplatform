import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { MobilePhoneFrame } from './MobilePhoneFrame';

export function HeroMobilePhonePreview() {
  const [selectedQuote, setSelectedQuote] = useState<'A7K3' | 'B2M9' | 'C4X1'>('A7K3');

  return (
    <div className="flex flex-col items-center justify-center relative">
      {/* Subtle Glow Behind Phone */}
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-emerald-500/10 to-primary/20 rounded-[60px] blur-2xl opacity-60 pointer-events-none" />

      <MobilePhoneFrame
        title="4-Pillar Sealed Evaluation"
        badge="Zero-Bias Mobile Matrix"
        badgeColor="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300"
        subtitle="10 HP Submersible Borewell Motor Rewind"
        size="md"
        activeTab="audit"
      >
        <div className="p-3.5 space-y-3 text-left text-foreground">
          {/* RFQ Status Banner */}
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div>
              <span className="text-[9px] font-bold text-muted-foreground block uppercase tracking-wider">
                Durga Rainbow RWA, Mahadevapura · RFQ #0842
              </span>
              <h5 className="text-xs font-bold text-foreground">
                10 HP Borewell Motor Rewind
              </h5>
            </div>
            <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold">
              🔒 Sealed
            </span>
          </div>

          {/* Sourcing Mode Badge */}
          <div className="rounded-xl bg-primary/10 border border-primary/20 px-3 py-1.5 flex items-center justify-between text-[10px]">
            <span className="font-bold text-primary flex items-center gap-1">
              <span>🛡️</span> Identity-Protected
            </span>
            <span className="text-muted-foreground text-[9px]">3 Sealed Quotes</span>
          </div>

          {/* Candidate Card 1: Supplier A7K3 (L1 Highlight) */}
          <div
            onClick={() => setSelectedQuote('A7K3')}
            className={`cursor-pointer rounded-2xl p-3 space-y-2.5 transition shadow-xs ${
              selectedQuote === 'A7K3'
                ? 'border-2 border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border border-border bg-card hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px]">
                  L1
                </span>
                <span className="font-mono text-xs font-bold text-foreground">Supplier A7K3</span>
              </div>
              <span className="text-[9px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full shadow-2xs">
                ⚡ Lowest (₹8,200)
              </span>
            </div>

            {/* 4-Pillar Grid */}
            <div className="grid grid-cols-4 gap-1 bg-card rounded-xl p-2 border border-border/70 text-center text-xs">
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">₹ Total</span>
                <span className="font-black text-foreground text-xs font-mono">₹8,200</span>
              </div>
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">Delivery</span>
                <span className="font-bold text-foreground text-[11px]">3 Days</span>
              </div>
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">Warranty</span>
                <span className="font-bold text-foreground text-[11px]">6 Mo</span>
              </div>
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">Score</span>
                <span className="font-black text-emerald-600 text-xs">★ 9.4</span>
              </div>
            </div>
          </div>

          {/* Candidate Card 2: Supplier B2M9 */}
          <div
            onClick={() => setSelectedQuote('B2M9')}
            className={`cursor-pointer rounded-2xl p-3 space-y-2.5 transition ${
              selectedQuote === 'B2M9'
                ? 'border-2 border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'border border-border bg-card hover:bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold text-[10px]">
                  2
                </span>
                <span className="font-mono text-xs font-bold text-foreground">Supplier B2M9</span>
              </div>
              <span className="text-[9px] text-muted-foreground font-semibold">Fast Turnaround</span>
            </div>

            <div className="grid grid-cols-4 gap-1 bg-muted/20 rounded-xl p-2 text-center text-xs">
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">₹ Total</span>
                <span className="font-bold text-foreground text-xs font-mono">₹8,900</span>
              </div>
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">Delivery</span>
                <span className="font-bold text-foreground text-[11px]">2 Days</span>
              </div>
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">Warranty</span>
                <span className="font-bold text-foreground text-[11px]">12 Mo</span>
              </div>
              <div>
                <span className="text-[8px] text-muted-foreground uppercase font-bold block">Score</span>
                <span className="font-bold text-foreground text-xs">★ 9.1</span>
              </div>
            </div>
          </div>

          {/* 1-Tap Committee Vote Button */}
          <Link
            to="/requirements/new"
            className="w-full rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 transition text-center flex items-center justify-center gap-1.5"
          >
            <span>🗳️ 1-Tap Select ({selectedQuote}) &amp; Start Sourcing →</span>
          </Link>
        </div>
      </MobilePhoneFrame>
    </div>
  );
}
