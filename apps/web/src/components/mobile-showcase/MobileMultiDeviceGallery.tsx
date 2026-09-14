import React from 'react';
import { MobilePhoneFrame } from './MobilePhoneFrame';

export function MobileMultiDeviceGallery() {
  return (
    <section className="py-12 sm:py-16 bg-muted/30 border-b border-border/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
          <span className="inline-block rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider px-3 py-1 mb-2">
            7-Screen End-to-End Pipeline
          </span>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight">
            How OTP Works on Every Smartphone
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
            From the factory floor to the RWA committee room—manage your entire sourcing lifecycle without leaving your phone.
          </p>
        </div>

        {/* Horizontal Scrolling Multi-Device Gallery */}
        <div className="flex items-stretch gap-6 overflow-x-auto pb-6 pt-2 px-2 snap-x snap-mandatory scrollbar-thin">
          {/* DEVICE 1: HOME COCKPIT */}
          <div className="snap-center shrink-0">
            <MobilePhoneFrame
              title="1. Sourcing Cockpit"
              badge="Tell What You Need"
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
              title="2. Voice Intake"
              badge="Instant Specs"
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

          {/* DEVICE 3: SEALED QUOTING */}
          <div className="snap-center shrink-0">
            <MobilePhoneFrame
              title="3. 1-Tap Quoting"
              badge="WhatsApp Quoting"
              badgeColor="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300"
              subtitle="Vendors quote in 15 seconds"
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

          {/* DEVICE 4: 4-PILLAR MATRIX */}
          <div className="snap-center shrink-0">
            <MobilePhoneFrame
              title="4. Sealed Matrix"
              badge="Zero-Bias Decision"
              badgeColor="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300"
              subtitle="4-pillar metrics under protected aliases"
              size="sm"
            >
              <div className="p-3 space-y-2 text-left text-foreground">
                <div className="flex justify-between items-center text-[9px] font-bold">
                  <span>🔒 3 Sealed Quotes</span>
                  <span className="text-emerald-700 bg-emerald-100 px-1 rounded">Protected</span>
                </div>
                {/* L1 Card */}
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
                {/* Card 2 */}
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

          {/* DEVICE 5: COMMITTEE VOTING */}
          <div className="snap-center shrink-0">
            <MobilePhoneFrame
              title="5. Committee Vote"
              badge="Democratic Room"
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

          {/* DEVICE 6: UNMASK & PO EXECUTION */}
          <div className="snap-center shrink-0">
            <MobilePhoneFrame
              title="6. Winner Unmask & PO"
              badge="Procure to Pay"
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
      </div>
    </section>
  );
}
