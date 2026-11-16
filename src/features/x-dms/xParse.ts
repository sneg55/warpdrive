import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

export interface Parser<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
}

export const hyphenId = (id: string): string => id.replaceAll(":", "-");

const DIRECT_HYPHEN_ID = /^(\d+)-(\d+)$/;

export const sdkConversationId = (id: string): string =>
  id.includes(":") ? id : id.replace(DIRECT_HYPHEN_ID, "$1:$2");

export function parseBody<T>(schema: Parser<T>, body: unknown, path: string): Result<T, AppError> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return ok(parsed.data);
  return err(
    new AppError(ERROR_IDS.X_PARSE_FAILED, "x response did not match the schema", { path }),
  );
}
