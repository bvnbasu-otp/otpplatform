/**
 * Golden vectors for cross-platform parity: domain computeDeterministicHmac (UTF-16
 * code units, same as String.prototype.charCodeAt / length) vs Postgres
 * private.otp_deterministic_hmac.
 */
export const DETERMINISTIC_HMAC_PARITY_SECRET = 'TEST-SECRET';

export type DeterministicHmacParityVector = {
  readonly label: string;
  readonly message: string;
  readonly expectedDigest: string;
};

/** Digests produced by computeDeterministicHmac(message, DETERMINISTIC_HMAC_PARITY_SECRET). */
export const DETERMINISTIC_HMAC_PARITY_VECTORS: readonly DeterministicHmacParityVector[] = [
  {
    label: 'ascii-only',
    message: 'ascii-only',
    expectedDigest:
      'c7a31d7e165af623026a31af68818b82c7a31d7e165af623026a31af68818b82',
  },
  {
    label: 'latin1-accent-cafe',
    message: 'caf\u00e9',
    expectedDigest:
      '24c665fb37ca4cb9669855accba0284d24c665fb37ca4cb9669855accba0284d',
  },
  {
    label: 'emoji-grinning-face-bmp-surrogate-pair',
    message: '\uD83D\uDE00',
    expectedDigest:
      '6a51a2064725d0fb3069f8d824ca678d6a51a2064725d0fb3069f8d824ca678d',
  },
  {
    label: 'mixed-accent-and-emoji',
    message: 'mix: caf\u00e9 \uD83D\uDE00',
    expectedDigest:
      '85e84e2d07a61236754b6505ad5d606e85e84e2d07a61236754b6505ad5d606e',
  },
  {
    label: 'secret-colon-delimiter-in-message',
    message: 'secret:delim',
    expectedDigest:
      'c5b96138384d5fb156335c7b1c5ab153c5b96138384d5fb156335c7b1c5ab153',
  },
  {
    label: 'empty-message',
    message: '',
    expectedDigest:
      'c4315e84b4820a633403f3fde2eb1920c4315e84b4820a633403f3fde2eb1920',
  },
  {
    label: 'newline-lf-line-1-line-2',
    message: 'line 1\nline 2',
    expectedDigest:
      '3079776e965e3f4995672bd147af3d8b3079776e965e3f4995672bd147af3d8b',
  },
  {
    label: 'newline-crlf-line-1-line-2',
    message: 'line 1\r\nline 2',
    expectedDigest:
      '96f41b7db81efed55aaeb6a6042dae3096f41b7db81efed55aaeb6a6042dae30',
  },
];
