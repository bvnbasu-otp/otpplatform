import { useEffect, useState } from 'react';
import { formatDateTimeIST } from '@/lib/date-utils';
import type { ClarificationMessage } from '../api/clarification';
import { postClarificationMessage } from '../api/clarification';

interface ClarificationThreadProps {
  rfqId: string;
  invitationId: string;
  messages: ClarificationMessage[];
  authorSide: 'BUYER' | 'SUPPLIER';
  readOnly?: boolean;
  onPosted?: () => void;
}

export function ClarificationThread({
  rfqId,
  invitationId,
  messages,
  authorSide,
  readOnly = false,
  onPosted,
}: ClarificationThreadProps) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBody('');
    setError(null);
  }, [invitationId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await postClarificationMessage(rfqId, invitationId, body, authorSide);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBody('');
    onPosted?.();
  }

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="clarification-thread">
      <div className="max-h-64 space-y-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages yet — start the Q&A thread.</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">{m.authorDisplay}</p>
            <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDateTimeIST(m.createdAt)}
            </p>
          </div>
        ))}
      </div>

      {!readOnly && (
        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            required
            placeholder="Ask a clarification or respond to negotiation points…"
            className="w-full rounded-md border border-input bg-card text-foreground placeholder:text-muted-foreground/60 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
          >
            Post message
          </button>
        </form>
      )}
    </div>
  );
}
