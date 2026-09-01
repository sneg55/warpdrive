import type { AppError } from "@/constants/errorIds";
import type { Result } from "./result";

export interface ClientError {
  id: string;
  message?: never;
}

export type ActionResult<Ok> = Result<Ok, ClientError>;

export function clientErr(error: AppError): { ok: false; error: ClientError } {
  return { ok: false, error: { id: error.id } };
}

export function toClientResult<Ok>(result: Result<Ok, AppError>): ActionResult<Ok> {
  return result.ok ? result : clientErr(result.error);
}
