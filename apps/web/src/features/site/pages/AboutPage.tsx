import { Link } from 'react-router-dom';
import { useRoleContext } from '@/features/roles';
import {
  PRODUCT_FULL_NAME,
  PRODUCT_NAME,
  PRODUCT_PLATFORM_SUBTITLE,
  PRODUCT_TITLE,
  PUBLIC_CONTENT_LAST_REVIEWED,
} from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';

export function AboutPage() {
  const { context } = useRoleContext();
  const canSeeProvenance = context.isFounder || context.isPlatformAdmin;

  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 overflow-x-hidden">
        <div className="max-w-2xl space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-action">About Us</p>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground font-medium">
              Last updated: {PUBLIC_CONTENT_LAST_REVIEWED}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight tracking-tight">
            {PRODUCT_TITLE}
          </h1>
          <p className="text-sm md:text-base leading-relaxed text-muted-foreground">
            {PRODUCT_PLATFORM_SUBTITLE}
          </p>
          <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
            {PRODUCT_NAME} ({PRODUCT_FULL_NAME}) helps individuals, businesses and housing societies in India
            get competing quotes for the things they need to buy, compare them fairly, and keep a clear record of
            how the choice was made.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
            <h2 className="text-sm font-bold text-foreground">Fair comparison</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Supplier names stay hidden while you compare, so quotes are judged on price, delivery and warranty —
              not on who you know.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
            <h2 className="text-sm font-bold text-foreground">Works from your phone</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Raise a request by typing or speaking. Suppliers invited directly can quote from a secure link without installing anything. WhatsApp and SMS delivery is planned but not yet live.
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
            <h2 className="text-sm font-bold text-foreground">You pay suppliers directly</h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {PRODUCT_NAME} does not take a commission or handle your money. You agree terms and pay the supplier
              yourself.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border bg-muted/20 p-5 sm:p-6 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-action">Who it is for</h2>
          <div className="grid gap-4 sm:grid-cols-2 text-xs leading-relaxed">
            <div className="space-y-1.5">
              <h3 className="font-bold text-foreground">Housing societies &amp; RWAs</h3>
              <p className="text-muted-foreground text-[11px]">
                Committee members vote on the same comparison and record why, so residents can see the decision was
                fair.
              </p>
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-foreground">Businesses &amp; individuals</h3>
              <p className="text-muted-foreground text-[11px]">
                Get several quotes for a job without phoning around, and pick the best offer rather than the
                loudest one.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="border-b border-border/60 pb-3">
            <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              Example · Housing society
            </span>
            <h2 className="mt-1 text-base sm:text-lg font-bold text-foreground">
              Durga Rainbow Flat Owner Welfare Association, Mahadevapura
            </h2>
            <p className="text-[11px] font-medium text-muted-foreground">141 homes · Bengaluru</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 text-xs leading-relaxed">
            <div className="space-y-1">
              <h3 className="font-bold text-foreground">The need</h3>
              <p className="text-muted-foreground text-[11px]">
                A 10 HP borewell motor needed rewinding within three days, and the committee had to agree on a
                supplier without anyone being accused of favouritism.
              </p>
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-foreground">How {PRODUCT_NAME} helped</h3>
              <p className="text-muted-foreground text-[11px]">
                Local suppliers were invited to quote, the committee compared the offers with names hidden, voted,
                and only then met the supplier they had chosen.
              </p>
            </div>
          </div>
        </div>

        {canSeeProvenance && (
          <div
            className="mt-8 rounded-2xl border bg-card p-5 sm:p-6 space-y-4 shadow-xs"
            data-testid="product-leadership-provenance"
          >
            <div className="border-b border-border/60 pb-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-action">
                Product Leadership &amp; Provenance · visible to founder and platform admins only
              </p>
              <h2 className="text-base font-bold text-foreground">Product ownership</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product Creator &amp; Author</span>
                <p className="font-extrabold text-foreground text-sm">Baskar Loganathan</p>
                <p className="text-[11px] text-muted-foreground">Original concept and product design.</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product Manager</span>
                <p className="font-extrabold text-foreground text-sm">Baskar Loganathan</p>
                <p className="text-[11px] text-muted-foreground">Product roadmap, feature specifications, and procurement governance.</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">CEO / Founder</span>
                <p className="font-extrabold text-foreground text-sm">Baskar Loganathan</p>
                <p className="text-[11px] text-muted-foreground">Executive direction, commercial pilot execution, and platform leadership.</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3 pt-2">
          <Link
            to="/signup"
            className="rounded-xl bg-action px-5 py-2.5 text-xs font-bold text-action-foreground hover:bg-action-hover shadow-xs"
          >
            Register →
          </Link>
          <Link
            to="/faqs"
            className="rounded-xl border border-transparent px-4 py-2.5 text-xs font-bold text-action hover:underline"
          >
            Read the FAQs
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
