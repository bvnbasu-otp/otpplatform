import { OtpLogo } from '@/components/ui/OtpLogo';
import type { DocumentPartyBlock, ProcurementDocumentModel } from '../lib/procurement-document';

function Party({ party }: { party: DocumentPartyBlock }) {
  return (
    <div className="border border-slate-300 rounded p-3" data-testid={`doc-party-${party.heading.toLowerCase()}`}>
      <p className="text-[10px] uppercase font-bold text-slate-500">
        {party.heading} · {party.role}
      </p>
      <p className="font-bold text-slate-900 text-sm">{party.name}</p>
      {party.details.map((d) => (
        <p key={d} className="text-[11px] text-slate-700">{d}</p>
      ))}
    </div>
  );
}

/**
 * A4 portrait print layout for a procurement document. Hidden on screen and
 * shown only when printing / saving as PDF. Each model page becomes one sheet.
 */
export function PrintableProcurementDocument({ model, className = 'hidden print:block' }: { model: ProcurementDocumentModel; className?: string }) {
  return (
    <div
      className={`${className} text-slate-900 bg-white font-sans text-[11px] leading-snug`}
      data-testid="printable-procurement-document"
      data-format={model.format}
      data-orientation={model.orientation}
    >
      {model.pages.map((page) => (
        <section
          key={page.pageNumber}
          className={`flex flex-col min-h-[270mm] ${page.isLast ? '' : 'break-after-page'}`}
          data-page={page.pageNumber}
        >
          <header className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-4" data-section="header">
            <div className="flex items-center gap-3">
              <OtpLogo size={40} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {model.brand.name} · {model.brand.fullName}
                </p>
                <h1 className="text-xl font-black uppercase">{model.documentType}</h1>
                <p className="text-xs font-semibold text-slate-700">{model.title}</p>
              </div>
            </div>
            <div className="text-right text-[11px]">
              <p className="font-mono font-bold">Ref: {model.referenceNumber}</p>
              <p>Issued: {model.issuedAtLabel}</p>
              {model.identityProtected && <p className="font-bold">Identity protected</p>}
            </div>
          </header>

          {page.isFirst && (
            <div className="grid grid-cols-2 gap-4 mb-4" data-section="parties">
              <Party party={model.parties.from} />
              <Party party={model.parties.to} />
            </div>
          )}

          <table className="w-full border-collapse border border-slate-300 mb-4" data-section="line-items">
            <thead>
              <tr className="bg-slate-100 text-[10px] uppercase">
                {model.columns.map((c) => (
                  <th key={c} className="border border-slate-300 p-1.5 text-left">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.length === 0 ? (
                <tr>
                  <td colSpan={model.columns.length} className="p-3 text-center text-slate-500">No line items recorded.</td>
                </tr>
              ) : (
                page.rows.map((row, i) => (
                  <tr key={`${page.pageNumber}-${i}`}>
                    {row.map((cell, j) => (
                      <td key={j} className="border border-slate-300 p-1.5 align-top">{cell}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {page.isLast && model.totals.length > 0 && (
            <table className="ml-auto w-72 border-collapse mb-4" data-section="totals">
              <tbody>
                {model.totals.map((t) => (
                  <tr key={t.label} className={t.emphasis ? 'font-black border-t-2 border-slate-900' : ''}>
                    <td className="p-1">{t.label}</td>
                    <td className="p-1 text-right font-mono">{t.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {page.isLast && model.notes.length > 0 && (
            <ul className="list-disc pl-4 mb-4 text-slate-700">
              {model.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          {page.isLast && (
            <p className="text-[10px] font-mono text-slate-600 mb-2" data-section="verification">
              {model.verification.label}: {model.verification.value}
            </p>
          )}

          <footer className="mt-auto border-t border-slate-300 pt-2 text-[9px] text-slate-600 flex items-end justify-between gap-4" data-section="footer">
            <div>
              {model.footer.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <p className="font-bold whitespace-nowrap">{page.label}</p>
          </footer>
        </section>
      ))}
    </div>
  );
}
