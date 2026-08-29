import type { AppError } from "@/constants/errorIds";

export interface SyncFailureDetail {
  errorId: string;
  cause: string;
  status?: number;
  statusText?: string;
  oauthError?: string;
  schemaInvalid?: true;
}

export function syncFailureDetail(error: AppError): SyncFailureDetail {
  const context = error.context ?? {};
  const detail: SyncFailureDetail = { errorId: error.id, cause: error.message };
  if (typeof context.status === "number") detail.status = context.status;
  if (typeof context.statusText === "string") detail.statusText = context.statusText;
  if (typeof context.oauthError === "string") detail.oauthError = context.oauthError;
  if ("body" in context) detail.schemaInvalid = true;
  return detail;
}
