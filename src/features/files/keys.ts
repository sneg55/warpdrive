import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

// Max length for a sanitized slug segment of the object key.
const MAX_SLUG_LENGTH = 80;
// Max length for a user-facing display filename (stored, never used as a key).
const MAX_DISPLAY_FILENAME_LENGTH = 255;

// Matches ASCII control chars (0x00-0x1F), which includes CR and LF. Used to
// strip header-injection vectors before the value reaches storage or headers.
// Matching control chars is the intended behavior here, so the rule is suppressed.
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the purpose
const CONTROL_CHARS = /[\x00-\x1f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting control chars is the purpose
const HAS_CONTROL_CHAR = /[\x00-\x1f]/;
const PATH_SEPARATOR = /[\\/]/;

/**
 * Derive a filesystem-safe slug from an untrusted filename. Order matters:
 * control chars are stripped first so traversal and CRLF vectors cannot survive
 * later steps. The result is lowercase and restricted to [a-z0-9._-].
 */
export function sanitizeSlug(filename: string): string {
  return filename
    .normalize("NFC")
    .toLowerCase()
    .replace(CONTROL_CHARS, "") // strip control chars + CRLF
    .replace(/\s+/g, "-") // whitespace runs to single dash
    .replace(/[\\/]/g, "") // strip path separators
    .replace(/\.{2,}/g, "") // collapse traversal dot-runs, keep single '.'
    .replace(/^[.-]+/, "") // strip leading dots/dashes
    .replace(/[^a-z0-9._-]/g, "") // allowlist
    .slice(0, MAX_SLUG_LENGTH);
}

/**
 * Build the storage object key from server-controlled values only. The slug is
 * decorative: the fileId prefix guarantees uniqueness regardless of collisions.
 */
export function buildObjectKey(args: {
  entityType: string;
  entityId: string;
  fileId: string;
  filename: string;
}): string {
  return `${args.entityType}/${args.entityId}/${args.fileId}-${sanitizeSlug(args.filename)}`;
}

/**
 * Immutable key for a confirmed object. The upload presigned POST policy pins the
 * original upload key, so it can never write here. confirmUpload copies the validated
 * object to this key and downloads serve only it, closing the overwrite-after-confirm
 * TOCTOU (F33).
 */
export function confirmedObjectKey(uploadKey: string): string {
  return `confirmed/${uploadKey}`;
}

/**
 * Validate a user-facing display filename. Rejects path separators, control
 * chars (covers CRLF header injection in Content-Disposition), and over-length
 * names. On success returns the NFC-normalized form.
 */
export function validateDisplayFilename(filename: string): Result<string, AppError> {
  if (
    PATH_SEPARATOR.test(filename) ||
    HAS_CONTROL_CHAR.test(filename) ||
    filename.length > MAX_DISPLAY_FILENAME_LENGTH
  ) {
    return err(new AppError(ERROR_IDS.FILE_PRESIGN_INVALID, "invalid filename", { filename }));
  }
  return ok(filename.normalize("NFC"));
}
