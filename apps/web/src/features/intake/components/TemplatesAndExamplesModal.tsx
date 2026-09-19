import { useState } from 'react';
import { Modal } from '@/components/ui/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export interface ProcurementTemplate {
  id: string;
  title: string;
  category: string;
  subcategory: string;
  mode: 'BUY' | 'SERVICE' | 'REPAIR' | 'RATE_CONTRACT';
  defaultUnit: string;
  suggestedQuantity?: number;
  description: string;
  specifications: Record<string, string>;
  standardWarrantyMonths?: number;
}

export interface ProcurementExample {
  id: string;
  title: string;
  location: string;
  organizationType: 'COMMUNITY' | 'MSME' | 'ENTERPRISE' | 'INDIVIDUAL';
  scenario: string;
  benchmarkPriceRange: string;
  turnaroundDays: number;
  warrantyOffered: string;
  keyTakeaway: string;
}

export const CANONICAL_TEMPLATES: ProcurementTemplate[] = [
  {
    id: 'tmpl-submersible-motor',
    title: '10 HP Submersible Borewell Motor Rewinding',
    category: 'Electrical & Power Equipment',
    subcategory: 'Motor Repair & Rewinding',
    mode: 'REPAIR',
    defaultUnit: 'unit',
    suggestedQuantity: 1,
    description: 'Complete copper rewinding, rotor balancing, bush/bearing replacement, and high-voltage insulation testing for 10 HP borewell pump.',
    specifications: {
      'Winding Material': '100% EC Grade Copper',
      'Insulation Class': 'Class F / Class H',
      'Testing Method': 'Megger Insulation & Full Load Current Test',
    },
    standardWarrantyMonths: 6,
  },
  {
    id: 'tmpl-hvac-maintenance',
    title: 'Comprehensive Annual HVAC Chiller Maintenance',
    category: 'Facility & Building Services',
    subcategory: 'HVAC Maintenance & Servicing',
    mode: 'SERVICE',
    defaultUnit: 'TR',
    suggestedQuantity: 50,
    description: 'Quarterly preventative maintenance, descaling of condenser tubes, refrigerant leak inspection, and compressor health telemetry.',
    specifications: {
      'Visits Included': '4 Scheduled + Unlimited Emergency Breakdowns',
      'Response Time SLA': 'Under 4 Hours',
      'Spare Parts Coverage': 'Comprehensive (O-rings, valves, lubricants)',
    },
    standardWarrantyMonths: 12,
  },
  {
    id: 'tmpl-cnc-flanges',
    title: 'CNC Machined SS316 Industrial Flanges',
    category: 'Manufacturing & Industrial Goods',
    subcategory: 'Precision Machining & Fabrication',
    mode: 'BUY',
    defaultUnit: 'pieces',
    suggestedQuantity: 500,
    description: 'Precision CNC turned stainless steel 316 flanges with 150# ANSI B16.5 rating, mill test certificates, and deburred surface finish.',
    specifications: {
      'Material Grade': 'AISI SS316',
      'Pressure Rating': '150 LBS ANSI B16.5',
      'Certificates Required': 'EN 10204 3.1 Mill Test Report',
    },
    standardWarrantyMonths: 12,
  },
  {
    id: 'tmpl-terrace-waterproofing',
    title: 'Commercial Terrace Waterproofing & Elastomeric Coating',
    category: 'Civil & Structural Works',
    subcategory: 'Waterproofing & Civil Repairs',
    mode: 'SERVICE',
    defaultUnit: 'sq ft',
    suggestedQuantity: 5000,
    description: 'Crack sealing with polymer modified mortar followed by 3-coat UV-resistant elastomeric membrane waterproofing.',
    specifications: {
      'Coating Thickness': 'Minimum 1.2 mm DFT',
      'Coats': '1 Primer + 2 Elastomeric Top Coats',
      'Ponding Test': 'Mandatory 48-hour water holding test',
    },
    standardWarrantyMonths: 36,
  },
];

export const CANONICAL_EXAMPLES: ProcurementExample[] = [
  {
    id: 'ex-chennai-rwa-generator',
    title: '250 kVA Diesel Generator Overhaul (Chennai RWA)',
    location: 'Chennai, Tamil Nadu (600028)',
    organizationType: 'COMMUNITY',
    scenario: 'A residential apartment society needed urgent top-overhaul of a 250 kVA Cummins DG set after oil leakage before monsoon.',
    benchmarkPriceRange: '₹65,000 – ₹82,000',
    turnaroundDays: 4,
    warrantyOffered: '6 Months Comprehensive Warranty',
    keyTakeaway: 'Competitive sealed quoting reduced committee deliberation from 3 weeks to 48 hours with verified GST invoice.',
  },
  {
    id: 'ex-pune-msme-machining',
    title: 'Batch CNC Turning for Automobile Bushings (Pune MSME)',
    location: 'Pune, Maharashtra (411018)',
    organizationType: 'MSME',
    scenario: 'An automotive tier-2 component manufacturer required urgent outsourced CNC turning of 2,000 EN8 steel bushings.',
    benchmarkPriceRange: '₹38 – ₹45 per piece',
    turnaroundDays: 7,
    warrantyOffered: '100% Dimensional Inspection Acceptance',
    keyTakeaway: 'Decoupled identity quotes allowed local machine shops to compete fairly on turnaround time and tolerance accuracy.',
  },
  {
    id: 'ex-blr-solar-rooftop',
    title: '50 kW Commercial Rooftop Solar Installation (Bengaluru)',
    location: 'Bengaluru, Karnataka (560100)',
    organizationType: 'ENTERPRISE',
    scenario: 'A logistics warehouse facility procured a 50 kW on-grid solar photovoltaic plant with net metering approvals.',
    benchmarkPriceRange: '₹22,00,000 – ₹25,50,000',
    turnaroundDays: 21,
    warrantyOffered: '5 Years System Warranty / 25 Years Module SLA',
    keyTakeaway: 'Milestone-based progressive settlement ensured payments were only released after Bescom net-metering synchronization.',
  },
];

export interface TemplatesAndExamplesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate?: (template: ProcurementTemplate) => void;
}

export function TemplatesAndExamplesModal({
  isOpen,
  onClose,
  onSelectTemplate,
}: TemplatesAndExamplesModalProps) {
  const [activeTab, setActiveTab] = useState<'templates' | 'examples' | 'guidance'>('templates');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary font-black text-sm">
            📚
          </span>
          <span className="font-extrabold text-foreground text-sm sm:text-base">
            Procurement Guidance, Templates &amp; Real-World Examples
          </span>
        </div>
      }
      subtitle="Understand the strict boundary between Structural Templates, Illustrative Examples, and Authoritative Confirmed Requirements."
      testId="templates-examples-modal"
    >
      {/* Navigation Tabs */}
      <div className="flex border-b border-border mb-4 overflow-x-auto pb-0.5 no-scrollbar min-w-0 flex-nowrap sm:flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 -mb-px flex items-center gap-1.5 shrink-0 min-w-0 ${
            activeTab === 'templates'
              ? 'border-primary text-primary font-black'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-templates"
        >
          <span>📋</span>
          <span className="truncate">Templates ({CANONICAL_TEMPLATES.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('examples')}
          className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 -mb-px flex items-center gap-1.5 shrink-0 min-w-0 ${
            activeTab === 'examples'
              ? 'border-primary text-primary font-black'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-examples"
        >
          <span>💡</span>
          <span className="truncate">Case Studies &amp; Examples ({CANONICAL_EXAMPLES.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('guidance')}
          className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 -mb-px flex items-center gap-1.5 shrink-0 min-w-0 ${
            activeTab === 'guidance'
              ? 'border-primary text-primary font-black'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          data-testid="tab-guidance"
        >
          <span>⚖️</span>
          <span className="truncate">Buyer Authority &amp; Quantity Rules</span>
        </button>
      </div>

      {/* TAB 1: TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
            <span className="font-bold text-primary block mb-0.5">ℹ️ How Templates Work:</span>
            <p className="text-muted-foreground leading-relaxed">
              Templates provide structured starting baselines with standard industry specifications. Quantities and counts are <strong>never locked</strong> — you can edit every value before publishing.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 min-w-0">
            {CANONICAL_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.id}
                className="rounded-xl border bg-card p-3.5 flex flex-col justify-between shadow-2xs hover:border-primary/50 transition min-w-0"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 min-w-0">
                    <h4 className="font-bold text-xs text-foreground leading-snug min-w-0 break-words flex-1">
                      {tmpl.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1 shrink-0">
                      <span className="rounded bg-muted/80 px-2 py-0.5 text-[9px] font-semibold text-muted-foreground border shrink-0">
                        {tmpl.category}
                      </span>
                      <Badge tone="neutral" className="text-[10px] shrink-0">
                        {tmpl.mode}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed min-w-0 break-words">
                    {tmpl.description}
                  </p>

                  <div className="space-y-1.5 text-[10px] pt-1.5 border-t border-border/60 min-w-0">
                    {Object.entries(tmpl.specifications).slice(0, 2).map(([k, v]) => (
                      <div key={k} className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-muted-foreground min-w-0 gap-0.5 sm:gap-2 py-0.5 leading-snug">
                        <span className="min-w-0 break-words font-medium">{k}:</span>
                        <strong className="text-foreground min-w-0 break-words sm:text-right">{v}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t flex flex-col xs:flex-row sm:flex-row items-start xs:items-center sm:items-center justify-between gap-2 min-w-0">
                  <span className="text-[10px] text-muted-foreground min-w-0">
                    Default: {tmpl.suggestedQuantity} {tmpl.defaultUnit}
                  </span>
                  {onSelectTemplate && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onSelectTemplate(tmpl);
                        onClose();
                      }}
                      className="min-h-[36px] text-xs font-bold w-full xs:w-auto sm:w-auto"
                      data-testid={`use-template-${tmpl.id}`}
                    >
                      Use Template →
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: EXAMPLES */}
      {activeTab === 'examples' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-foreground">
            <span className="font-bold text-indigo-700 dark:text-indigo-300 block mb-0.5">
              💡 Real-World Illustrative Benchmarks:
            </span>
            <p className="text-muted-foreground leading-relaxed">
              These case studies show how actual buyers used OTP's sealed evaluation, fair price discovery, and milestone settlements.
            </p>
          </div>

          <div className="space-y-3">
            {CANONICAL_EXAMPLES.map((ex) => (
              <div
                key={ex.id}
                className="rounded-xl border bg-card p-3.5 space-y-2.5 shadow-2xs min-w-0"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground shrink-0">
                        {ex.organizationType}
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground min-w-0">
                        📍 {ex.location}
                      </span>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-foreground mt-1 min-w-0 break-words">
                      {ex.title}
                    </h4>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed min-w-0 break-words">
                  {ex.scenario}
                </p>

                <div className="grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-3 gap-2 bg-muted/30 p-2.5 rounded-lg text-center text-[10px] min-w-0">
                  <div className="p-1">
                    <span className="block text-muted-foreground">Benchmark Price</span>
                    <strong className="text-foreground text-[11px] font-bold break-words">{ex.benchmarkPriceRange}</strong>
                  </div>
                  <div className="p-1 border-t xs:border-t-0 sm:border-t-0 xs:border-l sm:border-l border-border/40">
                    <span className="block text-muted-foreground">Turnaround</span>
                    <strong className="text-foreground text-[11px] font-bold">{ex.turnaroundDays} Days</strong>
                  </div>
                  <div className="p-1 border-t xs:border-t-0 sm:border-t-0 xs:border-l sm:border-l border-border/40">
                    <span className="block text-muted-foreground">Warranty</span>
                    <strong className="text-foreground text-[11px] font-bold break-words">{ex.warrantyOffered}</strong>
                  </div>
                </div>

                <div className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium bg-emerald-500/10 p-2.5 rounded-lg flex items-start sm:items-center gap-1.5 min-w-0">
                  <span className="shrink-0 mt-0.5 sm:mt-0">✓</span>
                  <span className="min-w-0 break-words"><strong>Key Outcome:</strong> {ex.keyTakeaway}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: GUIDANCE & AUTHORITY */}
      {activeTab === 'guidance' && (
        <div className="space-y-3 text-xs leading-relaxed min-w-0">
          <div className="rounded-xl border bg-card p-4 space-y-2 min-w-0">
            <h4 className="font-extrabold text-foreground flex items-center gap-1.5 min-w-0 break-words">
              <span>⚖️</span> Rule 1: Buyer Confirmation Authority Boundary
            </h4>
            <p className="text-muted-foreground min-w-0 break-words">
              OTP artificial intelligence, voice speech-to-text, document parsers, and template engines generate <strong>draft suggestions only</strong>. An enquiry is never broadcast to suppliers and an RFQ is never legally published until the authorized buyer explicitly confirms and submits the requirement.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2 min-w-0">
            <h4 className="font-extrabold text-foreground flex items-center gap-1.5 min-w-0 break-words">
              <span>🔢</span> Rule 2: Explicit Quantity &amp; Count Editing
            </h4>
            <p className="text-muted-foreground min-w-0 break-words">
              Suggested quantities from voice dictation or template selection are never silently locked or immutable. Buyers retain full manual control to modify quantity numbers, custom units of measurement, delivery deadlines, and budgetary constraints at every step of the wizard.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2 min-w-0">
            <h4 className="font-extrabold text-foreground flex items-center gap-1.5 min-w-0 break-words">
              <span>🔄</span> Rule 3: Zero Penalty Reset &amp; Re-Capture
            </h4>
            <p className="text-muted-foreground min-w-0 break-words">
              If an extraction does not match your intent, you can tap <em>Clear Input</em>, re-record voice in another language (Tamil, Hindi, English), or upload updated engineering drawings with zero penalty and zero data residue.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t flex justify-end">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onClose}
          className="min-h-[40px] px-5 font-bold"
        >
          Got it
        </Button>
      </div>
    </Modal>
  );
}
