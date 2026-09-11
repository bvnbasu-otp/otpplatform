import type { AttributeDef, AttributeValue } from '@otp/domain';
import {
  Checkbox,
  Field,
  Input,
  NumberInput,
  Select,
  Chip,
} from '@/components/ui';

export interface AttributeFieldsProps {
  attributes: AttributeDef[];
  values: Record<string, AttributeValue>;
  onChange: (code: string, value: AttributeValue | null) => void;
  errors?: Record<string, string>;
}

/**
 * The dynamic part of the form.
 *
 * Which questions appear, what they are called, what units they carry and
 * whether they are required all come from category_attribute_definitions. A new
 * vertical shows up here without a line of code changing.
 */
export function AttributeFields({
  attributes,
  values,
  onChange,
  errors = {},
}: AttributeFieldsProps) {
  if (attributes.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {attributes.map((attribute) => (
        <AttributeField
          key={attribute.code}
          attribute={attribute}
          value={values[attribute.code]}
          error={errors[attribute.code]}
          onChange={(value) => onChange(attribute.code, value)}
        />
      ))}
    </div>
  );
}

interface AttributeFieldProps {
  attribute: AttributeDef;
  value: AttributeValue | undefined;
  error?: string;
  onChange: (value: AttributeValue | null) => void;
}

function AttributeField({ attribute, value, error, onChange }: AttributeFieldProps) {
  const common = {
    label: attribute.label,
    help: attribute.helpText,
    error: error ?? null,
    required: attribute.isRequired,
  };

  switch (attribute.dataType) {
    case 'NUMBER':
      // The unit sits inside the control, so the label does not repeat it.
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <NumberInput
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              required={attribute.isRequired}
              unit={attribute.unit}
              min={attribute.validation.min}
              max={attribute.validation.max}
              placeholder={attribute.placeholder ?? undefined}
              value={typeof value === 'number' ? value : null}
              onValueChange={onChange}
            />
          )}
        </Field>
      );

    case 'BOOLEAN':
      // The checkbox carries its own label, so wrapping it in a Field would
      // leave the input with two competing names.
      return (
        <div>
          <Checkbox
            label={attribute.label}
            description={attribute.helpText}
            checked={value === true}
            onCheckedChange={onChange}
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      );

    case 'ENUM':
      return (
        <Field {...common} hint={attribute.unit}>
          {({ id, describedBy, invalid }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              required={attribute.isRequired}
              placeholder="Select one"
              options={attribute.options.map((option) => ({
                value: option,
                label: option,
              }))}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value || null)}
            />
          )}
        </Field>
      );

    case 'MULTI_ENUM': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <Field {...common} hint={attribute.unit} className="sm:col-span-2">
          {() => (
            <div className="mt-2 flex flex-wrap gap-2">
              {attribute.options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <Chip
                    key={option}
                    selected={isSelected}
                    onClick={() =>
                      onChange(
                        isSelected
                          ? selected.filter((v) => v !== option)
                          : [...selected, option],
                      )
                    }
                  >
                    {option}
                  </Chip>
                );
              })}
            </div>
          )}
        </Field>
      );
    }

    case 'DATE':
      return (
        <Field {...common}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="date"
              aria-describedby={describedBy}
              invalid={invalid}
              required={attribute.isRequired}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value || null)}
            />
          )}
        </Field>
      );

    case 'TEXT':
    default:
      return (
        <Field {...common} hint={attribute.unit}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              required={attribute.isRequired}
              maxLength={attribute.validation.maxLength}
              placeholder={attribute.placeholder ?? undefined}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value || null)}
            />
          )}
        </Field>
      );
  }
}
