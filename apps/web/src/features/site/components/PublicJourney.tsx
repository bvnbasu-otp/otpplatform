import { PUBLIC_JOURNEY, TRUST_PRINCIPLES } from '../content/site-content';

/** The one customer journey: Request → Compare → Decide → Purchase → Track. */
export function PublicJourney({ id = 'how-it-works' }: { id?: string }) {
  return (
    <section id={id} className="scroll-mt-16 px-4 sm:px-6" data-testid="public-journey">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
          How it works
        </h2>
        <ol className="mt-6 grid grid-cols-1 sm:grid-cols-5 gap-3">
          {PUBLIC_JOURNEY.map((step, index) => (
            <li
              key={step.title}
              data-testid="public-journey-step"
              className="rounded-2xl border bg-card p-4 shadow-2xs"
            >
              <span className="font-mono text-[11px] font-bold text-muted-foreground">{index + 1}</span>
              <h3 className="mt-1 text-sm font-bold text-foreground">{step.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** What a customer can rely on — deliberately separate from the journey steps. */
export function TrustPrinciples() {
  return (
    <section className="px-4 sm:px-6" data-testid="trust-principles">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
          What you can count on
        </h2>
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TRUST_PRINCIPLES.map((principle) => (
            <li key={principle.title} className="rounded-2xl border bg-card p-4 shadow-2xs">
              <h3 className="text-sm font-bold text-foreground">{principle.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{principle.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
