import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { err, type Result } from "@/types/result";

export interface SendTarget {
  accountId: string;
  accountXUserId: string;
  xConversationId: string;
  participantXUserId: string;
  encrypted: boolean;
}

export const inputInvalid = (reason: string): AppError =>
  new AppError(ERROR_IDS.X_INPUT_INVALID, "invalid x reply", { reason });

export const ENCRYPTED_CONVERSATION = "encrypted conversation";

const isUncertainDelivery = (e: AppError): boolean =>
  e.id === ERROR_IDS.X_PARSE_FAILED ||
  (e.id === ERROR_IDS.X_HTTP_FAILED &&
    (e.context?.status === null || e.context?.transient === true));

const unconfirmed = (e: AppError): AppError =>
  new AppError(ERROR_IDS.X_SEND_UNCONFIRMED, "x may have delivered the reply", {
    causeId: e.id,
    status: e.context?.status ?? null,
  });

export function deliveryOutcome<T>(r: Result<T, AppError>): Result<T, AppError> {
  return !r.ok && isUncertainDelivery(r.error) ? err(unconfirmed(r.error)) : r;
}
