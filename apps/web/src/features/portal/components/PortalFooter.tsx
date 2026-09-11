import { Link } from 'react-router-dom';
import { PLATFORM_DISCLAIMER, PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand';

/**
 * The footer both portals carry.
 *
 * The disclaimer keeps its own line rather than being folded into the link row.
 * It is set small, but it is the one thing on this page a new supplier needs to
 * read before they quote — that the platform never touches the money — so it
 * does not get abbreviated away to save space.
 *
 * `panel` sits inside an already-padded column; `page` centres itself on a
 * full-width page.
 */
export function PortalFooter({
  tone = 'light',
  variant = 'page',
}: {
  tone?: 'light' | 'dark';
  variant?: 'page' | 'panel';
}) {
  const dark = tone === 'dark';

  return (
    <footer
      className={`border-t ${
        dark ? 'border-navy-line text-navy-muted' : 'border-border text-slate-soft'
      }`}
      data-testid="portal-footer"
    >
      <div className={variant === 'page' ? 'mx-auto max-w-4xl px-6 py-6' : 'pt-4'}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[0.7rem]">
          <Link to="/" className="hover:underline">
            <span className={dark ? 'text-navy-foreground' : 'text-slate'}>
              {PRODUCT_NAME} · {PRODUCT_FULL_NAME}
            </span>
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/legal/terms" className="hover:underline">
              Terms
            </Link>
            <Link to="/legal/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link to="/legal/disclaimer" className="hover:underline">
              Disclaimer
            </Link>
            <span className={dark ? 'text-navy-faint' : 'text-slate-400'}>
              © {new Date().getFullYear()}
            </span>
          </nav>
        </div>

        <p
          className={`mt-2 text-[0.65rem] leading-snug ${
            dark ? 'text-navy-faint' : 'text-slate-soft'
          }`}
          data-testid="platform-disclaimer"
        >
          {PLATFORM_DISCLAIMER}
        </p>
      </div>
    </footer>
  );
}
