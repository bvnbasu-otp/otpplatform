import { useCallback, useEffect, useState } from 'react';
import { useDemoMode } from '../hooks/use-demo-mode';
import {
  fetchDemoSuppliers,
  fetchDemoThread,
  fetchEnquiryReference,
  sendDemoEnquiry,
  simulateSupplierReply,
  type DemoSupplier,
  type DemoThreadEntry,
  type SimulatedReply,
} from '../api/demo-messaging';

/**
 * The WhatsApp/SMS channel, made visible.
 *
 * Two things are worth demonstrating live rather than describing. First, that a
 * supplier with nothing but a phone can quote — and that the message they receive
 * does not say who is buying. Second, that the channel is not a side door: a
 * price texted after the deadline, or by a supplier who was never invited, is
 * refused by the same rules the web form obeys.
 *
 * Nothing here is a mock-up of the pipeline. Every button calls the gateway a
 * real message calls, and the wording shown is rendered by the same templates
 * the provider would send. Suppliers stay behind their aliases even on this
 * screen, because the identity protection being demonstrated does not pause for
 * the demonstration.
 */
export function MessagingInspector({ rfqId }: { rfqId: string }) {
  const { status } = useDemoMode();

  const [suppliers, setSuppliers] = useState<DemoSupplier[]>([]);
  const [thread, setThread] = useState<DemoThreadEntry[]>([]);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [alias, setAlias] = useState('');
  const [body, setBody] = useState('');
  const [lastReply, setLastReply] = useState<SimulatedReply | null>(null);

  const refresh = useCallback(async () => {
    const [supplierResult, threadResult] = await Promise.all([
      fetchDemoSuppliers(rfqId),
      fetchDemoThread(rfqId),
    ]);

    if (!supplierResult.ok) {
      setError(supplierResult.error);
      return;
    }
    if (!threadResult.ok) {
      setError(threadResult.error);
      return;
    }

    setError(null);
    setSuppliers(supplierResult.suppliers);
    setThread(threadResult.entries);
    setAlias((current) => current || supplierResult.suppliers[0]?.alias || '');
  }, [rfqId]);

  useEffect(() => {
    if (!status.enabled) return;
    void refresh();
    void fetchEnquiryReference(rfqId).then(setReference);
  }, [status.enabled, rfqId, refresh]);

  useEffect(() => {
    // Prefilled so a presenter can send a working quote without remembering the
    // format, and can then break it deliberately.
    if (reference) setBody((current) => current || `QUOTE ${reference} 8500`);
  }, [reference]);

  if (!status.enabled) return null;

  async function handleSendEnquiry() {
    setBusy(true);
    const result = await sendDemoEnquiry(rfqId);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  }

  async function handleSimulate() {
    if (!alias || !body.trim()) return;

    setBusy(true);
    const result = await simulateSupplierReply(rfqId, alias, body);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setLastReply(result.result);
    await refresh();
  }

  // Only verified numbers count as reachable: a supplier who texted STOP stays on
  // screen so consent can be restored, but the enquiry is not sent to them.
  const reachable = suppliers.filter((supplier) => supplier.channelStatus === 'VERIFIED').length;
  const notified = suppliers.filter(
    (supplier) => supplier.channelStatus === 'VERIFIED' && supplier.notified,
  ).length;
  const ref = reference ?? 'RFQ-XXXXXX';

  return (
    <section className="rounded-lg border bg-card p-4" data-testid="messaging-inspector">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">Quoting by WhatsApp &amp; SMS</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {reachable} supplier{reachable === 1 ? '' : 's'} on this enquiry can be
            reached by message. {notified} {notified === 1 ? 'has' : 'have'} been sent
            the enquiry.
          </p>
        </div>
        <button
          type="button"
          disabled={busy || reachable === 0 || notified === reachable}
          onClick={() => void handleSendEnquiry()}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          data-testid="send-demo-enquiry"
        >
          {notified === reachable && reachable > 0
            ? 'Everyone has it'
            : 'Send the enquiry'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Reply as a Supplier</h3>

          <label className="mt-2 block text-sm">
            <span className="text-muted-foreground">Supplier</span>
            <select
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              data-testid="messaging-supplier-select"
            >
              {suppliers.map((supplier) => (
                <option key={supplier.alias} value={supplier.alias}>
                  {supplier.alias} · {supplier.channel} {supplier.phoneMasked}
                  {supplier.channelStatus === 'SUSPENDED' ? ' · opted out' : ''}
                  {supplier.quoteStatus ? ` · ${supplier.quoteStatus}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-sm">
            <span className="text-muted-foreground">Message</span>
            <textarea
              value={body}
              rows={2}
              onChange={(event) => setBody(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
              data-testid="messaging-body"
            />
          </label>

          {/*
            Each of these is a case worth showing on its own: a revised quote that
            replaces the first, a message nobody would call structured, one with
            no reference at all, passing on the job, and opting out of the channel.
          */}
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ['Undercut', `QUOTE ${ref} 7800`],
              ['Casual wording', `my rate is Rs 8,200 for ${ref}`],
              ['No reference', 'price 8500'],
              ['Pass on it', `NO ${ref}`],
              ['Ask for help', 'HELP'],
              ['Opt out', 'STOP'],
              ['Opt back in', 'START'],
            ].map(([label, template]) => (
              <button
                key={label}
                type="button"
                onClick={() => setBody(template as string)}
                className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={busy || !alias || !body.trim()}
            onClick={() => void handleSimulate()}
            className="mt-3 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            data-testid="simulate-supplier-message"
          >
            Send as {alias || 'quoting supplier'}
          </button>

          {lastReply && (
            <div className="mt-4 rounded-md border bg-muted/40 p-3" data-testid="messaging-outcome">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {lastReply.outcome}
                {lastReply.confidence < 1 &&
                  ` · read with ${Math.round(lastReply.confidence * 100)}% confidence`}
              </p>
              {lastReply.reply ? (
                <p className="mt-2 whitespace-pre-wrap text-sm">{lastReply.reply}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No reply sent — a repeat delivery is answered once, not twice.
                </p>
              )}
              {lastReply.magicLinkUrl && (
                <a
                  href={lastReply.magicLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm text-primary hover:underline"
                >
                  Open the link the supplier received →
                </a>
              )}
              {lastReply.warnings.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Parser notes, never sent to the supplier: {lastReply.warnings.join('; ')}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-medium">Conversation</h3>
          {thread.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing sent yet on this run. Send the enquiry to start it.
            </p>
          ) : (
            <ol className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1" data-testid="messaging-thread">
              {thread.map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className={`rounded-md border p-2 text-sm ${
                    entry.direction === 'INBOUND' ? 'bg-background' : 'bg-muted/40'
                  }`}
                >
                  <p className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.alias}</span>
                    <span>{entry.channel}</span>
                    <span>{entry.direction === 'INBOUND' ? 'sent' : 'received'}</span>
                    <span>{formatTime(entry.at)}</span>
                    <span
                      className={
                        entry.status === 'REJECTED' ||
                        entry.status === 'FAILED' ||
                        entry.status === 'UNPARSEABLE'
                          ? 'font-medium text-red-600'
                          : ''
                      }
                    >
                      {entry.errorCode ?? entry.status}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{entry.body}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Aliases and partial numbers here too: a buyer never learns which business is
        behind a quote. A price arriving by message is recorded as indicative and stays
        out of the comparison until the supplier submits it through the link, so the
        committee never compares against a figure nobody stood behind.
      </p>
    </section>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
