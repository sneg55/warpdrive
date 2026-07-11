// Lightweight client-safe email check. The email composer's RecipientField used
// `z.string().email()` for a single boolean, which dragged all of zod (~62 KB gzipped) into
// the client bundle. This pure regex keeps zod off the compose path. The server still
// re-validates every recipient at the send boundary, so this is a UX gate, not the security
// boundary. Requires a local part, an @, and a dotted domain (a TLD), matching what the
// composer previously accepted.
const EMAIL_PATTERN =
  /^[^\s@]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}
