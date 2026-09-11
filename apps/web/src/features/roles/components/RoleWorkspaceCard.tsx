import { Link } from 'react-router-dom';
import { canVoteSomewhere, isReadOnly } from '../api/roles';
import { useRoleContext } from '../hooks/use-role-context';
import { PermissionChips } from './PermissionChips';

interface Task {
  label: string;
  to: string;
  /** Shown as a plain line instead of a link when the destination needs an enquiry. */
  note?: string;
}

interface RoleView {
  heading: string;
  blurb: string;
  tasks: (ids: { rfqId?: string; requirementId?: string }) => Task[];
}

/**
 * What each role came here to do.
 *
 * The product can do fourteen things; nobody's job is all fourteen. This is the
 * responsibility mapping from the specification, expressed as the shortlist a
 * person sees first. It is presentation only — every destination re-checks
 * permission on arrival — so being generous here would be misleading rather
 * than dangerous.
 */
const VIEWS: Record<string, RoleView> = {
  PROCUREMENT_LEAD: {
    heading: 'Run the sourcing round',
    blurb:
      'Raise the enquiry, set the phase deadlines and the weighting between price, turnaround and compliance, answer supplier questions, and put a shortlist into the Evaluation & Voting Room.',
    tasks: ({ rfqId, requirementId }) => [
      { label: 'Raise a requirement', to: '/requirements/new' },
      ...(requirementId
        ? [{ label: 'Find suppliers', to: `/requirements/${requirementId}/discover` }]
        : []),
      ...(rfqId
        ? [
          { label: 'Supplier questions', to: `/rfq/${rfqId}/clarification` },
          { label: 'Compare quotes', to: `/rfq/${rfqId}/evaluation` },
        ]
        : []),
    ],
  },
  FACILITY_MANAGER: {
    heading: 'Get the work specified and priced',
    blurb:
      'Describe what needs doing, let the platform turn it into something suppliers can price, and keep the round moving to its deadlines.',
    tasks: ({ rfqId, requirementId }) => [
      { label: 'Raise a requirement', to: '/requirements/new' },
      ...(requirementId ? [{ label: 'Open requirement', to: `/requirements/${requirementId}` }] : []),
      ...(rfqId ? [{ label: 'Supplier questions', to: `/rfq/${rfqId}/clarification` }] : []),
      ...(rfqId ? [{ label: 'Compare quotes', to: `/rfq/${rfqId}/evaluation` }] : []),
    ],
  },
  OPERATIONS_MANAGER: {
    heading: 'Raise work and track delivery',
    blurb:
      'Requirements and execution are yours. Awards and payments are signed off elsewhere, so those screens are read-only for you.',
    tasks: ({ requirementId }) => [
      { label: 'Raise a requirement', to: '/requirements/new' },
      ...(requirementId ? [{ label: 'Open requirement', to: `/requirements/${requirementId}` }] : []),
      { label: 'Orders in progress', to: '/purchase-orders' },
    ],
  },
  COMMITTEE_MEMBER: {
    heading: 'Decide on merit',
    blurb:
      'Quotes reach you ranked and anonymous. Compare them on the criteria that were set before quoting opened, record your vote with a reason, and authorise the order once the Evaluation & Voting Room has decided.',
    tasks: ({ rfqId }) =>
      rfqId
        ? [
          { label: 'Compare quotes', to: `/rfq/${rfqId}/evaluation` },
          { label: 'Evaluation & Voting Room', to: `/rfq/${rfqId}/committee` },
          { label: 'Award', to: `/rfq/${rfqId}/award` },
        ]
        : [{ label: 'Enquiries awaiting a vote', to: '/dashboard' }],
  },
  FINANCE_APPROVER: {
    heading: 'Sign off the money',
    blurb:
      'Itemised quotes, approved orders and payment schedules. You approve what has already been decided; you do not run the sourcing.',
    tasks: () => [
      { label: 'Purchase orders', to: '/purchase-orders' },
      { label: 'Audit trail', to: '/audit' },
    ],
  },
  PROPERTY_OWNER: {
    heading: 'Follow the round',
    blurb:
      'Everything is visible to you and nothing is editable. Votes, awards and execution logs, as they happen.',
    tasks: () => [
      { label: 'Purchase orders', to: '/purchase-orders' },
      { label: 'Audit trail', to: '/audit' },
    ],
  },
  GENERAL_AUDITOR: {
    heading: 'Check the record',
    blurb:
      'The append-only trail: who voted, on what, with which weights in force, and what happened after the award. Read-only by design — an auditor who can edit is not an auditor.',
    tasks: ({ rfqId }) => [
      { label: 'Audit trail', to: '/audit' },
      ...(rfqId ? [{ label: 'This enquiry’s history', to: `/rfq/${rfqId}/audit` }] : []),
    ],
  },
  SUPPLIER_FOUNDER: {
    heading: 'Win the work',
    blurb:
      'Approve what goes out under your name, negotiate through the masked thread, and accept awarded orders. The buyer’s details reach you the moment an award is locked.',
    tasks: ({ rfqId }) => [
      { label: 'Your invitations', to: '/dashboard' },
      ...(rfqId ? [{ label: 'Open enquiry', to: `/supplier/rfq/${rfqId}` }] : []),
      { label: 'Awarded orders', to: '/supplier/purchase-orders' },
      { label: 'What you can do', to: '/supplier/capabilities' },
    ],
  },
  SUPPLIER_BD_HEAD: {
    heading: 'Own the pipeline',
    blurb:
      'Leads in your categories and coverage, quotes you authorise, and negotiations you carry. Same commercial authority as the owner.',
    tasks: ({ rfqId }) => [
      { label: 'Your invitations', to: '/dashboard' },
      ...(rfqId ? [{ label: 'Open enquiry', to: `/supplier/rfq/${rfqId}` }] : []),
      { label: 'What you can do', to: '/supplier/capabilities' },
    ],
  },
  SUPPLIER_SALES_MANAGER: {
    heading: 'Quote and revise',
    blurb:
      'Price the work line by line, answer the buyer’s questions, and revise before the deadline. Accepting an awarded order needs the owner.',
    tasks: ({ rfqId }) => [
      { label: 'Your invitations', to: '/dashboard' },
      ...(rfqId ? [{ label: 'Submit or revise a quote', to: `/supplier/rfq/${rfqId}` }] : []),
    ],
  },
  SUPPLIER_TECHNICAL_LEAD: {
    heading: 'Prove you can do it, then do it',
    blurb:
      'Certifications and technical documents while quoting; milestones and proof of work once the order lands. No commercial authority — you cannot put a price in front of a buyer.',
    tasks: () => [
      { label: 'Capabilities and documents', to: '/supplier/capabilities' },
      { label: 'Work orders', to: '/supplier/purchase-orders' },
    ],
  },
  SUPPLIER_FINANCE: {
    heading: 'Bill for completed work',
    blurb:
      'Invoices against milestones that have been signed off, and where each payment stands.',
    tasks: () => [{ label: 'Orders and invoices', to: '/supplier/purchase-orders' }],
  },
};

export function RoleWorkspaceCard({
  rfqId,
  requirementId,
}: {
  rfqId?: string;
  requirementId?: string;
}) {
  const { context } = useRoleContext();
  const role = context.activeRole;
  if (!role) return null;

  const view = VIEWS[role.code];
  if (!view) return null;

  const tasks = view.tasks({ rfqId, requirementId });
  const readOnly = isReadOnly(context);

  return (
    <section
      className="rounded-lg border bg-card p-5"
      data-testid="role-workspace"
      data-role={role.code}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-primary">
            {role.label}
          </p>
          <h2 className="mt-1 text-lg font-medium">{view.heading}</h2>
        </div>
        <PermissionChips permissions={role.permissions} />
      </div>

      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{view.blurb}</p>

      {tasks.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tasks.map((task) => (
            <Link
              key={`${task.label}-${task.to}`}
              to={task.to}
              className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            >
              {task.label} →
            </Link>
          ))}
        </div>
      )}

      {/*
        The one place the interface must not flatter the role. A committee title
        grants the permission to vote; the right to vote on a particular enquiry
        comes from being assigned to it, and no title substitutes for that.
      */}
      {role.permissions.includes('VOTE') && !canVoteSomewhere(context) && (
        <p
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900"
          data-testid="no-committee-assignment"
        >
          You have not been added to an evaluation team for any open enquiry yet, so there is nothing
          to vote on. Your organisation assigns voting members per enquiry.
        </p>
      )}

      {readOnly && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="read-only-note">
          This role is read-only. Nothing you open can be edited, and that is deliberate.
        </p>
      )}
    </section>
  );
}
