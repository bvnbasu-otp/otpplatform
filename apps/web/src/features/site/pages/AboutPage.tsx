import { Link } from 'react-router-dom';
import { PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';

const PROBLEMS = [
  {
    title: 'The quote that was never going to lose',
    body: 'Most organisations already know who they will pick before the quotes arrive. Competitive tendering then becomes paperwork around a decision that was made socially. Hiding who submitted what removes the only input that bias needs.',
  },
  {
    title: 'The decision nobody can reconstruct',
    body: 'Six months later, the question is why the second-cheapest quote won. Without a record of the weights in force, the scores they produced and who voted which way, the honest answer is that nobody remembers — which is indistinguishable from something worse.',
  },
  {
    title: 'The follow-up tax',
    body: 'Chasing three suppliers for revised prices, chasing the treasurer for a signature, chasing the contractor for a completion photo. This is most of the calendar time in a procurement round, and almost none of the value.',
  },
];

export function AboutPage() {
  return (
    <SiteLayout>
      <div className="mx-auto max-w-3xl px-4 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-action">About Us</p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight">
          Procurement should be decided on merit, and be able to prove it
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {PRODUCT_NAME} — {PRODUCT_FULL_NAME} — exists because the way most organisations buy
          goods and services is not really a competition. It is a relationship, wrapped in
          enough paperwork to look like a process. That costs money, it invites kickbacks, and
          it leaves the people who signed off unable to explain the decision afterwards.
        </p>

        <h2 className="mt-10 text-xl font-semibold">What We Are Trying to Fix</h2>
        <div className="mt-4 space-y-5">
          {PROBLEMS.map((problem) => (
            <section key={problem.title} className="rounded-lg border bg-card p-5">
              <h3 className="text-base font-medium">{problem.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {problem.body}
              </p>
            </section>
          ))}
        </div>

        <h2 className="mt-10 text-xl font-semibold">How We Go About It</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">Structure beats good intentions.</strong> Every
            rule that matters — the deadline, the masking, the weights, who may vote — is
            enforced by the database on every path in, including the WhatsApp one. A rule that
            only the interface applies is a rule that can be skipped.
          </li>
          <li>
            <strong className="text-foreground">Anonymity has to be real to be worth
            anything.</strong> Aliases are salted per enquiry, so the same supplier is a
            different alias every time and the pattern cannot be learned. Reliability figures
            are banded, because an exact rating identifies a firm as surely as its name.
          </li>
          <li>
            <strong className="text-foreground">A record you cannot quietly edit.</strong> Votes,
            score changes, awards and approvals are appended and never rewritten — not by your
            administrators, and not by us.
          </li>
          <li>
            <strong className="text-foreground">We are not in the middle of the money.</strong>{' '}
            Buyers and suppliers contract and settle directly. We hold the process, the record
            and the evidence; we do not hold funds, and we do not take a cut of the deal.
          </li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold">Who it is for</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Any organisation that has to justify a spending decision to somebody else: housing
          societies and community associations answering to their members, small and mid-sized
          businesses without a procurement department, institutions with committees and audit
          obligations, and the suppliers who would rather be judged on their offer than on who
          they know.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/signup"
            className="rounded-md bg-action px-5 py-3 text-sm font-semibold text-action-foreground hover:bg-action-hover"
          >
            Register your organisation
          </Link>
          <Link
            to="/faqs"
            className="rounded-md border px-5 py-3 text-sm font-semibold hover:bg-muted"
          >
            Read the FAQs
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
