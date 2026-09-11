import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SiteLayout } from '@/features/site';
import { BuyerRegisterForm } from '../components/BuyerRegisterForm';
import { FormDensityProvider } from '../components/FormDensity';
import { BUYER_GLYPHS, SUPPLIER_GLYPHS } from '../components/PortalGlyphs';
import { SignupSuccess } from '../components/SignupSuccess';
import { SupplierRegisterForm } from '../components/SupplierRegisterForm';
import type { SignupResult } from '../api/signup';
import { copyFor, sideFromParam, sideParam, type PortalSide } from '../types/portal';

/**
 * Registration, for someone who arrived from the landing page rather than from
 * one side's proposition.
 *
 * On the site's own chrome, not the portal's. /signup is a destination in the
 * public navigation and its neighbour is /login, so it carries the same header,
 * the same footer and the same proportions as the rest of the marketing site. The
 * portal's edge-to-edge split screen belongs to /buyer and /seller, which are
 * propositions a visitor lands on rather than pages they navigate between — a
 * visitor who clicks "Sign up" and loses the navigation has no way back to the
 * pricing page they were reading a moment ago.
 *
 * The value points stay, beside the form rather than opposite it in a half of the
 * window. They are there because registration is a commitment made before the
 * account does anything visible, and the reasons for making it should not be a
 * page back.
 *
 * The side is a query parameter with a switch on the page, because a visitor who
 * clicked "Sign up" in the navigation has not yet told us which half of the
 * market they are in. Both values are addressable — /signup?side=buyer and
 * /signup?side=supplier — so either form can be linked to directly, which is how
 * these accounts really get created: a buyer forwards the supplier link to the
 * contractor they already use.
 */
export function SignupPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState<SignupResult | null>(null);

  // Buying is the common case, so a bare /signup opens on it. Both sides are
  // nameable in the URL all the same: ?side=buyer is the link you send someone
  // when you want to be sure which form they land on, and a link that only works
  // for one of two choices is a link people stop trusting.
  const side: PortalSide = sideFromParam(params.get('side')) ?? 'BUYER';
  const copy = copyFor(side);
  const glyphs = side === 'BUYER' ? BUYER_GLYPHS : SUPPLIER_GLYPHS;

  function chooseSide(next: PortalSide) {
    setSubmitted(null);
    const updated = new URLSearchParams(params);
    updated.set('side', sideParam(next));
    setParams(updated, { replace: true });
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16">
          {/*
            Second in the source order and first on screen at large sizes: the
            form is the errand, so a phone gets it without scrolling past the
            sales copy to reach it.
          */}
          <div className="order-2 lg:order-1">
            {/*
              The reasons stay put while the form scrolls past them. The card is
              taller than any viewport, so sticking the card would do nothing;
              sticking the short column is what actually keeps the left half of a
              wide screen from going blank halfway down the form.
            */}
            <div className="lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">
                {copy.eyebrow}
              </p>
              <h1 className="mt-2 text-3xl font-semibold leading-tight">{copy.headline}</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                {copy.subhead}
              </p>

              <ul className="mt-8 grid max-w-2xl gap-x-8 gap-y-6 sm:grid-cols-2">
                {copy.propositions.map((proposition, index) => {
                  const Glyph = glyphs[index] ?? glyphs[0]!;
                  return (
                    <li key={proposition.title} className="flex gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-navy-soft text-action">
                        <Glyph className="h-[55%] w-[55%]" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-medium leading-tight">
                          {proposition.title}
                        </h3>
                        <p className="mt-1 text-sm leading-snug text-muted-foreground">
                          {proposition.body}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p className="mt-8 max-w-2xl text-sm text-muted-foreground">
                Already registered?{' '}
                <Link to="/login" className="font-medium text-action hover:underline">
                  Log in
                </Link>
                . Want to read more first? See{' '}
                <Link to="/pricing" className="font-medium text-action hover:underline">
                  pricing
                </Link>{' '}
                or the{' '}
                <Link to="/faqs" className="font-medium text-action hover:underline">
                  FAQs
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            {/*
              Loose, because this page scrolls. The portal's dense setting is
              there to fit a form into a panel that does not.
            */}
            <FormDensityProvider dense={false}>
              <div className="rounded-lg border bg-card p-6">
                {submitted ? (
                  <SignupSuccess
                    copy={copy}
                    result={submitted}
                    onSignIn={() => navigate('/login')}
                  />
                ) : (
                  <>
                    {/*
                      The same segmented switch the sign-in form uses to choose a
                      code or a password. Signing up and signing in are one errand
                      with two doors, and "pick one of two" should not be a
                      different control on each of them.
                    */}
                    <div
                      role="radiogroup"
                      aria-label="Which side are you on?"
                      className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs"
                    >
                      {(
                        [
                          ['BUYER', 'I need work to be done'],
                          ['SUPPLIER', 'I provide services'],
                        ] as [PortalSide, string][]
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={side === value}
                          onClick={() => chooseSide(value)}
                          data-testid={`signup-side-${value.toLowerCase()}`}
                          className={`rounded px-2.5 py-1.5 ${
                            side === value
                              ? 'bg-card font-medium shadow-sm'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <h2 className="mt-5 text-xl font-semibold">{copy.registerTitle}</h2>
                    <p className="mt-1 text-sm leading-snug text-muted-foreground">
                      {copy.registerSubtitle}
                    </p>

                    <div className="mt-5">
                      {side === 'BUYER' ? (
                        <BuyerRegisterForm
                          onSuccess={setSubmitted}
                          onSignIn={() => navigate('/login')}
                          showHeading={false}
                        />
                      ) : (
                        <SupplierRegisterForm
                          onSuccess={setSubmitted}
                          onSignIn={() => navigate('/login')}
                          showHeading={false}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </FormDensityProvider>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
