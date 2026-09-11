import { useState } from 'react';
import { Button, Card, Field, Textarea } from '@/components/ui';

export interface DescribeStepProps {
  initialText: string;
  isBusy: boolean;
  onSubmit: (text: string) => void;
}

const EXAMPLES = [
  'Our borewell motor has burnt out. 12.5 HP submersible, needs rewinding this week in Bengaluru.',
  '500 pieces EN8 shaft, CNC turned, 25mm diameter, tolerance ±0.05mm, delivered to Coimbatore in 3 weeks.',
  '2000 kg of 40s combed compact cotton yarn for Tiruppur, needed within 10 days.',
];

/**
 * Step one asks for the requirement the way the buyer would say it out loud.
 * No dropdowns, no category to guess at — the next step is where the platform
 * shows what it made of the answer.
 */
export function DescribeStep({ initialText, isBusy, onSubmit }: DescribeStepProps) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 10) {
      setError('A sentence or two, so we can work out what you need.');
      return;
    }
    setError(null);
    onSubmit(trimmed);
  }

  return (
    <Card
      title="Tell us what you need"
      description="In your own words. Mention quantity, size, location and when you need it, if you know them."
    >
      <Field label="What do you need?" error={error} required>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            rows={5}
            autoFocus
            placeholder="e.g. 12.5 HP borewell submersible motor rewinding at our apartment in Bengaluru, needed this week"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">
          Or start from an example
        </p>
        <ul className="mt-2 space-y-1.5">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                className="w-full rounded-md border p-2 text-left text-xs text-muted-foreground hover:bg-muted"
                onClick={() => setText(example)}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSubmit} busy={isBusy} busyLabel="Reading it">
          Continue
        </Button>
      </div>
    </Card>
  );
}
