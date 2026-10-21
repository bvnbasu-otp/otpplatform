export const RECORD_PAGE_SIZE = 50;

interface RecordPagerProps {
  offset: number;
  pageSize?: number;
  /** Rows returned for this page. */
  count: number;
  /** Total matching rows, when the query reports one. */
  totalCount?: number | null;
  /** Authoritative continuation signal when the backend does not report a total. */
  hasNext?: boolean;
  disabled?: boolean;
  label: string;
  onOffsetChange: (offset: number) => void;
}

/**
 * Previous/next access for a server page. A full page enables Next.
 * A short page is the last page, so the control never pages an invented total.
 */
export function RecordPager({
  offset,
  pageSize = RECORD_PAGE_SIZE,
  count,
  totalCount,
  hasNext,
  disabled = false,
  label,
  onOffsetChange,
}: RecordPagerProps) {
  const page = Math.floor(offset / pageSize) + 1;
  const from = count === 0 ? 0 : offset + 1;
  const to = offset + count;
  const hasPrevious = offset > 0;
  const canGoNext =
    totalCount != null ? offset + count < totalCount : (hasNext ?? count >= pageSize);
  const range =
    totalCount != null ? `Showing ${from}–${to} of ${totalCount}` : `Showing ${from}–${to}`;

  return (
    <nav
      aria-label={label}
      data-testid="record-pager"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2"
    >
      <p className="text-xs text-muted-foreground">{range}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || !hasPrevious}
          onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-xs font-semibold text-foreground">Page {page}</span>
        <button
          type="button"
          disabled={disabled || !canGoNext}
          onClick={() => onOffsetChange(offset + pageSize)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
