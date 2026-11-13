import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";

export interface XListCursor {
  at: string;
  id: string;
}

const cursorSchema = z.object({
  at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/)
    .refine((v) => !Number.isNaN(Date.parse(v))),
  id: z.uuid(),
});

export function encodeXCursor(cursor: XListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeXCursor(raw: string): Result<XListCursor, AppError> {
  const invalid = err(new AppError(ERROR_IDS.X_INPUT_INVALID, "invalid X list cursor", {}));
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return invalid;
  }
  const parsed = cursorSchema.safeParse(decoded);
  if (!parsed.success) return invalid;
  return ok(parsed.data);
}
