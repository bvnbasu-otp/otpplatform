import { createContext, useContext, type ReactNode } from 'react';
import { Field, controlClasses, type FieldProps } from '@/components/ui';

/**
 * How tightly the registration forms are drawn, decided by the page they sit on.
 *
 * The same two forms appear in two places with opposite constraints. Inside the
 * portal split screen the panel does not scroll, so the form has to fit a laptop
 * window and runs tight. On /signup the page scrolls like every other public
 * page, and matching the sign-in form's proportions matters more than saving
 * vertical space — the two pages are one errand and should not look like two
 * products.
 *
 * Density travels by context rather than by prop because it is a property of the
 * form as a whole: threading it through twenty fields is how a label ends up at
 * one scale and its control at another. Field says the same thing in its own
 * documentation, and this is the mechanism for honouring it.
 */

const FormDensityContext = createContext<boolean>(true);

export function FormDensityProvider({
  dense,
  children,
}: {
  dense: boolean;
  children: ReactNode;
}) {
  return <FormDensityContext.Provider value={dense}>{children}</FormDensityContext.Provider>;
}

export function useFormDensity(): boolean {
  return useContext(FormDensityContext);
}

/** A field at whatever density the surrounding page asked for. */
export function PortalField(props: Omit<FieldProps, 'dense'>) {
  return <Field dense={useFormDensity()} {...props} />;
}

/**
 * Control classes matching the fields around them.
 *
 * A hook rather than a bare function so it cannot be called with a density the
 * labels above it do not share.
 */
export function usePortalControl(): (invalid?: boolean, className?: string) => string {
  const dense = useFormDensity();
  return (invalid, className) => controlClasses(invalid, className, dense);
}

/**
 * Type sizes and vertical rhythm that follow the same decision.
 *
 * Only the handful the forms set directly: everything else is a Field or a
 * Button and already density-aware. `stack` is here rather than written at each
 * form because the gap between fields and the size of their labels have to move
 * together, or a loosened form reads as an unevenly spaced one.
 */
export function useFormText(): {
  heading: string;
  body: string;
  note: string;
  chip: string;
  stack: string;
  grid: string;
} {
  const dense = useFormDensity();

  return dense
    ? {
        heading: 'text-[clamp(1.1rem,1.6vw,1.45rem)]',
        body: 'text-[0.8rem]',
        note: 'text-[0.78rem]',
        chip: 'text-[0.7rem]',
        stack: 'space-y-2.5',
        grid: 'gap-2.5',
      }
    : {
        heading: 'text-xl',
        body: 'text-sm',
        note: 'text-sm',
        chip: 'text-xs',
        stack: 'space-y-4',
        grid: 'gap-4',
      };
}
