import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import type { ClientError } from "@/types/actionResult";

export function unlockErrorForClient(error: AppError): { ok: false; error: ClientError } {
  const guessesRemaining = error.context?.guessesRemaining;
  if (error.id === ERROR_IDS.X_PASSCODE_WRONG && typeof guessesRemaining === "number")
    return { ok: false, error: { id: error.id, guessesRemaining } };
  return { ok: false, error: { id: error.id } };
}
