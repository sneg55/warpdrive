import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

const MAX_SLUG_LENGTH = 80;
const MAX_DISPLAY_FILENAME_LENGTH = 255;

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the purpose
const CONTROL_CHARS = /[\x00-\x1f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting control chars is the purpose
const HAS_CONTROL_CHAR = /[\x00-\x1f]/;
const PATH_SEPARATOR = /[\\/]/;

export function sanitizeSlug(filename: string): string {
  return filename
    .normalize("NFC")
    .toLowerCase()
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, "-")
    .replace(/[\\/]/g, "")
    .replace(/\.{2,}/g, "")
    .replace(/^[.-]+/, "")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, MAX_SLUG_LENGTH);
}

export function buildObjectKey(args: {
  entityType: string;
  entityId: string;
  fileId: string;
  filename: string;
}): string {
  return `${args.entityType}/${args.entityId}/${args.fileId}-${sanitizeSlug(args.filename)}`;
}

export function confirmedObjectKey(uploadKey: string): string {
  return `confirmed/${uploadKey}`;
}

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
