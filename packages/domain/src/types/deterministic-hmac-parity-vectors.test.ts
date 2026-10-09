import { describe, expect, it } from 'vitest';
import { computeDeterministicHmac } from './procurement-communications';
import {
  DETERMINISTIC_HMAC_PARITY_SECRET,
  DETERMINISTIC_HMAC_PARITY_VECTORS,
} from './deterministic-hmac-parity-vectors';

describe('deterministic HMAC parity golden vectors (UTF-16 code units)', () => {
  it.each(DETERMINISTIC_HMAC_PARITY_VECTORS.map((v) => [v.label, v] as const))(
    '%s matches frozen digest',
    (_label, vector) => {
      const digest = computeDeterministicHmac(vector.message, DETERMINISTIC_HMAC_PARITY_SECRET);
      expect(digest).toBe(vector.expectedDigest);
      expect(digest).toHaveLength(64);
    },
  );
});
