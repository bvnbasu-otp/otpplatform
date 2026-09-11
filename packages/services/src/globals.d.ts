/**
 * Ambient globals used inside the services package.
 *
 * The package deliberately does not depend on `@types/node`: it is domain-level
 * code and pulls in no Node runtime types beyond a handful of well-defined
 * globals. Declared here so `tsc --noEmit` on this package does not fail on
 * platforms that don't ship Node types by default.
 */

declare const crypto: {
  randomUUID(): string;
};

declare const process: {
  env: Record<string, string | undefined>;
};
