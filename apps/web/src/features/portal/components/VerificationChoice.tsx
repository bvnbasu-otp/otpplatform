import { PortalField, useFormText } from './FormDensity';
import type { VerificationChannel } from '../api/signup';

const OPTIONS: { value: VerificationChannel; label: string; note: string }[] = [
  {
    value: 'WHATSAPP',
    label: 'WhatsApp',
    note: 'Code to your phone. What most site teams actually read.',
  },
  {
    value: 'EMAIL',
    label: 'Email',
    note: 'Code to your work address. Works everywhere.',
  },
];

/**
 * How the applicant wants their one-time code.
 *
 * WhatsApp is offered first because it is what this market reads, but whether
 * it is deliverable depends on a messaging provider being configured. When it
 * is not, the send attempt says so and suggests email — better than a code
 * that silently never arrives.
 */
export function VerificationChoice({
  value,
  onChange,
  whatsappAvailable = true,
}: {
  value: VerificationChannel;
  onChange: (next: VerificationChannel) => void;
  whatsappAvailable?: boolean;
}) {
  const text = useFormText();

  return (
    <PortalField
      label="How should we send your code?"
      help={
        whatsappAvailable
          ? null
          : 'WhatsApp is not switched on for this environment yet.'
      }
      required
    >
      {() => (
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((option) => {
            const disabled = option.value === 'WHATSAPP' && !whatsappAvailable;
            const selected = value === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-2 rounded-md border p-2.5 transition ${text.body} ${
                  selected ? 'border-action bg-action-soft' : 'bg-white hover:bg-muted'
                } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <input
                  type="radio"
                  name="verification-channel"
                  value={option.value}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(option.value)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-action"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                  <span className={`mt-0.5 block leading-snug text-slate-soft ${text.chip}`}>
                    {option.note}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </PortalField>
  );
}
