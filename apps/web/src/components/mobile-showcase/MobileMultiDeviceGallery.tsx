import React, { useState } from 'react';
import { MobilePhoneFrame } from './MobilePhoneFrame';

export function MobileMultiDeviceGallery() {
  const [pipelineView, setPipelineView] = useState<'buyer' | 'supplier'>('buyer');

  return (
    <section className="py-12 sm:py-16 bg-muted/30 border-b border-border/80 overflow-x-hidden max-w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-8">
          <span className="inline-block rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider px-3 py-1 mb-2">
            Dual-Sided Smartphone Showcase
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight">
            How OTP Works on Every Smartphone
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            From the factory floor to the RWA committee room—manage your entire sourcing lifecycle without leaving your phone.
          </p>

          {/* Role Pipeline Switcher */}
          <div className="mt-6 inline-flex items-center justify-center gap-2 p-1 bg-card rounded-2xl border border-border/80 shadow-2xs">
            <button
              type="button"
              onClick={() => setPipelineView('buyer')}
              className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-black transition mobile-touch-target ${
                pipelineView === 'buyer'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🏢</span> Buyer Pipeline (7 Screens)
            </button>
            <button
              type="button"
              onClick={() => setPipelineView('supplier')}
              className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-black transition mobile-touch-target ${
                pipelineView === 'supplier'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span>🚚</span> Supplier Pipeline (5 Screens)
            </button>
          </div>

          {/* Horizontal Gallery Navigation Hint */}
          <div className="mt-4 flex items-center justify-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-card border border-border/70 text-[10px] text-muted-foreground font-semibold shadow-2xs">
              <span>👈</span>
              <span>Swipe or scroll horizontally to explore all {pipelineView === 'buyer' ? '7 Buyer' : '5 Supplier'} screens</span>
              <span>👉</span>
            </div>
          </div>
        </div>

        {pipelineView === 'buyer' ? (
          /* 7-SCREEN BUYER PIPELINE GALLERY */
          <div className="flex items-stretch gap-6 overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory scrollbar-thin w-full max-w-full">
            {/* DEVICE 1: HOME COCKPIT */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Requirement Intake"
                badge="Sourcing Cockpit"
                badgeColor="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300"
                subtitle="Voice search & 1-tap template chips"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded-xl bg-primary/10 border border-primary/20 p-2 text-[10px]">
                    <span className="font-bold block text-primary">🏢 Palm Meadows RWA</span>
                    <span className="text-muted-foreground">Whitefield, Bengaluru</span>
                  </div>
                  <div className="rounded-xl border bg-card p-2 space-y-1">
                    <span className="text-[10px] font-bold">⚡ What do you need?</span>
                    <div className="text-[10px] bg-muted/40 p-1.5 rounded text-muted-foreground flex justify-between">
                      <span>10HP Borewell Motor...</span>
                      <span>🎙️</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[9px]">
                    <div className="rounded bg-card border p-1.5 font-bold text-center">🟢 3 Active</div>
                    <div className="rounded bg-amber-500/10 border border-amber-300 p-1.5 font-bold text-center text-amber-700">🟡 1 Vote</div>
                  </div>
                  <div className="rounded-xl border bg-card p-2 space-y-1">
                    <span className="text-[10px] font-bold block">10 HP Borewell Motor</span>
                    <div className="text-[9px] text-muted-foreground flex justify-between">
                      <span>3 Quotes</span>
                      <span className="text-emerald-600 font-bold">L1: ₹8,200</span>
                    </div>
                    <div className="w-full bg-primary text-white text-[9px] font-bold py-1 rounded text-center">
                      Review &amp; Vote →
                    </div>
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* DEVICE 2: VOICE INTAKE */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Voice Intake"
                badge="Voice Intake"
                badgeColor="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300"
                subtitle="Regional voice parsing in seconds"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded-xl border bg-card p-2 space-y-1">
                    <span className="text-[10px] font-bold flex items-center justify-between">
                      <span>🎙️ Voice Dictation</span>
                      <span className="text-emerald-600 text-[8px] font-bold animate-pulse">● Live</span>
                    </span>
                    <p className="text-[9px] text-muted-foreground bg-muted/30 p-1.5 rounded leading-relaxed">
                      "Require 12.5 HP submersible borewell motor rewinding in Bengaluru..."
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground block">1-Tap Location:</span>
                    <div className="flex flex-wrap gap-1 text-[9px]">
                      <span className="bg-primary text-white px-2 py-0.5 rounded font-bold">Bengaluru ✓</span>
                      <span className="bg-muted px-1.5 py-0.5 rounded">Chennai</span>
                      <span className="bg-muted px-1.5 py-0.5 rounded">Coimbatore</span>
                    </div>
                  </div>
                  <div className="rounded bg-muted/40 p-1.5 text-[8px] flex justify-between font-bold">
                    <span>💰 Price 40%</span>
                    <span>🚚 Speed 35%</span>
                    <span>🛡️ SLA 25%</span>
                  </div>
                  <div className="w-full bg-primary text-white text-[9px] font-bold py-1.5 rounded text-center">
                    Publish Sealed RFQ →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* DEVICE 3: SUPPLIER RADAR */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Supplier Radar"
                badge="Supplier Radar"
                badgeColor="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300"
                subtitle="Broadcasts to verified local vendors"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded-xl bg-slate-950 text-white p-2 space-y-1 text-[9px]">
                    <div className="flex justify-between font-bold">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Radar Active
                      </span>
                      <span className="text-emerald-400">14 Nearby</span>
                    </div>
                    <p className="text-slate-400 text-[8px]">15 km radius around Whitefield</p>
                  </div>
                  <div className="space-y-1 text-[9px]">
                    <div className="border bg-emerald-500/5 rounded p-1.5 flex justify-between font-bold">
                      <span>💬 WhatsApp Broadcast</span>
                      <span className="text-emerald-600">8 Sent</span>
                    </div>
                    <div className="border bg-blue-500/5 rounded p-1.5 flex justify-between font-bold">
                      <span>🌐 ONDC Protocol</span>
                      <span className="text-blue-600">4 Synced</span>
                    </div>
                  </div>
                  <div className="w-full bg-primary text-white text-[9px] font-bold py-1.5 rounded text-center">
                    Track Incoming Quotes →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* DEVICE 4: SUPPLIER QUOTING */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Quoting Engine"
                badge="Supplier Quoting"
                badgeColor="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300"
                subtitle="30 Min from Supplier"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded bg-emerald-500/10 border border-emerald-400 p-1.5 text-[9px] font-bold text-emerald-800">
                    🔒 Sealed Quote (RFQ #0842)
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground">Price (₹ INR):</span>
                    <div className="text-sm font-black bg-card border p-1.5 rounded">
                      ₹ 8,200
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[8px] font-bold">
                    <div className="bg-primary/10 border border-primary text-primary p-1 rounded text-center">+18% GST</div>
                    <div className="bg-card border p-1 rounded text-center">⚡ 3 Days Delivery</div>
                  </div>
                  <div className="w-full bg-emerald-700 text-white text-[9px] font-bold py-1.5 rounded text-center">
                    🔒 Submit Sealed Quote
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* DEVICE 5: SEALED MATRIX */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Sealed Matrix"
                badge="Sealed Matrix"
                badgeColor="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                subtitle="4-pillar metrics under protected aliases"
                size="sm"
              >
                <div className="p-3 space-y-2 text-left text-foreground">
                  <div className="flex justify-between items-center text-[9px] font-bold">
                    <span>🔒 3 Sealed Quotes</span>
                    <span className="text-emerald-700 bg-emerald-100 px-1 rounded">Protected</span>
                  </div>
                  <div className="rounded-xl border-2 border-primary bg-primary/5 p-2 space-y-1">
                    <div className="flex justify-between text-[9px] font-bold">
                      <span className="font-mono text-primary">Supplier A7K3 (L1)</span>
                      <span className="text-emerald-600">★ 9.4</span>
                    </div>
                    <div className="grid grid-cols-3 text-center text-[8px] font-bold bg-card p-1 rounded border">
                      <div>₹8,200</div>
                      <div>3 Days</div>
                      <div>6 Mo</div>
                    </div>
                  </div>
                  <div className="rounded-xl border bg-card p-2 space-y-1">
                    <div className="flex justify-between text-[9px] font-bold">
                      <span className="font-mono text-muted-foreground">Supplier B2M9</span>
                      <span className="text-muted-foreground">★ 9.1</span>
                    </div>
                    <div className="grid grid-cols-3 text-center text-[8px] bg-muted/30 p-1 rounded">
                      <div>₹8,900</div>
                      <div>2 Days</div>
                      <div>12 Mo</div>
                    </div>
                  </div>
                  <div className="w-full bg-primary text-white text-[9px] font-bold py-1.5 rounded text-center">
                    Go to Committee Room →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* DEVICE 6: COMMITTEE VOTE */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Committee Governance"
                badge="Committee Vote"
                badgeColor="bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-300"
                subtitle="1-tap preset rationale chips"
                size="sm"
              >
                <div className="p-3 space-y-2 text-left text-foreground">
                  <div className="rounded bg-cyan-500/10 border border-cyan-400 p-1.5 text-[9px] font-bold text-cyan-900">
                    🏛️ Quorum: 3/3 Cast (100%)
                  </div>
                  <div className="rounded bg-card border p-1.5 text-[9px] space-y-0.5">
                    <span className="text-muted-foreground block">Winning Candidate:</span>
                    <span className="font-bold text-primary font-mono block">Supplier A7K3 · ₹8,200</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] font-bold text-muted-foreground">Rationale (1-Tap):</span>
                    <div className="flex flex-wrap gap-1 text-[8px]">
                      <span className="bg-primary/20 text-primary border border-primary/40 px-1.5 py-0.5 rounded font-bold">Optimal Price ✓</span>
                      <span className="bg-primary/20 text-primary border border-primary/40 px-1.5 py-0.5 rounded font-bold">3-Day Turnaround ✓</span>
                    </div>
                  </div>
                  <div className="w-full bg-primary text-white text-[9px] font-bold py-1.5 rounded text-center">
                    🔒 Lock Award &amp; Unmask →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* DEVICE 7: DIGITAL PO & TRACKING */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Digital PO &amp; Ledger"
                badge="Digital PO & Tracking"
                badgeColor="bg-emerald-600/10 text-emerald-800 dark:text-emerald-300 border-emerald-400"
                subtitle="Digital GST PO & Delivery Tracking"
                size="sm"
              >
                <div className="p-3 space-y-2 text-left text-foreground">
                  <div className="rounded bg-emerald-600 text-white p-2 text-[9px] space-y-0.5">
                    <span className="font-black block uppercase text-[7px] bg-white/20 px-1 py-0.2 rounded w-fit">✓ Unmasked</span>
                    <span className="font-bold block">Sri Vinayaka Electricals</span>
                    <span className="text-[8px] text-white/80 block">GST: 29ABCDE1234F1Z5</span>
                  </div>
                  <div className="rounded border bg-card p-1.5 text-[9px] flex justify-between items-center">
                    <span className="font-bold">PO-2026-0842</span>
                    <span className="text-emerald-600 font-bold">📄 PDF Issued</span>
                  </div>
                  <div className="rounded bg-muted/40 p-1.5 space-y-1 text-[8px]">
                    <div className="text-emerald-600 font-bold">✓ PO Accepted</div>
                    <div className="text-emerald-600 font-bold">✓ Motor Picked Up</div>
                    <div className="text-primary font-bold animate-pulse">⚙️ Rewinding in Progress</div>
                  </div>
                  <div className="w-full bg-emerald-700 text-white text-[9px] font-bold py-1 rounded text-center">
                    Live Order Settled ✓
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>
          </div>
        ) : (
          /* 5-SCREEN SUPPLIER PIPELINE GALLERY */
          <div className="flex items-stretch gap-6 overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory scrollbar-thin w-full max-w-full">
            {/* SUPPLIER DEVICE 1: RADAR & ALERTS */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Supplier Radar &amp; Hub"
                badge="Radar & Alerts"
                badgeColor="bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300"
                subtitle="Category & location matched RFQ alerts"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded-xl bg-primary/10 border border-primary/20 p-2 text-[10px]">
                    <span className="font-bold block text-primary">⚡ Sri Vinayaka Works</span>
                    <span className="text-muted-foreground">Whitefield · Verified Supplier</span>
                  </div>
                  <div className="rounded-xl border-2 border-primary/40 bg-card p-2 space-y-1.5">
                    <div className="flex justify-between text-[8px] font-bold">
                      <span className="text-blue-600">⚡ New RFQ Alert</span>
                      <span className="text-muted-foreground">4.2 km away</span>
                    </div>
                    <span className="text-[10px] font-bold block">10 HP Submersible Motor</span>
                    <div className="text-[8px] text-muted-foreground">Palm Meadows RWA</div>
                    <div className="w-full bg-primary text-white text-[9px] font-bold py-1 rounded text-center">
                      Quote (30 Min) →
                    </div>
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* SUPPLIER DEVICE 2: 30-MIN QUOTING ENGINE */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="30-Minute Quoting Engine"
                badge="30-Min Quoting"
                badgeColor="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300"
                subtitle="Instant GST auto-calculation & TAT"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded bg-primary/10 border border-primary/30 p-1.5 text-[9px] font-bold text-primary">
                    🔒 Masked as Supplier A7K3
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted-foreground">Base Amount:</span>
                    <div className="text-sm font-black bg-card border p-1.5 rounded">₹ 8,200</div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-[8px] font-bold">
                    <div className="bg-primary/10 border p-1 rounded text-center">+18% (₹1,476)</div>
                    <div className="bg-card border p-1 rounded text-center">3 Days TAT</div>
                  </div>
                  <div className="w-full bg-emerald-700 text-white text-[9px] font-bold py-1.5 rounded text-center">
                    Submit Sealed Quote →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* SUPPLIER DEVICE 3: QUOTE STATUS */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Quote Status &amp; Active Quotes"
                badge="Quote Status"
                badgeColor="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300"
                subtitle="Live status tracking & term revisions"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="flex justify-between items-center text-[9px] font-bold">
                    <span>Active Quotes</span>
                    <span className="text-emerald-600">● Live</span>
                  </div>
                  <div className="rounded-xl border-2 border-emerald-500/40 bg-card p-2 space-y-1">
                    <span className="rounded bg-emerald-100 text-emerald-800 text-[8px] font-bold px-1 py-0.2">
                      🟢 Shortlisted (L1)
                    </span>
                    <span className="text-[10px] font-bold block">10 HP Borewell Motor</span>
                    <div className="text-[9px] font-black text-emerald-600">₹8,200 · ★ 9.4</div>
                  </div>
                  <div className="w-full bg-primary text-white text-[9px] font-bold py-1.5 rounded text-center">
                    View Voting Status →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* SUPPLIER DEVICE 4: PO SIGN-OFF */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Award Notification &amp; PO Sign-off"
                badge="PO Acceptance"
                badgeColor="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300"
                subtitle="Unmasked buyer GST & 1-tap sign-off"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded bg-emerald-600 text-white p-2 text-[9px] space-y-0.5">
                    <span className="font-black block uppercase text-[7px] bg-white/20 px-1 py-0.2 rounded w-fit">🏆 Award Won</span>
                    <span className="font-bold block">PO Issued: PO-2026-0842</span>
                    <span className="text-[8px] text-white/80 block">Total: ₹9,676 (Incl. GST)</span>
                  </div>
                  <div className="rounded border bg-card p-1.5 text-[9px] space-y-0.5">
                    <span className="font-bold block">Palm Meadows RWA</span>
                    <span className="text-[8px] text-muted-foreground block">GSTIN: 29AAAAA0000A1Z5</span>
                  </div>
                  <div className="w-full bg-emerald-600 text-white text-[9px] font-bold py-1.5 rounded text-center">
                    ⚡ Accept PO &amp; Commit →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>

            {/* SUPPLIER DEVICE 5: FULFILLMENT TRACKER */}
            <div className="snap-center shrink-0">
              <MobilePhoneFrame
                title="Order Fulfillment &amp; Milestone Tracker"
                badge="Fulfillment Tracker"
                badgeColor="bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-300"
                subtitle="4-stage milestone execution & invoicing"
                size="sm"
              >
                <div className="p-3 space-y-2.5 text-left text-foreground">
                  <div className="rounded border bg-card p-1.5 text-[9px] flex justify-between font-bold">
                    <span>PO-2026-0842</span>
                    <span className="text-blue-600">In Execution (50%)</span>
                  </div>
                  <div className="space-y-1 text-[8px]">
                    <div className="text-emerald-600 font-bold">✓ 1. Pickup Scheduled</div>
                    <div className="text-emerald-600 font-bold">✓ 2. Rewinding in Progress</div>
                    <div className="text-primary font-bold animate-pulse">⚙️ 3. Ready for Delivery</div>
                    <div className="text-muted-foreground">○ 4. Invoiced &amp; Settled</div>
                  </div>
                  <div className="w-full bg-primary text-white text-[9px] font-bold py-1.5 rounded text-center">
                    📸 Update Milestone →
                  </div>
                </div>
              </MobilePhoneFrame>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
