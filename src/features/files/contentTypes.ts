// Client-safe file content-type allowlist. Kept in its own module (NO env import)
// so client components (e.g. the email composer's AttachButton) can import it
// without pulling the server-only env boundary into the browser bundle.
export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/zip",
] as const;
