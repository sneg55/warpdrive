import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import type { ClientError } from "@/types/actionResult";

export function sendErrorForClient(error: AppError): { ok: false; error: ClientError } {
  const detail = error.context?.detail;
  const resetAtMs = error.context?.resetAtMs;
  if (error.id === ERROR_IDS.X_SEND_REFUSED && typeof detail === "string")
    return { ok: false, error: { id: error.id, detail } };
  if (error.id === ERROR_IDS.X_RATE_LIMITED && typeof resetAtMs === "number")
    return { ok: false, error: { id: error.id, resetAtMs } };
  return { ok: false, error: { id: error.id } };
}
