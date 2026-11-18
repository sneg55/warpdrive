import { ZodError } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { captureServerError } from "@/features/observability/server";
import { err, type Result } from "@/types/result";

const CANCELLATION_NAMES = new Set(["AbortError", "TimeoutError"]);

function isCancellation(e: unknown): boolean {
  return e instanceof Error && CANCELLATION_NAMES.has(e.name);
}

export async function guardWrite<T>(
  label: string,
  actorId: string,
  write: () => Promise<Result<T, AppError>>,
): Promise<Result<T, AppError>> {
  try {
    return await write();
  } catch (e) {
    if (isCancellation(e) || e instanceof ZodError) throw e;
    console.error(`${label}: write threw`, e);
    captureServerError(actorId, e, { action: label });
    if (e instanceof AppError) return err(e);
    return err(new AppError(ERROR_IDS.DB_WRITE_FAILED, `${label}: write threw`));
  }
}
