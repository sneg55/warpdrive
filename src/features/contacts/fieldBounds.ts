// Zod-free contact/org field length bounds. Kept separate from contacts/schemas.ts (which imports
// zod) so client forms can read a maxLength hint without pulling zod (~62 KB gzipped) into their
// bundle. contacts/schemas.ts re-exports these and applies them in its zod validators, so the
// client hint and the server cap never diverge.

// RFC 5321 caps an email address at 320 chars; phones stay short with room for country code and
// formatting.
export const MAX_EMAIL_LEN = 320;
export const MAX_PHONE_LEN = 40;
// Firmographic field bounds (org Details panel, Wave 3 decision B3).
export const MAX_DOMAIN_LEN = 255;
export const MAX_INDUSTRY_LEN = 100;
export const MAX_LINKEDIN_URL_LEN = 2048;
