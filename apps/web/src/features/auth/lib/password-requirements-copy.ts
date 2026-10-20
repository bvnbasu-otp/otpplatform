import { ASCII_SPECIAL_CHARACTERS, PASSWORD_MIN_LENGTH } from '@otp/domain';

export const PASSWORD_REQUIREMENTS_COPY =
  `Use at least ${PASSWORD_MIN_LENGTH} characters with uppercase, lowercase, a digit, and a special character (${ASCII_SPECIAL_CHARACTERS.slice(0, 12)}…).`;
